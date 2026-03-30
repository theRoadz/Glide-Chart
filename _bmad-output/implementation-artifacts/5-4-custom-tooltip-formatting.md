# Story 5.4: Custom Tooltip Formatting

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer using Glide Chart,
I want to customize tooltip content and formatting,
so that tooltips display data in my application's format and style.

## Acceptance Criteria

1. **Given** a developer provides a custom tooltip formatter function, **when** the crosshair activates, **then** the custom formatter receives the data point(s) and returns formatted content, **and** the tooltip renders the custom content.

2. **Given** no custom formatter, **when** the tooltip displays, **then** default formatting is used (timestamp + value with configured precision).

## Important Context: Scope of Changes

- **Tooltip class** — Already fully renders timestamp + values using `xAxis.labelFormatter`/`yAxis.labelFormatter` as shared formatters. This story adds a **dedicated** `tooltip.formatter` callback that gives the developer complete control over tooltip content.
- **Config types** — Add `formatter` to `TooltipConfig` as an optional callback receiving all active data points and returning either a string (simple) or structured content.
- **Existing formatters** — `xAxis.labelFormatter` and `yAxis.labelFormatter` already work in tooltip (tested in Story 4.2). The new `tooltip.formatter` takes **priority** over axis formatters when present, giving tooltip-specific control.
- **No visual/rendering changes** — The DOM structure of the tooltip (`glide-chart-tooltip`, `glide-chart-tooltip-time`, `glide-chart-tooltip-row`, etc.) remains intact for default mode. When a custom formatter is provided, the tooltip renders formatter output as the entire tooltip body.

## Tasks / Subtasks

- [x] Task 1: Add `formatter` to TooltipConfig type (AC: 1, 2)
  - [x] 1.1 In `src/config/types.ts`, add to `TooltipConfig` using an **inline type** (do NOT import from `interaction/types` — `config/` cannot import from `interaction/` per architecture boundary rules):
    ```typescript
    formatter?: (points: ReadonlyArray<Readonly<{ seriesId: string; value: number; timestamp: number }>>) => string;
    ```
    This gives the developer all active series data points in one call, returning a single string for the tooltip body. The inline shape matches `TooltipDataPoint` from `interaction/types.ts` exactly but avoids a circular import.
  - [x] 1.2 In `src/config/types.ts`, `ChartConfig.tooltip` already accepts `Partial<TooltipConfig>`, so no changes needed there. The `formatter` property flows through automatically since it's optional.

- [x] Task 2: Wire formatter into Tooltip.update() (AC: 1, 2)
  - [x] 2.1 In `src/interaction/tooltip.ts`, in the `update()` method, after the data-finding loop (after `this.activeCount` is set, ~line 217), add a branch:
    - If `config.tooltip.formatter` exists, call it with the active entries from `this.resultPool` (sliced to `this.activeCount`).
    - Wrap in try-catch — if formatter throws, fall through to default rendering (same pattern as axis formatters at lines 310-316).
    - When using custom formatter: set `this.timeEl.textContent` to empty string, hide all row/value elements, and set the tooltip body to the formatter's return string. Approach: add a single `customEl` div (class `glide-chart-tooltip-custom`) to hold custom content, toggling visibility between custom and default elements.
  - [x] 2.2 In the Tooltip constructor, after creating series row elements (~line 100), create a `customEl` div:
    ```typescript
    this.customEl = document.createElement('div');
    this.customEl.className = 'glide-chart-tooltip-custom';
    this.customEl.style.display = 'none';
    this.tooltipEl.appendChild(this.customEl);
    ```
    Store as `private customEl: HTMLDivElement`.
  - [x] 2.3 In `update()`, after `this.activeCount` is determined and before existing default rendering, add the custom formatter branch. Use a `let customFormatted = false` flag to control flow:
    ```typescript
    let customFormatted = false;
    if (config.tooltip.formatter) {
      try {
        const activePoints = this.resultPool.slice(0, this.activeCount);
        const content = String(config.tooltip.formatter(activePoints));
        this.customEl.textContent = content;
        this.customEl.style.display = '';
        this.timeEl.style.display = 'none';
        this.hideDefaultRows();
        customFormatted = true;
      } catch {
        // Fall through to default rendering below
      }
    }
    if (!customFormatted) {
      this.customEl.style.display = 'none';
      this.timeEl.style.display = '';
      // ... existing default rendering code (timestamp + series values) ...
    }
    ```
    The flag pattern ensures: (1) successful custom format skips default rendering, (2) formatter error falls through cleanly, (3) no custom formatter uses default path.
  - [x] 2.4 Extract a `hideDefaultRows()` private helper to hide all row/value elements (DRY up the existing hide logic in `update()`).
  - [x] 2.5 Update ARIA text in `scheduleAriaUpdate()` — accept an optional `customText` parameter. When custom formatter was used in `update()`, pass the formatter's output string to `scheduleAriaUpdate()` so the ARIA live region announces the same content the visual tooltip displays. When `customText` is provided, set `this.ariaEl.textContent = customText` directly (inside the debounce timer). When not provided, use existing default format. This keeps ARIA and visual tooltip synchronized for screen reader users (NFR9).

- [x] Task 3: Validation for formatter in resolver (AC: 1)
  - [x] 3.1 In `src/config/resolver.ts`, add validation: if `config.tooltip.formatter` is provided, it must be a function. Add check in `validateConfig()` (after existing grid/animation validation):
    ```typescript
    if (config.tooltip.formatter !== undefined && typeof config.tooltip.formatter !== 'function') {
      throw new Error('resolveConfig: tooltip.formatter must be a function');
    }
    ```
    Note: `onStaleChange` (another function-typed config property) is NOT validated in resolver — it's used directly in `glide-chart.ts` and never enters `ResolvedConfig`. Unlike `onStaleChange`, `tooltip.formatter` IS part of `ResolvedConfig` (flows through `TooltipConfig`), so validation at resolve time is appropriate. `deepMerge` preserves function references since functions are not plain objects.

- [x] Task 4: Unit tests for custom tooltip formatter (AC: 1, 2)
  - [x] 4.1 In `src/interaction/tooltip.test.ts`, update `createConfig` helper to accept `TooltipConfig` with `formatter`. The existing `Partial<TooltipConfig>` already supports this since `formatter` is optional.
  - [x] 4.2 Add test: tooltip with custom `formatter` renders formatter's return string in `customEl`, hides timestamp and default rows.
  - [x] 4.3 Add test: tooltip with custom `formatter` receives correct `TooltipDataPoint[]` array — verify `seriesId`, `value`, `timestamp` match the data in the buffer.
  - [x] 4.4 Add test: multi-series tooltip with custom formatter receives all active series data points in array.
  - [x] 4.5 Add test: custom formatter that throws falls back to default rendering (timestamp + values displayed normally).
  - [x] 4.6 Add test: tooltip WITHOUT custom formatter renders default format (timestamp + value) — regression guard for AC 2.
  - [x] 4.7 Add test: custom formatter output used in ARIA live region text.
  - [x] 4.8 Add test: switching from custom formatter to no formatter (via config update) restores default rendering — verify `customEl` hidden, default elements shown.

- [x] Task 5: Resolver validation tests (AC: 1)
  - [x] 5.1 In `src/config/resolver.test.ts`, add test: `tooltip.formatter` as a function resolves successfully.
  - [x] 5.2 In `src/config/resolver.test.ts`, add test: `tooltip.formatter` as a non-function (e.g., string) throws validation error.
  - [x] 5.3 In `src/config/resolver.test.ts`, add test: `tooltip.formatter` undefined (default) resolves successfully — regression guard.
  - [x] 5.4 In `src/config/resolver.test.ts`, add test: `tooltip.formatter` survives `deepMerge` — verify function reference preserved after merge with theme defaults.

- [x] Task 6: Integration tests (AC: 1, 2)
  - [x] 6.1 In `src/api/glide-chart.test.ts`, add integration test: create chart with `tooltip: { formatter: (points) => points.map(p => p.seriesId + ':' + p.value).join(', ') }`, simulate pointer event, verify tooltip DOM contains custom formatted text.
  - [x] 6.2 In `src/api/glide-chart.test.ts`, add integration test: create chart without formatter, simulate pointer event, verify default tooltip format (timestamp + value).
  - [x] 6.3 In `src/api/glide-chart.test.ts`, add integration test: call `setConfig({ tooltip: { formatter: null } })` to remove formatter at runtime, verify tooltip falls back to default rendering. Note: `deepMerge` treats `undefined` as no-op; `null` deletes the key — so `null` is the correct way to remove the formatter via `setConfig()`.
  - [x] 6.4 In `src/api/glide-chart.test.ts`, add integration test: create chart with custom formatter, simulate keyboard ArrowRight navigation (dispatches keydown event on container), verify tooltip updates with custom-formatted content. Keyboard nav triggers `tooltip.update()` via `keyboardNavigator.updateTooltip()` callback (glide-chart.ts:240).

- [x] Task 7: Demo page update (AC: 1)
  - [x] 7.1 In `demo/index.html`, add a demo section showcasing custom tooltip formatting — e.g., a chart with `tooltip: { formatter: (points) => points.map(p => '$' + p.value.toFixed(4) + ' at ' + new Date(p.timestamp).toLocaleTimeString()).join('\n') }`.
  - [x] 7.2 Optionally add a toggle to switch between custom and default tooltip formatting.

## Dev Notes

### This Story Adds a Dedicated Tooltip Formatter Callback

The AC says "custom tooltip formatter function receives the data point(s) and returns formatted content." Currently, `xAxis.labelFormatter` and `yAxis.labelFormatter` are reused inside `tooltip.ts` — but these are axis-level formatters, not tooltip-specific. This story adds `tooltip.formatter` as a dedicated hook that gives the developer complete control over tooltip body content.

### Formatter Signature Design Decision

The formatter receives `ReadonlyArray<Readonly<TooltipDataPoint>>` — the array of all active data points across series. Each entry has `{ seriesId, value, timestamp }`. Returning a `string` keeps the API simple and covers FR25's "customize tooltip content and formatting" without introducing HTML injection concerns (`textContent` is used, not `innerHTML`).

### Interaction with Existing Axis Formatters

When `tooltip.formatter` is provided:
- It takes **priority** — axis formatters are NOT called for tooltip rendering
- The formatter receives raw numeric values, so the developer can apply any formatting
- Axis formatters (`xAxis.labelFormatter`, `yAxis.labelFormatter`) continue to work for axis labels independently

When `tooltip.formatter` is NOT provided:
- Existing behavior is preserved: `xAxis.labelFormatter` used for timestamp, `yAxis.labelFormatter` used for values, with auto-format fallbacks

### Performance: resultPool.slice() on Every Pointer Move

The formatter call uses `this.resultPool.slice(0, this.activeCount)` which creates a new array on each `update()` (up to 60fps). For 1-3 series this is negligible GC pressure. If profiling reveals issues, optimize by pre-allocating a reusable view array in the constructor and populating it before each formatter call. For now, slice is acceptable — clarity over premature optimization.

### Error Handling Pattern

All formatter calls follow the established try-catch-fallback pattern (identical to `formatTimestamp` at tooltip.ts:310-316 and `formatValue` at tooltip.ts:331-337):
```typescript
if (config.tooltip.formatter) {
  try {
    const content = String(config.tooltip.formatter(activePoints));
    // Use content
  } catch {
    // Fall through to default rendering
  }
}
```

### DOM Structure When Custom Formatter Active

```
.glide-chart-tooltip
  ├── .glide-chart-tooltip-time (display: none)
  ├── .glide-chart-tooltip-row (display: none) × N
  └── .glide-chart-tooltip-custom (display: '', textContent = formatter output)
```

When default rendering:
```
.glide-chart-tooltip
  ├── .glide-chart-tooltip-time (display: '')
  ├── .glide-chart-tooltip-row (display: '') × N
  └── .glide-chart-tooltip-custom (display: none)
```

### setConfig() Reconstructs Tooltip Entirely

`GlideChart.setConfig()` at glide-chart.ts:535-537 destroys the old Tooltip and creates a new one:
```typescript
this.tooltip.destroy();
this.tooltip = new Tooltip(this.container, this.scale, this.crosshairDataSource, this.resolvedConfig);
```
This means: (1) `customEl` created in the constructor is always fresh after config changes, (2) `applyStyles()` runs on the new config, (3) no stale state survives a config change. The formatter function is preserved through `deepMerge` → `resolveConfig` → new Tooltip constructor.

### deepMerge and Function Properties

`deepMerge()` in `resolver.ts` uses `isPlainObject()` which checks `Object.getPrototypeOf(value) === Object.prototype`. Functions fail this check, so they are assigned directly (not deep-merged), which correctly preserves function references. Verified: `deepMerge({ formatter: undefined }, { formatter: fn })` → `{ formatter: fn }`.

### Existing Code Locations

| File | Purpose | Change |
|------|---------|--------|
| `src/config/types.ts` | `TooltipConfig` — ADD `formatter` | Add optional formatter function |
| `src/interaction/tooltip.ts` | `Tooltip` class — ADD custom formatter branch | Constructor + update() |
| `src/config/resolver.ts` | `validateConfig()` — ADD formatter type check | One validation line |
| `src/interaction/tooltip.test.ts` | Tooltip unit tests — ADD formatter tests | ~8 new tests |
| `src/config/resolver.test.ts` | Resolver tests — ADD formatter validation tests | ~4 new tests |
| `src/api/glide-chart.test.ts` | Integration tests — ADD formatter integration | ~3 new tests |
| `demo/index.html` | Demo page — ADD formatter showcase | New demo section |

### Circular Import Prevention

`TooltipConfig` in `src/config/types.ts` needs to reference `TooltipDataPoint` from `src/interaction/types.ts`. Module boundary rules say `config/` cannot import from `interaction/`. **Solution:** Move `TooltipDataPoint` interface to `src/config/types.ts` (it's a simple data shape with no dependencies) OR define the formatter type inline: `formatter?: (points: ReadonlyArray<{ seriesId: string; value: number; timestamp: number }>) => string`. The inline approach avoids any import issues and keeps types self-contained. **Use the inline approach.**

### What NOT to Do

- Do NOT use `innerHTML` for custom formatter output — use `textContent` only (XSS prevention)
- Do NOT change the existing `xAxis.labelFormatter`/`yAxis.labelFormatter` behavior in tooltip — they remain as fallback formatters when `tooltip.formatter` is absent
- Do NOT change `TooltipDataPoint` interface in `interaction/types.ts` — it's used by crosshair data source
- Do NOT add per-series tooltip formatters — a single formatter receives all points, keeping API simple
- Do NOT remove or rename existing tooltip DOM elements — add `customEl` alongside them

### Key Learnings from Previous Stories

- Story 5.3: `deepMerge()` replaces arrays, does not concatenate. Functions are assigned directly.
- Story 5.2: Per-series overrides flow through `resolveConfig()` → renderers. Same merge pattern applies.
- Story 5.1: `setConfig()` deep-merges then re-resolves, marks all layers dirty. Tooltip receives new config on next `update()` call.
- Story 4.2: Tooltip DOM structure established — timestamp header + per-series rows. Custom formatter extends this, doesn't replace.
- Story 4.6: `setConfig()` preserves data buffers — tooltip data source stays intact across config changes.

### Project Structure Notes

- Modify 3 existing source files: `types.ts`, `tooltip.ts`, `resolver.ts`
- Tests distributed across 3 existing test files (co-located pattern)
- Demo update in `demo/index.html`
- No new files needed
- Kebab-case files, PascalCase classes, camelCase methods, named exports only

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 5, Story 5.4 AC, FR25]
- [Source: _bmad-output/planning-artifacts/prd.md — FR25: "Developer can customize tooltip content and formatting"]
- [Source: _bmad-output/planning-artifacts/architecture.md — Config & Theming, Event Handling, Interaction Layer]
- [Source: _bmad-output/implementation-artifacts/5-3-grid-gradient-and-animation-customization.md — deepMerge behavior, setConfig patterns]
- [Source: src/interaction/tooltip.ts — Existing tooltip implementation, formatter patterns]
- [Source: src/config/types.ts — TooltipConfig, AxisConfig.labelFormatter type]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

- Added `formatter` optional callback to `TooltipConfig` with inline type (avoids circular import from interaction → config)
- Wired custom formatter into `Tooltip.update()` with try-catch fallback to default rendering
- Added `customEl` div to tooltip DOM for custom formatter output, toggling visibility between custom and default elements
- Extracted `hideDefaultRows()` helper for DRY default-row hiding
- Updated `scheduleAriaUpdate()` to accept optional `customText` parameter, keeping ARIA and visual tooltip synchronized
- Added formatter type validation in `resolver.ts` `validateConfig()`
- Integration test 6.3: Used `null` instead of `undefined` to remove formatter via `setConfig()` — `deepMerge` treats `undefined` as no-op, `null` deletes the key
- 7 unit tests, 4 resolver validation tests, 4 integration tests added (15 new tests total)
- Demo page updated with custom tooltip formatter section and toggle button

### File List

- src/config/types.ts (modified) — added `formatter` to `TooltipConfig`
- src/interaction/tooltip.ts (modified) — added `customEl`, custom formatter branch in `update()`, `hideDefaultRows()`, updated `scheduleAriaUpdate()`
- src/config/resolver.ts (modified) — added tooltip.formatter validation
- src/interaction/tooltip.test.ts (modified) — 7 new unit tests for custom formatter
- src/config/resolver.test.ts (modified) — 4 new validation tests for tooltip.formatter
- src/api/glide-chart.test.ts (modified) — 4 new integration tests for custom formatter
- demo/index.html (modified) — added custom tooltip formatter demo section with toggle

### Change Log

- 2026-03-30: Implemented Story 5.4 — Custom Tooltip Formatting. Added `tooltip.formatter` callback to config, wired into Tooltip class with try-catch fallback, ARIA sync, resolver validation. 15 new tests, demo page updated.

### Review Findings

- [x] [Review][Patch] Formatter can mutate resultPool objects via shallow-copied references — Fixed: spread each entry before passing to formatter [src/interaction/tooltip.ts:231]
- [x] [Review][Patch] Error message prefix inconsistency: `resolveConfig:` should be `ConfigResolver:` — Fixed: updated prefix and test assertion [src/config/resolver.ts:127]
- [x] [Review][Patch] Formatter returning empty string produces silent/empty ARIA announcement — Fixed: ARIA falls back to default rendering when custom content is empty
- [x] [Review][Patch] Formatter returning null/undefined renders literal string "null"/"undefined" — Fixed: runtime typeof check rejects non-string returns, falls back to default
- [x] [Review][Patch] resultPool.slice() allocates on every pointer move, defeating pool pattern — Fixed: pre-allocated formatterView array with field-copy instead of slice+map
