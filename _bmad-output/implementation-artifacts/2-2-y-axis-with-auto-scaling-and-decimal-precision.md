# Story 2.2: Y-Axis with Auto-Scaling & Decimal Precision

Status: done

## Story

As a developer using Glide Chart,
I want a value y-axis that auto-scales and handles diverse price ranges,
so that sub-penny tokens and BTC-scale values display with correct precision.

## Acceptance Criteria

1. **Given** a dataset with values in any range (0.000001 to 100,000+) **When** the axis layer renders the y-axis **Then** labels display with appropriate decimal precision for the value range **And** tick marks align with grid lines **And** auto-scaling does not exaggerate or minimize price movements misleadingly **And** labels meet WCAG 2.1 AA contrast ratios in default themes

2. **Given** a developer provides a custom number format function via config **When** the y-axis renders **Then** the custom formatter is used for label text

3. **Given** a chart with `yAxis.visible: false` in config **When** the axis layer draws **Then** no y-axis labels or tick marks are rendered (canvas is cleared only)

4. **Given** a chart that is resized **When** the ResizeObserver fires and the axis layer redraws **Then** y-axis labels and ticks recalculate to the new viewport dimensions

5. **Given** a chart where the data range changes (new data extends scale domain) **When** the axis layer is marked dirty and redraws **Then** y-axis tick positions update to match the new Scale domain **And** decimal precision adjusts to the new value range

6. **Given** an empty dataset (no data points) **When** the axis layer draws **Then** the y-axis renders gracefully using the default Scale domain (0 to 1)

7. **Given** a dataset with sub-penny values (e.g., 0.00000142) **When** the y-axis renders **Then** labels show enough decimal places to distinguish between tick values (no repeated labels like "0.00" everywhere)

8. **Given** a dataset with large values (e.g., 45,000 to 65,000) **When** the y-axis renders **Then** labels show whole numbers or minimal decimals (not "45000.000000")

## Tasks / Subtasks

- [x] Task 1: Add `labelFormatter` to `AxisConfig` and `ChartConfig` types (AC: #2)
  - [x]In `src/config/types.ts`: add `labelFormatter?: (value: number) => string` to `AxisConfig`
  - [x]Add `readonly labelFormatter: ((value: number) => string) | null` to a new `ResolvedAxisConfig` interface or extend `AxisConfig` — must keep `ResolvedConfig.yAxis` compatible
  - [x]**Design decision:** Since `ResolvedConfig` uses `Readonly<AxisConfig>` and functions can't be deep-merged the same way, add `labelFormatter` as optional to `AxisConfig` (default `undefined`) and resolve to `null` if not provided. The renderer checks: if `config.yAxis.labelFormatter` exists, call it; otherwise use built-in precision formatter
  - [x]In `src/config/defaults.ts`: no change needed — `labelFormatter` is optional and absent in defaults (treated as "use auto-precision")
  - [x]In `src/api/types.ts`: `AxisConfig` is already re-exported — no change needed
  - [x]Update `src/config/resolver.ts` if needed to pass through function values in deep merge (functions should not be deep-merged; they should be taken from user config directly)

- [x] Task 2: Create `YAxisRenderer` class in `src/renderer/layers/y-axis-layer.ts` (AC: #1, #3, #5, #6, #7, #8)
  - [x]Constructor signature: `(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, scale: Scale, config: Readonly<ResolvedConfig>)`
  - [x]Pre-compute in constructor: `this.fontString = \`${config.yAxis.labelFontSize}px ${config.yAxis.labelFontFamily}\`` — avoids string allocation in draw()
  - [x]Implement `draw(): void` method:
    1. **DO NOT** call `clearRect` — the facade's axis layer draw callback clears the shared axis canvas once before calling all axis renderers (see "Shared Axis Canvas" in Dev Notes)
    2. Set `ctx.globalAlpha = 1.0` at the start of draw — defensive reset in case prior renderer changed it
    3. Early return if `config.yAxis.visible === false`
    4. Import and use `computeNiceTicks` from `../layers/background-layer` to compute tick positions from `scale.domainY` — reuse, do not reimplement
    5. Calculate maxTicks from viewport: `Math.max(3, Math.floor(scale.viewport.height / 60))` (same spacing as grid horizontal lines)
    6. Derive `tickSpacing` from returned ticks array: `ticks.length >= 2 ? ticks[1] - ticks[0] : 0` — guard for 0/1 tick case
    7. For each tick value, compute pixel Y via `scale.yToPixel(value)`
    8. **Batch all tick marks into ONE `beginPath()/stroke()` call** (same performance pattern as `BackgroundLayerRenderer`): accumulate `moveTo/lineTo` pairs for all ticks, then single `stroke()`. Draw labels in a separate pass after stroking.
    9. Tick marks: short horizontal lines at `(viewport.x - tickLength, pixelY)` to `(viewport.x, pixelY)` — ticks are to the LEFT of the viewport
    10. Labels: right-aligned text at `(viewport.x - tickLength - labelPadding, pixelY)` — use `ctx.textAlign = 'right'` and `ctx.textBaseline = 'middle'`
    11. Use 0.5px offset for crisp tick lines (same pixel alignment as grid lines)
  - [x]Implement private `formatLabel(value: number, tickSpacing: number): string` method:
    - If `config.yAxis.labelFormatter` exists, delegate to it: `return config.yAxis.labelFormatter(value)`
    - Otherwise, auto-detect decimal precision from tickSpacing:
      - Compute decimals needed: if `tickSpacing >= 1`, use 0 decimals; if `tickSpacing >= 0.1`, use 1; etc.
      - Formula: `Math.max(0, Math.ceil(-Math.log10(tickSpacing)))` gives the number of decimal places
      - Use `value.toFixed(decimals)` for consistent display
      - Edge case: for very small tick spacing (< 1e-10), cap at 10 decimal places
      - Edge case: for very large values (> 1e6), consider no decimals
  - [x]Named export: `export { YAxisRenderer }` — no `export default`
  - [x]Define constants at top of file: `const LABEL_PADDING = 4;` (gap between tick end and label text), `const MIN_TICK_SPACING = 60;` (minimum px between ticks, matching background-layer), `const MIN_TICKS = 3;`

- [x] Task 3: Wire `YAxisRenderer` into `GlideChart` facade in `src/api/glide-chart.ts` (AC: #1, #4, #5)
  - [x]Import `YAxisRenderer` from `../renderer/layers/y-axis-layer`
  - [x]In constructor, after resolving config and creating Scale, instantiate `YAxisRenderer`:
    ```typescript
    this.yAxisRenderer = new YAxisRenderer(axisCtx, axisCanvas, this.scale, this.resolvedConfig);
    ```
  - [x]Replace the current no-op axis layer draw function — the callback MUST clear the canvas once, then call the renderer:
    ```typescript
    // BEFORE:
    createLayer(LayerType.Axis, axisCanvas, axisCtx, () => {
      axisCtx.clearRect(0, 0, axisCanvas.width, axisCanvas.height);
    }),
    // AFTER:
    createLayer(LayerType.Axis, axisCanvas, axisCtx, () => {
      axisCtx.clearRect(0, 0, axisCanvas.width, axisCanvas.height);
      this.yAxisRenderer.draw();
      // Story 2.3 will add: this.xAxisRenderer.draw();
    }),
    ```
  - [x]Store `yAxisRenderer` as private field (type `YAxisRenderer`)
  - [x]In `setConfig()`: recreate `YAxisRenderer` AND update the axis layer draw callback — mirror the existing `backgroundLayerRenderer` two-step recreation pattern in `setConfig()`:
    ```typescript
    // Step 1: recreate renderer
    const axisCtxNew = this.layerManager.getContext(LayerType.Axis);
    const axisCanvasNew = this.layerManager.getCanvas(LayerType.Axis);
    this.yAxisRenderer = new YAxisRenderer(axisCtxNew, axisCanvasNew, this.scale, this.resolvedConfig);
    // Step 2: update layer draw callback
    const axisLayer = this.layers.find((l) => l.type === LayerType.Axis);
    if (axisLayer) {
      axisLayer.draw = () => {
        axisCtxNew.clearRect(0, 0, axisCanvasNew.width, axisCanvasNew.height);
        this.yAxisRenderer.draw();
      };
    }
    ```
  - [x]In `destroy()`: null out reference with `this.yAxisRenderer = null!;` — use the `null!` non-null assertion pattern matching existing destroy() cleanup
  - [x]Axis layer is already marked dirty on scale/data changes (from Story 2.1 setup) — verify this still works correctly

- [x] Task 4: Write tests in `src/renderer/layers/y-axis-layer.test.ts` (AC: #1-#8)
  - [x]Test: `draw()` does NOT call `clearRect` (canvas clearing is the facade's responsibility)
  - [x]Test: `draw()` draws tick marks aligned with grid line positions (same `computeNiceTicks` values)
  - [x]Test: tick marks use 0.5px offset for crisp rendering
  - [x]Test: tick marks use `config.yAxis.tickColor` and `config.yAxis.tickLength`
  - [x]Test: labels use `config.yAxis.labelColor`, `labelFontSize`, `labelFontFamily`
  - [x]Test: labels are right-aligned to the left of the viewport area
  - [x]Test: `draw()` renders nothing when `yAxis.visible === false` (early return, no canvas operations)
  - [x]Test: auto-precision for small values — tick spacing 0.001 → labels show 3 decimal places
  - [x]Test: auto-precision for large values — tick spacing 1000 → labels show 0 decimal places
  - [x]Test: auto-precision for sub-penny — tick spacing 0.0000001 → labels show 7 decimal places
  - [x]Test: custom `labelFormatter` is called when provided
  - [x]Test: custom `labelFormatter` receives the raw numeric value
  - [x]Test: empty domain (min === max) does not crash — handles edge case gracefully
  - [x]Test: labels stay within canvas bounds (not clipped off-screen)

### Review Findings

- [x] [Review][Patch] `labelFormatter` throwing crashes draw mid-render — tick marks drawn but all labels silently aborted [src/renderer/layers/y-axis-layer.ts:68-70] — Fixed: wrapped in try/catch, falls back to auto-precision
- [x] [Review][Patch] Floating-point imprecision in `Math.log10` for exact powers of 10 — `tickSpacing=0.01` can yield 0 decimals instead of 2 [src/renderer/layers/y-axis-layer.ts:76-79] — Fixed: changed `Math.ceil` to `Math.round`
- [x] [Review][Defer] `setConfig()` layer `find` can silently fail leaving stale draw callback — deferred, pre-existing pattern across all layers
- [x] [Review][Patch] `labelFormatter` returning non-string has no runtime guard — Fixed: wrapped return in `String()` coercion
- [x] [Review][Patch] Long `labelFormatter` return value causes off-canvas label overflow — Fixed: added `maxWidth` parameter to `fillText`

- [x] Task 5: Integration verification
  - [x]Run `pnpm test` — all tests pass (264 existing + new y-axis tests)
  - [x]Run `pnpm typecheck` — no type errors
  - [x]Run `pnpm lint` — no lint errors
  - [x]Run `pnpm build` — build succeeds

## Dev Notes

### Architecture Compliance

**Module:** `src/renderer/layers/y-axis-layer.ts` — lives in the `renderer/layers/` directory, alongside `background-layer.ts` and `data-layer.ts`.

**Import DAG for renderer/ module:** `renderer/` can import from `core/` and `config/`:
- `../../core/scale` — `Scale` (for viewport, domainY, yToPixel)
- `../../config/types` — `ResolvedConfig`, `AxisConfig`
- `./background-layer` — `computeNiceTicks` (reuse the exported tick calculation utility)

**DO NOT** import from `api/`, `interaction/`, or `react/` — that would violate the module DAG.

### Tick Alignment with Grid Lines — Critical

Y-axis ticks MUST align exactly with horizontal grid lines. Both use `computeNiceTicks(domainY.min, domainY.max, maxTicks)` with the same maxTicks calculation based on viewport height and 60px minimum spacing. By reusing the exact same function and parameters, ticks will align perfectly.

Do NOT reimplement nice number tick generation — import `computeNiceTicks` from `./background-layer`.

### Decimal Precision Algorithm

The key challenge is displaying appropriate precision across 10 orders of magnitude:

| Value Range | Tick Spacing | Decimals | Example Label |
|---|---|---|---|
| 0.000001 – 0.00001 | 0.000001 | 6 | "0.000003" |
| 0.001 – 0.01 | 0.001 | 3 | "0.005" |
| 0.1 – 1.0 | 0.1 | 1 | "0.5" |
| 1 – 100 | 10 | 0 | "50" |
| 10,000 – 100,000 | 10000 | 0 | "50000" |

**Formula:** `decimals = Math.max(0, Math.ceil(-Math.log10(tickSpacing)))`

Edge cases:
- `tickSpacing === 0` → guard early, return value as-is
- `tickSpacing` very small (< 1e-10) → cap decimals at 10
- Large values with small tickSpacing (e.g., values around 45000 with spacing 0.5) → still show 1 decimal

### Y-Axis Rendering Position

Y-axis labels and ticks render to the LEFT of the viewport area:
```
|  label  |tick|  ← viewport area →  |
           ↑
    viewport.x
```

- Tick marks: from `(viewport.x - tickLength, pixelY + 0.5)` to `(viewport.x, pixelY + 0.5)`
- Labels: text at `(viewport.x - tickLength - LABEL_PADDING, pixelY)` with `textAlign = 'right'`, `textBaseline = 'middle'`
- Ticks and labels must not extend below `viewport.y + viewport.height` or above `viewport.y`

### Canvas Text Rendering

**Performance:** Batch all tick marks into a single `beginPath()/stroke()` call (same pattern as `BackgroundLayerRenderer` — critical for performance). Draw labels in a separate loop or interleaved after the single stroke.

**Pre-compute in constructor:** Cache the font string as `this.fontString = \`${config.yAxis.labelFontSize}px ${config.yAxis.labelFontFamily}\`` to avoid string allocation in draw().

```typescript
// Defensive reset — FrameScheduler calls save()/restore() but explicit is safer
ctx.globalAlpha = 1.0;

// Derive tickSpacing for label precision
const tickSpacing = ticks.length >= 2 ? ticks[1] - ticks[0] : 0;

// --- Batch all tick marks into ONE path/stroke ---
ctx.beginPath();
ctx.strokeStyle = config.yAxis.tickColor;
ctx.lineWidth = 1;

const labelPositions: Array<{ y: number; label: string }> = [];

for (const tick of ticks) {
  const y = Math.round(scale.yToPixel(tick)) + 0.5;
  if (y < scale.viewport.y || y > scale.viewport.y + scale.viewport.height) continue;

  // Tick mark (accumulated into single path)
  ctx.moveTo(scale.viewport.x - config.yAxis.tickLength, y);
  ctx.lineTo(scale.viewport.x, y);

  labelPositions.push({ y, label: this.formatLabel(tick, tickSpacing) });
}

ctx.stroke(); // Single stroke for all ticks

// --- Draw labels ---
ctx.fillStyle = config.yAxis.labelColor;
ctx.font = this.fontString; // Pre-computed in constructor
ctx.textAlign = 'right';
ctx.textBaseline = 'middle';

for (const { y, label } of labelPositions) {
  ctx.fillText(label, scale.viewport.x - config.yAxis.tickLength - LABEL_PADDING, y);
}
```

### Adding labelFormatter to AxisConfig

Add `labelFormatter?: (value: number) => string` to `AxisConfig`. Since it's optional and `undefined` by default, no changes to `defaults.ts` or theme files are needed.

**Deep merge safety:** The resolver's `deepMerge` uses `isPlainObject()` which returns `false` for functions (they have `Function.prototype`, not `Object.prototype`). Functions fall through to direct assignment — they are preserved correctly. No resolver changes needed.

Both `yAxis.labelFormatter` and `xAxis.labelFormatter` share the same type. Story 2.3 (X-axis) will also use this field for custom date formatting.

### Shared Axis Canvas

Both Y-axis (this story) and X-axis (Story 2.3) render on the SAME axis canvas layer (`LayerType.Axis`). The facade's axis layer draw callback clears the canvas ONCE, then calls each renderer in sequence. `YAxisRenderer.draw()` does NOT call `clearRect` — this differs from `BackgroundLayerRenderer` which clears its own canvas because it's the only renderer on the background layer.

```typescript
createLayer(LayerType.Axis, axisCanvas, axisCtx, () => {
  axisCtx.clearRect(0, 0, axisCanvas.width, axisCanvas.height);
  this.yAxisRenderer.draw();
  // Story 2.3 will add: this.xAxisRenderer.draw();
}),
```

### WCAG 2.1 AA Contrast

Default theme label colors must meet WCAG 2.1 AA contrast ratio (4.5:1 for normal text):
- Dark theme: `labelColor: '#8a8a9a'` on dark background — verify contrast
- Light theme: `labelColor: '#555555'` on light background — verify contrast

These are already set in the themes. The renderer just uses `config.yAxis.labelColor` — no additional work needed.

### Following the BackgroundLayerRenderer Pattern

Mirror the `BackgroundLayerRenderer` constructor injection pattern:
- Receives `ctx`, `canvas`, `scale`, and config via constructor
- Has a `draw()` public method
- Private helper methods for internal logic
- No allocations in `draw()` path — pre-compute or cache what you can (e.g., font string)
- Named export only

### What NOT To Do

- **DO NOT** render x-axis labels or ticks — that's Story 2.3
- **DO NOT** render grid lines — that's Story 2.1 (already done)
- **DO NOT** add runtime dependencies
- **DO NOT** use `export default` — named exports only
- **DO NOT** use `any` type
- **DO NOT** create circular imports
- **DO NOT** call `requestAnimationFrame` directly — FrameScheduler handles this
- **DO NOT** manually compute data-to-pixel coordinates — always use Scale methods (`yToPixel`)
- **DO NOT** use `I` prefix on interfaces or `_` prefix for private members
- **DO NOT** import test utilities (`describe`, `it`, `expect`, `vi`) from `vitest` — globals are enabled
- **DO NOT** reimplement `computeNiceTicks` — import it from `background-layer.ts`
- **DO NOT** have `YAxisRenderer.draw()` call `clearRect` — the facade axis draw callback clears

### Project Structure Notes

| File | Path | Purpose |
|------|------|---------|
| Config types | `src/config/types.ts` | Add `labelFormatter` to `AxisConfig` (modify existing) |
| Y-axis layer renderer | `src/renderer/layers/y-axis-layer.ts` | Y-axis labels, ticks, auto-precision (new) |
| Y-axis layer tests | `src/renderer/layers/y-axis-layer.test.ts` | Unit tests for y-axis rendering (new) |
| GlideChart facade | `src/api/glide-chart.ts` | Wire YAxisRenderer into axis layer (modify existing) |

### Previous Story Intelligence

**From Story 2.1 (done — previous story in this epic):**
- `BackgroundLayerRenderer` created in `src/renderer/layers/background-layer.ts`
- `computeNiceTicks(min, max, maxTicks)` exported as named export — reuse for tick alignment
- Grid horizontal lines use `Math.max(3, Math.floor(viewport.height / 60))` for maxTicks — Y-axis must match
- Grid vertical lines use `Math.max(3, Math.floor(viewport.width / 100))` for maxTicks
- Background layer wired into facade following `DataLayerRenderer` pattern
- 264 total tests passing after Story 2.1
- Review finding: background layer not marked dirty on initial construction was fixed
- `globalAlpha` must be reset to 1.0 after drawing

**From Story 1.8 (done):**
- Axis layer currently wired as no-op: `axisCtx.clearRect(0, 0, axisCanvas.width, axisCanvas.height)`
- GlideChart facade at `src/api/glide-chart.ts` — constructor creates axis layer
- `setConfig()` recreates renderers — follow same pattern for YAxisRenderer
- `destroy()` nulls out all references with `null!` assertion pattern
- Axis layer already marked dirty when scale domain changes (from `addData`, `setData`, `clearData`)

**From Story 1.6 (done):**
- Axis config in resolved config: `yAxis: { visible: boolean, labelColor: string, labelFontSize: number, labelFontFamily: string, tickColor: string, tickLength: number }`
- Dark theme defaults: `labelColor: '#8a8a9a'`, `labelFontSize: 11`, `labelFontFamily: SYSTEM_FONT_STACK`, `tickColor: '#3a3a4a'`, `tickLength: 4`
- Light theme defaults: `labelColor: '#555555'`, `tickColor: '#cccccc'`
- Config is deep-frozen (Readonly) — never mutate

**From Story 1.4 (done):**
- `Scale` provides: `viewport` (Readonly<Viewport>), `domainX`, `domainY` (Readonly<ScaleDomain>), `xToPixel()`, `yToPixel()`
- `autoFitY(values, paddingPercent)` — default 10% padding
- Y-axis is inverted in canvas: `yToPixel` maps higher values to lower pixel Y

### Git Intelligence

Recent commits follow: `feat:` prefix, lowercase, concise description with story reference.
Latest: `feat: add background layer grid line rendering (Story 2.1)`

Expected commit message: `feat: add y-axis with auto-scaling and decimal precision (Story 2.2)`

### Downstream Dependencies

This y-axis renderer will be referenced by:
- **Story 2.3** — X-axis renderer will share the axis canvas. The draw callback structure established here determines how X-axis is added.
- **Story 2.4** — Locale-aware number formatting may replace or wrap the auto-precision formatter.
- **Story 2.5** — Multi-series rendering may require Y-axis to auto-scale across all series values (already handled by Scale).
- **Story 5.3** — Grid/axis customization may extend `AxisConfig`.

### References

- [Source: architecture.md — Rendering Architecture, Layer Structure, Pixel Alignment, Canvas Drawing Conventions]
- [Source: architecture.md — Module Boundaries: renderer/ can import from core/, config/]
- [Source: architecture.md — Project Structure: renderer/layers/axis-layer.ts — note: we use `y-axis-layer.ts` for the Y-axis renderer specifically, anticipating a separate `x-axis-layer.ts` in Story 2.3]
- [Source: epics.md — Epic 2, Story 2.2: Y-Axis with Auto-Scaling & Decimal Precision]
- [Source: epics.md — FR17 (value y-axis auto-scaled), FR18 (decimal precision), FR19 (custom formatters)]
- [Source: prd.md — NFR11 (WCAG AA contrast)]
- [Source: project-context.md — Layered canvas architecture, pixel alignment, dirty flag system, zero runtime dependencies]
- [Source: 2-1-background-layer-grid-lines.md — computeNiceTicks reuse, BackgroundLayerRenderer pattern, axis layer dirty flagging]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Fixed TS6133 unused parameter error: `canvas` parameter in `YAxisRenderer` constructor kept for API consistency with `BackgroundLayerRenderer` but prefixed with `_` since YAxisRenderer doesn't clear its own canvas (facade handles clearing for shared axis canvas).

### Completion Notes List

- Added `labelFormatter?: (value: number) => string` to `AxisConfig` interface — optional, no changes needed to defaults or resolver (functions pass through deep merge correctly)
- Created `YAxisRenderer` class in `src/renderer/layers/y-axis-layer.ts` following `BackgroundLayerRenderer` pattern
- Auto-precision formula: `Math.max(0, Math.ceil(-Math.log10(tickSpacing)))` handles 10+ orders of magnitude (sub-penny to BTC-scale)
- Tick marks batched into single `beginPath()/stroke()` for performance
- Reuses `computeNiceTicks` from background-layer for exact grid line alignment
- YAxisRenderer does NOT call `clearRect` — facade clears shared axis canvas once before calling all axis renderers
- Wired into `GlideChart` facade: constructor, `setConfig()`, and `destroy()`
- 15 new tests covering all 8 acceptance criteria, 279 total tests passing

### Change Log

- 2026-03-28: Implemented Story 2.2 — Y-axis with auto-scaling and decimal precision

### File List

- `src/config/types.ts` (modified) — added `labelFormatter` to `AxisConfig`
- `src/renderer/layers/y-axis-layer.ts` (new) — `YAxisRenderer` class
- `src/renderer/layers/y-axis-layer.test.ts` (new) — 15 unit tests
- `src/api/glide-chart.ts` (modified) — wired `YAxisRenderer` into facade
