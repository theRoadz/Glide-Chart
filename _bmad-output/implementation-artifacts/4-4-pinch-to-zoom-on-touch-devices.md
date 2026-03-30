# Story 4.4: Pinch-to-Zoom on Touch Devices

Status: done

## Story

As a user on a touch device,
I want to zoom the chart using pinch gestures,
so that I can explore data ranges on mobile and tablet.

## Acceptance Criteria

1. **Given** zoom is enabled and a touch device is used **When** I perform a pinch-out gesture on the chart **Then** the chart zooms in, centering on the pinch midpoint
2. **Given** zoom is enabled and a touch device is used **When** I perform a pinch-in gesture **Then** the chart zooms out
3. **And** the gesture detection normalizes touch events correctly
4. **And** zoom transitions are smooth (no jumps or jitter)
5. **Given** zoom is disabled in config (`zoom: false`) **When** I perform a pinch gesture **Then** the gesture passes through (no zoom occurs)
6. **Given** the chart is zoomed via pinch **When** new streaming data arrives via `addData()` **Then** the zoom level and viewport position are preserved (consistent with scroll-wheel zoom behavior from Story 4.3)
7. **Given** the chart has no data **When** the user performs a pinch gesture **Then** nothing happens (no errors, no visual changes)

## Tasks / Subtasks

- [x] Task 1: Extract reusable zoom method from ZoomHandler (AC: 1, 2)
  - [x] 1.1 In `src/interaction/zoom-handler.ts`, extract the core zoom math from `handleWheel()` into a new public method: `applyZoom(cursorX: number, factor: number, config: ResolvedConfig): void`. The caller passes `cursorX` in data space (not pixels) and is responsible for viewport bounds checks. Method steps:
    - Early return if `config.zoom === false`
    - Get current domain: `const { min, max } = this.scale.domainX`
    - Early return if `max === min` (degenerate domain — prevents division by zero in leftRatio)
    - Compute `leftRatio = (cursorX - min) / (max - min)`
    - Compute `newWidth = (max - min) * factor`, clamped to `[MIN_ZOOM_WIDTH, MAX_ZOOM_WIDTH]`
    - Compute `newMin = cursorX - newWidth * leftRatio`, `newMax = cursorX + newWidth * (1 - leftRatio)`
    - Call `this.scale.setDomainX(newMin, newMax)`
    - Auto-fit Y: `this.scale.autoFitY(this.getVisibleValues())`
    - Set `this._isZoomed = true`
    - Mark dirty: `Data`, `Axis`, `Background` layers
    - **Do NOT call `preventWheelFn`** — that is wheel-specific
  - [x] 1.2 Refactor `handleWheel()` to delegate to `applyZoom()`: compute `factor` from `deltaY` sign, compute `cursorX` via `scale.pixelToX(wheelState.x)`, validate viewport bounds and config.zoom, then call `applyZoom(cursorX, factor, config)` followed by `this.preventWheelFn()`
  - [x] 1.3 Verify all existing ZoomHandler tests still pass after refactor — the external behavior is unchanged

- [x] Task 2: Add pinch gesture tracking to EventDispatcher (AC: 1, 2, 3, 4)
  - [x] 2.1 Add `PinchState` interface to `src/interaction/types.ts`: `{ centerX: number; centerY: number; scale: number }` — `centerX`/`centerY` are the midpoint of the two touch points in CSS pixels (from `offsetX`/`offsetY`), `scale` is the ratio of current pinch distance to previous pinch distance (>1 = spreading/zoom in, <1 = pinching/zoom out). **Pure data, no functions** — matches PointerState/WheelState pattern
  - [x] 2.2 Add `PinchCallback` type to `src/interaction/types.ts`: `(state: Readonly<PinchState>) => void`
  - [x] 2.3 In `EventDispatcher`, add private fields for pinch tracking:
    - `private pinchSubscribers: PinchCallback[] = []`
    - `private pinchState: PinchState = { centerX: 0, centerY: 0, scale: 1 }` (pre-allocated, zero-allocation pattern)
    - `private pinchPointers: Map<number, { x: number; y: number }> = new Map()` — tracks active touch pointer positions by `pointerId`. Use a `Map` (not array) for O(1) lookup/delete by pointerId
    - `private pinchStartDistance: number = 0` — the distance between the two touch points when the pinch gesture begins (used to compute scale ratio on each move)
    - `private isPinching: boolean = false` — true when exactly 2 touch pointers are active and pinch has started
  - [x] 2.4 Add `subscribePinch(callback: PinchCallback): () => void` method — returns unsubscribe function (same pattern as `subscribe()` and `subscribeWheel()`)
  - [x] 2.5 Modify `handlePointerdown(e: PointerEvent)` — add touch tracking after existing pointer state update:
    - If `e.pointerType === 'touch'`:
      - Call `this.container.setPointerCapture(e.pointerId)` — ensures move/up/cancel events are received even if finger moves outside container
      - If `pinchPointers.size < 2`: add `{ x: e.offsetX, y: e.offsetY }` to `pinchPointers` keyed by `e.pointerId`
      - If `pinchPointers.size === 2` after adding: compute initial distance via `Math.hypot()`, store in `pinchStartDistance`, set `isPinching = true`
      - If `pinchPointers.size >= 2` before adding: ignore (third+ finger)
  - [x] 2.6 Modify `handlePointermove(e: PointerEvent)` — add pinch processing after existing pointer state update:
    - If `this.isPinching && e.pointerType === 'touch'` and `pinchPointers.has(e.pointerId)`:
      - Update this pointer's position in `pinchPointers`: `pinchPointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY })`
      - Get both pointer positions from the map (use `pinchPointers.values()` iterator)
      - Compute `newDistance = Math.hypot(x2 - x1, y2 - y1)`
      - Guard: if `this.pinchStartDistance === 0`, skip (prevents division by zero)
      - Compute `scale = newDistance / this.pinchStartDistance`
      - Compute midpoint: `centerX = (x1 + x2) / 2`, `centerY = (y1 + y2) / 2`
      - Populate pre-allocated `this.pinchState` with `{ centerX, centerY, scale }`
      - Notify pinch subscribers (wrap in try/finally matching `notifyWheel` pattern)
      - Update `this.pinchStartDistance = newDistance` (continuous delta for smooth zoom)
      - Suppress crosshair: set `this.state.active = false` and call `this.notify()` — hides crosshair during two-finger gesture
    - **`offsetX`/`offsetY` reliability note:** With pointer capture active, some mobile browsers may report incorrect `offsetX`/`offsetY` when the finger is outside the container. If tests reveal this, fall back to computing position from `e.clientX - container.getBoundingClientRect().left` (and `.top` for Y). Start with `offsetX`/`offsetY` as they work correctly when fingers are inside the container (the common case)
  - [x] 2.7 Modify `handlePointerup(e: PointerEvent)` (also handles `pointercancel` — they share the same bound handler via line 28):
    - If `e.pointerType === 'touch'`:
      - Release pointer capture: `try { this.container.releasePointerCapture(e.pointerId); } catch { /* may already be released */ }`
      - Remove from `pinchPointers` by `e.pointerId`
      - If `this.isPinching` was true and `pinchPointers.size < 2`: set `isPinching = false`, reset `pinchStartDistance = 0`
      - Set `this.state.active = false` and call `this.notify()` — do NOT re-activate remaining finger as crosshair (user just finished a two-finger gesture)
  - [x] 2.8 In `destroy()`: clear `pinchPointers` map, clear `pinchSubscribers` array, set `isPinching = false`
  - [x] 2.9 Add `touch-action: none` CSS to the container element in the constructor: `container.style.touchAction = 'none'`. This prevents the browser from handling pinch-zoom/pan natively on the chart container, allowing our custom gesture handling to work. Without this, mobile browsers will zoom the entire page instead of the chart. **Only set this when EventDispatcher is created** — `destroy()` should restore the original value: save `this.originalTouchAction = container.style.touchAction` before setting, restore in `destroy()`

- [x] Task 3: Add pinch-to-zoom handling in ZoomHandler (AC: 1, 2, 5, 7)
  - [x] 3.1 Add `handlePinch(pinchState: PinchState, config: ResolvedConfig): void` method to `ZoomHandler`:
    - Early return if `config.zoom === false`
    - Early return if `pinchState.scale === 1` (no change) or `pinchState.scale <= 0` (invalid)
    - Compute `cursorX = scale.pixelToX(pinchState.centerX)` — pinch midpoint in data space
    - Compute `factor = 1 / pinchState.scale` — when fingers spread (scale > 1), we want to zoom IN (narrower domain), so factor < 1. When fingers pinch (scale < 1), we want to zoom OUT (wider domain), so factor > 1. This is the inverse because `applyZoom` treats factor > 1 as wider domain
    - Call `this.applyZoom(cursorX, factor, config)`
  - [x] 3.2 No `preventDefault` needed for pinch — `touch-action: none` on the container (Task 2.9) handles browser default prevention. The Pointer Events API doesn't have a `preventDefault()` equivalent for gesture suppression — CSS `touch-action` is the correct approach

- [x] Task 4: Integrate pinch-to-zoom into GlideChart facade (AC: 1, 2, 5, 6, 7)
  - [x] 4.1 In `glide-chart.ts` constructor, after the existing `subscribeWheel()` call, add a pinch subscription: `this.eventDispatcher.subscribePinch((pinchState) => { this.zoomHandler.handlePinch(pinchState, this.resolvedConfig); this.tooltip.update(this.pointerState, this.resolvedConfig); })` — tooltip update ensures tooltip repositions on zoom change if pointer was active
  - [x] 4.2 **No changes needed to `autoFitScale()`, `setData()`, `clearData()`, `resize()`, `destroy()`** — all zoom-aware behavior was already implemented in Story 4.3 via `zoomHandler.isZoomed` and `zoomHandler.resetZoom()`. Pinch zoom sets `_isZoomed = true` through `applyZoom()`, so all existing guards work automatically

- [x] Task 5: Unit tests for ZoomHandler.applyZoom refactor (AC: 1, 2)
  - [x] 5.1 In `src/interaction/zoom-handler.test.ts`, add tests:
  - [x] 5.2 Test: `applyZoom` with factor < 1 narrows X domain (zoom in)
  - [x] 5.3 Test: `applyZoom` with factor > 1 widens X domain (zoom out)
  - [x] 5.4 Test: `applyZoom` centers on provided cursorX — verify cursor data value position preserved
  - [x] 5.5 Test: `applyZoom` sets `isZoomed = true`
  - [x] 5.6 Test: `applyZoom` marks Data, Axis, Background layers dirty
  - [x] 5.7 Test: `applyZoom` clamps to MIN_ZOOM_WIDTH and MAX_ZOOM_WIDTH
  - [x] 5.8 Test: `applyZoom` with degenerate domain (min === max) does nothing
  - [x] 5.9 Test: all existing `handleWheel` tests still pass (behavioral regression check)

- [x] Task 6: Unit tests for EventDispatcher pinch support (AC: 3, 4)
  - [x] 6.1 Add tests to `src/interaction/event-dispatcher.test.ts`:
  - [x] 6.2 Test: two touch pointerdown events start pinch tracking (isPinching state)
  - [x] 6.3 Test: pinch pointermove dispatches PinchState with correct centerX, centerY, and scale
  - [x] 6.4 Test: pinch scale > 1 when fingers spread apart, < 1 when fingers move together
  - [x] 6.5 Test: pinch deactivates pointer state (active = false) to hide crosshair
  - [x] 6.6 Test: pointerup during pinch ends pinch tracking
  - [x] 6.7 Test: pointercancel during pinch ends pinch tracking
  - [x] 6.8 Test: mouse events do not trigger pinch (only pointerType === 'touch')
  - [x] 6.9 Test: subscribePinch returns unsubscribe function that removes subscriber
  - [x] 6.10 Test: multiple pinch subscribers all receive updates
  - [x] 6.11 Test: destroy clears pinch tracking state and subscribers
  - [x] 6.12 Test: `touch-action: none` is set on container in constructor and restored in destroy
  - [x] 6.13 Test: `setPointerCapture` is called on touch pointerdown
  - [x] 6.14 Test: single touch pointer does not trigger pinch (need exactly 2)
  - [x] 6.15 Test: third touch pointer is ignored (pinch only tracks first 2)

- [x] Task 7: Unit tests for ZoomHandler.handlePinch (AC: 1, 2, 5, 7)
  - [x] 7.1 Add tests to `src/interaction/zoom-handler.test.ts`:
  - [x] 7.2 Test: handlePinch with scale > 1 (spread) zooms in — X domain narrows
  - [x] 7.3 Test: handlePinch with scale < 1 (pinch) zooms out — X domain widens
  - [x] 7.4 Test: handlePinch centers on pinch midpoint (centerX in data space)
  - [x] 7.5 Test: handlePinch with config.zoom === false does nothing
  - [x] 7.6 Test: handlePinch with scale === 1 does nothing
  - [x] 7.7 Test: handlePinch with scale <= 0 does nothing (invalid)
  - [x] 7.8 Test: handlePinch sets isZoomed = true
  - [x] 7.9 Test: handlePinch Y auto-fits to visible data

- [x] Task 8: Integration tests (AC: 1, 2, 5, 6, 7)
  - [x] 8.1 Create `src/interaction/pinch-zoom-integration.test.ts`
  - [x] 8.2 Test: full GlideChart — simulate two-finger pinch-out gesture → verify scale domain narrowed (zoom in)
  - [x] 8.3 Test: full GlideChart — simulate pinch-in gesture → verify scale domain widened (zoom out)
  - [x] 8.4 Test: pinch on chart with `zoom: false` does not change domain
  - [x] 8.5 Test: streaming data via addData() after pinch zoom preserves viewport (isZoomed guard)
  - [x] 8.6 Test: setData() after pinch zoom resets zoom and auto-fits
  - [x] 8.7 Test: pinch on chart with no data — no errors, no domain change
  - [x] 8.8 Test: destroy cleans up pinch tracking

- [x] Task 9: Verify demo works on touch devices (AC: 1, 2, 4)
  - [x] 9.1 Verify pinch-to-zoom works on the existing demo page (zoom is enabled by default)
  - [x] 9.2 Optionally update demo subtitle to mention pinch zoom alongside scroll zoom

## Dev Notes

### Architecture Compliance

**Module location:** All new code in `src/interaction/` — no new files needed for ZoomHandler changes; EventDispatcher modified in-place. Integration test file `pinch-zoom-integration.test.ts` is new.

**Import DAG:** Same as Story 4.3 — `interaction/` imports from `core/` (Scale, types) and `renderer/types` (LayerType). ZoomHandler does NOT import from `api/` or renderer implementation. EventDispatcher imports only from `./types`.

**Dependency injection:** ZoomHandler already receives Scale + callbacks via constructor. `handlePinch()` follows the same pattern as `handleWheel()` — receives PinchState + config, delegates zoom math to `applyZoom()`.

### Touch Event Architecture

**Pointer Events API (not Touch Events):** The existing EventDispatcher uses Pointer Events (`pointerdown`, `pointermove`, `pointerup`, `pointercancel`), which unify mouse, touch, and pen input. Each touch contact gets a unique `pointerId`. This is the correct modern API for multi-touch detection. Do NOT add `touchstart`/`touchmove`/`touchend` listeners — Pointer Events handle everything.

**Why `touch-action: none` is required:** Without this CSS property, mobile browsers intercept touch gestures for native scroll/zoom before Pointer Events fire. Setting `touch-action: none` on the container tells the browser "I'll handle all touch interactions myself." This is the standard approach for canvas-based interactive content. Without it, pinch gestures will zoom the entire page instead of the chart.

**Pointer capture:** `setPointerCapture(pointerId)` ensures the container receives all subsequent pointer events for that finger, even if the finger moves outside the container bounds during a pinch gesture. This prevents lost pointerup events that would leave the pinch state stuck.

**Pinch distance calculation:**
```
distance = Math.sqrt((x2 - x1)² + (y2 - y1)²)
scale = currentDistance / previousDistance
```
Use `Math.hypot(x2 - x1, y2 - y1)` for distance — clean, readable, and handles edge cases.

**Continuous delta model:** After each pinch move event, update `pinchStartDistance = newDistance` so the next event's scale is relative to the previous position (not the gesture start). This produces smooth, incremental zoom steps that feel natural. Without this, zoom would accelerate as the fingers move further from their starting positions.

**Crosshair suppression during pinch:** When two fingers are down, the crosshair should NOT appear. Set `PointerState.active = false` when `isPinching` becomes true. The crosshair only reappears on the next single-finger/mouse interaction after the pinch ends.

### Zoom Math Reuse

**The `applyZoom(cursorX, factor, config)` method** contains the cursor-centered zoom algorithm from Story 4.3. Both `handleWheel()` and `handlePinch()` delegate to it:

- **Wheel:** `factor = ZOOM_FACTOR` or `1/ZOOM_FACTOR` based on `Math.sign(deltaY)`, `cursorX = scale.pixelToX(wheelState.x)`
- **Pinch:** `factor = 1 / pinchState.scale`, `cursorX = scale.pixelToX(pinchState.centerX)`

The factor inversion for pinch (`1 / scale`) is because `applyZoom` treats `factor > 1` as "widen domain" (zoom out), but `pinchState.scale > 1` means fingers are spreading (user wants zoom in = narrower domain).

### Existing Code to Reuse

- **`ZoomHandler`** (`src/interaction/zoom-handler.ts`) — refactor to extract `applyZoom()`, add `handlePinch()`
- **`EventDispatcher`** (`src/interaction/event-dispatcher.ts`) — extend with pinch tracking (same pattern as wheel extension in 4.3)
- **`Scale.pixelToX()`** (`src/core/scale.ts:137-141`) — convert pinch midpoint pixel to data space
- **`Scale.setDomainX()`** (`src/core/scale.ts:45-56`) — set new zoom domain
- **`Scale.autoFitY()`** (`src/core/scale.ts:97-121`) — auto-fit Y after zoom
- **`getVisibleWindow()`** (`src/core/ring-buffer.ts`) — get visible data for Y auto-fit
- **`FrameScheduler.markDirty()`** — trigger redraws after zoom
- **`LayerType`** (`src/renderer/types.ts`) — layer type enum
- **`GlideChart.autoFitScale()` zoom guard** (`src/api/glide-chart.ts:682-685`) — already respects `zoomHandler.isZoomed`
- **`GlideChart.setData()/clearData()/resize()` zoom reset** — already calls `zoomHandler.resetZoom()`

### Anti-Patterns to Avoid

- **DO NOT** add `touchstart`/`touchmove`/`touchend` listeners — use Pointer Events API exclusively
- **DO NOT** create a separate event dispatcher for touch — extend the existing `EventDispatcher`
- **DO NOT** duplicate the zoom math — extract `applyZoom()` from `handleWheel()` and call it from both wheel and pinch handlers
- **DO NOT** use `requestAnimationFrame` directly — use `frameScheduler.markDirty()`
- **DO NOT** allocate objects in the pointermove handler — pre-allocate `PinchState`, reuse `pinchPointers` map
- **DO NOT** use `export default` — named exports only
- **DO NOT** add runtime dependencies
- **DO NOT** forget `touch-action: none` — without it, pinch gestures will zoom the page
- **DO NOT** forget `setPointerCapture` — without it, touch events are lost when finger moves outside container
- **DO NOT** let the crosshair appear during a two-finger gesture — suppress pointer active state
- **ALL error messages must be prefixed** with class name
- **DO NOT** modify `Scale` class — use existing methods

### Event Listener Count — No Change Expected

Pinch detection piggybacks on existing `pointerdown`/`pointermove`/`pointerup`/`pointercancel` listeners. **No new `addEventListener` calls are needed.** The current count is 6 listeners (5 pointer + 1 wheel). Existing tests that assert listener count should NOT need updating. Do NOT add separate `touchstart`/`touchmove`/`touchend` listeners.

### Testing Standards

- Co-located test files in `src/interaction/`
- Use `vitest-canvas-mock` for Canvas 2D API mocking
- **Simulating touch pointer events in tests:** Create `PointerEvent` instances with `{ pointerType: 'touch', pointerId: <unique id>, offsetX, offsetY, bubbles: true }` and dispatch on the container element. Must dispatch `pointerdown` for 2 different pointerIds to start a pinch, then `pointermove` to simulate gesture
- **Mock `setPointerCapture`/`releasePointerCapture`:** These are DOM methods on HTMLElement — mock them on the container: `container.setPointerCapture = vi.fn()`, `container.releasePointerCapture = vi.fn()`
- Constructor injection makes ZoomHandler fully testable in isolation — mock Scale with simple domain
- For integration tests: create full `GlideChart`, dispatch touch pointer events, verify domain change
- **Consider a shared test helper** for multi-touch simulation — Tasks 6 and 8 both need to simulate two-finger pinch sequences (pointerdown x2, pointermove, pointerup). A helper like `simulatePinch(container, { startDistance, endDistance, centerX, centerY })` would reduce duplication across ~20 tests

### Previous Story Intelligence (Story 4.3)

Key patterns from Story 4.3 that this story MUST follow:
- **WheelState/WheelCallback pattern** — PinchState/PinchCallback follows the same pure-data, pre-allocated, zero-allocation pattern
- **subscribeWheel() pattern** — `subscribePinch()` follows the same subscribe/unsubscribe pattern
- **ZoomHandler receives callbacks via constructor** — `handlePinch()` uses the same injected `markDirty` and `getVisibleValues` callbacks
- **`handleWheel` delegates to `applyZoom` after refactor** — `handlePinch` does the same
- **Review finding from 4.3:** Subscriber exception handling — `notifyPinch()` dispatch MUST be wrapped in try/finally, matching `handleWheel`'s pattern (event-dispatcher.ts:107-111). The `notify()` method for pointer events does NOT have this pattern, so do not copy from `notify()` — copy from `notifyWheel()`
- **Review finding from 4.3:** Empty data handling — `applyZoom()` already handles `getVisibleValues()` returning `[]` correctly
- **493 tests currently passing** — do not break any existing tests

### Git Intelligence

Recent commit: `e30de2f feat: add scroll wheel zoom with review fixes (Story 4.3)`. 493 tests passing, zero lint/type errors. Commit message pattern: `feat: add <description> with review fixes (Story X.Y)`.

### Cross-Story Context

- **Story 4.5 (Keyboard Navigation):** Will add `+`/`-` keyboard zoom calling `zoomHandler.applyZoom()` with center-of-viewport cursor position. The `applyZoom()` extraction in this story directly enables Story 4.5
- **Story 4.6 (Dataset Replace, Clear & Destroy):** All zoom reset logic already in place from Story 4.3

### Edge Cases to Handle

- **Three or more fingers:** Only track the first two touch pointers for pinch. Ignore additional fingers
- **One finger lifts during pinch:** End the pinch gesture immediately, do not convert to single-finger crosshair
- **Very small pinch movements:** `scale` values very close to 1.0 may produce negligible zoom — `applyZoom` clamping handles this naturally
- **Zero distance between fingers:** Guard against division by zero when computing scale ratio — if `pinchStartDistance === 0`, skip the pinch update
- **Finger on non-chart area:** Viewport bounds check is in `applyZoom` via domain clamping — the midpoint computation using `offsetX`/`offsetY` gives coordinates relative to the container, which map correctly through `pixelToX()`

### Project Structure Notes

```
src/interaction/
  types.ts              ← Modify: add PinchState, PinchCallback
  event-dispatcher.ts   ← Modify: add pinch tracking, subscribePinch(), touch-action, pointer capture
  event-dispatcher.test.ts ← Modify: add pinch gesture tests
  zoom-handler.ts       ← Modify: extract applyZoom(), add handlePinch()
  zoom-handler.test.ts  ← Modify: add applyZoom and handlePinch tests
  pinch-zoom-integration.test.ts ← NEW: integration tests
  crosshair.ts          ← No changes
  tooltip.ts            ← No changes
src/api/
  glide-chart.ts        ← Modify: add subscribePinch() call in constructor
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 4, Story 4.4 lines 576-593]
- [Source: _bmad-output/planning-artifacts/prd.md — FR14: pinch-to-zoom on touch devices]
- [Source: _bmad-output/planning-artifacts/architecture.md — Event Handling section lines 245-256: touch → pointer with gesture detection for pinch-zoom]
- [Source: _bmad-output/planning-artifacts/architecture.md — Module Structure line 349: zoom.ts in interaction/]
- [Source: src/interaction/zoom-handler.ts — current implementation, lines 1-105]
- [Source: src/interaction/event-dispatcher.ts — current implementation, lines 1-127]
- [Source: src/interaction/types.ts — PointerState, WheelState, PinchState to add]
- [Source: src/core/scale.ts — pixelToX(), setDomainX(), autoFitY()]
- [Source: src/api/glide-chart.ts:211-221 — ZoomHandler instantiation and wheel subscription pattern]
- [Source: src/api/glide-chart.ts:682-685 — autoFitScale zoom guard]
- [Source: src/config/types.ts — zoom?: boolean config]
- [Source: _bmad-output/implementation-artifacts/4-3-scroll-wheel-zoom.md — ZoomHandler patterns, cross-story context note about applyZoom extraction]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

None

### Completion Notes List

- Extracted `applyZoom(cursorX, factor, config)` from `handleWheel()` in ZoomHandler — cursor-centered zoom math now reusable by both wheel and pinch handlers
- Added `PinchState` and `PinchCallback` types following WheelState/WheelCallback pattern
- Extended EventDispatcher with pinch gesture tracking using Pointer Events API (no new event listeners — piggybacks on existing pointerdown/pointermove/pointerup handlers)
- Added `touch-action: none` CSS on container to prevent browser default pinch-zoom; restored in `destroy()`
- Added `setPointerCapture` for reliable touch tracking across container boundaries
- Crosshair suppressed during two-finger pinch gesture (active = false)
- Continuous delta model: `pinchStartDistance` updated each move for smooth incremental zoom
- Integrated `subscribePinch()` in GlideChart facade — pinch zoom flows through same `applyZoom()` path as wheel zoom
- 38 new tests: 8 applyZoom unit tests, 8 handlePinch unit tests, 14 EventDispatcher pinch tests, 7 integration tests, 1 existing test regression verified
- All 531 tests pass, zero lint errors, zero type errors (pre-existing TS errors in glide-chart.test.ts unchanged)
- Demo subtitle updated to mention pinch zoom

### Review Findings

- [x] [Review][Patch] Crosshair flickers during pinch — `notify()` with `active=true` fires before pinch suppression [event-dispatcher.ts:94-96] — fixed
- [x] [Review][Patch] Remaining finger after pinch end activates crosshair on subsequent moves [event-dispatcher.ts:91-96] — fixed
- [x] [Review][Patch] Pinch permanently frozen if both fingers land at same pixel — `pinchStartDistance=0` deadlock [event-dispatcher.ts:104] — fixed
- [x] [Review][Patch] `handlePinch` does not check viewport bounds (inconsistent with `handleWheel`) [zoom-handler.ts:95-103] — fixed
- [x] [Review][Patch] Crosshair suppression outside try/finally — skipped if subscriber throws [event-dispatcher.ts:109-115] — fixed
- [x] [Review][Patch] Stale pointer position when transitioning pinch pairs (finger A lifts, finger C starts) [event-dispatcher.ts:136-137] — fixed
- [x] [Review][Patch] Integration test only checks domain width, not viewport position for AC6 [pinch-zoom-integration.test.ts:161] — fixed
- [x] [Review][Patch] `touch-action: none` set unconditionally, breaks scroll on zoom-disabled charts [event-dispatcher.ts:31] — fixed: added `disableTouchAction` option, only applied when zoom is enabled

### Change Log

- 2026-03-30: Implemented pinch-to-zoom on touch devices (Story 4.4)

### File List

- src/interaction/types.ts (modified — added PinchState, PinchCallback)
- src/interaction/zoom-handler.ts (modified — extracted applyZoom(), added handlePinch())
- src/interaction/zoom-handler.test.ts (modified — added applyZoom and handlePinch tests)
- src/interaction/event-dispatcher.ts (modified — added pinch tracking, subscribePinch(), touch-action, pointer capture)
- src/interaction/event-dispatcher.test.ts (modified — added 14 pinch gesture tests)
- src/interaction/pinch-zoom-integration.test.ts (new — 7 integration tests)
- src/api/glide-chart.ts (modified — added subscribePinch() call in constructor)
- demo/index.html (modified — updated subtitle to mention pinch zoom)
