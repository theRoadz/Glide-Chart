# Story 2.3: X-Axis with Time Formatting & Timezone Support

Status: done

## Story

As a developer using Glide Chart,
I want a time-based x-axis with auto-scaled labels and timezone awareness,
so that global trading contexts display time correctly for any user.

## Acceptance Criteria

1. **Given** a dataset with timestamps **When** the axis layer renders the x-axis **Then** time labels are auto-scaled to appropriate intervals (seconds, minutes, hours, days) **And** labels adapt when zoomed in or out **And** tick marks align with vertical grid lines **And** labels meet WCAG 2.1 AA contrast ratios in default themes

2. **Given** a developer configures a timezone (e.g., `xAxis.timezone: 'America/New_York'`) **When** the x-axis renders **Then** time labels reflect the configured timezone

3. **Given** a developer provides a custom date format function via `xAxis.labelFormatter` **When** the x-axis renders **Then** the custom formatter is used for label text (receives Unix ms timestamp, returns string)

4. **Given** a chart with `xAxis.visible: false` in config **When** the axis layer draws **Then** no x-axis labels or tick marks are rendered

5. **Given** a chart that is resized **When** the ResizeObserver fires and the axis layer redraws **Then** x-axis labels and ticks recalculate to the new viewport dimensions

6. **Given** a chart where the data range changes (new data extends scale domain) **When** the axis layer is marked dirty and redraws **Then** x-axis tick positions update to match the new Scale domain **And** time format level adjusts to the new time range

7. **Given** an empty dataset (no data points) **When** the axis layer draws **Then** the x-axis renders gracefully using the default Scale domain (0 to 1)

8. **Given** no timezone is configured **When** the x-axis renders **Then** the browser's local timezone is used for formatting

## Tasks / Subtasks

- [x] Task 1: Update `DEFAULT_PADDING` for axis label space (AC: #1)
  - [x] In `src/api/glide-chart.ts`: change `DEFAULT_PADDING` from `{ top: 10, right: 10, bottom: 10, left: 10 }` to `{ top: 10, right: 10, bottom: 30, left: 60 }`
  - [x] **Why:** Current 10px padding on all sides is insufficient for axis labels. Y-axis labels (Story 2.2) are being clipped to 2px max width with current left padding. X-axis labels need `tickLength (4) + gap (4) + text height (~14px) = 22px` minimum below viewport; current bottom padding is only 10px.
  - [x] `left: 60` gives ~52px for y-axis labels after tick (4px) and padding (4px) — sufficient for formatted numbers like "0.0000" or "65,000"
  - [x] `bottom: 30` gives ~22px for x-axis labels after tick (4px) and padding (4px) — sufficient for formatted times like "14:23:05" or "Mar 28"
  - [x] Update any existing tests that assert on padding values or viewport dimensions (check `src/api/glide-chart.test.ts`)

- [x] Task 2: Add `timezone` to `AxisConfig` and `ChartConfig` types (AC: #2, #8)
  - [x] In `src/config/types.ts`: add `timezone?: string` to `AxisConfig`
  - [x] `timezone` is optional — when absent, formatting uses browser local timezone (default `Intl.DateTimeFormat` behavior)
  - [x] No changes needed in `defaults.ts` or `themes.ts` — `timezone` is optional and absent in defaults
  - [x] `ResolvedConfig.xAxis` already uses `Readonly<AxisConfig>` — `timezone` will be available as optional field
  - [x] Note: `labelFormatter` already exists on `AxisConfig` from Story 2.2 — both x-axis and y-axis share this type. For x-axis, `labelFormatter` receives `value` as a Unix ms timestamp (number). This is the same type signature `(value: number) => string`.

- [x] Task 3: Create `XAxisRenderer` class in `src/renderer/layers/x-axis-layer.ts` (AC: #1, #3, #4, #5, #6, #7, #8)
  - [x] Constructor signature: `(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, scale: Scale, config: Readonly<ResolvedConfig>)`
  - [x] Pre-compute in constructor: `this.fontString = \`${config.xAxis.labelFontSize}px ${config.xAxis.labelFontFamily}\`` — avoid string allocation in draw()
  - [x] Pre-create and cache `Intl.DateTimeFormat` instances in constructor (see "Intl.DateTimeFormat Setup" section below for details)
  - [x] Wrap `Intl.DateTimeFormat` construction in try/catch — if `config.xAxis.timezone` is an invalid IANA timezone string, `Intl.DateTimeFormat` throws `RangeError` at construction time. Catch the error and fall back to creating formatters without the `timeZone` option (browser default).
  - [x] Implement `draw(): void` method:
    1. **DO NOT** call `clearRect` — the facade's axis layer draw callback clears the shared axis canvas once before calling all axis renderers
    2. Set `ctx.globalAlpha = 1.0` at start — defensive reset
    3. Early return if `config.xAxis.visible === false`
    4. Import and use `computeNiceTicks` from `./background-layer` to compute tick positions from `scale.domainX` — reuse, do not reimplement
    5. Calculate maxTicks from viewport: `Math.max(3, Math.floor(scale.viewport.width / 100))` (same 100px minimum spacing as grid vertical lines)
    6. Derive `tickSpacing` from returned ticks: `ticks.length >= 2 ? ticks[1] - ticks[0] : 0`
    7. For each tick value, compute pixel X via `scale.xToPixel(value)`
    8. **Batch all tick marks into ONE `beginPath()/stroke()` call** (same pattern as `YAxisRenderer`): accumulate `moveTo/lineTo` pairs, then single `stroke()`. Draw labels in separate pass.
    9. Tick marks: short vertical lines at `(pixelX, viewport.y + viewport.height)` to `(pixelX, viewport.y + viewport.height + tickLength)` — ticks are BELOW the viewport
    10. Labels: centered text at `(pixelX, viewport.y + viewport.height + tickLength + labelPadding)` — use `ctx.textAlign = 'center'` and `ctx.textBaseline = 'top'`
    11. Use 0.5px offset for crisp tick lines: `Math.round(x) + 0.5`
    12. Skip labels that would overlap: measure text width with `ctx.measureText()`, skip if overlapping previous label position (add MIN_LABEL_GAP between labels)
    13. Use `maxWidth` parameter in `ctx.fillText(label, x, y, maxWidth)` to prevent long custom formatter strings from overflowing — match the YAxisRenderer pattern from Story 2.2 review findings
  - [x] Implement private `formatLabel(timestamp: number, tickSpacing: number): string` method:
    - If `config.xAxis.labelFormatter` exists, delegate to it: `return config.xAxis.labelFormatter(timestamp)` (wrapped in try/catch with String() coercion, matching YAxisRenderer pattern)
    - Otherwise, auto-detect time format level from tickSpacing:
      - `tickSpacing < 60_000` (< 1 min) → use `this.fmtSeconds` (HH:MM:SS)
      - `tickSpacing < 86_400_000` (< 1 day) → use `this.fmtMinutes` (HH:MM)
      - `tickSpacing >= 86_400_000` → use `this.fmtDays` (MMM DD)
    - `Intl.DateTimeFormat.format()` accepts a number (Unix ms) directly — do NOT construct `new Date()` objects. Passing a number is equivalent to passing a Date; the spec calls `ToNumber()` internally.
    - Edge case: `tickSpacing === 0` → fall back to `this.fmtSeconds`
  - [x] Define constants: `const LABEL_PADDING = 4;`, `const MIN_V_SPACING = 100;`, `const MIN_TICKS = 3;`, `const MIN_LABEL_GAP = 8;`
  - [x] Named export: `export { XAxisRenderer }` — no `export default`

- [x] Task 4: Wire `XAxisRenderer` into `GlideChart` facade in `src/api/glide-chart.ts` (AC: #1, #4, #5)
  - [x] Import `XAxisRenderer` from `../renderer/layers/x-axis-layer`
  - [x] Add private field: `private xAxisRenderer: XAxisRenderer;`
  - [x] In constructor, after creating `YAxisRenderer` (step 9), instantiate `XAxisRenderer`:
    ```typescript
    this.xAxisRenderer = new XAxisRenderer(axisCtx, axisCanvas, this.scale, this.resolvedConfig);
    ```
  - [x] Update the axis layer draw callback to include x-axis:
    ```typescript
    createLayer(LayerType.Axis, axisCanvas, axisCtx, () => {
      axisCtx.clearRect(0, 0, axisCanvas.width, axisCanvas.height);
      this.yAxisRenderer.draw();
      this.xAxisRenderer.draw();
    }),
    ```
  - [x] In `setConfig()`: recreate `XAxisRenderer` alongside `YAxisRenderer` — mirror the existing pattern:
    ```typescript
    this.xAxisRenderer = new XAxisRenderer(axisCtxNew, axisCanvasNew, this.scale, this.resolvedConfig);
    ```
    Update the axis layer draw callback to call both renderers:
    ```typescript
    if (axisLayer) {
      axisLayer.draw = () => {
        axisCtxNew.clearRect(0, 0, axisCanvasNew.width, axisCanvasNew.height);
        this.yAxisRenderer.draw();
        this.xAxisRenderer.draw();
      };
    }
    ```
  - [x] In `destroy()`: add `this.xAxisRenderer = null!;` alongside existing yAxisRenderer cleanup
  - [x] Axis layer is already marked dirty on scale/data changes — no additional dirty marking needed

- [x] Task 5: Write tests in `src/renderer/layers/x-axis-layer.test.ts` (AC: #1-#8)
  - [x] **Critical test setup:** Use explicit locale `'en-US'` and explicit `timeZone: 'UTC'` in test configurations for deterministic assertions. Production code uses `undefined` locale (user preference), but tests MUST be locale-independent to pass on any CI environment.
  - [x] Test: `draw()` does NOT call `clearRect` (facade responsibility)
  - [x] Test: `draw()` draws tick marks at vertical grid line positions (same `computeNiceTicks` values with domainX)
  - [x] Test: tick marks use 0.5px offset for crisp rendering
  - [x] Test: tick marks use `config.xAxis.tickColor` and `config.xAxis.tickLength`
  - [x] Test: labels use `config.xAxis.labelColor`, `labelFontSize`, `labelFontFamily`
  - [x] Test: labels are centered below the viewport area
  - [x] Test: `draw()` renders nothing when `xAxis.visible === false`
  - [x] Test: auto-format seconds-level — tickSpacing < 60s shows time with seconds
  - [x] Test: auto-format minutes-level — tickSpacing 1-59 min shows HH:MM
  - [x] Test: auto-format hours-level — tickSpacing 1-23 hours shows HH:MM
  - [x] Test: auto-format days-level — tickSpacing >= 1 day shows month and day
  - [x] Test: custom `labelFormatter` is called when provided
  - [x] Test: custom `labelFormatter` receives the raw timestamp value (number, not Date)
  - [x] Test: custom `labelFormatter` error falls back to auto-format (try/catch)
  - [x] Test: timezone config affects label output (use known timezone like `'UTC'` vs `'America/New_York'` and verify different output for same timestamp)
  - [x] Test: invalid timezone string does not crash — falls back to browser default
  - [x] Test: empty domain (min === max) does not crash
  - [x] Test: labels stay within canvas bounds (not clipped off-screen)
  - [x] Test: overlapping labels are skipped
  - [x] Test: `fillText` is called with `maxWidth` parameter

- [x] Task 6: Integration verification
  - [x] Run `pnpm test` — all tests pass (279 existing + new x-axis tests)
  - [x] Run `pnpm typecheck` — no type errors
  - [x] Run `pnpm lint` — no lint errors
  - [x] Run `pnpm build` — build succeeds
  - [x] Visual verification: open `demo/index.html` and confirm x-axis labels appear below the chart with proper spacing, and y-axis labels have adequate space on the left

## Dev Notes

### DEFAULT_PADDING Update — Critical Prerequisite

The current `DEFAULT_PADDING = { top: 10, right: 10, bottom: 10, left: 10 }` was set in Story 1.x before any axis rendering existed. It is insufficient for axis labels:

**Left padding (y-axis):** `viewport.x = padding.left = 10`. Y-axis ticks extend from `x = 6` to `x = 10`, leaving only 2px for label text. Labels are being silently clipped by the `maxLabelWidth` parameter in `fillText()`.

**Bottom padding (x-axis):** `viewport.y + viewport.height = canvasHeight - 10`. X-axis needs at minimum 22px below viewport (4px tick + 4px gap + 14px text). Current 10px clips labels below the canvas edge.

Update to `{ top: 10, right: 10, bottom: 30, left: 60 }`:
- `left: 60` → ~52px available for y-axis labels (fixes Story 2.2 rendering)
- `bottom: 30` → ~22px available for x-axis labels (enables this story)

This change is a **prerequisite** — without it, x-axis labels will be invisible.

### Architecture Compliance

**Module:** `src/renderer/layers/x-axis-layer.ts` — lives in the `renderer/layers/` directory, alongside `background-layer.ts`, `data-layer.ts`, and `y-axis-layer.ts`.

**Import DAG for renderer/ module:** `renderer/` can import from `core/` and `config/`:
- `../../core/scale` — `Scale` (for viewport, domainX, xToPixel)
- `../../config/types` — `ResolvedConfig`, `AxisConfig`
- `./background-layer` — `computeNiceTicks` (reuse the exported tick calculation utility)

**DO NOT** import from `api/`, `interaction/`, or `react/` — that would violate the module DAG.

### Tick Alignment with Grid Lines — Design Decision

X-axis ticks MUST align exactly with vertical grid lines. Both use `computeNiceTicks(domainX.min, domainX.max, maxTicks)` with the same maxTicks calculation: `Math.max(3, Math.floor(viewport.width / 100))`. By reusing the exact same function and parameters, ticks will align perfectly.

**Important:** `computeNiceTicks` uses a numeric "nice numbers" algorithm (1, 2, 5 × powers of 10), NOT time-aware boundaries. For timestamp domains, ticks fall at intervals like 10,000 ms, 20,000 ms, 50,000 ms — not at exact minute or hour boundaries. This is intentional: grid lines already use this algorithm for vertical lines, so x-axis ticks align with them. The time format auto-detection compensates by choosing the appropriate display format (seconds/minutes/hours/days) based on the actual tick spacing, regardless of whether ticks land on exact time boundaries.

Do NOT reimplement nice number tick generation — import `computeNiceTicks` from `./background-layer`. Do NOT try to create a time-aware tick algorithm — that would break grid alignment.

### Time Format Auto-Detection Algorithm

Select time display format based on tick spacing (which reflects the visible time range):

| Tick Spacing | Time Level | Format | Example |
|---|---|---|---|
| < 60,000 ms | Seconds | HH:MM:SS | "14:23:05" |
| < 86,400,000 ms | Minutes/Hours | HH:MM | "14:23" |
| >= 86,400,000 ms | Days | MMM DD | "Mar 28" |

Minutes and hours levels both display `HH:MM` — they share one `Intl.DateTimeFormat` instance (`fmtMinutes`). Only 3 formatter instances are needed, not 4.

### Intl.DateTimeFormat Setup

Pre-create and cache formatter instances in the constructor. Use `hourCycle: 'h23'` (not `hour12: false`) for unambiguous 24-hour time — `hour12: false` can produce `"24:00:00"` at midnight on some locale/engine combinations, while `hourCycle: 'h23'` guarantees midnight is `"00:00:00"`.

```typescript
// Constructor — cache formatters
const tz = config.xAxis.timezone;
const baseOpts: Intl.DateTimeFormatOptions | undefined = tz ? { timeZone: tz } : undefined;

// Wrap in try/catch — invalid timezone throws RangeError at construction time
try {
  this.fmtSeconds = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23', ...baseOpts,
  });
  this.fmtMinutes = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23', ...baseOpts,
  });
  this.fmtDays = new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric',
    ...baseOpts,
  });
} catch {
  // Invalid timezone — fall back to browser default (no timeZone option)
  this.fmtSeconds = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  });
  this.fmtMinutes = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23',
  });
  this.fmtDays = new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric',
  });
}
```

**Key details:**
- `Intl.DateTimeFormat.format()` accepts a number (Unix ms) directly — do NOT construct `new Date()` objects in the draw path
- Invalid timezone throws `RangeError` at construction time (not on `.format()`), so the try/catch in the constructor catches it
- `undefined` as first argument (locale) uses the browser's default locale — correct for production
- `{ month: 'short', day: 'numeric' }` output is locale-dependent: "Mar 28" (en-US) vs "28 Mar" (en-GB) — this is desired behavior

### X-Axis Rendering Position

X-axis labels and ticks render BELOW the viewport area:
```
|  ← viewport area →  |
|__tick________________|
     label
     ↑
  viewport.y + viewport.height
```

- Tick marks: from `(pixelX + 0.5, viewport.y + viewport.height)` to `(pixelX + 0.5, viewport.y + viewport.height + tickLength)`
- Labels: text at `(pixelX, viewport.y + viewport.height + tickLength + LABEL_PADDING)` with `textAlign = 'center'`, `textBaseline = 'top'`
- Ticks and labels must stay within canvas x-bounds (check `pixelX >= viewport.x` and `pixelX <= viewport.x + viewport.width`)

### Label Overlap Prevention

With many ticks visible, labels can overlap. Implement a simple overlap check:
1. After formatting a label, call `ctx.measureText(label).width`
2. Track the rightmost edge of the previously rendered label
3. If the new label's left edge (pixelX - width/2) is less than `previousRightEdge + MIN_LABEL_GAP`, skip this label
4. This produces clean, non-overlapping time labels that thin out naturally

Also use `maxWidth` parameter in `ctx.fillText(label, x, y, maxWidth)` as a safety net for custom formatters returning very long strings — matching the YAxisRenderer pattern established in Story 2.2 review.

### Shared Axis Canvas — Critical

Both Y-axis and X-axis render on the SAME axis canvas layer (`LayerType.Axis`). The facade's axis layer draw callback clears the canvas ONCE, then calls each renderer in sequence. `XAxisRenderer.draw()` does NOT call `clearRect`.

```typescript
createLayer(LayerType.Axis, axisCanvas, axisCtx, () => {
  axisCtx.clearRect(0, 0, axisCanvas.width, axisCanvas.height);
  this.yAxisRenderer.draw();
  this.xAxisRenderer.draw();  // ← Added by this story
}),
```

### Timezone Handling — Zero Dependencies

**Critical:** Do NOT import any timezone library (moment-timezone, luxon, date-fns-tz). Use the browser-native `Intl.DateTimeFormat` with `timeZone` option. This handles IANA timezone names (e.g., `'America/New_York'`, `'Europe/London'`, `'Asia/Tokyo'`) and is supported in all modern browsers.

When `config.xAxis.timezone` is `undefined`, omit the `timeZone` option entirely — `Intl.DateTimeFormat` defaults to the browser's local timezone, which satisfies AC #8.

### Test Environment Considerations

`Intl.DateTimeFormat` output is locale-dependent and timezone-dependent. Tests MUST be deterministic:

- **In test code:** Pass explicit locale `'en-US'` to `Intl.DateTimeFormat` constructor (or create `XAxisRenderer` with a config that has `timezone: 'UTC'`) so assertions produce consistent output across all CI environments.
- **In production code:** Use `undefined` locale (user's system preference) — this is correct behavior.
- **Do NOT** assert exact formatted string output without controlling locale and timezone. Either:
  - Use a known timezone (`'UTC'`) in the test config
  - Or assert structural properties (e.g., "contains digits", "contains ':'") rather than exact strings
- Node.js (which vitest uses) has full ICU support by default since Node 13 — no polyfills needed.

### Following the YAxisRenderer Pattern

Mirror the `YAxisRenderer` implementation:
- Constructor receives `ctx`, `canvas`, `scale`, and config via constructor injection
- `canvas` parameter kept for API consistency (prefixed with `_` since XAxisRenderer doesn't clear its own canvas)
- Public `draw()` method, private `formatLabel()` helper
- Pre-compute font string and formatters in constructor
- Batch tick marks into single `beginPath()/stroke()`
- Labels in separate pass after stroke
- Named export only

### What NOT To Do

- **DO NOT** render y-axis labels or ticks — that's Story 2.2 (already done)
- **DO NOT** render grid lines — that's Story 2.1 (already done)
- **DO NOT** add runtime dependencies (no moment.js, no date-fns, no luxon)
- **DO NOT** use `export default` — named exports only
- **DO NOT** use `any` type
- **DO NOT** create circular imports
- **DO NOT** call `requestAnimationFrame` directly — FrameScheduler handles this
- **DO NOT** manually compute data-to-pixel coordinates — always use Scale methods (`xToPixel`)
- **DO NOT** use `I` prefix on interfaces or `_` prefix for private members (except unused constructor params)
- **DO NOT** import test utilities (`describe`, `it`, `expect`, `vi`) from `vitest` — globals are enabled
- **DO NOT** reimplement `computeNiceTicks` — import it from `background-layer.ts`
- **DO NOT** have `XAxisRenderer.draw()` call `clearRect` — the facade axis draw callback clears
- **DO NOT** use `Date.toLocaleString()` or manual date parsing — use `Intl.DateTimeFormat` instances
- **DO NOT** use `new Date(timestamp)` in the draw path — `Intl.DateTimeFormat.format()` accepts numbers directly
- **DO NOT** use `hour12: false` — use `hourCycle: 'h23'` for unambiguous 24-hour time
- **DO NOT** create a time-aware tick algorithm — reuse `computeNiceTicks` for grid alignment

### Project Structure Notes

| File | Path | Purpose |
|------|------|---------|
| GlideChart facade | `src/api/glide-chart.ts` | Update DEFAULT_PADDING, wire XAxisRenderer (modify existing) |
| Config types | `src/config/types.ts` | Add `timezone` to `AxisConfig` (modify existing) |
| X-axis layer renderer | `src/renderer/layers/x-axis-layer.ts` | X-axis labels, ticks, time formatting (new) |
| X-axis layer tests | `src/renderer/layers/x-axis-layer.test.ts` | Unit tests for x-axis rendering (new) |

### Previous Story Intelligence

**From Story 2.2 (done — previous story in this epic):**
- `YAxisRenderer` created in `src/renderer/layers/y-axis-layer.ts` — follow exact same pattern
- `labelFormatter` already added to `AxisConfig` as optional `(value: number) => string`
- Custom formatter wrapped in try/catch with `String()` coercion — replicate this pattern
- `formatLabel` has `tickSpacing` parameter for auto-precision — X-axis needs this for time level detection
- Facade axis layer draw callback: clears canvas once, then calls `this.yAxisRenderer.draw()` — add `this.xAxisRenderer.draw()` after
- `setConfig()` already recreates YAxisRenderer and updates axis layer draw callback — extend to include XAxisRenderer
- `destroy()` already nulls `this.yAxisRenderer = null!;` — add `this.xAxisRenderer = null!;` alongside
- 279 total tests passing after Story 2.2
- Review findings: floating-point imprecision in `Math.log10` fixed with `Math.round`, `labelFormatter` errors wrapped in try/catch, long labels capped with `maxWidth` in `fillText`
- **Y-axis labels are currently clipped** due to insufficient left padding (only 2px available for label text) — the padding update in Task 1 of this story fixes this retroactively

**From Story 2.1 (done):**
- `computeNiceTicks` exported from `src/renderer/layers/background-layer.ts` — reuse for tick alignment
- Vertical grid lines use `Math.max(3, Math.floor(viewport.width / 100))` for maxTicks — X-axis must match
- Background layer wired into facade following DataLayerRenderer pattern

**From Story 1.6 (done):**
- Axis config: `xAxis: { visible: boolean, labelColor: string, labelFontSize: number, labelFontFamily: string, tickColor: string, tickLength: number }` — same as yAxis
- Dark theme: `labelColor: '#8a8a9a'`, `labelFontSize: 11`, `labelFontFamily: SYSTEM_FONT_STACK`, `tickColor: '#3a3a4a'`, `tickLength: 4`
- Light theme: `labelColor: '#555555'`, `tickColor: '#cccccc'`

**From Story 1.4 (done):**
- `Scale` provides: `domainX` (Readonly<ScaleDomain>), `xToPixel(timestamp)` — maps timestamp to horizontal pixel position
- domainX stores Unix millisecond timestamps (from `DataPoint.timestamp`)

### Git Intelligence

Recent commits follow: `feat:` prefix, lowercase, concise description with story reference.
Latest: `feat: add y-axis with auto-scaling and decimal precision (Story 2.2)`

Expected commit message: `feat: add x-axis with time formatting and timezone support (Story 2.3)`

### Downstream Dependencies

This x-axis renderer will be referenced by:
- **Story 2.4** — Locale-aware number formatting may affect how x-axis time labels are formatted if locale-specific date formatting is needed.
- **Story 2.5** — Multi-series rendering does not directly affect x-axis (all series share the same time domain).
- **Story 3.2** — Configurable visible time window and auto-scroll will cause frequent x-axis domain changes, testing the dirty flag performance.
- **Story 5.3** — Axis customization may extend `AxisConfig` with additional x-axis display options.

### References

- [Source: architecture.md — Rendering Architecture, Layer Structure, Pixel Alignment, Canvas Drawing Conventions]
- [Source: architecture.md — Module Boundaries: renderer/ can import from core/, config/]
- [Source: epics.md — Epic 2, Story 2.3: X-Axis with Time Formatting & Timezone Support]
- [Source: epics.md — FR16 (time-based x-axis auto-scaled), FR19 (custom formatters), FR21 (timezone awareness)]
- [Source: prd.md — NFR11 (WCAG AA contrast), NFR12 (modern browser support)]
- [Source: project-context.md — Layered canvas architecture, pixel alignment, dirty flag system, zero runtime dependencies, time zone agnostic timestamps]
- [Source: 2-2-y-axis-with-auto-scaling-and-decimal-precision.md — YAxisRenderer pattern, shared axis canvas, labelFormatter, setConfig pattern]
- [Source: 2-1-background-layer-grid-lines.md — computeNiceTicks reuse, vertical grid line spacing (100px minimum)]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Test assertion fix: `fillText` call indices — `call[1]` is x position, `call[2]` is y position (not `call[1]`)
- Unused variable `x` in bounds test removed for typecheck compliance

### Completion Notes List

- Task 1: Updated `DEFAULT_PADDING` from `{10,10,10,10}` to `{10,10,30,60}` — provides adequate space for both x-axis labels (bottom: 30px) and y-axis labels (left: 60px). All 279 existing tests pass unchanged.
- Task 2: Added optional `timezone?: string` to `AxisConfig` interface in `types.ts`. No defaults changes needed — field is optional and uses browser default when absent.
- Task 3: Created `XAxisRenderer` class following `YAxisRenderer` pattern — constructor caches `Intl.DateTimeFormat` instances (seconds/minutes/days) with timezone support and invalid-timezone fallback. `draw()` method uses `computeNiceTicks` for grid-aligned tick positions, batches tick marks, skips overlapping labels, uses `maxWidth` safety net. `formatLabel()` auto-detects time level from tick spacing, delegates to custom formatter when provided (with try/catch).
- Task 4: Wired `XAxisRenderer` into `GlideChart` facade — constructor, axis layer draw callback, `setConfig()`, and `destroy()` all updated. X-axis draws after y-axis on shared axis canvas.
- Task 5: 20 unit tests covering: no clearRect, tick alignment, 0.5px crisp rendering, tick/label styling, centered label positioning, visibility toggle, all 4 time format levels (seconds/minutes/hours/days), custom formatter delegation, formatter error fallback, timezone effects, invalid timezone resilience, empty domain, bounds checking, overlap skipping, maxWidth parameter.
- Task 6: All 299 tests pass (279 existing + 20 new), typecheck clean, lint clean, build succeeds.

### File List

- `src/api/glide-chart.ts` — Modified: updated DEFAULT_PADDING, imported and wired XAxisRenderer
- `src/config/types.ts` — Modified: added `timezone?: string` to AxisConfig
- `src/renderer/layers/x-axis-layer.ts` — New: XAxisRenderer class
- `src/renderer/layers/x-axis-layer.test.ts` — New: 20 unit tests for XAxisRenderer

### Change Log

- 2026-03-29: Implemented Story 2.3 — X-axis with time formatting and timezone support. Updated default padding for axis labels, added timezone config type, created XAxisRenderer with auto-detecting time format levels and Intl.DateTimeFormat-based timezone support, wired into facade, 20 tests added.

### Review Findings

- [x] [Review][Fixed] Minimum container size increased by padding change [src/api/glide-chart.ts] — Fixed: constructor and handleResize clamp dimensions to minimum required by padding.
- [x] [Review][Fixed] Cannot unset timezone via setConfig(null) [src/config/resolver.ts] — Fixed: deepMerge now treats null as a reset signal (deletes key).
