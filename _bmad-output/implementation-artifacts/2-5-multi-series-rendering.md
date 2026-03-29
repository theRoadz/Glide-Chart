# Story 2.5: Multi-Series Rendering

Status: done

## Story

As a developer using Glide Chart,
I want to render multiple data series on the same chart,
so that I can overlay a price line with a reference/target line.

## Acceptance Criteria

1. Given a config with 2+ series (e.g., price line + opening price reference), when the chart renders, then each series draws its own smooth curve with independent color and thickness.
2. Each series has its own ring buffer and spline cache (independent data lifecycle).
3. Gradient fill is applied per-series and configurable independently (enable/disable, colors, opacity).
4. The y-axis auto-scales to encompass all visible series values across all series.
5. The demo page includes a multi-series example for visual verification.

## Important Scope Note

The epic AC mentions "the legend or tooltip distinguishes between series." Tooltip is Epic 4 (Story 4.2) and legend is not in the architecture document. This story should **not** implement a legend or tooltip. Instead, ensure the `series[].id` is available in the public config so that future tooltip/legend stories can use it. The demo page should visually distinguish series via different colors as a stand-in.

## Tasks / Subtasks

- [x] Task 1: Add multi-series integration tests at the GlideChart API level (AC: #1, #2, #3, #4)
  - [x] 1.1 Add test: construct chart with 2 series + initial data, verify both render (stroke called twice on frame tick)
  - [x] 1.2 Add test: each series gets independent color/thickness from config (verify strokeStyle set per series)
  - [x] 1.3 Add test: per-series gradient enable/disable works independently (one enabled, one disabled)
  - [x] 1.4 Add test: y-axis auto-scales to encompass all series values (series A: 0-50, series B: 80-100, domain covers 0-100)
  - [x] 1.5 Add test: addData to one series doesn't affect other series buffer size
  - [x] 1.6 Add test: setData replaces data for one series only, other series unchanged
  - [x] 1.7 Add test: setConfig adding a new third series dynamically creates its buffer/cache
  - [x] 1.8 Add test: setConfig removing a series cleans up its buffer/cache, other series unaffected
- [x] Task 2: Add multi-series DataLayerRenderer tests (AC: #1, #3)
  - [x] 2.1 Add test: 3 series render 3 separate curves (3 stroke calls)
  - [x] 2.2 Add test: mixed gradient states (series A gradient enabled, series B disabled) — verify createLinearGradient called once
  - [x] 2.3 Add test: series with different data lengths (series A: 5 points, series B: 100 points) both render
  - [x] 2.4 Add test: one empty series + one populated series — empty is skipped, populated renders
  - [x] 2.5 Add test: multi-series performance — 3 series x 5K points completes within 1500ms (canvas mock bounds)
- [x] Task 3: Add multi-series config resolver tests (AC: #1, #3)
  - [x] 3.1 Add test: all resolved series configs are deeply frozen (immutable)
  - [x] 3.2 Add test: series with no overrides inherits global line AND gradient defaults correctly
- [x] Task 4: Update demo page with multi-series example (AC: #5)
  - [x] 4.1 Add a SECOND chart section to demo/index.html (keep existing single-series chart intact)
  - [x] 4.2 New chart shows 2 series: price (teal #00d4aa, gradient on) + reference (coral #ff6b6b, gradient off)
  - [x] 4.3 Reference line renders behind price line (listed first in series array)
- [x] Task 5: Verify all existing tests still pass (regression)

## Dev Notes

### Critical: Multi-Series Infrastructure Already Exists

The multi-series rendering pipeline is **already fully implemented**. This story is about **comprehensive testing** and **demo verification** — NOT building new features.

**What already works:**
- `GlideChart` constructor creates per-series `RingBuffer` + `SplineCache` from `config.series[]` (`src/api/glide-chart.ts:78-84`)
- `DataLayerRenderer.draw()` iterates all series, renders each with independent line/gradient config (`src/renderer/layers/data-layer.ts:44-67`)
- `autoFitScale()` aggregates timestamps/values across ALL series for unified y-axis scaling (`src/api/glide-chart.ts:394-424`)
- `setConfig()` reconciles seriesMap — adds new series, removes deleted ones (`src/api/glide-chart.ts:241-322`)
- `addData(seriesId, ...)`, `setData(seriesId, ...)`, `clearData(seriesId?)` all work per-series
- Config resolver handles per-series line/gradient overrides inheriting from global defaults (`src/config/resolver.ts`)

**What's missing:**
- Integration tests proving multi-series works end-to-end at the API level
- Multi-series DataLayerRenderer edge case tests (mixed states, varying lengths)
- Multi-series config resolver edge case tests (frozen series, inheritance)
- Demo page multi-series visual example

### Existing Multi-Series Tests (DO NOT DUPLICATE)

These tests already exist — do not recreate them:

**glide-chart.test.ts** (4 existing multi-series tests):
- `clearData > with seriesId clears specific series` (line ~243) — 2-series clearData by ID
- `clearData > without args clears all series` (line ~256) — 2-series clearData all
- `multiple series > work independently` (line ~343) — addData/setData/clearData across 2 series
- `multiple series > clearData without args clears all` (line ~360) — 2-series clear all

**data-layer.test.ts** (1 existing multi-series test):
- `draw() — multiple series > multiple series each render with their own config colors` (line ~245) — 2-series, verifies 2 stroke calls

**resolver.test.ts** (1 existing multi-series test):
- `resolves multiple series each with different overrides` (line ~152) — 3 series with mixed overrides

### Series Rendering Order (Z-Index)

Series render in **array order**: index 0 draws first (bottom), last index draws on top. For the demo, put the reference line first in the array so the price line renders on top.

### Duplicate Series ID Warning

There is no runtime validation preventing duplicate `series[].id` values. The `seriesMap` (Map) silently overwrites on duplicate keys. **Always use unique IDs in tests.** Adding ID validation is out of scope for this story.

### Architecture Compliance

- **Rendering**: Data layer renders all series in a single pass. No new layers needed.
- **Config**: `ResolvedSeriesConfig` has `id`, `line`, `gradient`. Per-series overrides inherit from global defaults via `deepMerge`.
- **Data types**: `SeriesConfig` in `src/config/types.ts`, `SeriesRenderData` in `src/renderer/layers/data-layer.ts`
- **Scale**: Single `Scale` shared across all series. `autoFitScale()` iterates all series.
- **No new source files needed** — only test files and demo updated.

### File Structure

| File | Action | Purpose |
|------|--------|---------|
| `src/api/glide-chart.test.ts` | Modify | Add multi-series integration tests (new describe block) |
| `src/renderer/layers/data-layer.test.ts` | Modify | Add multi-series edge case tests (extend existing describe block) |
| `src/config/resolver.test.ts` | Modify | Add multi-series config resolver tests |
| `demo/index.html` | Modify | Add second chart section with multi-series example |

### Testing Standards

- Co-located tests: `*.test.ts` next to source
- Use `vitest` with `vitest-canvas-mock`
- Use existing test helpers: `makeSeriesConfig()`, `makeSeries()`, `createCanvas()`, `makeScale()` in data-layer tests
- For GlideChart tests: use existing mock patterns for `ResizeObserver`, `matchMedia`, `requestAnimationFrame`
- Construct charts with `new GlideChart(container, config)` where container = `document.createElement('div')` with `clientWidth`/`clientHeight` set
- Use explicit values (not random data) for deterministic assertions
- Verify canvas API calls (stroke count, fillStyle, globalAlpha) to confirm rendering behavior
- All 308 tests pass as of story 2.4 completion — ensure zero regressions

### Config Example for Multi-Series

```typescript
const chart = new GlideChart(container, {
  series: [
    {
      id: 'reference',
      data: referenceData,
      line: { color: '#ff6b6b', width: 1.5 },
      gradient: { enabled: false },
    },
    {
      id: 'price',
      data: priceData,
      line: { color: '#00d4aa', width: 2 },
      gradient: {
        enabled: true,
        topColor: '#00d4aa',
        topOpacity: 0.3,
        bottomColor: '#00d4aa',
        bottomOpacity: 0,
      },
    },
  ],
});
```

Note: `reference` is listed first so it renders behind `price` (z-order = array order).

### Demo Page Pattern

The demo page at `demo/index.html` uses inline `<script type="module">` importing from `../src/index.ts`. Add a **second** chart container and initialization block below the existing single-series chart. Do NOT replace the existing chart. Use visually distinct colors (teal `#00d4aa` for price, coral `#ff6b6b` for reference line).

### Git Intelligence

Recent commit pattern: `feat: add <feature description> (Story X.Y)`. Use same convention.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.5]
- [Source: _bmad-output/planning-artifacts/architecture.md#Layered Canvas Architecture]
- [Source: _bmad-output/planning-artifacts/prd.md#FR2 — Multi-series rendering]
- [Source: src/renderer/layers/data-layer.ts — DataLayerRenderer multi-series loop]
- [Source: src/api/glide-chart.ts — seriesMap, autoFitScale, buildSeriesRenderData]
- [Source: src/config/resolver.ts — per-series config resolution]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

No issues encountered — all multi-series infrastructure was already implemented and functional.

### Completion Notes List

- Task 1: Added 8 multi-series integration tests to glide-chart.test.ts covering: dual-series rendering, independent color/thickness, per-series gradient enable/disable, y-axis auto-scaling across all series, addData isolation, setData isolation, dynamic series addition via setConfig, and series removal cleanup via setConfig.
- Task 2: Added 5 multi-series DataLayerRenderer edge case tests to data-layer.test.ts covering: 3 series rendering (3 stroke calls), mixed gradient states (1 createLinearGradient call), different data lengths (5 vs 100 points), empty+populated series (empty skipped), and performance (3 series x 5K points under 1500ms).
- Task 3: Added 2 multi-series config resolver tests to resolver.test.ts covering: deeply frozen series configs (immutability), and series with no overrides inheriting both global line AND gradient defaults correctly.
- Task 4: Updated demo/index.html with a second chart section showing price (#00d4aa, gradient on) + reference line (#ff6b6b, gradient off). Reference line renders behind price (listed first in series array). Existing single-series chart preserved intact.
- Task 5: Full regression suite passed — 326 tests across 14 files, zero regressions.

### Change Log

- 2026-03-29: Implemented Story 2.5 — added 15 multi-series tests (8 integration, 5 data-layer, 2 config resolver) and demo page multi-series chart section. All 326 tests pass.

### File List

- src/api/glide-chart.test.ts (modified) — Added 8 multi-series integration tests in new `multi-series integration` describe block
- src/renderer/layers/data-layer.test.ts (modified) — Added 5 multi-series edge case tests in new `draw() — multi-series edge cases` describe block
- src/config/resolver.test.ts (modified) — Added 2 multi-series config resolver tests (frozen series, global inheritance)
- demo/index.html (modified) — Added second chart section with price + reference line multi-series example

### Review Findings

- [x] [Review][Decision] Demo `multiChart` never destroyed/cleaned up by Destroy button — Fixed: Destroy/Recreate now handles both charts
- [x] [Review][Patch] Dead code: `origThemeHandler` captured but never used [demo/index.html:451] — Fixed: removed dead variable
- [x] [Review][Patch] Y-axis auto-scale test has no meaningful assertion (AC #4) — Fixed: added domainY bounds assertions via `(chart as any).scale`
- [x] [Review][Patch] `setConfig` ignores `data` arrays on new series entries — Fixed: new series in `setConfig` now populates buffer from `userConfig.series[].data`
- [x] [Review][Patch] Demo `multiChart` excluded from clear/random button flows — Fixed: clear and random buttons now sync multiChart
