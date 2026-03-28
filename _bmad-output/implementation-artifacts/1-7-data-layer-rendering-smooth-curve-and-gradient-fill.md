# Story 1.7: Data Layer Rendering — Smooth Curve & Gradient Fill

Status: done

## Story

As a developer using Glide Chart,
I want the data layer to render smooth curves with gradient area fills on canvas,
So that the chart displays the signature flowing line aesthetic.

## Acceptance Criteria

1. **Given** a dataset loaded into the ring buffer with computed spline coefficients **When** the data layer draws **Then** a smooth curve is rendered using the cached spline coefficients on the canvas
2. **Given** a dataset with a gradient-enabled config **When** the data layer draws **Then** a gradient area fill is drawn beneath the curve (from line to bottom of viewport)
3. **Given** a rendered curve **When** visually inspected **Then** the curve passes through every data point (monotone cubic — no overshooting)
4. **Given** a dataset rendering **When** timing is measured **Then** rendering completes within the frame budget (~16ms) for up to 10,000 points
5. **Given** a dirty data layer **When** `draw()` is called **Then** the canvas is cleared before each redraw (no ghost artifacts)
6. **Given** fewer than 2 data points **When** the data layer draws **Then** single points render as dots, empty datasets render nothing (no errors)
7. **Given** multiple series configured **When** the data layer draws **Then** each series renders with its own `ResolvedSeriesConfig` line color, width, opacity, and gradient settings

## Tasks / Subtasks

- [x] Task 1: Create `DataLayerRenderer` class in `src/renderer/layers/data-layer.ts` (AC: #1, #5, #6, #7)
  - [x]Define constructor accepting dependencies via injection:
    ```typescript
    constructor(
      private readonly ctx: CanvasRenderingContext2D,
      private readonly canvas: HTMLCanvasElement,
      private readonly scale: Scale,
      private readonly seriesData: ReadonlyArray<{
        buffer: RingBuffer<DataPoint>;
        splineCache: SplineCache;
        config: Readonly<ResolvedSeriesConfig>;
      }>
    )
    ```
  - [x]In the constructor, pre-compute and store rgba gradient color strings for each series using `hexToRgba()`. Since `ResolvedSeriesConfig` is deep-frozen and immutable for the lifetime of the renderer instance, these strings never need recomputation. Store in a private `gradientColors` array indexed by series position:
    ```typescript
    private readonly gradientColors: ReadonlyArray<{ top: string; bottom: string }>;
    // Computed once in constructor:
    // { top: hexToRgba(config.gradient.topColor, config.gradient.topOpacity),
    //   bottom: hexToRgba(config.gradient.bottomColor, config.gradient.bottomOpacity) }
    ```
  - [x]Implement `draw(): void` method:
    - Clear the canvas: `ctx.clearRect(0, 0, canvas.width, canvas.height)`
    - For each series in `seriesData`:
      - Get coefficients array from `splineCache.getCoefficients()`
      - If `coefficients.length === 0` and `buffer.size === 1` → render as dot
      - If `coefficients.length === 0` and `buffer.size === 0` → skip
      - If `coefficients.length > 0` → render gradient fill first, then curve on top
      - Note: `getCoefficients()` always returns an array (never null). Empty array means no valid spline — this also handles the case where `computeFull()` was never called on the SplineCache.
  - [x]Export `DataLayerRenderer` as named export

- [x] Task 2: Implement smooth curve rendering method (AC: #1, #3, #4)
  - [x]Implement `private drawCurve(series: { buffer, splineCache, config })` method:
    - Get coefficients from `splineCache.getCoefficients()`
    - Set stroke style from `config.line.color`, `config.line.width`, `config.line.opacity` via `ctx.globalAlpha`
    - Set `ctx.lineWidth = config.line.width`
    - Set `ctx.lineJoin = 'round'` and `ctx.lineCap = 'round'` for smooth joints
    - Begin path: `ctx.beginPath()`
    - For each spline segment, sample at an adaptive resolution:
      - Use `evaluateSpline(coeff, x)` to get y values at sampled x positions
      - Convert to pixel coordinates via `scale.xToPixel(x)` and `scale.yToPixel(y)`
      - Use `ctx.moveTo()` for first point, `ctx.lineTo()` for subsequent points
    - Stroke the path: `ctx.stroke()`
    - Reset `ctx.globalAlpha = 1`
  - [x]Determine sampling resolution: sample each segment at `Math.max(2, Math.ceil(pixelWidth / 2))` steps where `pixelWidth = scale.xToPixel(coeff.x1) - scale.xToPixel(coeff.x0)`. This gives ~2px per sample for smooth sub-pixel curves without over-sampling
  - [x]Do NOT pixel-align curve points — sub-pixel rendering is what makes curves smooth (architecture rule)

- [x] Task 3: Implement gradient fill rendering method (AC: #2)
  - [x]Implement `private drawGradient(series: { buffer, splineCache, config })` method:
    - Guard: if `config.gradient.enabled === false`, return immediately
    - Get coefficients from `splineCache.getCoefficients()`
    - Access viewport via `this.scale.viewport` (returns `Readonly<Viewport>` with `{ x, y, width, height }`)
    - Create a `CanvasGradient` using `ctx.createLinearGradient(0, this.scale.viewport.y, 0, this.scale.viewport.y + this.scale.viewport.height)`:
      - `addColorStop(0, this.gradientColors[seriesIndex].top)` — pre-computed in constructor
      - `addColorStop(1, this.gradientColors[seriesIndex].bottom)` — pre-computed in constructor
    - Build fill path:
      - `ctx.beginPath()`
      - Trace the curve (same sampling as `drawCurve`) using `moveTo`/`lineTo`
      - Close the area using the `{ firstX, lastX }` returned by `buildCurvePath`: `lineTo(lastX, this.scale.viewport.y + this.scale.viewport.height)`, `lineTo(firstX, this.scale.viewport.y + this.scale.viewport.height)`, `closePath()`
    - Set `ctx.fillStyle = gradient` and fill
  - [x]Use helper to convert hex color + opacity to `rgba()` string for gradient color stops:
    ```typescript
    private hexToRgba(hex: string, alpha: number): string
    ```
    - Parse hex (supports `#RGB`, `#RRGGBB` formats)
    - Return `rgba(r, g, b, alpha)`

- [x] Task 4: Implement single-point dot rendering (AC: #6)
  - [x]Implement `private drawDot(point: DataPoint, config: ResolvedSeriesConfig)` method:
    - Convert point to pixel: `scale.xToPixel(point.timestamp)`, `scale.yToPixel(point.value)`
    - Draw filled circle: `ctx.beginPath()`, `ctx.arc(px, py, config.line.width * 2, 0, Math.PI * 2)`, `ctx.fill()`
    - Use `config.line.color` for fill color

- [x] Task 5: Create reusable curve path helper to avoid duplicating sampling logic (AC: #1, #2)
  - [x]Implement `private buildCurvePath(coefficients, scale): { firstX: number, lastX: number }` that traces the curve path onto the current canvas context
    - This method is called by both `drawCurve` and `drawGradient` to avoid duplicating the spline sampling loop
    - Returns first/last pixel X coordinates for gradient area closure
    - Uses `ctx.moveTo` for first point, `ctx.lineTo` for all subsequent

- [x] Task 6: Write tests in `src/renderer/layers/data-layer.test.ts` (AC: #1-#7)
  - [x]Test: empty series data renders nothing (no errors, no canvas calls except clearRect)
  - [x]Test: single data point renders a dot (arc call with correct coordinates)
  - [x]Test: 2 data points renders a path starting with moveTo followed by lineTo calls (linear interpolation produces a straight-line polyline via adaptive sampling)
  - [x]Test: 3+ data points renders smooth curve using spline coefficients
  - [x]Test: gradient fill creates linearGradient with correct color stops from config
  - [x]Test: gradient disabled (`enabled: false`) skips gradient rendering
  - [x]Test: canvas is cleared at start of draw
  - [x]Test: multiple series each render with their own config colors
  - [x]Test: line opacity is applied via globalAlpha
  - [x]Test: line width and color are set from series config
  - [x]Test: `hexToRgba` correctly converts `#RRGGBB` to `rgba(r, g, b, a)`
  - [x]Test: `hexToRgba` correctly converts `#RGB` shorthand to `rgba(r, g, b, a)`
  - [x]Test: draw completes within 16ms for 10,000 data points (performance benchmark — use `performance.now()` to measure, or defer to integration testing in Story 1.8 if canvas mock overhead makes timing unreliable)

- [x] Task 7: Integration verification
  - [x]Run `pnpm test` — all tests pass (existing 197 + new data layer tests)
  - [x]Run `pnpm typecheck` — no type errors
  - [x]Run `pnpm lint` — no lint errors
  - [x]Run `pnpm build` — build succeeds
  - [x]Do NOT update `src/index.ts` — public API exports are Story 1.8's concern

## Dev Notes

### Architecture Compliance

**Module:** `src/renderer/layers/data-layer.ts` — lives under renderer module.

**Class name:** `DataLayerRenderer` (not `DataLayer`) — deliberately named to distinguish the drawing logic from the `Layer` interface adapter that will wrap it in Story 1.8.

**Import rules for DataLayerRenderer:**
- Imports from `../../core/types` — `DataPoint`
- Imports from `../../core/ring-buffer` — `RingBuffer`
- Imports from `../../core/spline-cache` — `SplineCache`
- Imports from `../../core/interpolation` — `evaluateSpline`, `SplineCoefficients`
- Imports from `../../core/scale` — `Scale`
- Imports from `../../config/types` — `ResolvedSeriesConfig`
- Does NOT import from `../layer-manager`, `../frame-scheduler`, `../../api/`, `../../interaction/`, or `../../react/`

**Why per-series config, not full `ResolvedConfig`:** The architecture example shows `DataLayer` taking `config: ResolvedConfig`, but this renderer only needs per-series `line` and `gradient` settings. Taking `ResolvedSeriesConfig` per series is more precise and avoids coupling to the full config shape. Global config (e.g., `backgroundColor`) is not needed — background is rendered by the background layer.

**Dependency DAG:** `renderer/` → `core/`, `config/` — this is allowed by the project's strict import DAG.

### How DataLayerRenderer Integrates with Existing System

The architecture shows the `Layer` interface in `src/renderer/types.ts`:
```typescript
interface Layer {
  readonly type: LayerType;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  isDirty: boolean;
  draw(): void;
}
```

The `DataLayerRenderer` is NOT a `Layer` itself. It is the **drawing logic** that will be called from within a `Layer`'s `draw()` method. The `GlideChart` facade (Story 1.8) will:
1. Create a `Layer` for `LayerType.Data` via `LayerManager`
2. Create a `DataLayerRenderer` with the Data layer's canvas/ctx, the Scale, and series data
3. Set the `Layer.draw` callback to invoke `DataLayerRenderer.draw()`
4. Register the layer with `FrameScheduler`

**Important:** The `FrameScheduler` calls `ctx.save()` before and `ctx.restore()` after each `draw()` (using try/finally to guarantee restore). The DataLayerRenderer should NOT call `save()`/`restore()` at the top level — it receives a clean context from the scheduler.

**Canvas clearing ownership:** The `DataLayerRenderer.draw()` owns clearing the data canvas. The `Layer` adapter created in Story 1.8 must NOT add its own `clearRect` call — that would cause double clearing.

### Canvas Drawing Rules (from Architecture)

- **Clear canvas at start of draw:** `ctx.clearRect(0, 0, canvas.width, canvas.height)` — canvas dimensions are in backing store pixels (CSS pixels * DPR)
- **No pixel alignment for curves** — sub-pixel rendering makes curves smooth. Only grid lines and axis ticks use 0.5px offset.
- **All coordinate conversion through Scale** — use `scale.xToPixel()` and `scale.yToPixel()`, never manual math
- **No allocations in render loop** — avoid object creation, array spreading, string concatenation inside `draw()`. Pre-allocate reusable buffers where possible. The `hexToRgba` conversion should be cached or computed once per series, not per-frame.
- **No try/catch in rendering code** — let bugs surface immediately. Note: FrameScheduler uses try/finally (not try/catch) around `draw()` to guarantee `ctx.restore()` runs — this is acceptable and different from error swallowing.

### Spline Evaluation Strategy

Use `evaluateSpline(coeffs, x)` from `src/core/interpolation.ts` — pass a data-space x value, get back the interpolated y value. Sample each spline segment at adaptive resolution:
- Each segment spans `[coeff.x0, coeff.x1]` in data space
- Convert endpoints to pixel space to determine segment pixel width
- Samples per segment: `Math.max(2, Math.ceil(pixelWidth / 2))` — avoids over-sampling narrow segments and under-sampling wide ones

### Gradient Fill Technical Details

The gradient creates a vertical fade from line to bottom:
- `topColor` with `topOpacity` at the curve (y = curve value)
- `bottomColor` with `bottomOpacity` at the viewport bottom (y = viewport.y + viewport.height)
- Default dark theme: teal `#00d4aa` fading from 0.3 opacity to 0.0 (transparent)
- The gradient is a `CanvasGradient` spanning the full viewport height

**Fill path construction:**
1. Trace the curve path (left to right) — same points as the stroke path
2. At the end of the curve, draw a line straight down to viewport bottom
3. Draw a line along the bottom back to the start X
4. Close the path
5. Fill with the gradient

### Performance Considerations

- **10,000 points at 60fps** — with spline caching, only the rendering step (sampling + drawing) happens per frame. The spline computation is already done.
- **Pre-compute rgba strings in constructor** — `hexToRgba()` must be called once per series in the constructor and stored in a private `gradientColors` array. `ResolvedSeriesConfig` is deep-frozen and immutable for the renderer's lifetime, so these strings never need recomputation. Zero string allocations inside `draw()`.
- **Avoid per-frame allocations** — the curve path is built using canvas path API (`moveTo`/`lineTo`) which doesn't allocate JS objects
- **Adaptive sampling** — narrow segments (few pixels wide) get fewer samples. This prevents wasting cycles on segments that span only 1-2 pixels.

### Edge Cases

- **Empty dataset** — `draw()` clears the canvas and returns. No errors.
- **Single data point** — render as a filled circle (dot), not a line. Radius = `lineWidth * 2`.
- **Two data points** — linear interpolation (spline returns linear coefficients). Renders as a straight line.
- **All points have same value** — horizontal line. Gradient still fills below.
- **All points have same timestamp** — spline computation handles this (filtered in `computeMonotoneSpline`). Effectively 1 unique point → dot.
- **Very large datasets (10K+)** — spline cache already computed. Rendering samples adaptively. Should meet frame budget.
- **SplineCache never computed** — `getCoefficients()` returns empty array, `draw()` treats as zero-data or single-dot case. No errors.

### Testing Standards

- **Framework:** Vitest with `globals: true` — do NOT import `describe`, `it`, `expect`, or `vi` from `vitest`. They are all globally available.
- **Canvas mocking:** Use `vitest-canvas-mock` — it provides mock implementations of Canvas 2D API methods. Access call records via the mock context.
- **Co-located:** `data-layer.test.ts` next to `data-layer.ts` in `src/renderer/layers/`
- **No mocking internal modules:** Use real `SplineCache`, `RingBuffer`, `Scale`, and `computeMonotoneSpline`. Mock only `CanvasRenderingContext2D` (via vitest-canvas-mock).
- **Constructor injection enables testing:** Create `DataLayerRenderer` with test doubles for canvas/ctx and real instances of Scale, RingBuffer, SplineCache.

### What NOT To Do

- **DO NOT** create the GlideChart facade or wire up the full rendering pipeline — that's Story 1.8
- **DO NOT** update `src/index.ts` exports — that's Story 1.8
- **DO NOT** render grid lines, axes, crosshair, or tooltips — those are other stories
- **DO NOT** implement animation/transition logic — Story 3.1 handles animated data transitions
- **DO NOT** call `requestAnimationFrame` directly — the FrameScheduler handles frame timing
- **DO NOT** call `ctx.save()`/`ctx.restore()` at the top level of `draw()` — FrameScheduler does this
- **DO NOT** add runtime dependencies
- **DO NOT** use `export default`
- **DO NOT** use `any` type
- **DO NOT** create circular imports
- **DO NOT** manually compute data-to-pixel coordinates — always use `Scale`
- **DO NOT** pixel-align curve rendering (0.5px offset) — that's only for grid/axis lines

### File Locations — Exact Paths

| File | Path | Purpose |
|------|------|---------|
| Data layer renderer | `src/renderer/layers/data-layer.ts` | DataLayerRenderer class — curve + gradient rendering |
| Data layer tests | `src/renderer/layers/data-layer.test.ts` | Tests for curve rendering, gradient fill, edge cases |

### Naming Conventions

- File: `data-layer.ts` (kebab-case)
- Class: `DataLayerRenderer` (PascalCase)
- Methods: `draw`, `drawCurve`, `drawGradient`, `drawDot`, `hexToRgba` (camelCase)
- Private members: `private` keyword, no underscore prefix
- Error messages: prefixed with `DataLayerRenderer:`
- Named exports only

### Previous Story Intelligence

**From Story 1.6 (done — previous story):**
- Config system fully implemented with `ResolvedConfig`, `ResolvedSeriesConfig`
- Per-series config resolution: each series has complete `line` and `gradient` configs
- Dark theme defaults: line color `#00d4aa`, gradient top opacity 0.3, bottom opacity 0.0
- Config is deep-frozen (immutable) — safe to hold references without copying
- `deepFreeze` applied at runtime — don't attempt to mutate config properties
- 197 total tests passing after Story 1.6
- Review fixed: NaN/Infinity validation for line.width and opacity, per-series validation added

**From Story 1.5 (done):**
- Layer/FrameScheduler integration details covered in "How DataLayerRenderer Integrates" section above
- Browser globals (document, window, requestAnimationFrame) available via ESLint config

**From Story 1.4 (done):**
- `Scale` class: `xToPixel(timestamp)`, `yToPixel(value)`, `autoFitX()`, `autoFitY()`
- Scale maps data values to positions within the viewport rectangle. It does NOT multiply by DPR — DPR is handled at the canvas level (`canvas.width = CSS width * dpr`, then `ctx.scale(dpr, dpr)` makes Scale's coordinates work correctly). The DataLayerRenderer should NOT manually account for DPR.
- `viewport` getter returns `Readonly<Viewport>` with `{ x, y, width, height }` — the drawable area after padding

**From Story 1.3 (done):**
- `SplineCache` wraps `RingBuffer<DataPoint>` — call `computeFull()` or `appendPoint()` to update
- `getCoefficients()` returns `ReadonlyArray<SplineCoefficients>`
- `evaluateSpline(coeff, x)` evaluates a single segment at x-coordinate
- `findSegmentIndex(coefficients, x)` does binary search for the segment containing x
- Incremental updates: `appendPoint()` only recomputes last 2-3 segments when no eviction

**From Story 1.2 (done):**
- `RingBuffer<DataPoint>` — `push()`, `get(index)`, `toArray()`, `size`, `isEmpty`, `peek()`, `peekOldest()`
- `DataPoint`: `{ timestamp: number; value: number }`

**From Story 1.1 (done):**
- TypeScript 6.x, `ignoreDeprecations: "6.0"` in tsconfig
- ESLint 10 flat config (`eslint.config.js`)
- Vitest globals: `true` — do NOT import test utilities from `vitest`

### Git Intelligence

Recent commits follow: `feat:` prefix, lowercase, concise description with story reference.

Expected commit message: `feat: add data layer rendering with smooth curve and gradient fill (Story 1.7)`

### Downstream Dependencies

This DataLayerRenderer will be consumed by:
- **Story 1.8 (GlideChart Facade)** — creates `DataLayerRenderer`, wires it into the Data `Layer`, registers with `FrameScheduler`
- **Story 2.5 (Multi-Series Rendering)** — uses the multi-series rendering already implemented here; adds y-axis auto-scaling across all series and legend/tooltip series identification
- **Story 3.1 (Incremental Data Push)** — marks data layer dirty when new data arrives
- **Story 5.2 (Per-Series Customization)** — uses per-series `ResolvedSeriesConfig` (already supported by this story)
- **Story 5.3 (Gradient Customization)** — uses gradient config from `ResolvedSeriesConfig`

### References

- [Source: architecture.md — Rendering Architecture, Canvas Drawing Conventions, Constructor Injection, Interpolation Architecture]
- [Source: epics.md — Epic 1, Story 1.7]
- [Source: prd.md — FR1 (smooth curve), FR3 (gradient fill), FR4 (sparse data), FR5 (spike handling), NFR1 (60fps/10K points)]
- [Source: project-context.md — Canvas rendering rules, no allocations in render loop, sub-pixel curves]
- [Source: 1-6-config-system-and-beautiful-defaults.md — ResolvedSeriesConfig, gradient config, per-series resolution]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

No issues encountered during implementation.

### Completion Notes List

- Implemented `DataLayerRenderer` class with constructor dependency injection (ctx, canvas, scale, seriesData)
- Pre-computed gradient rgba color strings in constructor for zero per-frame string allocations
- Implemented `draw()` method: clears canvas, iterates series, dispatches to gradient/curve/dot rendering
- Implemented `drawCurve()`: sets line style from `ResolvedSeriesConfig`, uses `buildCurvePath` helper, strokes path
- Implemented `drawGradient()`: creates vertical `CanvasGradient` spanning viewport, fills area beneath curve
- Implemented `drawDot()`: renders single data points as filled circles (radius = lineWidth * 2)
- Implemented `buildCurvePath()`: shared helper for curve/gradient, adaptive sampling per segment (`Math.max(2, Math.ceil(pixelWidth / 2))` steps)
- Exported `hexToRgba()` utility: converts `#RGB` and `#RRGGBB` to `rgba(r, g, b, a)` strings
- All coordinate conversion through `Scale.xToPixel()`/`yToPixel()` — no manual math
- No pixel alignment on curve points (sub-pixel rendering for smooth curves)
- No `ctx.save()`/`ctx.restore()` — FrameScheduler handles that
- No `requestAnimationFrame` calls — FrameScheduler handles frame timing
- No `export default` — named exports only
- No runtime dependencies added
- 21 new tests covering: empty data, single point, 2-point, 3+ point curves, gradient fill, gradient disabled, canvas clearing, multi-series, line opacity/width/color, hexToRgba for #RRGGBB and #RGB, performance benchmark
- All 218 tests pass (197 existing + 21 new), typecheck clean, lint clean, build succeeds

### File List

- `src/renderer/layers/data-layer.ts` — NEW: DataLayerRenderer class with curve, gradient, dot rendering
- `src/renderer/layers/data-layer.test.ts` — NEW: 21 tests for DataLayerRenderer and hexToRgba

### Review Findings

- [x] [Review][Patch] `buildCurvePath` called twice per gradient-enabled series — doubles path construction work [data-layer.ts:55-56,71,94] — Fixed: spline evaluation now computed once into a pre-allocated Float64Array buffer, replayed for both gradient fill and curve stroke
- [x] [Review][Defer] Performance test uses 500ms threshold instead of 16ms frame budget (AC4) — deferred, spec allows deferral to Story 1.8 integration testing when canvas mock overhead makes timing unreliable

### Change Log

- 2026-03-28: Implemented DataLayerRenderer with smooth curve rendering, gradient fill, single-point dots, multi-series support, and adaptive spline sampling. Added 21 comprehensive tests. (Story 1.7)
