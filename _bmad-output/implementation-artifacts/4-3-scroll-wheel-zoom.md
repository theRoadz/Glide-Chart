# Story 4.3: Scroll Wheel Zoom

Status: done

## Story

As a user viewing a Glide Chart,
I want to zoom in and out using my scroll wheel,
so that I can explore different time ranges of the data.

## Acceptance Criteria

1. **Given** zoom is enabled in config (`zoom: true`) **When** I scroll the mouse wheel up on the chart **Then** the chart zooms in, centering on the cursor position **And** the time window narrows, showing more detail
2. **Given** zoom is enabled **When** I scroll the mouse wheel down **Then** the chart zooms out, showing a wider time range
3. **Given** zoom is disabled in config (`zoom: false`) **When** I scroll on the chart **Then** the scroll event passes through to the page (no zoom occurs)
4. **Given** the chart is zoomed in **When** new streaming data arrives via `addData()` **Then** the zoom level and viewport position are preserved (auto-fit does NOT reset the zoom)
5. **Given** the chart is zoomed in **When** `setData()` or `clearData()` is called **Then** the zoom resets and auto-fit resumes normally
6. **Given** the chart has no data **When** the user scrolls the wheel **Then** nothing happens (no errors, no visual changes)

## Tasks / Subtasks

- [x] Task 1: Add wheel event support to EventDispatcher (AC: 1, 2, 3)
  - [x] 1.1 Add `WheelState` interface to `src/interaction/types.ts`: `{ x: number; y: number; deltaY: number }` — x/y are CSS pixels from `event.offsetX`/`offsetY`, deltaY is the scroll delta. **No function fields** — keeps WheelState as pure data matching PointerState's zero-allocation pattern
  - [x] 1.2 Add `WheelCallback` type to `src/interaction/types.ts`: `(state: Readonly<WheelState>) => void`
  - [x] 1.3 In `EventDispatcher`, add `private wheelSubscribers: WheelCallback[]` array, a pre-allocated `WheelState` object (same zero-allocation pattern as `PointerState`), and `private currentWheelEvent: WheelEvent | null = null` to store the raw event reference
  - [x] 1.4 Add `subscribeWheel(callback: WheelCallback): () => void` method — returns unsubscribe function (same pattern as `subscribe()`)
  - [x] 1.5 Add `wheel` event listener on the container in the constructor. Handler: store `this.currentWheelEvent = e`, populate the pre-allocated `WheelState` with `e.offsetX`, `e.offsetY`, `e.deltaY`. Notify all wheel subscribers. After notification, set `this.currentWheelEvent = null`. Do NOT call `preventDefault()` in the dispatcher — subscribers call `preventWheel()` when they handle the event
  - [x] 1.6 Add `preventWheel(): void` method — calls `this.currentWheelEvent?.preventDefault()`. This is called by ZoomHandler after confirming zoom is enabled and pointer is in viewport. Zero closure allocations per event
  - [x] 1.7 Remove the `wheel` listener in `destroy()`. Clear `wheelSubscribers` array
  - [x] 1.8 **Critical:** The wheel listener must be registered with `{ passive: false }` to allow `preventDefault()`. Without this, `preventDefault()` throws in Chrome/Safari

- [x] Task 2: Create ZoomHandler class (AC: 1, 2, 6)
  - [x] 2.1 Create `src/interaction/zoom-handler.ts`
  - [x] 2.2 Constructor receives: `Scale`, a `markDirty: (layer: LayerType) => void` callback, a `getVisibleValues: () => number[]` callback (for Y auto-fit after zoom), and a `preventWheel: () => void` callback (bound to EventDispatcher.preventWheel). Validate inputs with prefixed error messages
  - [x] 2.3 Implement `handleWheel(wheelState: WheelState, config: ResolvedConfig): void`:
    - Early return if `config.zoom === false`
    - Early return if `wheelState.deltaY === 0` (no zoom direction)
    - Early return if `wheelState.x` is outside `scale.viewport` bounds (pointer not over plot area)
    - Get current X domain: `const { min, max } = scale.domainX`
    - Early return if `max === min` (degenerate domain, division by zero guard)
    - Compute zoom factor: `deltaY > 0` (scroll down) → zoom out (factor > 1), `deltaY < 0` (scroll up) → zoom in (factor < 1). Use `ZOOM_FACTOR = 1.1` constant. For scroll down: `factor = ZOOM_FACTOR`, for scroll up: `factor = 1 / ZOOM_FACTOR`. Use `Math.sign(deltaY)` to determine direction — only the sign matters, not the magnitude (eliminates cross-browser deltaY normalization issues)
    - Compute cursor position in data space: `const cursorX = scale.pixelToX(wheelState.x)`
    - Compute ratios: `const leftRatio = (cursorX - min) / (max - min)` and `const rightRatio = 1 - leftRatio`
    - Compute new domain width: `const newWidth = (max - min) * factor`
    - Clamp `newWidth` to prevent degenerate cases: minimum 1ms (`MIN_ZOOM_WIDTH = 1`), maximum bounded by some reasonable limit (e.g., `MAX_ZOOM_WIDTH = 1e15` — about 30,000 years in ms)
    - Compute new domain: `const newMin = cursorX - newWidth * leftRatio`, `const newMax = cursorX + newWidth * rightRatio`
    - Call `scale.setDomainX(newMin, newMax)`
    - Auto-fit Y to visible data: call the `getVisibleValues()` callback, then `scale.autoFitY(values)`
    - Call `this.preventWheel()` to block page scroll (only reached when zoom is actually performed)
    - Mark layers dirty: `markDirty(LayerType.Data)`, `markDirty(LayerType.Axis)`, `markDirty(LayerType.Background)`
  - [x] 2.4 Implement `get isZoomed(): boolean` — returns true when user has zoomed. Set to `true` in `handleWheel()` after a successful zoom. Reset via `resetZoom()` method
  - [x] 2.5 Implement `resetZoom(): void` — sets `isZoomed` to `false`. Called by GlideChart when `setData()` or `clearData()` is invoked
  - [x] 2.6 Implement `destroy(): void` — no-op for now, but keeps consistent lifecycle pattern

- [x] Task 3: Integrate ZoomHandler into GlideChart facade (AC: 1, 2, 3, 4, 5)
  - [x] 3.1 Import `ZoomHandler` in `glide-chart.ts`. Add `private zoomHandler: ZoomHandler` property
  - [x] 3.2 Instantiate `ZoomHandler` in constructor after Scale and EventDispatcher are created but **before FrameScheduler** (the markDirty callback is captured as a closure but only invoked asynchronously on wheel events, so FrameScheduler will be initialized by then). Pass `this.scale`, a `markDirty` callback `(layer) => this.frameScheduler.markDirty(layer)`, a `getVisibleValues` callback that iterates all series buffers and collects values within the current X domain using `getVisibleWindow()`, and `() => this.eventDispatcher.preventWheel()` as the preventWheel callback
  - [x] 3.3 Subscribe to wheel events: `this.eventDispatcher.subscribeWheel((wheelState) => { this.zoomHandler.handleWheel(wheelState, this.resolvedConfig); this.tooltip.update(this.pointerState, this.resolvedConfig); })` — tooltip update needed so tooltip content reflects new scale if pointer is active
  - [x] 3.4 **Modify `autoFitScale()` to respect zoom state:** At the top of `autoFitScale()`, add: `if (this.zoomHandler && this.zoomHandler.isZoomed) { return this.autoFitYOnly(); }` — when zoomed, skip X domain auto-fit, only auto-fit Y to visible data in the current zoom window. This preserves the user's zoom position when streaming data arrives via `addData()`
  - [x] 3.5 Implement `private autoFitYOnly(): boolean` — similar to the Y portion of `autoFitScaleWindowed()`: iterate all series, collect values within current `scale.domainX` using `getVisibleWindow()`, call `scale.autoFitY()`. Return whether the Y domain changed
  - [x] 3.6 In `setData()`: call `this.zoomHandler.resetZoom()` **before** `autoFitScale()` so the full auto-fit runs
  - [x] 3.7 In `clearData()`: call `this.zoomHandler.resetZoom()` **before** `autoFitScale()`
  - [x] 3.8 In `setConfig()`: if `zoom` config changes, reset zoom state. Recreate ZoomHandler if needed
  - [x] 3.9 In `destroy()`: call `this.zoomHandler.destroy()`, null out reference
  - [x] 3.10 In `resize()`: reset zoom — `this.zoomHandler.resetZoom()` before `autoFitScale()` (viewport dimensions changed, zoom bounds are stale)

- [x] Task 4: Unit tests for EventDispatcher wheel support (AC: 1, 2, 3)
  - [x] 4.1 Add tests to `src/interaction/event-dispatcher.test.ts`
  - [x] 4.2 Test: wheel event dispatches WheelState with correct x, y, deltaY to wheel subscribers
  - [x] 4.3 Test: multiple wheel subscribers all receive updates
  - [x] 4.4 Test: subscribeWheel returns unsubscribe function that removes subscriber
  - [x] 4.5 Test: preventWheel() calls preventDefault on the current WheelEvent during subscriber notification
  - [x] 4.6 Test: preventWheel() is a no-op when called outside of a wheel event (currentWheelEvent is null)
  - [x] 4.7 Test: destroy removes wheel event listener
  - [x] 4.8 Test: wheel listener registered with passive: false

- [x] Task 5: Unit tests for ZoomHandler (AC: 1, 2, 6)
  - [x] 5.1 Create `src/interaction/zoom-handler.test.ts`
  - [x] 5.2 Test: handleWheel with deltaY < 0 (scroll up) narrows X domain (zoom in) — verify `scale.domainX` width decreased
  - [x] 5.3 Test: handleWheel with deltaY > 0 (scroll down) widens X domain (zoom out) — verify `scale.domainX` width increased
  - [x] 5.4 Test: zoom centers on cursor position — cursor data value stays at same position in domain before/after zoom
  - [x] 5.5 Test: handleWheel respects config.zoom === false — no domain change
  - [x] 5.6 Test: handleWheel with pointer outside viewport — no domain change
  - [x] 5.7 Test: isZoomed is false initially, becomes true after handleWheel, resets on resetZoom()
  - [x] 5.8 Test: zoom doesn't go below MIN_ZOOM_WIDTH (prevents degenerate domain)
  - [x] 5.9 Test: zoom doesn't exceed MAX_ZOOM_WIDTH
  - [x] 5.10 Test: markDirty callback called for Data, Axis, and Background layers on zoom
  - [x] 5.11 Test: Y domain auto-fits to visible data after zoom
  - [x] 5.12 Test: constructor validates inputs
  - [x] 5.13 Test: handleWheel with deltaY === 0 does nothing (no domain change, no error)
  - [x] 5.14 Test: handleWheel when domainX.min === domainX.max does nothing (degenerate domain guard)
  - [x] 5.15 Test: handleWheel with empty data (getVisibleValues returns []) — no Y domain error, no crash

- [x] Task 6: Integration tests (AC: 1, 2, 3, 4, 5)
  - [x] 6.1 Create `src/interaction/zoom-handler-integration.test.ts`
  - [x] 6.2 Test: full GlideChart with wheel event zooms in — verify scale domain changed
  - [x] 6.3 Test: wheel event on chart with `zoom: false` does not change domain
  - [x] 6.4 Test: streaming data via addData() after zoom preserves zoom viewport (does not reset X domain)
  - [x] 6.5 Test: setData() after zoom resets zoom and auto-fits
  - [x] 6.6 Test: clearData() after zoom resets zoom and auto-fits
  - [x] 6.7 Test: destroy cleans up ZoomHandler

- [x] Task 7: Update demo page (AC: 1, 2)
  - [x] 7.1 Verify scroll wheel zoom works on existing demo charts (enabled by default since `zoom: true`)
  - [x] 7.2 Optionally update demo subtitle to mention zoom

## Dev Notes

### Architecture Compliance

**Module location:** `src/interaction/zoom-handler.ts` and `src/interaction/zoom-handler.test.ts`. The architecture doc specifies `zoom.ts` in `src/interaction/`, but `zoom-handler.ts` is more descriptive and follows the established pattern of `event-dispatcher.ts`, avoiding a generic name. Either name is acceptable.

**Import DAG:** `interaction/` can import from `core/`, `config/`, and `renderer/types` (types file only, not implementation modules). ZoomHandler must NOT import from `api/` or `renderer/` implementation files. It imports `Scale` from `core/` and `LayerType` from `renderer/types.ts`. This is explicitly permitted by the architecture import DAG table.

**Dependency injection:** ZoomHandler constructor receives `Scale`, callbacks for `markDirty` and `getVisibleValues`. GlideChart wires everything together — consistent with EventDispatcher, Crosshair, and Tooltip patterns.

### Wheel Event Handling

**Browser normalization:** `WheelEvent.deltaY` varies by browser:
- Chrome/Edge: `deltaMode === 0` (pixel mode), deltaY is ~100 per notch
- Firefox: `deltaMode === 1` (line mode), deltaY is ~3 per notch
- Safari: `deltaMode === 0`, deltaY is ~4-120 depending on trackpad vs mouse

**For zoom, only the sign matters.** Use `Math.sign(deltaY)` to determine direction, apply a fixed zoom factor per step. This eliminates all cross-browser deltaY magnitude issues.

**`passive: false` is critical.** The `wheel` event listener must be registered with `{ passive: false }` to allow `preventDefault()`. Modern browsers default wheel listeners to passive on certain elements. Without this flag, calling `preventDefault()` will:
- Throw a console error in Chrome/Safari
- Not actually prevent the page from scrolling

**Conditional `preventDefault()`:** Only call `preventDefault()` when zoom is actually handled. If `config.zoom === false` or pointer is outside viewport, do NOT prevent default — let the scroll event pass through to the page.

**Design:** EventDispatcher stores `currentWheelEvent: WheelEvent | null` during subscriber notification, then clears it. EventDispatcher exposes a `preventWheel()` method that calls `currentWheelEvent?.preventDefault()`. ZoomHandler receives `preventWheel` as a constructor-injected callback and calls it at the end of `handleWheel()` only when zoom actually occurs. This achieves:
- Zero closure allocations per event (WheelState is pure data like PointerState)
- Page scroll blocked only when zoom fires
- Clean separation: EventDispatcher owns the DOM event, ZoomHandler decides when to prevent

**Trackpad smooth scrolling note:** Modern trackpads fire many rapid wheel events with small deltaY values. Using `Math.sign(deltaY)` treats each event as a full 10% zoom step, which may feel aggressive on trackpads. This is a known limitation of the sign-only approach. If trackpad UX needs refinement in the future, consider accumulating deltaY over a time window or scaling the zoom factor by deltaY magnitude. For v1, the sign-only approach is correct and simple.

### Zoom Math

**Cursor-centered zoom algorithm:**
```
currentDomain = { min, max }
cursorDataX = scale.pixelToX(wheelState.x)

// Ratio of cursor position within the domain
leftRatio = (cursorDataX - min) / (max - min)

// New domain width after zoom
newWidth = (max - min) * factor

// Reposition domain so cursor stays at same data value
newMin = cursorDataX - newWidth * leftRatio
newMax = cursorDataX + newWidth * (1 - leftRatio)
```

This ensures the data value under the cursor stays in place — the zoom feels natural and anchored to what you're looking at.

**Zoom factor:** `ZOOM_FACTOR = 1.1` means each scroll step changes the visible range by ~10%. This gives smooth incremental zoom. Rapid scrolling produces rapid zooming proportionally.

### Auto-Fit Override During Zoom

**Critical interaction with `addData()`:** When the user zooms, `autoFitScale()` runs on every `addData()` call. Without protection, it would reset the zoom by calling `autoFitX()` or `setDomainX()` with the auto-fit range.

**Solution:** ZoomHandler exposes `isZoomed: boolean`. In `autoFitScale()`:
- If `isZoomed === true`: skip X domain changes, only auto-fit Y to visible data within the current X domain. This preserves the user's zoom viewport while ensuring Y axis adapts to visible values.
- If `isZoomed === false`: normal auto-fit behavior.

**Zoom reset triggers:**
- `setData()` — replacing the entire dataset makes the zoom position meaningless
- `clearData()` — no data to zoom into
- `resize()` — viewport dimensions change, zoom bounds become stale
- `setConfig()` — config change may affect zoom behavior

### Existing Code to Reuse

- **`EventDispatcher`** (`src/interaction/event-dispatcher.ts`) — extend with wheel subscription (don't create a separate dispatcher)
- **`Scale.pixelToX()`** (`src/core/scale.ts:137-141`) — convert cursor pixel to timestamp for zoom center calculation
- **`Scale.setDomainX()`** (`src/core/scale.ts:45-56`) — set new zoom domain
- **`Scale.autoFitY()`** (`src/core/scale.ts:97-121`) — auto-fit Y after zoom
- **`getVisibleWindow()`** (`src/core/ring-buffer.ts`) — get visible data points within current domain for Y auto-fit
- **`FrameScheduler.markDirty()`** — trigger layer redraws after zoom
- **`LayerType`** (`src/renderer/types.ts`) — layer type enum for markDirty calls

### Anti-Patterns to Avoid

- **DO NOT** create a separate event listener for wheel — extend `EventDispatcher` with `subscribeWheel()`
- **DO NOT** register wheel listener with `{ passive: true }` or without passive option — must use `{ passive: false }` for `preventDefault()`
- **DO NOT** use `deltaY` magnitude for zoom amount — normalize to sign only, apply fixed factor
- **DO NOT** call `requestAnimationFrame` directly — use `frameScheduler.markDirty()`
- **DO NOT** modify `Scale` class — use existing `setDomainX()` and `autoFitY()`
- **DO NOT** use `export default` — named exports only
- **DO NOT** add runtime dependencies
- **DO NOT** allocate objects in the wheel event handler hot path — pre-allocate `WheelState`
- **ALL error messages must be prefixed** with class name — e.g., `"ZoomHandler: scale instance is required"`
- **DO NOT** call `autoFitX()` or `autoFitScaleWindowed()` when zoom is active — only auto-fit Y

### Testing Standards

- Co-located test files in `src/interaction/`
- Use `vitest-canvas-mock` for Canvas 2D API mocking
- Mock `WheelEvent` by creating objects with `offsetX`, `offsetY`, `deltaY`, `deltaMode`, `preventDefault` properties and dispatching via `element.dispatchEvent(new WheelEvent('wheel', {...}))`
- **Important:** When constructing `WheelEvent` for tests, pass `{ bubbles: true }` so the event propagates to the container
- Mock `Scale` with simple domain for unit tests — verify domain changes after zoom
- Constructor injection makes ZoomHandler fully testable in isolation
- For integration tests: create a full `GlideChart` instance, dispatch wheel events, verify scale domain changed

### Previous Story Intelligence (Story 4.2)

Key patterns established in Stories 4.1-4.2 that this story must follow:
- **EventDispatcher** listens on container div, pre-allocates reusable state objects, subscribers receive shared reference
- **Constructor injection** for all dependencies — Scale, data sources, callbacks
- **GlideChart integration:** single subscriber callback per event type, marks layers dirty
- **Review findings from 4.1:** pre-allocate arrays, early termination in search loops, subscribe returns unsubscribe function
- **Review findings from 4.2:** boundary checks, `Math.max(0, ...)` clamping, try/catch for user-provided formatters
- **459 tests currently passing** — do not break any existing tests

### Git Intelligence

Recent commit: `55388e2 feat: add tooltip with data values and review fixes (Story 4.2)`. All 459 tests passing, zero lint/type errors. Commit message pattern: `feat: add <description> with review fixes (Story X.Y)`.

### Cross-Story Context

- **Story 4.4 (Pinch-to-Zoom):** Will reuse `ZoomHandler.handleWheel()` pattern but with touch gesture-derived zoom factor. Design ZoomHandler so the zoom math can be called from a pinch handler too — consider extracting a `zoom(cursorX: number, factor: number)` method that both wheel and pinch can call
- **Story 4.5 (Keyboard Navigation):** Will add `+`/`-` keyboard zoom, also calling into ZoomHandler zoom math with a center-of-viewport cursor position

### Project Structure Notes

```
src/interaction/
  types.ts              ← Modify: add WheelState, WheelCallback
  event-dispatcher.ts   ← Modify: add wheel listener, subscribeWheel(), WheelState pre-allocation
  zoom-handler.ts       ← NEW: wheel zoom logic
  zoom-handler.test.ts  ← NEW: unit tests
  zoom-handler-integration.test.ts ← NEW: integration tests
  event-dispatcher.test.ts ← Modify: add wheel event tests
  crosshair.ts          ← No changes
  tooltip.ts            ← No changes
src/api/
  glide-chart.ts        ← Modify: instantiate ZoomHandler, wheel subscriber, autoFitScale guard, resetZoom in setData/clearData/resize/destroy
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 4, Story 4.3 lines 556-575]
- [Source: _bmad-output/planning-artifacts/prd.md — FR13: enable/disable zoom via config flag, FR15: scroll wheel zoom on desktop]
- [Source: _bmad-output/planning-artifacts/architecture.md — Event Handling section lines 246-256: centralized dispatcher routes to zoom handler]
- [Source: _bmad-output/planning-artifacts/architecture.md — Module Structure line 349: zoom.ts in interaction/]
- [Source: src/interaction/event-dispatcher.ts — current implementation, lines 1-89]
- [Source: src/interaction/types.ts — PointerState, PointerCallback, WheelState to add]
- [Source: src/core/scale.ts — setDomainX(), pixelToX(), autoFitY(), viewport getter]
- [Source: src/core/ring-buffer.ts — getVisibleWindow() for Y auto-fit]
- [Source: src/api/glide-chart.ts:662-751 — autoFitScale() and autoFitScaleWindowed() logic]
- [Source: src/api/glide-chart.ts:200-207 — EventDispatcher subscriber pattern]
- [Source: src/config/types.ts:83 — zoom?: boolean config, line 108: readonly zoom: boolean in ResolvedConfig]
- [Source: _bmad-output/implementation-artifacts/4-1-event-dispatcher-and-crosshair.md — EventDispatcher patterns, review findings]
- [Source: _bmad-output/implementation-artifacts/4-2-tooltip-with-data-values.md — Tooltip integration patterns, review findings]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Fixed existing EventDispatcher test that expected 5 addEventListener calls (now 6 with wheel)
- Added WheelEvent to ESLint globals in eslint.config.js

### Completion Notes List

- Task 1: Extended EventDispatcher with wheel event support — WheelState/WheelCallback types, subscribeWheel(), preventWheel(), passive:false listener, zero-allocation pre-allocated WheelState
- Task 2: Created ZoomHandler with cursor-centered zoom algorithm, ZOOM_FACTOR=1.1, sign-only deltaY normalization, MIN/MAX_ZOOM_WIDTH clamping, isZoomed state, Y auto-fit after zoom
- Task 3: Integrated ZoomHandler into GlideChart — wheel subscription, autoFitScale() zoom guard with autoFitYOnly(), resetZoom in setData/clearData/resize/setConfig/destroy
- Task 4: Added 8 unit tests for EventDispatcher wheel support (dispatch, multi-subscriber, unsubscribe, preventDefault, passive:false, destroy cleanup, zero-allocation)
- Task 5: Added 15 unit tests for ZoomHandler (zoom in/out, cursor-centered, config disabled, outside viewport, isZoomed state, MIN/MAX width, markDirty, Y auto-fit, constructor validation, deltaY=0, degenerate domain, empty data)
- Task 6: Added 6 integration tests (full chart zoom, disabled zoom, streaming preserves viewport, setData/clearData reset, destroy cleanup)
- Task 7: Updated demo subtitle to mention scroll zoom; zoom works by default since config resolver defaults zoom:true

### File List

- src/interaction/types.ts (modified — added WheelState, WheelCallback)
- src/interaction/event-dispatcher.ts (modified — added wheel listener, subscribeWheel, preventWheel, handleWheel)
- src/interaction/event-dispatcher.test.ts (modified — updated listener count, added 8 wheel event tests)
- src/interaction/zoom-handler.ts (new — ZoomHandler class)
- src/interaction/zoom-handler.test.ts (new — 15 unit tests)
- src/interaction/zoom-handler-integration.test.ts (new — 6 integration tests)
- src/api/glide-chart.ts (modified — ZoomHandler integration, autoFitYOnly, getVisibleValuesInDomain, resetZoom calls)
- eslint.config.js (modified — added WheelEvent to globals)
- demo/index.html (modified — updated subtitle)

### Review Findings

- [x] [Review][Patch] Subscriber exception in `notifyWheel` skips remaining subscribers and leaks `currentWheelEvent` — wrap in try/finally [event-dispatcher.ts:102-108]
- [x] [Review][Patch] Zoomed into empty region leaves Y axis showing stale range — when `getVisibleValues()` returns `[]`, should reset Y domain to a sensible default [zoom-handler.ts:84-87, glide-chart.ts:725-733]
- [x] [Review][Patch] Missing integration test for AC 6 (wheel on empty chart) — add test dispatching wheel on chart with zero data [zoom-handler-integration.test.ts]

### Change Log

- 2026-03-30: Implemented scroll wheel zoom (Story 4.3) — ZoomHandler with cursor-centered zoom, EventDispatcher wheel support, GlideChart integration with zoom-aware auto-fit. 492 tests passing (33 new).
