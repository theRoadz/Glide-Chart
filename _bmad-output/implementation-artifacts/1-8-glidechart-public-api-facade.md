# Story 1.8: GlideChart Public API Facade

Status: done

## Story

As a developer using Glide Chart,
I want a simple public API class that I can instantiate with a container and optional config,
So that I can render a chart with `new GlideChart(container, config)` and see a smooth curve immediately.

## Acceptance Criteria

1. **Given** a container element and a dataset **When** `new GlideChart(container, { series: [{ id: 'price', data: points }] })` is called **Then** a smooth, gradient-filled curve renders in the container with beautiful defaults **And** the chart is responsive to container resize **And** TypeScript types provide full autocomplete for the config object

2. **Given** a GlideChart instance **When** `chart.setData('price', newPoints)` is called **Then** the chart re-renders with the new dataset **And** the spline cache is fully recomputed **And** the data layer is marked dirty

3. **Given** a GlideChart instance **When** `chart.destroy()` is called **Then** all canvases, event listeners, ResizeObserver, and rAF loop are cleaned up **And** no memory leaks remain **And** subsequent method calls throw descriptive errors

4. **Given** a GlideChart instance **When** `chart.addData('price', { timestamp, value })` is called **Then** the new point is appended to the ring buffer **And** only the tail spline segments are recomputed (incremental update) **And** only the data layer is marked dirty

5. **Given** a GlideChart instance **When** `chart.clearData('price')` is called **Then** the specified series data is cleared **When** `chart.clearData()` is called (no argument) **Then** all series are cleared

6. **Given** a GlideChart instance **When** `chart.setConfig(partialConfig)` is called **Then** config is re-resolved (deep merge defaults <- theme <- new user config) **And** all layers are marked dirty and re-render

7. **Given** a GlideChart instance **When** `chart.resize()` is called **Then** canvas dimensions are recalculated **And** Scale is updated **And** all layers are marked dirty (also auto-detects via ResizeObserver from LayerManager)

8. **Given** the `src/index.ts` entry point **When** a consumer imports from `'glide-chart'` **Then** `GlideChart` class and all public types are available with full TypeScript autocomplete

## Tasks / Subtasks

- [x] Task 1: Define public API types in `src/api/types.ts` (AC: #1, #8)
  - [x]Define `GlideChartConfig` extending `ChartConfig` to add initial data:
    ```typescript
    export interface GlideChartConfig extends ChartConfig {
      series?: Array<SeriesConfig & { data?: DataPoint[] }>;
    }
    ```
    Note: `ChartConfig` already has `series?: SeriesConfig[]` but without `data`. The extended version adds optional initial data per-series.
  - [x]Re-export all consumer-facing types: `GlideChartConfig`, `ChartConfig`, `SeriesConfig`, `DataPoint`, `ThemeMode`, `LineConfig`, `GradientConfig`, `GridConfig`, `AnimationConfig`, `AxisConfig`, `CrosshairConfig`, `TooltipConfig`
  - [x]These are the ONLY types exposed to consumers via `src/index.ts`

- [x] Task 2: Implement `GlideChart` facade class in `src/api/glide-chart.ts` (AC: #1-#7)
  - [x]Constructor signature:
    ```typescript
    constructor(container: HTMLElement, config?: GlideChartConfig)
    ```
  - [x]Constructor wiring sequence (ownership hierarchy):
    1. Validate `container` is an HTMLElement — throw `GlideChart: container must be an HTMLElement`
    2. Resolve config: `resolveConfig(config)` → `ResolvedConfig`
    3. Create `LayerManager(container, { onResize })` — creates 4 canvases, ResizeObserver
    4. Create `Scale` from LayerManager dimensions
    5. For each series in resolved config: create `RingBuffer<DataPoint>(config.maxDataPoints)` and `SplineCache(buffer)`
    6. If initial data provided in config, populate each series' ring buffer and compute full splines
    7. Auto-fit scale to initial data: `scale.autoFitX(timestamps)`, `scale.autoFitY(values)`
    8. Create `DataLayerRenderer` with data layer's canvas/ctx, scale, and series render data
    9. Create `Layer` objects that wrap each renderer — for now, only the Data layer has a renderer; Background, Axis, and Interaction layers get no-op `draw()` callbacks
    10. Register all layers with `FrameScheduler`
    11. Create `FrameScheduler` and register layers
    12. Start scheduler and mark data layer dirty for initial render
  - [x]The `onResize` callback from LayerManager should: update Scale dimensions, auto-fit, mark all layers dirty
  - [x]Store `private destroyed = false` flag — check on every public method call

- [x] Task 3: Implement `addData` method (AC: #4)
  - [x]Signature: `addData(seriesId: string, point: DataPoint | DataPoint[]): void`
  - [x]Validate: series exists, point(s) have valid timestamp/value (numbers, not NaN)
  - [x]**Single point:** `ringBuffer.push(point)` then `splineCache.appendPoint()` — appendPoint takes NO arguments, it reads from the buffer internally
  - [x]**Batch (array):** Loop and `ringBuffer.push(p)` for each point, then call `splineCache.computeFull()` once (NOT appendPoint per item — appendPoint is for single incremental updates only)
  - [x]Re-fit scale if new data extends range: check if timestamps/values exceed current domain, only call autoFit if needed
  - [x]Mark data layer dirty (and axis layer if scale range changed)

- [x] Task 4: Implement `setData` method (AC: #2)
  - [x]Signature: `setData(seriesId: string, points: DataPoint[]): void`
  - [x]Validate: series exists
  - [x]Call `ringBuffer.clear()` then loop `ringBuffer.push(p)` for each point (push only accepts single items)
  - [x]Call `splineCache.computeFull()` — full recompute
  - [x]Re-fit scale to new data range
  - [x]Mark data layer dirty (and axis layer)

- [x] Task 5: Implement `clearData` method (AC: #5)
  - [x]Signature: `clearData(seriesId?: string): void`
  - [x]If seriesId provided: call `ringBuffer.clear()` and `splineCache.invalidate()` for that series
  - [x]If no argument: call `ringBuffer.clear()` and `splineCache.invalidate()` for all series
  - [x]Re-fit scale (may shrink if data removed; Scale defaults domain to `{ min: 0, max: 1 }` when no data — this is acceptable for empty state)
  - [x]Mark data layer dirty (and axis layer)

- [x] Task 6: Implement `setConfig` method (AC: #6)
  - [x]Signature: `setConfig(partialConfig: ChartConfig): void`
  - [x]Re-resolve config: `resolveConfig({ ...currentUserConfig, ...partialConfig })`
  - [x]Recreate `DataLayerRenderer` with new resolved series configs (gradient colors may change)
  - [x]Re-register data layer draw callback
  - [x]Mark all layers dirty

- [x] Task 7: Implement `resize` method (AC: #7)
  - [x]Signature: `resize(): void`
  - [x]Call `layerManager.resizeAll()`
  - [x]Update Scale with new canvas dimensions
  - [x]Re-fit data
  - [x]Mark all layers dirty
  - [x]Note: ResizeObserver in LayerManager triggers `onResize` callback automatically — this method is for manual trigger

- [x] Task 8: Implement `destroy` method (AC: #3)
  - [x]Signature: `destroy(): void`
  - [x]Set `destroyed = true`
  - [x]Call `frameScheduler.destroy()` — stops rAF loop
  - [x]Call `layerManager.destroy()` — removes canvases, ResizeObserver, DPR listener
  - [x]Clear all ring buffers and spline caches
  - [x]Null out all references for GC
  - [x]Subsequent method calls should throw `GlideChart: instance has been destroyed`

- [x] Task 9: Update `src/index.ts` to export public API (AC: #8)
  - [x]Export `GlideChart` class from `./api/glide-chart`
  - [x]Export all public types from `./api/types`
  - [x]This is the ONLY place that re-exports — no barrel exports in internal modules

- [x] Task 10: Write tests in `src/api/glide-chart.test.ts` (AC: #1-#8)
  - [x]Test: constructor creates chart with container and renders (canvases created in DOM)
  - [x]Test: constructor with no config uses beautiful defaults
  - [x]Test: constructor with initial data populates ring buffer and computes splines
  - [x]Test: constructor with invalid container throws descriptive error
  - [x]Test: `addData` appends point to correct series buffer
  - [x]Test: `addData` with invalid seriesId throws descriptive error
  - [x]Test: `addData` marks data layer dirty
  - [x]Test: `setData` replaces dataset and recomputes splines
  - [x]Test: `clearData` with seriesId clears specific series
  - [x]Test: `clearData` without args clears all series
  - [x]Test: `setConfig` re-resolves config and marks all dirty
  - [x]Test: `resize` triggers scale update and marks all dirty
  - [x]Test: `destroy` stops scheduler and cleans up LayerManager
  - [x]Test: methods after `destroy` throw error
  - [x]Test: multiple series work independently
  - [x]Test: DataPoint validation (NaN, non-number) throws

- [x] Task 11: Integration verification
  - [x]Run `pnpm test` — all tests pass (218 existing + new facade tests)
  - [x]Run `pnpm typecheck` — no type errors
  - [x]Run `pnpm lint` — no lint errors
  - [x]Run `pnpm build` — build succeeds and exports are resolvable

## Dev Notes

### Architecture Compliance

**Module:** `src/api/glide-chart.ts` — the facade class lives in the `api/` module.

**Import DAG for api/ module:** `api/` can import from ALL internal modules:
- `../core/types` — `DataPoint`
- `../core/ring-buffer` — `RingBuffer`
- `../core/spline-cache` — `SplineCache`
- `../core/scale` — `Scale`
- `../config/types` — `ChartConfig`, `ResolvedConfig`, `ResolvedSeriesConfig`
- `../config/resolver` — `resolveConfig`
- `../renderer/types` — `Layer`, `LayerType`
- `../renderer/layer-manager` — `LayerManager`
- `../renderer/frame-scheduler` — `FrameScheduler`
- `../renderer/layers/data-layer` — `DataLayerRenderer`, `SeriesRenderData`

This is correct per the architecture: `api/` is the facade and imports everything.

**What `react/` and `widget/` may import:** ONLY from `api/`. They never reach into core/, config/, renderer/, or interaction/.

### Ownership Hierarchy (from Architecture)

```
GlideChart (facade)
  ├── ResolvedConfig       → produced by resolveConfig()
  ├── RingBuffer[]         → one per series
  ├── SplineCache[]        → one per series, wraps its RingBuffer
  ├── Scale                → shared coordinate mapping
  ├── LayerManager
  │     ├── Background canvas  → no-op draw for now (Story 2.1)
  │     ├── Axis canvas        → no-op draw for now (Story 2.2/2.3)
  │     ├── Data canvas        → DataLayerRenderer.draw()
  │     └── Interaction canvas → no-op draw for now (Story 4.1)
  ├── FrameScheduler       → owns the rAF loop
  └── (EventDispatcher)    → NOT created yet (Story 4.1)
```

GlideChart creates ALL subsystems and wires them together. No subsystem creates other subsystems.

### Layer Adapter Pattern

The `Layer` interface requires `{ type, canvas, ctx, isDirty, draw() }`. The `DataLayerRenderer` is NOT a `Layer` — it's the drawing logic. Create a simple adapter:

```typescript
function createLayer(
  type: LayerType,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  drawFn: () => void
): Layer {
  return {
    type,
    canvas,
    ctx,
    isDirty: false,
    draw: drawFn,
  };
}
```

For the Data layer: `draw` calls `dataLayerRenderer.draw()`.
For Background, Axis, Interaction: `draw` is a no-op (clears canvas only, or does nothing) — these get real renderers in later stories.

**Important:** `FrameScheduler` calls `ctx.save()` before and `ctx.restore()` after each `draw()`. The `DataLayerRenderer` does NOT call save/restore at the top level.

**Canvas clearing ownership:** `DataLayerRenderer.draw()` owns clearing the data canvas. The no-op layers should clear their own canvas in `draw()` too (each layer clears its own canvas per architecture).

### Scale Integration

The `Scale` constructor needs `ScaleOptions`:
```typescript
{ canvasWidth: number, canvasHeight: number, dpr: number, padding: Padding }
```
**Note:** `padding` is REQUIRED (not optional). Provide a default padding, e.g. `{ top: 10, right: 10, bottom: 10, left: 10 }` — this will be refined in later stories when axes need more space.

Get dimensions from `LayerManager`: `layerManager.width`, `layerManager.height`, `layerManager.dpr`.

After data is loaded, call:
- `scale.autoFitX(allTimestamps)` — sets x domain to [min, max] of timestamps
- `scale.autoFitY(allValues)` — sets y domain to [min, max] of values with padding

On resize (from LayerManager callback or manual `resize()`):
- Call `scale.update(canvasWidth, canvasHeight, dpr)` — takes 3 separate number args, NOT a ScaleOptions object
- Re-autoFit (domain stays same, pixel mapping changes)
- Mark all layers dirty

### Data Flow for addData (single point)

```
chart.addData('price', point)
  → validate seriesId exists
  → ringBuffer.push(point)
  → splineCache.appendPoint()   // NO args — reads from buffer internally; incremental recompute
  → check if point extends scale domain → if yes, autoFitX/autoFitY
  → frameScheduler.markDirty(LayerType.Data)
  → if scale changed: frameScheduler.markDirty(LayerType.Axis)  // for future axis layer
```

### Data Flow for addData (batch)

```
chart.addData('price', [p1, p2, p3])
  → validate seriesId exists
  → for each point: ringBuffer.push(point)   // push only accepts single items
  → splineCache.computeFull()                 // full recompute after batch (not appendPoint per item)
  → autoFitX/autoFitY if range extended
  → frameScheduler.markDirty(LayerType.Data)
  → if scale changed: frameScheduler.markDirty(LayerType.Axis)
```

### Data Flow for setData

```
chart.setData('price', newPoints)
  → validate seriesId exists
  → ringBuffer.clear()
  → for each point: ringBuffer.push(point)   // push only accepts single items
  → splineCache.computeFull()                 // full recompute
  → autoFitX/autoFitY to new data range
  → frameScheduler.markDirty(LayerType.Data)
  → frameScheduler.markDirty(LayerType.Axis)
```

### Input Validation Rules

All public methods validate inputs and throw descriptive errors (architecture pattern):
- `container` must be an HTMLElement — `GlideChart: container must be an HTMLElement`
- `seriesId` must match a configured series — `GlideChart: series '${id}' not found. Add it via config.series first.`
- `DataPoint` must have numeric, non-NaN `timestamp` and `value` — `GlideChart: invalid data point — timestamp and value must be finite numbers`
- Methods on destroyed instance — `GlideChart: instance has been destroyed`
- Error prefix always `GlideChart:` per error handling pattern

### Testing Standards

- **Framework:** Vitest with `globals: true` — do NOT import `describe`, `it`, `expect`, or `vi` from `vitest`
- **Canvas mocking:** `vitest-canvas-mock` — provides mock Canvas 2D API. The `LayerManager` creates real canvas elements in the test DOM (via jsdom), but `getContext('2d')` returns a mock context.
- **Co-located:** `glide-chart.test.ts` next to `glide-chart.ts` in `src/api/`
- **No mocking internal modules:** Use real `RingBuffer`, `SplineCache`, `Scale`, `resolveConfig`, `LayerManager`, `FrameScheduler`, `DataLayerRenderer`. Mock only DOM APIs (canvas, requestAnimationFrame).
- **Constructor injection:** Not applicable here — GlideChart is the top-level wirer. Test by creating real instances and asserting behavior.
- **DOM setup for tests:** Need a container element: `document.createElement('div')` with explicit dimensions set (e.g., `style.width = '800px'`). Note: jsdom may not report `clientWidth`/`clientHeight` properly — may need to mock `getBoundingClientRect` or similar.

### What NOT To Do

- **DO NOT** implement background layer rendering (grid lines) — that's Story 2.1
- **DO NOT** implement axis layer rendering — that's Story 2.2/2.3
- **DO NOT** implement interaction layer rendering (crosshair, tooltip) — that's Story 4.1/4.2
- **DO NOT** implement event handling (EventDispatcher) — that's Story 4.1
- **DO NOT** implement animation/transition logic for addData — Story 3.1 handles animated data transitions
- **DO NOT** add runtime dependencies
- **DO NOT** use `export default` — named exports only
- **DO NOT** use `any` type
- **DO NOT** create circular imports
- **DO NOT** call `requestAnimationFrame` directly — always go through FrameScheduler
- **DO NOT** manually compute data-to-pixel coordinates — always use Scale
- **DO NOT** use `I` prefix on interfaces
- **DO NOT** use underscore prefix for private members

### Project Structure Notes

| File | Path | Purpose |
|------|------|---------|
| Public API types | `src/api/types.ts` | Consumer-facing types (GlideChartConfig, re-exports) |
| Facade class | `src/api/glide-chart.ts` | GlideChart class — wires all subsystems |
| Facade tests | `src/api/glide-chart.test.ts` | Integration tests for public API |
| Entry point | `src/index.ts` | Re-exports GlideChart + public types |

### Previous Story Intelligence

**From Story 1.7 (done — previous story):**
- `DataLayerRenderer` class implemented with constructor injection: `(ctx, canvas, scale, seriesData)`
- `SeriesRenderData` type: `{ buffer: RingBuffer<DataPoint>, splineCache: SplineCache, config: Readonly<ResolvedSeriesConfig> }`
- Pre-computes gradient rgba strings in constructor — must create new `DataLayerRenderer` if config changes
- `hexToRgba()` exported as named export
- `draw()` clears canvas, iterates series, renders gradient then curve per series
- Single point renders as dot, empty data renders nothing
- Performance: optimized with pre-allocated Float64Array for spline point buffer (review fix)
- 218 total tests passing

**From Story 1.6 (done):**
- `resolveConfig(userConfig?: ChartConfig): ResolvedConfig` — deep merges defaults <- theme <- user
- `ResolvedConfig` is deep-frozen (immutable) via `deepFreeze()`
- Per-series config: each series gets resolved `ResolvedSeriesConfig` with line + gradient
- Default: 1 series `{ id: 'default' }` if none specified
- 197 tests passing after 1.6

**From Story 1.5 (done):**
- `LayerManager(container, options?)` — creates 4 canvases, ResizeObserver, DPR handling
- `getCanvas(type)`, `getContext(type)`, `width`, `height`, `dpr`, `resizeAll()`, `destroy()`
- `onResize` callback receives `(width, height, dpr)`
- `FrameScheduler(options?)` — `registerLayer(layer)`, `markDirty(type)`, `markAllDirty()`, `start()`, `stop()`, `destroy()`
- `FrameScheduler` calls `ctx.save()`/`ctx.restore()` around each `draw()` using try/finally
- Sleeps after 3 idle frames (configurable), wakes on `markDirty()`
- Browser globals (document, window, requestAnimationFrame) available via ESLint config

**From Story 1.4 (done):**
- `Scale(options: ScaleOptions)` — `xToPixel(t)`, `yToPixel(v)`, `autoFitX(timestamps)`, `autoFitY(values)`
- `ScaleOptions`: `{ canvasWidth, canvasHeight, dpr, padding: Padding }` — padding is REQUIRED, not optional
- `viewport` getter returns `Readonly<Viewport>` with `{ x, y, width, height }`
- Scale does NOT multiply by DPR — DPR is handled at canvas level
- `scale.update(canvasWidth, canvasHeight, dpr)` — updates canvas size for resize (3 separate number args, NOT a ScaleOptions object)
- `setDomainX(min, max)` and `setDomainY(min, max)` — direct domain setters also available
- Scale defaults domain to `{ min: 0, max: 1 }` on construction

**From Story 1.3 (done):**
- `SplineCache(buffer: RingBuffer<DataPoint>)` — wraps a ring buffer
- `computeFull(): void` — compute all spline coefficients from scratch, no args
- `appendPoint(): void` — NO ARGUMENTS — reads from buffer internally; detects eviction and falls back to computeFull() if eviction occurred, otherwise does incremental recompute of last 2-3 segments
- `invalidate(): void` — clears all cached coefficients, tangents, and valid flag (use for clearData)
- `getCoefficients(): ReadonlyArray<SplineCoefficients>` — returns cached coefficients (empty array if never computed)
- `isValid: boolean` getter — whether cache has valid coefficients
- `segmentCount: number` getter — number of cached segments

**From Story 1.2 (done):**
- `RingBuffer<DataPoint>(capacity)` — capacity is REQUIRED (no default), must be positive integer
- `push(item)` — accepts SINGLE items only (not arrays); loop for batch push
- `clear()` — resets buffer (head=0, tail=0, count=0)
- `get(index)`, `toArray()`, `size`, `isEmpty`, `isFull`, `peek()`, `peekOldest()`
- Supports `for...of` iteration via `Symbol.iterator`
- `resolveConfig()` provides a default `maxDataPoints` value, so RingBuffer capacity is always defined

**From Story 1.1 (done):**
- TypeScript 6.x, `ignoreDeprecations: "6.0"` in tsconfig
- ESLint 10 flat config (`eslint.config.js`)
- Vitest globals: `true` — do NOT import test utilities from `vitest`
- `pnpm build`, `pnpm test`, `pnpm typecheck`, `pnpm lint` all work

### Git Intelligence

Recent commits follow: `feat:` prefix, lowercase, concise description with story reference.

Expected commit message: `feat: add GlideChart public API facade (Story 1.8)`

### Downstream Dependencies

This GlideChart facade will be consumed/extended by:
- **Story 2.1-2.5** — adds real background/axis layer renderers into the layer draw callbacks
- **Story 3.1** — uses `addData()` for real-time streaming; adds animation to data transitions
- **Story 3.2** — adds time window config and auto-scroll behavior
- **Story 4.1-4.6** — adds EventDispatcher, crosshair, tooltip, zoom, keyboard nav, lifecycle methods (clearData/destroy already implemented here)
- **Story 5.1-5.4** — uses `setConfig()` for theme switching and customization
- **Story 6.1-6.2** — React wrapper imports GlideChart from `api/` only
- **Story 7.1-7.2** — Widget imports GlideChart from `api/` only

### References

- [Source: architecture.md — Public API, Facade Pattern, Ownership Hierarchy, Data Flow, Module Boundaries]
- [Source: epics.md — Epic 1, Story 1.8]
- [Source: prd.md — FR28 (beautiful defaults), FR33 (npm install), FR34 (vanilla TypeScript), FR36 (TypeScript types)]
- [Source: project-context.md — Facade pattern, entry points, constructor injection, error handling, sideEffects:false]
- [Source: 1-7-data-layer-rendering-smooth-curve-and-gradient-fill.md — DataLayerRenderer integration, SeriesRenderData, canvas clearing ownership]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Constructor initialization order: Scale and SeriesMap must be created before LayerManager because LayerManager.constructor calls resizeAll() synchronously which triggers onResize callback. Added `initialized` guard flag to prevent handleResize from running during construction.

### Completion Notes List

- Implemented `GlideChartConfig` type extending `ChartConfig` with optional initial data per series
- Re-exported all consumer-facing types from `src/api/types.ts`
- Implemented `GlideChart` facade class wiring all subsystems: resolveConfig, RingBuffer, SplineCache, Scale, LayerManager, FrameScheduler, DataLayerRenderer
- Implemented `addData()` with single-point incremental (appendPoint) and batch (computeFull) paths
- Implemented `setData()` with full buffer replacement and spline recompute
- Implemented `clearData()` with optional seriesId for selective or full clear
- Implemented `setConfig()` with config re-resolution and DataLayerRenderer recreation
- Implemented `resize()` for manual resize trigger
- Implemented `destroy()` with full cleanup and destroyed-guard on all methods
- Updated `src/index.ts` to export GlideChart class and all public types
- Created 29 tests covering constructor, all methods, validation, destroy guard, multi-series, and rendering integration
- All 247 tests pass (218 existing + 29 new), typecheck clean, lint clean, build succeeds

### Change Log

- 2026-03-28: Implemented GlideChart public API facade (Story 1.8) — all tasks complete

### File List

- `src/api/types.ts` (modified) — GlideChartConfig type + consumer-facing type re-exports
- `src/api/glide-chart.ts` (new) — GlideChart facade class
- `src/api/glide-chart.test.ts` (new) — 29 integration tests for public API
- `src/index.ts` (modified) — re-exports GlideChart + public types

### Review Findings

- [x] [Review][Decision] `setConfig` does not handle series additions or removals — fixed: reconciles `seriesMap` (adds new, removes dropped series)
- [x] [Review][Decision] `setConfig` shallow-merges user config instead of deep merge — fixed: uses `deepMerge` from config/resolver
- [x] [Review][Patch] `destroy()` does not null out all references for GC — fixed: nulls out scale, dataLayerRenderer, resolvedConfig, userConfig, layerManager, frameScheduler
- [x] [Review][Patch] `addData` batch with invalid point mid-array produces torn partial state — fixed: validates all points before mutating buffer
- [x] [Review][Patch] `resize()` throws when container is hidden (zero dimensions) — fixed: guards against zero width/height
- [x] [Review][Patch] `SeriesRenderData` exported from `api/types.ts` leaks internal renderer type — fixed: removed export
- [x] [Review][Patch] Type casts circumvent `Readonly` and `Layer` interface in `setConfig` — fixed: made SeriesState.config mutable, removed unsafe casts
