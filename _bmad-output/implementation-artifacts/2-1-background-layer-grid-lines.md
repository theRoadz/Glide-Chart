# Story 2.1: Background Layer — Grid Lines

Status: done

## Story

As a developer using Glide Chart,
I want grid lines rendered on the background canvas layer,
So that data values are easier to read at a glance.

## Acceptance Criteria

1. **Given** a chart with data rendered **When** the background layer draws **Then** horizontal and vertical grid lines are rendered at appropriate intervals **And** grid lines use 0.5px offset for crisp 1px rendering **And** grid line spacing adapts to the current viewport/zoom level **And** grid renders on the background layer (not the data layer) so it only redraws on viewport change

2. **Given** a chart with `grid.visible: false` in config **When** the background layer draws **Then** no grid lines are rendered (canvas is cleared only)

3. **Given** a chart with custom grid config (color, opacity, lineWidth) **When** the background layer draws **Then** grid lines use the configured appearance values from `ResolvedConfig.grid`

4. **Given** a chart that is resized **When** the ResizeObserver fires and the background layer redraws **Then** grid lines recalculate to the new viewport dimensions **And** spacing remains appropriate for the new size

5. **Given** a chart where the data range changes (new data extends scale domain) **When** the background layer is marked dirty and redraws **Then** grid lines reposition to match the updated Scale domain

6. **Given** an empty dataset (no data points) **When** the background layer draws **Then** grid lines still render using the default Scale domain (0 to 1) — the chart renders gracefully with no data

## Tasks / Subtasks

- [x] Task 1: Create `BackgroundLayerRenderer` class in `src/renderer/layers/background-layer.ts` (AC: #1, #2, #3)
  - [x] Constructor signature: `(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, scale: Scale, config: Readonly<ResolvedConfig>)`
  - [x] Implement `draw(): void` method:
    1. `ctx.clearRect(0, 0, canvas.width, canvas.height)` — each layer clears its own canvas
    2. Early return if `config.grid.visible === false`
    3. Compute horizontal grid line positions (Y-axis values) using "nice number" tick generation from `scale.domainY`
    4. Compute vertical grid line positions (X-axis timestamps) using "nice number" tick generation from `scale.domainX`
    5. Set canvas state: `ctx.globalAlpha`, `ctx.strokeStyle`, `ctx.lineWidth` from grid config
    6. Call `ctx.beginPath()` once, then loop all horizontal lines with `moveTo/lineTo`, then all vertical lines with `moveTo/lineTo`, then call `ctx.stroke()` once — batching into a single path+stroke is critical for performance
    7. Reset `ctx.globalAlpha = 1.0` after stroke
  - [x] Implement private `computeNiceTicks(min: number, max: number, maxTicks: number): number[]` utility
    - Use the "nice numbers" algorithm (1, 2, 5 multiplied by powers of 10) to choose human-friendly intervals
    - `maxTicks` should be derived from viewport size (e.g., `Math.floor(viewportHeight / MIN_GRID_SPACING)` for horizontal lines)
    - Return array of values where grid lines should be drawn
    - Handle edge case: if `min === max` (zero range), return a single tick at `min` or empty array — `Math.log10(0)` returns `-Infinity` so guard against zero/negative range before computing
  - [x] Export both `BackgroundLayerRenderer` and `computeNiceTicks` as named exports (no `export default`) — axis stories 2.2/2.3 will reuse `computeNiceTicks` for aligned tick positions

- [x] Task 2: Wire `BackgroundLayerRenderer` into `GlideChart` facade in `src/api/glide-chart.ts` (AC: #1, #4, #5)
  - [x] Import `BackgroundLayerRenderer` from `../renderer/layers/background-layer`
  - [x] In constructor, after resolving config and creating Scale, instantiate `BackgroundLayerRenderer`:
    ```typescript
    this.backgroundLayerRenderer = new BackgroundLayerRenderer(bgCtx, bgCanvas, this.scale, this.resolvedConfig);
    ```
  - [x] Replace the current no-op background layer draw function:
    ```typescript
    // BEFORE:
    createLayer(LayerType.Background, bgCanvas, bgCtx, () => {
      bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
    }),
    // AFTER:
    createLayer(LayerType.Background, bgCanvas, bgCtx, () => {
      this.backgroundLayerRenderer.draw();
    }),
    ```
  - [x] Store `backgroundLayerRenderer` as private field (type `BackgroundLayerRenderer`)
  - [x] Mark background layer dirty on: resize, setConfig, setData, addData (when scale domain changes), clearData
  - [x] In `setConfig()`: recreate `BackgroundLayerRenderer` with new resolved config (grid config may change)
  - [x] In `destroy()`: null out reference with `this.backgroundLayerRenderer = null!;` — use the `null!` non-null assertion pattern matching existing destroy() cleanup (e.g., `this.dataLayerRenderer = null!;`)

- [x] Task 3: Mark background layer dirty at appropriate times (AC: #4, #5)
  - [x] In `handleResize()`: already calls `markAllDirty()` — background redraws automatically
  - [x] In `setConfig()`: already calls `markAllDirty()` — background redraws automatically
  - [x] In `addData()`: find the existing block that conditionally marks `LayerType.Axis` dirty when scale domain changes — add `this.frameScheduler.markDirty(LayerType.Background)` alongside it so grid repositions when domain extends
  - [x] In `setData()`: add `this.frameScheduler.markDirty(LayerType.Background)` alongside the existing `markDirty(LayerType.Axis)` call
  - [x] In `clearData()`: add `this.frameScheduler.markDirty(LayerType.Background)` alongside the existing `markDirty(LayerType.Axis)` call

- [x] Task 4: Write tests in `src/renderer/layers/background-layer.test.ts` (AC: #1-#6)
  - [x] Test: `draw()` clears the canvas first
  - [x] Test: `draw()` draws horizontal grid lines within viewport bounds
  - [x] Test: `draw()` draws vertical grid lines within viewport bounds
  - [x] Test: grid lines use 0.5px offset (check `moveTo`/`lineTo` coordinates end in `.5`)
  - [x] Test: `draw()` uses config grid color, opacity, and lineWidth
  - [x] Test: `draw()` resets `globalAlpha` to 1.0 after rendering (prevents opacity leaking to other layers)
  - [x] Test: `draw()` renders nothing when `grid.visible === false` (only clearRect called)
  - [x] Test: tick spacing produces reasonable number of lines (not too many, not too few)
  - [x] Test: grid lines stay within viewport boundaries (viewport.x to viewport.x + viewport.width)
  - [x] Test: empty domain (min === max) does not crash — handles edge case gracefully
  - [x] Test: `computeNiceTicks` returns human-friendly intervals (multiples of 1, 2, 5)

### Review Findings

- [x] [Review][Patch] Background layer not marked dirty on initial construction — grid won't render on first frame. Add `this.frameScheduler.markDirty(LayerType.Background)` at line 159 of `src/api/glide-chart.ts` alongside `markDirty(LayerType.Data)` [src/api/glide-chart.ts:159]
- [x] [Review][Defer] `niceNum()` produces tickSpacing=0 with subnormal float inputs (e.g., 5e-324) — deferred, pre-existing algorithm edge case guarded by Scale
- [x] [Review][Defer] 0.5px crisp-line offset may not be pixel-perfect at dpr > 1 — deferred, pre-existing rendering pattern decision
- [x] [Review][Defer] `setData()` is non-atomic (clears buffer before validating all points) — deferred, pre-existing in glide-chart.ts

- [x] Task 5: Integration verification
  - [x] Run `pnpm test` — all tests pass (247 existing + new background layer tests)
  - [x] Run `pnpm typecheck` — no type errors
  - [x] Run `pnpm lint` — no lint errors
  - [x] Run `pnpm build` — build succeeds

## Dev Notes

### Architecture Compliance

**Module:** `src/renderer/layers/background-layer.ts` — lives in the `renderer/layers/` directory, alongside `data-layer.ts`.

**Import DAG for renderer/ module:** `renderer/` can import from `core/` and `config/`:
- `../../core/scale` — `Scale` (for viewport, domain, coordinate conversion)
- `../../config/types` — `ResolvedConfig`, `GridConfig` (for grid appearance)

**DO NOT** import from `api/`, `interaction/`, or `react/` — that would violate the module DAG.

### Pixel Alignment — Critical Rendering Detail

Grid lines MUST use 0.5px offset for crisp 1px rendering on standard displays:
```typescript
// Crisp horizontal line
const y = Math.round(scale.yToPixel(value)) + 0.5;
ctx.moveTo(viewport.x, y);
ctx.lineTo(viewport.x + viewport.width, y);

// Crisp vertical line
const x = Math.round(scale.xToPixel(timestamp)) + 0.5;
ctx.moveTo(x, viewport.y);
ctx.lineTo(x, viewport.y + viewport.height);
```

Data curves do NOT pixel-align (sub-pixel rendering makes them smooth). Grid lines MUST pixel-align.

### Nice Number Tick Generation Algorithm

Grid line spacing must produce human-friendly intervals. Implement a "nice numbers" algorithm:

```
function niceNum(range: number, round: boolean): number {
  const exp = Math.floor(Math.log10(range));
  const frac = range / Math.pow(10, exp);
  let nice: number;
  if (round) {
    if (frac < 1.5) nice = 1;
    else if (frac < 3) nice = 2;
    else if (frac < 7) nice = 5;
    else nice = 10;
  } else {
    if (frac <= 1) nice = 1;
    else if (frac <= 2) nice = 2;
    else if (frac <= 5) nice = 5;
    else nice = 10;
  }
  return nice * Math.pow(10, exp);
}
```

**Edge case guard:** If `range <= 0` (min === max, or degenerate domain), return early with a single tick at `min` or empty array. `Math.log10(0)` returns `-Infinity` which will break the algorithm.

Use this to determine tick spacing: compute range, divide by desired tick count, round to a nice number, then generate tick values starting from `Math.ceil(min / tickSpacing) * tickSpacing`.

The target number of grid lines should adapt to viewport size:
- Horizontal lines: `Math.max(3, Math.floor(viewport.height / 60))` — minimum ~60px between horizontal lines
- Vertical lines: `Math.max(3, Math.floor(viewport.width / 100))` — minimum ~100px between vertical lines

### Color Application with Opacity

Grid config provides `color` (hex string) and `opacity` (0-1) separately. Apply opacity via `ctx.globalAlpha`. Batch all lines into a single path for performance:

```typescript
ctx.globalAlpha = config.grid.opacity;
ctx.strokeStyle = config.grid.color;
ctx.lineWidth = config.grid.lineWidth;
ctx.beginPath();
// loop horizontal lines: moveTo/lineTo pairs
// loop vertical lines: moveTo/lineTo pairs
ctx.stroke();
ctx.globalAlpha = 1.0; // MUST reset — otherwise axis/data/interaction layers inherit wrong opacity
```

**Critical:** Always reset `globalAlpha` to 1.0 after drawing. FrameScheduler calls `save()/restore()` around each layer, so restore will also reset it — but explicit reset is defensive and documents intent.

### Canvas Clearing Ownership

Each layer clears its OWN canvas at the start of `draw()`. The FrameScheduler calls `ctx.save()` before and `ctx.restore()` after each layer's `draw()`, but the layer is responsible for clearing. `BackgroundLayerRenderer.draw()` must call `ctx.clearRect(0, 0, canvas.width, canvas.height)` first.

### Following the DataLayerRenderer Pattern

Mirror the `DataLayerRenderer` constructor injection pattern:
- Receives `ctx`, `canvas`, `scale`, and config via constructor
- Has a `draw()` public method
- Private helper methods for internal logic
- No allocations in `draw()` path — pre-compute or cache what you can
- Named export only

### What NOT To Do

- **DO NOT** render axis labels or tick marks — that's Story 2.2/2.3
- **DO NOT** render background color fill — grid lines only (background is transparent/cleared)
- **DO NOT** add runtime dependencies
- **DO NOT** use `export default` — named exports only
- **DO NOT** use `any` type
- **DO NOT** create circular imports
- **DO NOT** call `requestAnimationFrame` directly — FrameScheduler handles this
- **DO NOT** manually compute data-to-pixel coordinates — always use Scale methods (`xToPixel`, `yToPixel`)
- **DO NOT** use `I` prefix on interfaces or `_` prefix for private members
- **DO NOT** import test utilities (`describe`, `it`, `expect`, `vi`) from `vitest` — globals are enabled

### Project Structure Notes

| File | Path | Purpose |
|------|------|---------|
| Background layer renderer | `src/renderer/layers/background-layer.ts` | Grid line rendering on background canvas |
| Background layer tests | `src/renderer/layers/background-layer.test.ts` | Unit tests for grid rendering |
| GlideChart facade | `src/api/glide-chart.ts` | Wire BackgroundLayerRenderer into facade (modify existing) |

### Previous Story Intelligence

**From Story 1.8 (done — previous story):**
- Background layer currently wired as no-op: `bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height)`
- GlideChart facade at `src/api/glide-chart.ts` — constructor lines ~126-136 create background layer
- `setConfig()` recreates DataLayerRenderer — follow same pattern for BackgroundLayerRenderer
- `destroy()` nulls out all references with `null!` assertion pattern — add `this.backgroundLayerRenderer = null!;`
- All layers registered with FrameScheduler; `markAllDirty()` used on resize and setConfig
- 247 total tests passing
- `createLayer()` helper function at top of file creates Layer objects from draw callbacks
- `initialized` guard flag prevents handleResize during construction

**From Story 1.7 (done):**
- `DataLayerRenderer` pattern: constructor `(ctx, canvas, scale, seriesData)`, public `draw()`, private helpers
- Pre-computes rgba strings in constructor (performance: avoid per-frame string work)
- `draw()` calls `clearRect` then iterates and renders
- Named export, co-located test file

**From Story 1.5 (done):**
- `LayerManager` creates canvases, provides `getCanvas(type)` and `getContext(type)`
- `FrameScheduler` wraps draw calls in `save()/restore()` — renderers do NOT call save/restore
- Layer dirty flags managed by FrameScheduler: `markDirty(LayerType)`, `markAllDirty()`

**From Story 1.4 (done):**
- `Scale` provides: `viewport` (Readonly<Viewport>), `domainX`, `domainY` (Readonly<ScaleDomain>), `xToPixel()`, `yToPixel()`
- Viewport = canvas area minus padding: `{ x: padding.left, y: padding.top, width, height }`
- All coordinate conversion MUST go through Scale — no manual math

**From Story 1.6 (done):**
- Grid config in resolved config: `grid: { visible: boolean, color: string, opacity: number, lineWidth: number }`
- Dark theme defaults: `grid.color = '#ffffff'`, `grid.opacity = 0.06`, `grid.lineWidth = 1`
- Light theme defaults: `grid.color = '#000000'`, `grid.opacity = 0.08`, `grid.lineWidth = 1`
- Config is deep-frozen (Readonly) — never mutate

### Git Intelligence

Recent commits follow: `feat:` prefix, lowercase, concise description with story reference.
Example: `feat: add data layer rendering with smooth curve and gradient fill (Story 1.7)`

Expected commit message: `feat: add background layer grid line rendering (Story 2.1)`

### Downstream Dependencies

This background layer grid renderer will be referenced by:
- **Story 2.2/2.3** — Axis layer renderers will reuse the exported `computeNiceTicks` function for aligned tick positions. Export it as a named export from `background-layer.ts`.
- **Story 5.3** — Grid customization (visibility, opacity, color, dash style) will extend `GridConfig` and be consumed by this renderer.

### References

- [Source: architecture.md — Rendering Architecture, Layer Structure, Pixel Alignment]
- [Source: epics.md — Epic 2, Story 2.1]
- [Source: prd.md — FR24 (custom grid appearance), NFR11 (WCAG AA contrast)]
- [Source: project-context.md — Layered canvas architecture, pixel alignment, dirty flag system, canvas clearing ownership]
- [Source: 1-8-glidechart-public-api-facade.md — Ownership hierarchy, background layer wiring, layer creation pattern]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

None — clean implementation, no issues encountered.

### Completion Notes List

- Created `BackgroundLayerRenderer` class with constructor injection pattern matching `DataLayerRenderer`
- Implemented `computeNiceTicks()` utility using "nice numbers" algorithm (1, 2, 5 × 10^n intervals) — exported as named export for reuse in Stories 2.2/2.3
- Grid lines use 0.5px offset for crisp 1px rendering on standard displays
- All lines batched into a single `beginPath()/stroke()` call for performance
- `globalAlpha` explicitly reset to 1.0 after rendering
- Wired `BackgroundLayerRenderer` into `GlideChart` facade with proper lifecycle management
- Background layer marked dirty on: resize (via `markAllDirty`), `setConfig` (via `markAllDirty`), `addData` (when scale changes), `setData`, `clearData`
- 17 new tests added covering all acceptance criteria including edge cases
- All 264 tests pass, typecheck clean, lint clean, build succeeds

### Change Log

- 2026-03-28: Implemented Story 2.1 — Background layer grid line rendering

### File List

- `src/renderer/layers/background-layer.ts` (new) — BackgroundLayerRenderer class and computeNiceTicks utility
- `src/renderer/layers/background-layer.test.ts` (new) — 17 unit tests for grid rendering
- `src/api/glide-chart.ts` (modified) — Wired BackgroundLayerRenderer, added dirty marking for background layer
