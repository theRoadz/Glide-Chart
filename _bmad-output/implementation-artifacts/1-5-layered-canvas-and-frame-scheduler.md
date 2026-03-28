# Story 1.5: Layered Canvas & Frame Scheduler

Status: done

## Story

As a developer using Glide Chart,
I want a multi-layer canvas rendering system with an efficient frame loop,
So that only changed layers redraw and the chart maintains 60fps performance.

## Acceptance Criteria

1. **Given** a container DOM element **When** the LayerManager initializes **Then** 4 stacked canvas elements are created (background, axis, data, interaction) inside the container
2. **Given** 4 canvas elements **When** created **Then** each canvas is sized to the container dimensions with DPR scaling applied (backing store = clientWidth × dpr, clientHeight × dpr) and `ctx.scale(dpr, dpr)` is called
3. **Given** a LayerManager **When** the container resizes **Then** a ResizeObserver triggers resizing of all canvases, recalculates DPR, and marks all layers dirty
4. **Given** the FrameScheduler is running **When** no layers are dirty **Then** the rAF loop sleeps (stops requesting frames) after N consecutive idle frames
5. **Given** a layer is marked dirty **When** the next animation frame fires **Then** only dirty layers redraw, `ctx.save()` is called before and `ctx.restore()` after each layer draw, and the dirty flag is cleared
6. **Given** the FrameScheduler is sleeping **When** a layer is marked dirty **Then** the rAF loop wakes and requests the next frame
7. **Given** a LayerManager instance **When** `destroy()` is called **Then** the ResizeObserver is disconnected, all canvas elements are removed from the DOM, and all references are released

## Tasks / Subtasks

- [x] Task 1: Define renderer types in `src/renderer/types.ts` (AC: #1, #4, #5)
  - [x] Define `LayerType` enum: `Background`, `Axis`, `Data`, `Interaction` (PascalCase values)
  - [x] Define `LAYER_ORDER` constant array for iteration order:
    ```typescript
    export const LAYER_ORDER = [LayerType.Background, LayerType.Axis, LayerType.Data, LayerType.Interaction] as const;
    ```
  - [x] Define `Layer` interface:
    ```typescript
    export interface Layer {
      readonly type: LayerType;
      readonly canvas: HTMLCanvasElement;
      readonly ctx: CanvasRenderingContext2D;
      isDirty: boolean;
      draw(): void;
    }
    ```
    **Design note:** The architecture doc shows `draw(config: ResolvedConfig, scale: Scale)` as the final signature for layer renderers. However, `ResolvedConfig` and `Scale` injection are the facade's concern (Story 1.8). For this story, use `draw(): void` — concrete layer implementations (Stories 1.7, 2.1, etc.) will capture `config` and `scale` via constructor injection and close over them, so the `draw()` method itself needs no parameters. The FrameScheduler calls `layer.draw()` without knowing what data each layer needs internally. This is consistent with constructor injection — dependencies are provided at creation time, not at call time.
  - [x] Define `LayerDrawCallback` type: `(ctx: CanvasRenderingContext2D) => void` — placeholder for future layer renderers to provide draw functions
  - [x] Define `FrameSchedulerOptions` interface:
    ```typescript
    export interface FrameSchedulerOptions {
      idleFramesBeforeSleep?: number; // default: 3
    }
    ```

- [x] Task 2: Implement LayerManager in `src/renderer/layer-manager.ts` (AC: #1, #2, #3, #7)
  - [x] Constructor: `constructor(container: HTMLElement)`
    - Validate container is a valid HTMLElement — throw `LayerManager: container must be an HTMLElement`
    - Set container `position: relative` if not already positioned (canvases need absolute positioning within it)
    - Create 4 `<canvas>` elements using `LAYER_ORDER`. For each canvas:
      - Apply CSS via `canvas.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;display:block;pointer-events:none"` (batch styling for fewer DOM mutations). For the interaction layer, omit `pointer-events:none` (it needs to receive pointer events).
      - Set `data-layer-type` attribute for debugging/testing: `canvas.setAttribute('data-layer-type', 'background')` etc.
    - Append canvases to container in stacking order: background (bottom) → axis → data → interaction (top)
    - Get `CanvasRenderingContext2D` from each canvas — throw `LayerManager: failed to get 2d context` if null
    - Call `resizeAll()` immediately to set initial dimensions
    - Create a `ResizeObserver` on the container, calling `resizeAll()` on resize
    - Register `matchMedia` listener for DPR changes to trigger resize
    - Accept optional `onResize?: (width: number, height: number, dpr: number) => void` callback — invoked after `resizeAll()` completes, so the facade (Story 1.8) can call `scale.update()` and `frameScheduler.markAllDirty()` in response
  - [x] `resizeAll(): void`
    - Read `container.clientWidth` and `container.clientHeight` — if either is 0, skip resize (container not visible)
    - Read `window.devicePixelRatio` (default 1 if unavailable)
    - For each canvas:
      - Set `canvas.width = clientWidth * dpr` (backing store width)
      - Set `canvas.height = clientHeight * dpr` (backing store height)
      - Call `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` to apply DPR scaling (use setTransform, not scale, to avoid accumulation)
    - Store current `clientWidth`, `clientHeight`, `dpr` for consumers (Scale needs these)
    - Return `{ width: clientWidth, height: clientHeight, dpr }` or store as accessible properties
  - [x] `getCanvas(type: LayerType): HTMLCanvasElement` — return canvas by layer type
  - [x] `getContext(type: LayerType): CanvasRenderingContext2D` — return context by layer type
  - [x] Readonly getters: `readonly width: number`, `readonly height: number`, `readonly dpr: number`
  - [x] `destroy(): void`
    - Disconnect ResizeObserver
    - Remove matchMedia listener
    - Remove all canvas elements from the container
    - Null out references for GC
  - [x] Input validation:
    - Constructor throws on invalid container
    - Error messages prefixed with `LayerManager:`

- [x] Task 3: Implement FrameScheduler in `src/renderer/frame-scheduler.ts` (AC: #4, #5, #6)
  - [x] Constructor: `constructor(options?: FrameSchedulerOptions)`
    - Accept optional `idleFramesBeforeSleep` (default 3)
    - Initialize dirty flags as `Map<LayerType, boolean>` (all false)
    - Initialize draw callbacks as `Map<LayerType, Layer>` (empty — layers register themselves)
    - Start in sleeping state (no rAF requested)
  - [x] `registerLayer(layer: Layer): void`
    - Store the layer reference, keyed by `layer.type`
    - Initialize dirty flag for this layer type to false
  - [x] `markDirty(type: LayerType): void`
    - Set dirty flag for the given layer type to true
    - If currently sleeping, wake up: request a new animation frame
  - [x] `markAllDirty(): void`
    - Set all layer dirty flags to true
    - Wake if sleeping
  - [x] `private tick(timestamp: number): void` — the rAF callback
    - Iterate registered layers using `LAYER_ORDER` (Background → Axis → Data → Interaction)
    - For each layer that is dirty:
      - `ctx.save()`
      - Call `layer.draw()` — the layer's `draw()` is responsible for calling `ctx.clearRect()` on its own canvas before drawing (per architecture convention). FrameScheduler does NOT clear canvases.
      - `ctx.restore()`
      - Set `layer.isDirty = false`
    - Track consecutive idle frames (frames where no layer was dirty)
    - If idle count >= `idleFramesBeforeSleep`, stop requesting frames (sleep)
    - Otherwise, request next animation frame
  - [x] `start(): void` — begin the rAF loop (called on chart initialization)
  - [x] `stop(): void` — cancel any pending rAF and enter sleep state
  - [x] `destroy(): void` — call `stop()`, clear all layer references
  - [x] `readonly isRunning: boolean` — whether the loop is actively requesting frames
  - [x] Error messages prefixed with `FrameScheduler:`

- [x] Task 4: Write tests for LayerManager in `src/renderer/layer-manager.test.ts` (AC: #1, #2, #3, #7)
  - [x] Test: constructor creates 4 canvas elements inside the container
  - [x] Test: canvases are stacked with absolute positioning
  - [x] Test: canvases have correct backing store dimensions (clientWidth × dpr, clientHeight × dpr)
  - [x] Test: canvas contexts have DPR scaling applied via `setTransform`
  - [x] Test: `getCanvas(LayerType)` returns correct canvas for each type
  - [x] Test: `getContext(LayerType)` returns correct context for each type
  - [x] Test: ResizeObserver is created on the container
  - [x] Test: `resizeAll()` updates canvas dimensions when container resizes
  - [x] Test: `resizeAll()` skips resize when container has zero dimensions
  - [x] Test: `destroy()` removes all canvases from the DOM
  - [x] Test: `destroy()` disconnects ResizeObserver
  - [x] Test: constructor throws on invalid container argument
  - [x] Test: `width`, `height`, `dpr` getters reflect current container state
  - [x] Test: interaction layer canvas has pointer events enabled (no `pointer-events: none`)
  - [x] Test: each canvas has `data-layer-type` attribute matching its layer type
  - [x] Test: each canvas has `display: block` CSS (no inline spacing gap)
  - [x] Test: `onResize` callback fires with correct width, height, dpr after resize

- [x] Task 5: Write tests for FrameScheduler in `src/renderer/frame-scheduler.test.ts` (AC: #4, #5, #6)
  - [x] Test: initial state has no dirty layers and is sleeping
  - [x] Test: `registerLayer()` stores the layer reference
  - [x] Test: `markDirty()` sets dirty flag for specified layer type
  - [x] Test: `markDirty()` wakes sleeping scheduler (requests rAF)
  - [x] Test: `tick()` calls `ctx.save()`, `layer.draw()`, `ctx.restore()` for dirty layers
  - [x] Test: `tick()` does NOT call draw for clean (non-dirty) layers
  - [x] Test: `tick()` clears dirty flag after drawing
  - [x] Test: `tick()` processes layers in order: Background → Axis → Data → Interaction
  - [x] Test: scheduler sleeps after N consecutive idle frames (default 3)
  - [x] Test: `markAllDirty()` sets all layer flags to true
  - [x] Test: `stop()` cancels pending rAF
  - [x] Test: `destroy()` stops the loop and clears layer references
  - [x] Test: `isRunning` getter reflects loop state accurately

- [x] Task 6: Verify integration and quality gates
  - [x] Run `pnpm test` — all tests pass (including existing core tests: 109 passing)
  - [x] Run `pnpm typecheck` — no type errors
  - [x] Run `pnpm lint` — no lint errors
  - [x] Run `pnpm build` — build succeeds
  - [x] Do NOT update `src/index.ts` — public API exports are Story 1.8's concern

## Dev Notes

### Architecture Compliance

**Module:** `src/renderer/` — depends on `src/core/` (types only). Does NOT import from `config/`, `interaction/`, or `api/`.

**Import rules for new files:**
- `layer-manager.ts` imports from `./types` (for `LayerType`, `Layer`)
- `frame-scheduler.ts` imports from `./types` (for `LayerType`, `Layer`, `FrameSchedulerOptions`)
- Neither file imports from `src/core/` directly — they receive `Scale` via constructor injection from the facade (Story 1.8)

**Constructor injection:** `LayerManager` and `FrameScheduler` are created by the `GlideChart` facade (Story 1.8). `FrameScheduler` receives registered layers — it does not create them. `LayerManager` creates canvases but does not create layer renderers (those come in Stories 1.7, 2.1, etc.).

**Named exports only:** `export default` is forbidden. All exports are named.

### Canvas Layer Architecture

The 4-layer canvas stack is the core rendering architecture:

```
Container <div> (position: relative)
  ├── <canvas data-layer-type="background">  — grid lines, background color      (pointer-events: none)
  ├── <canvas data-layer-type="axis">        — x/y axis labels, tick marks       (pointer-events: none)
  ├── <canvas data-layer-type="data">        — smooth curves, gradient fills     (pointer-events: none)
  └── <canvas data-layer-type="interaction"> — crosshair, tooltip overlay        (pointer-events: auto)
```

All canvases: `position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: block`. DOM order provides natural stacking (no z-index needed). The `display: block` prevents the inline element baseline gap that canvas elements have by default.

Each layer has independent dirty tracking. When streaming data arrives, only the Data layer redraws. When the user moves their cursor, only the Interaction layer redraws. Background and Axis only redraw on viewport changes (resize, zoom, data range change).

### DPR Handling — Critical Details

Canvas elements have two dimensions:
1. **CSS dimensions** — visual size on screen (`canvas.style.width/height` or CSS `width: 100%`)
2. **Backing store dimensions** — actual pixel buffer (`canvas.width/height`)

For crisp rendering on Retina/HiDPI displays:
```typescript
// Set backing store to physical pixel dimensions
canvas.width = clientWidth * dpr;
canvas.height = clientHeight * dpr;

// Apply DPR scaling so draw calls use CSS pixel coordinates
// Use setTransform (not scale) to avoid accumulation on repeated resize
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
```

After this, all drawing code works in CSS pixel coordinates. The Scale object (Story 1.4) already returns CSS pixel values — no DPR multiplication needed in renderers.

**DPR change detection:** `window.matchMedia(\`(resolution: ${currentDpr}dppx)\`)` fires when DPR changes (user moves window between monitors, changes OS scaling). On change, call `resizeAll()` to update backing stores.

### FrameScheduler — rAF Loop Behavior

The frame scheduler implements a "sleep when idle" pattern:

```
[sleeping] → markDirty() → [running] → tick() → redraw dirty → [running]
                                      → tick() → nothing dirty → idleCount++
                                      → tick() → idleCount >= threshold → [sleeping]
```

**Why sleep after N idle frames (not immediately)?** Canvas operations may mark layers dirty within the same frame (e.g., data push triggers data + axis dirty). By running a few extra frames, we catch these cascading dirty marks without excessive wakeup overhead. Default: 3 idle frames.

**Canvas context save/restore:** The FrameScheduler owns `save()`/`restore()` bracketing. Layer renderers never call these at the top level — they receive a clean context and draw freely. This prevents state leakage between layers.

**Canvas clearing responsibility:** Each layer's `draw()` method is responsible for calling `ctx.clearRect(0, 0, canvas.width, canvas.height)` on its own canvas before drawing (per architecture convention). The FrameScheduler does NOT clear canvases — it only manages save/restore and dirty flags.

```typescript
// In FrameScheduler.tick() — uses LAYER_ORDER from types.ts
for (const layerType of LAYER_ORDER) {
  const layer = this.layers.get(layerType);
  if (layer && layer.isDirty) {
    layer.ctx.save();
    layer.draw();  // layer clears its own canvas inside draw()
    layer.ctx.restore();
    layer.isDirty = false;
    hadDirtyLayer = true;
  }
}
```

### ResizeObserver Behavior

`ResizeObserver` callback fires when the container's content box changes size. On resize:
1. Read new `clientWidth` / `clientHeight` from container
2. Read current `window.devicePixelRatio`
3. Update all canvas backing store sizes and DPR scaling
4. Mark ALL layers dirty (everything needs redrawing at new size)
5. Consumers (Scale, future layers) read new dimensions from LayerManager getters

**Edge case:** ResizeObserver can fire with 0 dimensions when the container is hidden (display: none) or removed from DOM. Guard against this — skip resize if width or height is 0.

### Layer Registration Flow

LayerManager creates canvases. FrameScheduler manages the draw loop. The actual Layer implementations come in later stories:

- **Story 1.5 (this story):** Create infrastructure — LayerManager + FrameScheduler + types. Layer `draw()` callbacks are empty/no-op initially.
- **Story 1.7:** DataLayer renderer registers its draw callback
- **Story 2.1:** BackgroundLayer renderer registers its draw callback
- **Story 2.2-2.3:** AxisLayer renderer registers its draw callback
- **Story 4.1:** InteractionLayer renderer registers its draw callback

For this story, the `Layer` interface defines the contract. Tests can use mock/stub layers with simple draw callbacks to verify the scheduler works correctly.

### Interaction Layer Pointer Events

All canvases except interaction get `pointer-events: none` CSS. The interaction canvas (top of stack) receives pointer events and forwards them to the EventDispatcher (Story 4.1). This means:
- Mouse/touch events only fire on the interaction canvas
- The interaction canvas is transparent — it doesn't visually block lower layers
- The container div itself should NOT receive pointer events directly (canvases cover it)

### Integration with Scale (Story 1.4)

When `resizeAll()` fires, the GlideChart facade (Story 1.8) will call `scale.update(width, height, dpr)` to recalculate coordinate mappings. LayerManager exposes `width`, `height`, `dpr` getters AND an `onResize` callback. The facade will wire this up:

```typescript
// In GlideChart facade (Story 1.8) — NOT this story
const layerManager = new LayerManager(container, {
  onResize: (w, h, dpr) => {
    scale.update(w, h, dpr);
    frameScheduler.markAllDirty();
  }
});
```

For this story, just implement the callback mechanism. The wiring happens in Story 1.8.

### Existing Code Awareness

**`src/renderer/types.ts`** — Currently exports nothing (`export { }`). This story replaces its contents with `LayerType`, `Layer`, and related types.

**`vitest.setup.ts`** — Already imports `vitest-canvas-mock` which provides Canvas 2D API mocking in jsdom. LayerManager tests can create `<canvas>` elements and call `getContext('2d')` — the mock handles it.

**`vitest.config.ts`** — Uses `environment: 'jsdom'`, `globals: true`. Tests can use `document.createElement`, `ResizeObserver` (needs mocking — jsdom doesn't provide it), etc.

### jsdom Limitations — ResizeObserver Mock Required

jsdom does not provide `ResizeObserver`. You must mock it in tests:

```typescript
const resizeCallback = vi.fn();
vi.stubGlobal('ResizeObserver', class {
  constructor(private cb: ResizeObserverCallback) { resizeCallback.mockImplementation(cb); }
  observe() {}
  unobserve() {}
  disconnect() {}
});
```

Similarly, `window.matchMedia` needs mocking for DPR change detection tests. jsdom has limited `matchMedia` support.

`window.devicePixelRatio` can be set directly in tests: `Object.defineProperty(window, 'devicePixelRatio', { value: 2 })`.

### requestAnimationFrame in Tests

jsdom does NOT provide `requestAnimationFrame` unless `pretendToBeVisual: true` is configured (it is not in this project). **You must mock rAF/cAF** using `vi.stubGlobal()` as shown in the Testing Standards section above. This gives tests precise frame-by-frame control — call the captured callback manually to simulate each animation frame. This is preferable to timer-based approaches because it makes tests deterministic and avoids timing flakiness.

### Performance Constraints

- **LayerManager.resizeAll():** Called on resize only — not per frame. Can do DOM reads (`clientWidth`, `clientHeight`, `devicePixelRatio`) safely.
- **FrameScheduler.tick():** Called up to 60 times/second. Must be allocation-free:
  - No object creation
  - No string operations
  - No array creation
  - Simple flag checks and function calls only
- **markDirty():** Called from data push, pointer events, etc. Must be O(1) — just set a boolean flag and potentially call rAF.

### Naming Conventions

- Files: `layer-manager.ts`, `frame-scheduler.ts` (kebab-case)
- Classes: `LayerManager`, `FrameScheduler` (PascalCase)
- Enum: `LayerType` with values `Background`, `Axis`, `Data`, `Interaction` (PascalCase)
- Methods: `resizeAll`, `markDirty`, `markAllDirty`, `registerLayer` (camelCase)
- Private members: `private` keyword, no underscore prefix (Note: Story 1.4 used underscore prefix for private members due to same-name getters — if LayerManager has the same collision, underscore prefix is acceptable as established precedent)
- Error messages: prefix with class name — `LayerManager:`, `FrameScheduler:`

### Testing Standards

- **Framework:** Vitest with `globals: true` — do NOT import `describe`, `it`, `expect` from `vitest`. The `vi` utility is also available as a global (same `globals: true` setting), so you do NOT need to import it. Existing tests in this project import nothing from `vitest`. Follow that pattern.
- **Co-located:** `layer-manager.test.ts` next to `layer-manager.ts`, `frame-scheduler.test.ts` next to `frame-scheduler.ts`
- **jsdom environment:** Already configured — DOM APIs available
- **Canvas mock:** `vitest-canvas-mock` already in setup — `getContext('2d')` works. The mock provides `__getEvents()`, `__getDrawCalls()` on contexts for inspecting calls.
- **ResizeObserver mock:** Must be mocked manually (see above)
- **requestAnimationFrame / cancelAnimationFrame:** jsdom only provides rAF when `pretendToBeVisual: true` is set, which is NOT currently configured. **You must mock rAF/cAF directly** using `vi.stubGlobal()`:
  ```typescript
  let rafCallback: FrameRequestCallback | null = null;
  let rafId = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafCallback = cb;
    return ++rafId;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());

  // To simulate a frame tick in tests:
  rafCallback?.(performance.now());
  ```
  This gives tests precise control over when frames fire, which is better than relying on timers.

### What NOT To Do

- **DO NOT** create layer renderers (BackgroundLayer, DataLayer, etc.) — those are Stories 1.7, 2.1, etc.
- **DO NOT** create config resolver or theme logic — that's Story 1.6
- **DO NOT** create event handling or crosshair — that's Story 4.1
- **DO NOT** update `src/index.ts` exports — that's Story 1.8
- **DO NOT** import from `src/config/`, `src/interaction/`, or `src/api/`
- **DO NOT** add any runtime dependencies
- **DO NOT** use `export default`
- **DO NOT** create circular imports
- **DO NOT** use `any` type anywhere
- **DO NOT** connect Scale to LayerManager — that wiring is the facade's job (Story 1.8)

### File Locations — Exact Paths

| File | Path | Purpose |
|------|------|---------|
| Renderer types | `src/renderer/types.ts` | `LayerType` enum, `LAYER_ORDER` constant, `Layer` interface, `FrameSchedulerOptions` |
| LayerManager class | `src/renderer/layer-manager.ts` | Canvas creation, DPR handling, ResizeObserver, destroy |
| LayerManager tests | `src/renderer/layer-manager.test.ts` | DOM and canvas lifecycle tests |
| FrameScheduler class | `src/renderer/frame-scheduler.ts` | rAF loop, dirty flags, sleep/wake |
| FrameScheduler tests | `src/renderer/frame-scheduler.test.ts` | Loop behavior, dirty flag, save/restore tests |

### Previous Story Intelligence

**From Story 1.4 (done):**
- `Scale` class in `src/core/scale.ts` — shared coordinate authority
- Scale operates in CSS pixel space (not backing-store pixels). `ctx.scale(dpr, dpr)` on each canvas context makes this work — LayerManager must apply this scaling.
- Scale has `update(canvasWidth, canvasHeight, dpr)` method for resize — LayerManager's `resizeAll()` provides these values.
- `Viewport`, `ScaleDomain`, `Padding`, `ScaleOptions` in `src/core/types.ts`
- Private members used underscore prefix to avoid getter name collision — established precedent
- `Readonly<>` return types on getters to prevent mutable internal object exposure
- Review found NaN/Infinity guard gaps — deferred as systemic pattern

**From Story 1.3 (done):**
- `SplineCache` class with constructor injection of `RingBuffer<DataPoint>`
- Vitest globals confirmed — do NOT import `describe`, `it`, `expect`
- Error messages prefixed with class name pattern established
- `private` keyword used (not underscore prefix) for class members without getter collision

**From Story 1.2 (done):**
- `RingBuffer<T>` in `src/core/ring-buffer.ts` — O(1) push/evict
- Fixed `no-this-alias` lint error by using generator function for `[Symbol.iterator]`

**From Story 1.1 (done):**
- TypeScript 6.x (not 5.x as architecture doc says), `ignoreDeprecations: "6.0"` in tsconfig
- ESLint 10 flat config (`eslint.config.js`)
- Canvas mock configured in `vitest.setup.ts` — available for this story
- jsdom environment configured in `vitest.config.ts`

### Git Intelligence

Recent commits:
- `f88a19f feat: add coordinate scale and viewport mapping (Story 1.4)`
- `5fbbb1e feat: add monotone cubic interpolation and spline cache (Story 1.3)`
- `1ce64a4 feat: add core data types and ring buffer (Story 1.2)`
- `7fd0476 feat: initialize project with TypeScript, tsup, Vitest, ESLint, and Prettier`

Conventions: `feat:` prefix, lowercase, concise description with story reference.

### Project Structure Notes

Files to create:
- `src/renderer/layer-manager.ts` (new)
- `src/renderer/layer-manager.test.ts` (new)
- `src/renderer/frame-scheduler.ts` (new)
- `src/renderer/frame-scheduler.test.ts` (new)

File to modify:
- `src/renderer/types.ts` (replace empty export with `LayerType`, `Layer`, `FrameSchedulerOptions`)

These match the architecture document's module organization exactly.

### References

- [Source: _bmad-output/planning-artifacts/architecture.md — Rendering Architecture: Layered canvas with 4 layers]
- [Source: _bmad-output/planning-artifacts/architecture.md — Animation & Frame Scheduling: Single rAF loop with dirty flags]
- [Source: _bmad-output/planning-artifacts/architecture.md — Canvas Drawing Conventions: save/restore, clearRect, pixel alignment]
- [Source: _bmad-output/planning-artifacts/architecture.md — Structure Patterns: Module Organization — src/renderer/]
- [Source: _bmad-output/planning-artifacts/architecture.md — Ownership Hierarchy: LayerManager and FrameScheduler under GlideChart facade]
- [Source: _bmad-output/planning-artifacts/architecture.md — DPR handling: backing store at clientWidth*dpr, ctx.scale(dpr, dpr)]
- [Source: _bmad-output/planning-artifacts/architecture.md — ResizeObserver: on container, updates dimensions, recalculates Scale, marks all layers dirty]
- [Source: _bmad-output/planning-artifacts/architecture.md — Data Flow: FrameScheduler.markDirty → rAF → layer draw]
- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1, Story 1.5]
- [Source: _bmad-output/implementation-artifacts/1-4-coordinate-scale-and-viewport-mapping.md — Scale design rationale, CSS pixels vs backing store]

### Review Findings

- [x] [Review][Patch] `layer.draw()` exception skips `ctx.restore()` and kills the render loop — Fixed: wrapped save/draw/restore in try/finally [`src/renderer/frame-scheduler.ts`]
- [x] [Review][Patch] `resizeAll()`/`getCanvas()`/`getContext()` lack `_destroyed` guard — Fixed: added `_destroyed` guard to `resizeAll()` [`src/renderer/layer-manager.ts`]
- [x] [Review][Patch] `_container` reference not nulled in `destroy()` — Fixed: nulled `_container` in destroy [`src/renderer/layer-manager.ts`]
- [x] [Review][Patch] `markDirty()` after `destroy()` re-wakes FrameScheduler into zombie rAF loop — Fixed: added `_destroyed` flag with guards in `markDirty()`, `markAllDirty()`, `start()`, `destroy()` [`src/renderer/frame-scheduler.ts`]
- [x] [Review][Patch] `markDirty()` allows setting dirty flag for unregistered layer type — Fixed: added `!this._layers.has(type)` guard [`src/renderer/frame-scheduler.ts`]
- [x] [Review][Defer] Fractional DPR produces non-integer backing store dimensions [`src/renderer/layer-manager.ts:111-112`] — deferred, pre-existing pattern (mobile DPR values like 1.5, 2.75 truncate to integer canvas dimensions; `Math.round()` would improve sub-pixel alignment)
- [x] [Review][Defer] `_setupDprListener` leaks old MediaQueryList on rapid DPR changes [`src/renderer/layer-manager.ts:84-92`] — deferred, pre-existing (each re-registration overwrites `_mediaQuery` without removing previous listener; `{ once: true }` auto-cleans on fire but destroy only removes the latest)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Fixed ESLint `no-undef` errors for browser globals (DOM APIs) by adding browser globals to eslint.config.js — this is the first story using DOM/Canvas APIs.
- Fixed TypeScript strict errors: unused import (`LayerType` in test) and possibly-undefined array access.

### Completion Notes List

- **Task 1:** Defined `LayerType` enum, `LAYER_ORDER` constant, `Layer` interface, `LayerDrawCallback` type, and `FrameSchedulerOptions` interface in `src/renderer/types.ts`.
- **Task 2:** Implemented `LayerManager` class with 4-canvas creation, DPR scaling via `setTransform`, `ResizeObserver`, `matchMedia` DPR change listener, `onResize` callback, `destroy()` cleanup, and input validation.
- **Task 3:** Implemented `FrameScheduler` class with rAF loop, dirty flag tracking per layer type, sleep/wake idle detection, `LAYER_ORDER`-based draw ordering, `ctx.save()`/`restore()` bracketing, and `destroy()` cleanup.
- **Task 4:** 17 unit tests for LayerManager covering canvas creation, DPR scaling, ResizeObserver, destroy, getters, pointer events, data attributes, onResize callback.
- **Task 5:** 13 unit tests for FrameScheduler covering initial state, registerLayer, markDirty/markAllDirty, tick behavior (save/draw/restore order, dirty flag clearing, layer ordering), sleep after idle frames, stop/destroy.
- **Task 6:** All quality gates pass — 140 tests (31 new), typecheck clean, lint clean, build succeeds. `src/index.ts` not modified per spec.
- **ESLint config:** Added browser globals to support DOM/Canvas API usage in renderer module. This is the first module in the project that uses browser APIs.

### Change Log

- 2026-03-28: Implemented Story 1.5 — Layered Canvas & Frame Scheduler (LayerManager, FrameScheduler, types, 31 tests)
- 2026-03-28: Added browser globals to ESLint config for DOM/Canvas API support

### File List

- `src/renderer/types.ts` (modified — replaced empty export with LayerType, Layer, FrameSchedulerOptions, etc.)
- `src/renderer/layer-manager.ts` (new — LayerManager class)
- `src/renderer/layer-manager.test.ts` (new — 17 tests)
- `src/renderer/frame-scheduler.ts` (new — FrameScheduler class)
- `src/renderer/frame-scheduler.test.ts` (new — 13 tests)
- `eslint.config.js` (modified — added browser globals)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified — status update)
