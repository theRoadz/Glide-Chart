# Story 4.2: Tooltip with Data Values

Status: done

## Story

As a user viewing a Glide Chart,
I want a tooltip showing data values at the crosshair position,
so that I can read exact prices and timestamps.

## Acceptance Criteria

1. **Given** the crosshair is active on the chart **When** hovering over the data area **Then** a tooltip displays the timestamp and value(s) at the crosshair position **And** for multi-series charts, all series values are shown **And** values use the configured number/date formatting **And** the tooltip repositions to stay within the chart bounds (no clipping)
2. **Given** a screen reader is active **When** the crosshair moves **Then** tooltip data is accessible via ARIA live region (NFR9)
3. **Given** `tooltip.enabled` is `false` in config **When** pointer events occur **Then** no tooltip is rendered and no unnecessary work is done
4. **Given** the pointer leaves the chart area **When** the pointer exits **Then** the tooltip hides immediately

## Tasks / Subtasks

- [x] Task 1: Create Tooltip class (AC: 1, 3, 4)
  - [x] 1.1 Create `src/interaction/tooltip.ts` — DOM-based tooltip overlay
  - [x] 1.2 Constructor receives: container `HTMLElement`, `Scale`, `CrosshairDataSource`, `ResolvedConfig`. Validate all inputs with prefixed error messages
  - [x] 1.3 Create tooltip DOM element: a `<div>` positioned absolutely within the container, with `pointer-events: none`, styled from `ResolvedConfig.tooltip` (backgroundColor, textColor, fontSize, fontFamily, padding, borderRadius)
  - [x] 1.4 Implement `update(pointerState, config)` method:
    - Early return if `config.tooltip.enabled === false` or `pointerState.active === false` → hide tooltip
    - Early return if pointer is outside the plot area (`Scale.viewport` bounds) → hide tooltip. This prevents showing a tooltip with no matching crosshair when hovering over axis labels or padding
    - Convert pointer X to timestamp via `Scale.pixelToX(pointerState.x)`
    - Look up nearest data point(s) across all series buffers using same early-termination algorithm as Crosshair
    - For multi-series: collect nearest value from each buffer, paired with series config id. For single-series charts (`config.series.length === 1`), omit the series label and show just the value — the label is unnecessary clutter when there's only one series
    - Format timestamp using configured `xAxis.labelFormatter` or auto-detect format (same Intl.DateTimeFormat patterns as XAxisRenderer)
    - Format values using configured `yAxis.labelFormatter` or auto-detect precision (same Intl.NumberFormat patterns as YAxisRenderer)
    - Build tooltip content via `document.createElement`/`textContent` (never `innerHTML`) — timestamp header div + series value row divs
    - Position tooltip near pointer using `style.transform = translate(Xpx, Ypx)` — compute position to stay within container bounds (flip left/right and top/bottom as needed)
  - [x] 1.5 Implement `hide()` — set `display: none` on tooltip div
  - [x] 1.6 Implement `destroy()` — remove tooltip div from DOM
  - [x] 1.7 **Sanitize all text content** — use `textContent` for user-provided formatter output, never `innerHTML` with raw strings from formatters (security: XSS prevention)

- [x] Task 2: Create ARIA live region for screen reader accessibility (AC: 2)
  - [x] 2.1 Create a visually-hidden `<div aria-live="polite" aria-atomic="true">` inside the container
  - [x] 2.2 Apply sr-only styles: `position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0`
  - [x] 2.3 **Debounce** live region updates to ~300ms to avoid flooding screen readers during rapid crosshair movement — the visible tooltip updates every frame, but the ARIA div only updates after the pointer has been stationary for 300ms
  - [x] 2.4 Update ARIA div `textContent` with a plain-text summary: e.g., `"10:32:15: price 142.50, volume 1,200"`
  - [x] 2.5 Clear ARIA div on pointer leave
  - [x] 2.6 Destroy: remove ARIA div from DOM, clear debounce timer

- [x] Task 3: Add tooltip types to interaction types (AC: 1)
  - [x] 3.1 Add `TooltipDataPoint` interface to `src/interaction/types.ts`: `{ seriesId: string; value: number; timestamp: number }`

- [x] Task 4: Integrate Tooltip into GlideChart facade (AC: 1, 2, 3, 4)
  - [x] 4.1 Import and instantiate `Tooltip` in GlideChart constructor after EventDispatcher setup — pass container, scale, crosshairDataSource, resolvedConfig
  - [x] 4.2 In the existing EventDispatcher subscriber callback (lines 191-197), after updating `pointerState` and marking interaction dirty, also call `this.tooltip.update(this.pointerState, this.resolvedConfig)` — tooltip DOM updates happen synchronously in the event handler (no rAF needed for DOM positioning)
  - [x] 4.3 On `pointerleave` (when `state.active === false`), tooltip hides automatically via the update method's early return
  - [x] 4.4 In `setConfig()`, **recreate the Tooltip instance** (destroy old, create new) — same pattern as BackgroundLayerRenderer/YAxisRenderer/XAxisRenderer which are all recreated in `setConfig()` (glide-chart.ts lines 406-455). This is necessary because Tooltip pre-creates `Intl.DateTimeFormat`/`Intl.NumberFormat` in its constructor using locale/timezone from config, and those become stale if config changes
  - [x] 4.5 In `destroy()`, call `this.tooltip.destroy()` and null out reference

- [x] Task 5: Format utilities (AC: 1)
  - [x] 5.1 Tooltip must use the same formatting as axes: if `yAxis.labelFormatter` is set, use it for values; if `xAxis.labelFormatter` is set, use it for timestamps
  - [x] 5.2 For auto-format when no custom formatter: use `Intl.DateTimeFormat` with xAxis locale/timezone for timestamps, `Intl.NumberFormat` with yAxis locale for values
  - [x] 5.3 Pre-create `Intl.DateTimeFormat` and `Intl.NumberFormat` instances in the constructor — do NOT allocate per frame
  - [x] 5.4 Auto-detect timestamp detail level: if domain X span < 60s show HH:MM:SS, if < 24h show HH:MM, else show Mon DD

- [x] Task 6: Tooltip positioning logic (AC: 1)
  - [x] 6.1 Default position: offset right and above the crosshair point
  - [x] 6.2 Boundary detection: if tooltip would overflow right edge → flip to left of crosshair; if overflow top → flip below crosshair
  - [x] 6.3 Use `offsetWidth`/`offsetHeight` of tooltip div for size measurement (reflow is acceptable since it happens at most once per pointer move, not per frame)
  - [x] 6.4 Apply position via CSS `transform: translate(Xpx, Ypx)` with `left: 0; top: 0` base — avoids layout thrashing, compositor-friendly

- [x] Task 7: Unit tests for Tooltip (AC: 1, 2, 3, 4)
  - [x] 7.1 Create `src/interaction/tooltip.test.ts`
  - [x] 7.2 Test: tooltip div created in container on construction
  - [x] 7.3 Test: update() shows tooltip with formatted timestamp and value(s) when pointer active and within viewport
  - [x] 7.4 Test: multi-series — all series values displayed
  - [x] 7.5 Test: tooltip hidden when enabled=false
  - [x] 7.6 Test: tooltip hidden when pointer inactive
  - [x] 7.7 Test: tooltip hidden when pointer is outside viewport bounds (e.g., over axis padding area)
  - [x] 7.8 Test: tooltip repositions to avoid overflow (boundary detection)
  - [x] 7.9 Test: ARIA live region exists with aria-live="polite"
  - [x] 7.10 Test: ARIA content updates are debounced (~300ms)
  - [x] 7.11 Test: destroy removes tooltip and ARIA divs from DOM and clears timer
  - [x] 7.12 Test: custom formatter functions applied to values and timestamps
  - [x] 7.13 Test: constructor validates all required inputs

- [x] Task 8: Integration tests (AC: 1, 2, 3, 4)
  - [x] 8.1 Create `src/interaction/tooltip-integration.test.ts`
  - [x] 8.2 Test: full GlideChart with pointer events triggers tooltip display
  - [x] 8.3 Test: tooltip hidden after pointerleave
  - [x] 8.4 Test: destroy cleans up tooltip DOM elements
  - [x] 8.5 Test: multi-series chart shows all series in tooltip

- [x] Task 9: Update demo page (AC: 1)
  - [x] 9.1 Verify tooltip appears automatically on existing demo charts (since tooltip.enabled defaults to true)
  - [x] 9.2 Optionally add note to demo subtitle mentioning tooltip

### Review Findings

- [x] [Review][Patch] No bottom boundary check in `positionTooltip` — tooltip could clip below container [src/interaction/tooltip.ts:282] — FIXED: added containerHeight check and clamp
- [x] [Review][Patch] Tooltip can go negative-X (off-screen left) — flip logic could produce negative X [src/interaction/tooltip.ts:291] — FIXED: added `Math.max(0, ...)` style clamp
- [x] [Review][Patch] `SECONDS_MS` constant name misleading — renamed to `MINUTE_MS` [src/interaction/tooltip.ts:7] — FIXED
- [x] [Review][Patch] No test for custom formatter error fallback — try/catch path untested [src/interaction/tooltip.test.ts] — FIXED: added test

## Dev Notes

### Architecture Compliance

**Tooltip is a DOM overlay, NOT canvas-drawn.** This is a critical design decision:
- DOM elements provide native text rendering quality, automatic DPI handling, and screen reader accessibility
- Canvas-drawn text would require a parallel DOM structure for ARIA anyway
- All major charting libraries (Chart.js, Highcharts, ECharts) use DOM tooltips
- `pointer-events: none` on the tooltip div ensures it doesn't intercept chart interactions

**Module location:** `src/interaction/tooltip.ts` and `src/interaction/tooltip.test.ts`

**Import DAG:** `interaction/` imports from `core/`, `config/` only. It CANNOT import from `api/` or `renderer/` implementation files. The Tooltip class must NOT import axis renderers. To avoid duplicating formatting code, consider creating `src/core/format-utils.ts` with shared timestamp/value formatting helpers that both `renderer/layers/` and `interaction/tooltip.ts` can import (both modules can import from `core/`). If this feels like over-engineering for now, duplicating the Intl.DateTimeFormat/NumberFormat pattern locally is acceptable.

**Dependency injection:** Tooltip constructor receives `container: HTMLElement`, `Scale`, `CrosshairDataSource`, and `ResolvedConfig`. GlideChart wires everything together.

### Interaction Layer Integration

The tooltip does NOT render on the canvas interaction layer. It is a DOM element overlaid on the chart. However, the tooltip update is triggered from the same EventDispatcher subscriber callback that drives the crosshair.

**Key integration point in `glide-chart.ts` (lines 191-197):**
```typescript
// Current EventDispatcher subscriber:
this.eventDispatcher.subscribe((state) => {
  this.pointerState.x = state.x;
  this.pointerState.y = state.y;
  this.pointerState.active = state.active;
  this.pointerState.pointerType = state.pointerType;
  this.frameScheduler.markDirty(LayerType.Interaction);
  // ADD: tooltip DOM update (synchronous, no rAF needed)
  this.tooltip.update(this.pointerState, this.resolvedConfig);
});
```

The interaction layer draw callback (lines 175-179) does NOT change — crosshair continues to draw on canvas, tooltip is separate DOM.

### Coordinate System

- PointerEvent `.offsetX`/`.offsetY` are CSS pixels relative to the container — use directly
- `Scale.pixelToX(pointerX)` converts CSS pixel X to a timestamp for data lookup
- Tooltip DOM positioning uses CSS pixels — no DPR conversion needed
- The container element has `position: relative` (set by LayerManager) so absolute positioning works correctly

### Data Lookup Pattern

Reuse the same nearest-data-point algorithm from Crosshair (`findNearestValue`), but extended to return data from ALL series:
- Iterate all buffers from `CrosshairDataSource.getBuffers()`
- For each buffer, find the data point closest to the target timestamp using linear scan with early termination (data is time-sorted)
- Return an array of `{ seriesId, timestamp, value }` for all series. Pre-allocate this result array in the constructor (sized to `config.series.length`) and reuse it per update — mutate entries in-place and track the active count rather than creating a new array per pointer move. Follows the same zero-allocation philosophy as EventDispatcher's reusable `PointerState`
- The `seriesId` comes from the `ResolvedConfig.series[index].id` — pass series configs to Tooltip or use an enhanced `CrosshairDataSource` that provides series IDs alongside buffers

**Required refactor:** The current `CrosshairDataSource` interface only exposes `getBuffers()` without series IDs. Enhance it to include series IDs. Update `src/interaction/types.ts`:
```typescript
export interface CrosshairSeriesData {
  id: string;
  buffer: RingBuffer<DataPoint>;
}

export interface CrosshairDataSource {
  getSeries(): Iterable<CrosshairSeriesData>;
}
```
Then update:
- `Crosshair.findNearestValue()` — iterate `getSeries()` instead of `getBuffers()` (extract `.buffer` from each entry)
- `glide-chart.ts` data source construction (lines 183-188) — pre-allocate array of `{ id, buffer }` objects from `seriesMap`
- `crosshair.test.ts` and `crosshair-integration.test.ts` — update mock data sources to use `getSeries()`

This is a contained refactor within `interaction/` + `api/` — all files are already in scope for this story.

### Formatting

**Timestamp formatting:** Pre-create three `Intl.DateTimeFormat` instances in the constructor (same pattern as XAxisRenderer):
- `fmtSeconds`: `{ hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }` — used when X domain span < 60s
- `fmtMinutes`: `{ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }` — used when span < 24h
- `fmtDays`: `{ month: 'short', day: 'numeric' }` — used for larger spans

Respect `xAxis.timezone` and `xAxis.locale` from config when creating these formatters.

**Value formatting:** Pre-create `Intl.NumberFormat` in constructor. Respect `yAxis.locale`. Auto-detect decimal precision from value range (same as YAxisRenderer.formatLabel). Use `yAxis.labelFormatter` if provided.

**Custom formatters:** If `config.xAxis.labelFormatter` or `config.yAxis.labelFormatter` is set, use those. Wrap in try/catch — fall through to auto-format on error (same pattern as axis renderers).

### Tooltip DOM Structure

**Multi-series (2+ series):**
```html
<div class="glide-chart-tooltip" style="position: absolute; left: 0; top: 0; pointer-events: none; display: none; z-index: 10; background: ...; color: ...; font: ...; padding: ...; border-radius: ...;">
  <div class="glide-chart-tooltip-time">10:32:15</div>
  <div class="glide-chart-tooltip-row">
    <span class="glide-chart-tooltip-label">price</span>
    <span class="glide-chart-tooltip-value">142.50</span>
  </div>
  <div class="glide-chart-tooltip-row">
    <span class="glide-chart-tooltip-label">volume</span>
    <span class="glide-chart-tooltip-value">1,200</span>
  </div>
</div>
```

**Single-series (omit label, show value only):**
```html
<div class="glide-chart-tooltip" style="...">
  <div class="glide-chart-tooltip-time">10:32:15</div>
  <div class="glide-chart-tooltip-value">142.50</div>
</div>
```

Use `document.createElement` — do NOT use `innerHTML` for construction. Set text via `textContent` for XSS safety. Apply styles programmatically from config values.

**Class names use `glide-chart-` prefix** to avoid collisions with consumer CSS.

### Tooltip Positioning

1. Compute tooltip position offset from pointer: `tooltipX = pointerX + 12`, `tooltipY = pointerY - tooltipHeight - 12`
2. If `tooltipX + tooltipWidth > containerWidth` → flip: `tooltipX = pointerX - tooltipWidth - 12`
3. If `tooltipY < 0` → flip: `tooltipY = pointerY + 12`
4. Apply via `transform: translate(${tooltipX}px, ${tooltipY}px)`
5. Use `offsetWidth`/`offsetHeight` for tooltip size — this forces a reflow but only happens per pointer move, not per rAF frame

### ARIA Live Region

A separate visually-hidden div for screen readers:
```html
<div aria-live="polite" aria-atomic="true" style="position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;">
  10:32:15: price 142.50, volume 1,200
</div>
```

- Updates debounced at 300ms to avoid flooding screen readers
- Use `setTimeout` / `clearTimeout` pattern for debounce — clear previous timer on each pointer move, set new 300ms timer
- On pointer leave: clear timer, clear textContent immediately
- Destroy: remove div, clear timer

### Config Defaults Already Exist

`TooltipConfig` is already in `src/config/types.ts` (lines 51-59) with fields: `enabled`, `backgroundColor`, `textColor`, `fontSize`, `fontFamily`, `padding`, `borderRadius`.

Theme defaults in `src/config/themes.ts`:
- **Dark theme (lines 53-61):** `{ enabled: true, backgroundColor: '#1a1a2e', textColor: '#e0e0e0', fontSize: 12, fontFamily: SYSTEM_FONT_STACK, padding: 8, borderRadius: 4 }`
- **Light theme (lines 114-122):** `{ enabled: true, backgroundColor: '#ffffff', textColor: '#333333', fontSize: 12, fontFamily: SYSTEM_FONT_STACK, padding: 8, borderRadius: 4 }`

No config changes needed — these are already resolved via `resolveConfig()`.

### Existing Code to Reuse

- **`CrosshairDataSource` interface** (`src/interaction/types.ts`) — data access pattern (needs enhancement for series IDs as described above)
- **`Scale.pixelToX()`** (`src/core/scale.ts:137-141`) — convert pixel to timestamp
- **`PointerState`** (`src/interaction/types.ts`) — pointer position and active flag
- **`EventDispatcher.subscribe()`** (`src/interaction/event-dispatcher.ts:33-38`) — returns unsubscribe function
- **Existing EventDispatcher subscriber** in GlideChart (lines 191-197) — extend, do not create a second subscriber

### Anti-Patterns to Avoid

- **DO NOT** render tooltip on canvas — use DOM overlay for text quality and accessibility
- **DO NOT** allocate `Intl.DateTimeFormat`/`Intl.NumberFormat` per pointer move — pre-create in constructor
- **DO NOT** use `innerHTML` with user-provided formatter output — XSS risk; use `textContent`
- **DO NOT** import from `renderer/layers/x-axis-layer.ts` or `y-axis-layer.ts` — replicate formatting locally within `interaction/` module (DAG constraint)
- **DO NOT** create a second EventDispatcher subscriber — extend the existing one in GlideChart
- **DO NOT** use `export default` — named exports only
- **DO NOT** add runtime dependencies
- **ALL error messages must be prefixed** with class name — e.g., `"Tooltip: container element is required"`

### Testing Standards

- Co-located test files in `src/interaction/`
- For DOM testing: create a container div via `document.createElement('div')`, attach to `document.body`, clean up in afterEach
- Test tooltip DOM creation, content updates, positioning, and destruction
- Use `vi.useFakeTimers()` for debounce testing on ARIA updates
- Mock `Scale` with simple identity mapping for unit tests
- Mock `CrosshairDataSource` with test ring buffers containing known data
- Constructor injection makes Tooltip fully testable in isolation

### Previous Story Intelligence (Story 4.1)

Key patterns established in Story 4.1 that this story must follow:
- **EventDispatcher** listens on container div, pre-allocates reusable `PointerState`, subscribers receive shared reference
- **Crosshair** uses constructor injection (Scale + CrosshairDataSource), early-return guards, 0.5px offset for crisp lines
- **GlideChart integration:** pre-allocated buffer list for data source, single subscriber callback updates state and marks dirty
- **Review findings from 4.1:** `getBuffers()` allocation was fixed to pre-allocate; `findNearestValue` uses early termination; subscribe returns unsubscribe function — follow all these patterns
- **439 tests currently passing** — do not break any existing tests

### Git Intelligence

Recent commit: `b261db1 feat: add event dispatcher and crosshair overlay with review fixes (Story 4.1)`. All 439 tests passing, zero lint/type errors. Commit message pattern: `feat: add <description> (Story X.Y)`.

### Project Structure Notes

```
src/interaction/
  types.ts              ← Modify: add TooltipDataPoint, enhance CrosshairDataSource
  event-dispatcher.ts   ← No changes
  crosshair.ts          ← Minor refactor: update to use getSeries() instead of getBuffers()
  tooltip.ts            ← NEW: DOM-based tooltip overlay
  tooltip.test.ts       ← NEW: unit tests
  tooltip-integration.test.ts ← NEW: integration tests
  event-dispatcher.test.ts ← No changes
  crosshair.test.ts     ← Update if CrosshairDataSource interface changes
  crosshair-integration.test.ts ← Update if CrosshairDataSource interface changes
src/api/
  glide-chart.ts        ← Modify: instantiate Tooltip, extend subscriber, update destroy/setConfig
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 4, Story 4.2 lines 537-555]
- [Source: _bmad-output/planning-artifacts/prd.md — FR12: tooltip displaying data values]
- [Source: _bmad-output/planning-artifacts/prd.md — NFR9: tooltip data accessible to screen readers]
- [Source: _bmad-output/planning-artifacts/architecture.md — Event Handling section, Interaction module]
- [Source: src/config/types.ts:51-59 — TooltipConfig interface]
- [Source: src/config/themes.ts:53-61, 114-122 — tooltip theme defaults]
- [Source: src/interaction/types.ts — CrosshairDataSource, PointerState interfaces]
- [Source: src/interaction/crosshair.ts — findNearestValue pattern, draw early-return pattern]
- [Source: src/interaction/event-dispatcher.ts — subscribe API returning unsubscribe function]
- [Source: src/api/glide-chart.ts:175-179 — interaction layer draw callback]
- [Source: src/api/glide-chart.ts:183-197 — EventDispatcher/Crosshair integration pattern]
- [Source: src/renderer/layers/x-axis-layer.ts:121-137 — timestamp formatting with Intl.DateTimeFormat]
- [Source: src/renderer/layers/y-axis-layer.ts:77-106 — value formatting with Intl.NumberFormat]
- [Source: src/core/scale.ts:137-141 — pixelToX() for coordinate conversion]
- [Source: _bmad-output/implementation-artifacts/4-1-event-dispatcher-and-crosshair.md — previous story patterns and review findings]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

None — clean implementation with no blocking issues.

### Completion Notes List

- Created DOM-based tooltip overlay (`src/interaction/tooltip.ts`) with full feature set: data lookup, formatting, positioning, ARIA accessibility
- Enhanced `CrosshairDataSource` interface to include series IDs (`getSeries()` replaces `getBuffers()`), enabling tooltip to display series names
- Added `TooltipDataPoint` and `CrosshairSeriesData` types to `src/interaction/types.ts`
- Refactored `Crosshair.findNearestValue()` to use new `getSeries()` API
- Integrated Tooltip into GlideChart facade: constructor instantiation, EventDispatcher subscriber update, setConfig recreation, destroy cleanup
- Pre-allocated result pool and Intl formatters in constructor (zero per-frame allocations)
- ARIA live region with 300ms debounce for screen reader accessibility
- XSS-safe: all text rendering uses `textContent`, never `innerHTML`
- Tooltip positioning with boundary flip detection (right/left, top/bottom)
- Single-series mode omits redundant series label
- Custom formatter support with try/catch fallback to auto-format
- Added `HTMLDivElement`/`HTMLSpanElement` globals to ESLint config
- 12 unit tests + 4 integration tests — all 458 tests pass, zero regressions

### Change Log

- 2026-03-30: Implemented Story 4.2 — Tooltip with Data Values (all 9 tasks complete)

### File List

- `src/interaction/tooltip.ts` — NEW: DOM-based tooltip overlay class
- `src/interaction/tooltip.test.ts` — NEW: 12 unit tests for Tooltip
- `src/interaction/tooltip-integration.test.ts` — NEW: 4 integration tests for Tooltip + GlideChart
- `src/interaction/types.ts` — MODIFIED: added CrosshairSeriesData, TooltipDataPoint interfaces; replaced getBuffers() with getSeries()
- `src/interaction/crosshair.ts` — MODIFIED: updated findNearestValue to use getSeries() API
- `src/interaction/crosshair.test.ts` — MODIFIED: updated mock data source to use getSeries()
- `src/api/glide-chart.ts` — MODIFIED: added Tooltip instantiation, subscriber update, setConfig recreation, destroy cleanup; stored container reference; updated crosshairDataSource to use getSeries()
- `eslint.config.js` — MODIFIED: added HTMLDivElement/HTMLSpanElement to globals
- `demo/index.html` — MODIFIED: updated subtitle to mention tooltip
