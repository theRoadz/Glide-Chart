# Story 4.1: Event Dispatcher & Crosshair

Status: done

## Story

As a user viewing a Glide Chart,
I want a crosshair overlay that tracks my cursor or touch position,
so that I can precisely identify values at any point on the chart.

## Acceptance Criteria

1. **Given** a rendered chart with mouse/touch support **When** I move my cursor over the chart **Then** a vertical crosshair line tracks the cursor position **And** a horizontal crosshair line shows the corresponding value level **And** the crosshair renders on the interaction layer (separate from data) **And** the crosshair updates at 60fps with no visible lag
2. **Given** a touch device **When** I touch and drag on the chart **Then** the crosshair follows my touch position
3. **Given** the cursor leaves the chart area **When** the pointer exits **Then** the crosshair hides immediately
4. **Given** `crosshair.enabled` is `false` in config **When** pointer events occur **Then** no crosshair is rendered and no unnecessary work is done

## Tasks / Subtasks

- [x] Task 1: Create EventDispatcher class (AC: 1, 2, 3)
  - [x] 1.1 Create `src/interaction/event-dispatcher.ts` — centralised event normalisation
  - [x] 1.2 Register `pointermove`, `pointerleave`, `pointerdown` on the **container div** (not the interaction canvas) via `addEventListener` — the architecture mandates a single listener target for all event types (pointer, wheel, keyboard); this avoids a refactor when Story 4.5 adds keyboard events with `tabindex="0"` on the container
  - [x] 1.3 Normalise PointerEvent to a unified `PointerState` (x, y in CSS pixels relative to canvas, active flag, pointer type)
  - [x] 1.4 Expose a callback registration API so crosshair (and future tooltip/zoom) handlers can subscribe
  - [x] 1.5 Implement `destroy()` that removes all listeners in a single cleanup call
- [x] Task 2: Create Crosshair class (AC: 1, 2, 4)
  - [x] 2.1 Create `src/interaction/crosshair.ts`
  - [x] 2.2 Draw vertical line at pointer X position. For the horizontal line: use `Scale.pixelToX(pointerX)` to convert pointer X to a timestamp, look up the nearest data point value in the ring buffer, then draw the horizontal line at `Scale.yToPixel(nearestValue)` — this snaps the horizontal crosshair to actual data values so users can "precisely identify values" per AC. Use `ResolvedConfig.crosshair` settings (color, lineWidth, dashPattern)
  - [x] 2.6 Receive `Scale` instance (or `Viewport` from `core/types.ts`) to determine plot area bounds — crosshair lines span from `viewport.x` to `viewport.x + viewport.width` (horizontal) and `viewport.y` to `viewport.y + viewport.height` (vertical), NOT the full canvas
  - [x] 2.3 Use `ctx.setLineDash(dashPattern)` for dashed crosshair lines
  - [x] 2.4 Skip draw entirely when `crosshair.enabled === false` or pointer is inactive
  - [x] 2.5 Use 0.5px offset for crisp 1px rendering on crosshair lines
- [x] Task 3: Integrate into GlideChart facade (AC: 1, 2, 3)
  - [x] 3.1 Instantiate EventDispatcher in `GlideChart` constructor, passing the **container div** element (available as `layerManager.container` or the container passed to GlideChart constructor)
  - [x] 3.2 Instantiate Crosshair, subscribe to EventDispatcher pointer updates
  - [x] 3.3 On pointer update: store pointer state, call `frameScheduler.markDirty(LayerType.Interaction)`
  - [x] 3.4 Update the interaction layer draw callback to call Crosshair.draw() (in addition to existing stale overlay)
  - [x] 3.5 On `pointerleave`: clear pointer state, mark interaction dirty to erase crosshair
  - [x] 3.6 Destroy EventDispatcher in `GlideChart.destroy()`
- [x] Task 4: Define interaction types (AC: 1, 2)
  - [x] 4.1 Populate `src/interaction/types.ts` with `PointerState`, `PointerCallback`, and any shared interaction types
- [x] Task 5: Unit tests for EventDispatcher (AC: 1, 2, 3)
  - [x] 5.1 Create `src/interaction/event-dispatcher.test.ts`
  - [x] 5.2 Test: pointermove dispatches normalised coordinates to subscribers
  - [x] 5.3 Test: pointerleave sets active=false and notifies subscribers
  - [x] 5.4 Test: touch events (pointerType === 'touch') work identically
  - [x] 5.5 Test: destroy removes all event listeners
  - [x] 5.6 Test: multiple subscribers all receive updates
  - [x] 5.7 Test: pointerdown sets active=true and enables subsequent pointermove tracking on touch devices
- [x] Task 6: Unit tests for Crosshair (AC: 1, 2, 4)
  - [x] 6.1 Create `src/interaction/crosshair.test.ts`
  - [x] 6.2 Test: draws vertical line at pointer X and horizontal line snapped to nearest data point value
  - [x] 6.3 Test: applies config color, lineWidth, dashPattern
  - [x] 6.4 Test: no draw calls when enabled=false
  - [x] 6.5 Test: no draw calls when pointer is inactive
  - [x] 6.6 Test: clears canvas before drawing
- [x] Task 7: Integration tests (AC: 1, 2, 3)
  - [x] 7.1 Create `src/interaction/crosshair-integration.test.ts` or add to `src/api/glide-chart.test.ts`
  - [x] 7.2 Test: full GlideChart with pointer events triggers interaction layer redraw
  - [x] 7.3 Test: crosshair hidden after pointerleave
  - [x] 7.4 Test: destroy cleans up all event listeners
- [x] Task 8: Update demo page (AC: 1, 2, 3)
  - [x] 8.1 Update `dev/index.html` or add section showing crosshair behaviour

## Dev Notes

### Architecture Compliance

**Module location:** All new files go in `src/interaction/` per the module structure:
```
src/interaction/
  types.ts           ← PointerState, PointerCallback types
  event-dispatcher.ts ← Centralised event normalisation
  crosshair.ts           ← Crosshair position logic, data lookup, and draw (architecture names this `crosshair.ts`)
  event-dispatcher.test.ts
  crosshair.test.ts
  crosshair-integration.test.ts
```

**Import DAG:** `interaction/` can import from `core/`, `config/`, and `renderer/types` only. It CANNOT import from `api/` or `renderer/` implementation files.

**Dependency injection:** EventDispatcher receives the container div element. Crosshair receives `CanvasRenderingContext2D`, `ResolvedConfig`, and `Scale` (for viewport bounds and data coordinate conversion). GlideChart wires everything together.

### Interaction Layer Integration

The interaction layer already exists as the 4th canvas (its style omits `pointer-events`, so it defaults to `auto`; all other layers have `pointer-events: none`). Current draw callback in `glide-chart.ts` (lines ~168-171) clears the canvas and draws the stale overlay. The crosshair draw must be added to this same callback — draw crosshair first, then stale overlay on top.

**Key integration point in `glide-chart.ts`:**
```typescript
// Current interaction layer draw callback (approximate):
() => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawStaleOverlay(ctx, ...);
}
// Must become:
() => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  crosshair.draw(ctx, pointerState, config, scale);
  drawStaleOverlay(ctx, ...);
}
```

### Coordinate System

- Canvas dimensions are physical pixels: `clientWidth * dpr` by `clientHeight * dpr`
- Context has `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` applied by LayerManager — so draw calls use CSS pixel coordinates, NOT physical pixels
- PointerEvent `.offsetX` / `.offsetY` are already in CSS pixels relative to the canvas element — use directly, no conversion needed
- For crosshair lines, use the plot area bounds from `Scale.viewport` (accounting for axis padding)
- **DPR note:** The existing `drawStaleOverlay()` (glide-chart.ts lines 482-543) manually multiplies by DPR while the setTransform is active — do NOT follow that pattern. Use CSS pixel coordinates for the crosshair since the DPR transform handles scaling automatically. The `clearRect` at line 169 uses `canvas.width, canvas.height` (physical pixels) which overshoots harmlessly — follow this same pattern for clearRect only

### Config Defaults Already Exist

`CrosshairConfig` is already in `src/config/types.ts` (lines 44-49) with fields: `enabled`, `color`, `lineWidth`, `dashPattern`. Theme defaults:
- **Dark theme:** `{ enabled: true, color: '#ffffff', lineWidth: 1, dashPattern: [4, 4] }`
- **Light theme:** `{ enabled: true, color: '#333333', lineWidth: 1, dashPattern: [4, 4] }`

These are resolved via `resolveConfig()` — no config changes needed.

### EventDispatcher Design

Use the Pointer Events API (not separate mouse/touch handlers):
- `pointermove` — fires for mouse, touch, and pen
- `pointerleave` — fires when pointer exits the element
- `pointerdown` / `pointerup` — needed for touch drag detection (touch requires initial `pointerdown` before `pointermove`)

Register listeners on the **container div** element (the parent wrapping all canvases). The architecture mandates a single listener target for all event types. The container is available as the element passed to GlideChart constructor. Do NOT register on the interaction canvas — keyboard events in Story 4.5 require `tabindex="0"` on the container.

**Performance:** Do NOT allocate objects in the event handler hot path. Pre-allocate a reusable `PointerState` object and mutate it. The callback subscriber should read values and mark dirty — no heavy work in the event handler itself.

### Render Loop Integration

The crosshair does NOT create its own rAF loop. Flow:
1. PointerEvent fires → EventDispatcher normalises → callback fires
2. Callback stores pointer state + calls `frameScheduler.markDirty(LayerType.Interaction)`
3. FrameScheduler's next tick calls the interaction layer draw callback
4. Draw callback: `clearRect` → `crosshair.draw()` → `drawStaleOverlay()`

This ensures crosshair renders at 60fps via the existing single rAF loop.

### Existing Patterns to Follow

- **StaleDetector pattern (Story 3.4):** Similar lifecycle — created by GlideChart, receives dependencies via constructor, has `destroy()` method. Follow the same integration pattern.
- **Layer draw callbacks:** Each layer's draw function is a closure defined in `GlideChart` constructor that captures needed references. Crosshair rendering slots into the interaction layer's existing closure.
- **No allocations in draw():** Pre-allocate any path arrays or temporary objects. The `draw()` method should only call Canvas 2D API methods.
- **FrameScheduler wraps draw() in ctx.save()/ctx.restore():** (frame-scheduler.ts lines 96-101). Crosshair.draw() must NOT call save()/restore() itself — the scheduler already handles this.
- **FrameScheduler auto-wakes on markDirty():** When the scheduler is sleeping (no dirty flags), calling `markDirty()` automatically restarts the rAF loop. No manual wake logic needed.

### Anti-Patterns to Avoid

- **DO NOT** add `mousemove`/`touchmove` separately — use PointerEvents API exclusively
- **DO NOT** call `requestAnimationFrame` directly — always go through FrameScheduler dirty flags
- **DO NOT** create a new canvas for the crosshair — use the existing interaction layer canvas
- **DO NOT** add any runtime dependencies
- **DO NOT** use `export default` — named exports only
- **DO NOT** put types in the implementation files — shared types go in `src/interaction/types.ts`
- **ALL error messages must be prefixed** with class name — e.g., `"EventDispatcher: container element is required"`, `"Crosshair: scale instance is required"`

### Testing Standards

- Co-located test files in `src/interaction/`
- Use `vitest-canvas-mock` for Canvas 2D API mocking
- Mock `PointerEvent` by creating plain objects with `offsetX`, `offsetY`, `pointerType`, `type` properties and dispatching via `element.dispatchEvent(new PointerEvent(...))`
- Constructor injection makes EventDispatcher and Crosshair fully testable in isolation
- Verify `addEventListener`/`removeEventListener` calls for cleanup testing

### Cross-Story Context

This story establishes the interaction infrastructure that Stories 4.2-4.5 build upon:
- **Story 4.2 (Tooltip):** Will subscribe to EventDispatcher and use pointer position to render tooltip — EventDispatcher callback API must support multiple subscribers
- **Story 4.3 (Scroll Zoom):** Will subscribe to `wheel` events via EventDispatcher
- **Story 4.4 (Pinch Zoom):** Will subscribe to multi-touch pointer events via EventDispatcher
- **Story 4.5 (Keyboard):** Will subscribe to `keydown` events via EventDispatcher

Design EventDispatcher to be extensible for additional event types without modifying existing subscribers.

### Git Intelligence

Recent commit pattern: `feat: add <feature description> (Story X.Y)`. Last commit was `cda52b3 feat: add stale data visual indicator with review fixes (Story 3.4)`. All 418 tests passing, no lint or type errors.

### Project Structure Notes

- Files align with `src/interaction/` module boundary per architecture doc
- `src/interaction/types.ts` exists but is empty (`export { }`) — ready to be populated
- No conflicts with existing code paths — interaction layer draw callback is the only integration point

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 4, Story 4.1 lines 514-535]
- [Source: _bmad-output/planning-artifacts/prd.md — FR11: crosshair overlay]
- [Source: _bmad-output/planning-artifacts/architecture.md — Event Handling section, Interaction module]
- [Source: src/config/types.ts:44-49 — CrosshairConfig interface]
- [Source: src/config/themes.ts:47-52, 108-113 — crosshair theme defaults]
- [Source: src/core/scale.ts — pixelToX(), pixelToY(), xToPixel(), yToPixel(), viewport bounds]
- [Source: src/core/types.ts — Viewport, DataPoint, Padding types]
- [Source: src/renderer/layer-manager.ts — interaction canvas setup, container element]
- [Source: src/renderer/frame-scheduler.ts — dirty flag mechanism]
- [Source: src/api/glide-chart.ts:168-171 — interaction layer draw callback]
- [Source: _bmad-output/implementation-artifacts/3-4-stale-data-visual-indicator.md — previous story patterns]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

No issues encountered during implementation.

### Completion Notes List

- Implemented EventDispatcher class with centralised pointer event normalisation on the container div
- EventDispatcher uses PointerEvents API exclusively (pointermove, pointerleave, pointerdown), pre-allocates reusable PointerState object
- Implemented Crosshair class with vertical line at pointer X and horizontal line snapped to nearest data point value via Scale.pixelToX() lookup
- Crosshair uses 0.5px offset for crisp rendering, respects config (color, lineWidth, dashPattern), skips draw when disabled or inactive
- Crosshair uses CrosshairDataSource interface for data access — receives ring buffers from GlideChart via closure
- Integrated into GlideChart facade: EventDispatcher and Crosshair instantiated in constructor, interaction layer draw callback updated to draw crosshair before stale overlay
- EventDispatcher destroyed in GlideChart.destroy()
- Added PointerEvent and PointerEventInit to ESLint browser globals
- 21 new tests added (8 EventDispatcher unit, 7 Crosshair unit, 4 integration, 2 constructor validation)
- All 439 tests pass (418 existing + 21 new), zero lint errors, zero type errors
- Demo page subtitle updated to mention crosshair — crosshair works automatically on all existing charts

### Change Log

- 2026-03-30: Implemented Story 4.1 — Event Dispatcher & Crosshair (all 8 tasks complete)

### Review Findings

- [x] [Review][Patch] `findNearestValue` O(N) linear scan — added early termination for sorted data [src/interaction/crosshair.ts:77-90]
- [x] [Review][Patch] `getBuffers()` allocates array every frame — pre-allocated buffer list at construction [src/api/glide-chart.ts:183-185]
- [x] [Review][Patch] `ctx.setLineDash([])` allocates every frame — use pre-allocated EMPTY_DASH constant [src/interaction/crosshair.ts:74]
- [x] [Review][Patch] Missing `pointerup`/`pointercancel` — crosshair persists after touch end — added handlers [src/interaction/event-dispatcher.ts]
- [x] [Review][Patch] `CrosshairDataSource` interface in wrong file — moved to `types.ts` [src/interaction/crosshair.ts:7-9]
- [x] [Review][Patch] `buffer.get(i)!` unsafe non-null assertion — added null guard with continue [src/interaction/crosshair.ts:83]
- [x] [Review][Patch] No `unsubscribe` mechanism — subscribe now returns cleanup function [src/interaction/event-dispatcher.ts:27-28]

### File List

- src/interaction/types.ts (modified — populated with PointerState, PointerCallback)
- src/interaction/event-dispatcher.ts (new)
- src/interaction/crosshair.ts (new)
- src/interaction/event-dispatcher.test.ts (new)
- src/interaction/crosshair.test.ts (new)
- src/interaction/crosshair-integration.test.ts (new)
- src/api/glide-chart.ts (modified — integrated EventDispatcher and Crosshair)
- eslint.config.js (modified — added PointerEvent, PointerEventInit globals)
- demo/index.html (modified — updated subtitle)
- _bmad-output/implementation-artifacts/sprint-status.yaml (modified — status update)

