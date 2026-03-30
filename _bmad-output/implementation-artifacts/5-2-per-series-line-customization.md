# Story 5.2: Per-Series Line Customization

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer using Glide Chart,
I want to customize line color and thickness per series,
so that each data series is visually distinct and matches my design system.

## Acceptance Criteria

1. **Given** a config with series-specific overrides (e.g., `{ id: 'price', line: { color: '#00ff88', width: 3 } }`), **when** the chart renders, **then** each series uses its configured color and thickness, **and** series without overrides get distinct palette colors automatically.

## Important Context: Per-Series Infrastructure Already Exists

The per-series config system is **already fully implemented**. `SeriesConfig` supports `line?: Partial<LineConfig>` and `gradient?: Partial<GradientConfig>`, `resolveConfig()` deep-merges per-series overrides with global defaults (resolver.ts:131-148), `DataLayerRenderer` reads `series.config.line.color`, `.width`, `.opacity` for each series independently (data-layer.ts:264-266), and gradient colors are pre-computed per series (data-layer.ts:55-63).

**What is missing and needs implementation:**

1. **Default color palette** — When multiple series are defined without explicit `line.color` overrides, all series inherit the same global theme color (e.g., all teal in dark mode). There is no automatic color differentiation. A built-in `DEFAULT_SERIES_COLORS` palette is needed so series get distinct colors by default (cycling through the palette by index).
2. **Palette application in resolver** — `resolveConfig()` currently copies `merged.line` verbatim for series without `line` overrides (resolver.ts:137). It needs to assign palette colors based on series index when no explicit color is provided.
3. **Gradient auto-matching** — When a series gets a palette color but no explicit gradient config, its gradient `topColor`/`bottomColor` should automatically match the series line color (not the global gradient color).
4. **setConfig per-series override test** — No test verifies that calling `setConfig()` with new per-series line overrides updates the rendered series correctly (existing test at glide-chart.test.ts:1867 only checks theme switching preserves overrides, not live per-series config updates).
5. **Demo page update** — Update subtitle; optionally show series with different auto-assigned colors (the demo already has multi-series setups).

## Tasks / Subtasks

- [x] Task 1: Add DEFAULT_SERIES_COLORS palette (AC: 1)
  - [x] 1.1 In `src/config/themes.ts`, add a named export `DARK_SERIES_COLORS: readonly string[]` — an array of 8 visually distinct colors that meet WCAG 2.1 AA >= 3:1 contrast against `#0a0a0f` (dark background). Suggested palette: `['#00d4aa', '#ff6b6b', '#ffd93d', '#6bcbff', '#ff8c42', '#c084fc', '#22d3ee', '#f472b6']`. First color MUST match `DARK_THEME.line.color` (`'#00d4aa'`) for backward compatibility.
  - [x] 1.2 Add `LIGHT_SERIES_COLORS: readonly string[]` — 8 colors meeting >= 3:1 contrast against `#ffffff` (light background). Suggested palette: `['#0066cc', '#cc3333', '#cc8800', '#0088aa', '#cc5500', '#7733aa', '#007788', '#cc3377']`. First color MUST match `LIGHT_THEME.line.color` (`'#0066cc'`).
  - [x] 1.3 Add helper `getSeriesColors(mode: ThemeMode): readonly string[]` that returns the appropriate palette.
  - [x] 1.4 Add WCAG contrast tests in `src/config/themes.test.ts`: every color in each palette meets >= 3:1 against its theme background. Reuse the `wcagContrast()` helper from Story 5.1.

- [x] Task 2: Apply palette colors in resolveConfig (AC: 1)
  - [x] 2.1 In `src/config/resolver.ts`, import `getSeriesColors`. In the per-series resolution loop (lines 131-148), when a series has NO `line.color` override AND the user did NOT set an explicit global `line.color` (i.e., `!userConfig?.line?.color`), assign `palette[index % palette.length]` as the line color.
  - [x] 2.2 When a series gets a palette color (or explicit color override) and has NO explicit `gradient.topColor`/`gradient.bottomColor`, set gradient colors to match the series line color. This ensures gradient fill visually matches the series curve.
  - [x] 2.3 Add tests in `src/config/resolver.test.ts`:
    - Two series with no color overrides get different palette colors (index 0 and 1).
    - Series with explicit `line.color` keeps its color, not overridden by palette.
    - Series at index >= palette length wraps around (index 8 gets palette[0]).
    - Series gradient colors auto-match line color when no explicit gradient config.
    - Theme change (dark->light) changes palette colors to light variants.
    - Global `line.color` override applies to all series without per-series overrides (palette is NOT used when global color is explicitly set by user).
  - [x] 2.4 **Regression check:** Existing resolver tests (resolver.test.ts:130-202) expect series without overrides to inherit the global theme color. These tests must be updated to expect palette colors instead (palette[0] == theme default for single-series, palette[N] for multi-series). Review and update ALL affected existing test expectations.

- [x] Task 3: Per-series config update via setConfig (AC: 1)
  - [x] 3.1 Add test in `src/api/glide-chart.test.ts`: create chart with 2 series ('price' and 'ref') using default palette colors, call `setConfig({ series: [{ id: 'price', line: { color: '#ff0000' } }, { id: 'ref' }] })`, verify 'price' now has `#ff0000` and 'ref' retains its palette color. **CRITICAL: `setConfig({ series: [...] })` REPLACES the entire series array (deepMerge replaces arrays, does not concatenate). You MUST include ALL series in the array or omitted series will be deleted (glide-chart.ts:406-414 removes series not in the new set).**
  - [x] 3.2 Add test: call `setConfig({ series: [{ id: 'price', line: { width: 4 } }, { id: 'ref' }] })` — verify width changes but color is preserved from palette for both series.
  - [x] 3.3 Add test: call `setConfig({ line: { color: '#aabbcc' } })` (global override, no series array) — verify global color override applies to all series without explicit per-series overrides, palette is NOT used.

- [x] Task 4: Palette-to-renderer integration test (AC: 1)
  - [x] 4.1 Add test in `src/renderer/layers/data-layer.test.ts`: create DataLayerRenderer with 3 series whose configs use 3 different palette colors (simulating what `resolveConfig` would produce), verify each series' `ctx.strokeStyle` is set to its respective palette color during draw. This verifies palette colors flow correctly from resolved config through to canvas rendering.
  - [x] 4.2 Add test: series with auto-matched gradient colors (topColor/bottomColor matching line color) renders gradient with correct color stops from `hexToRgba()` conversion.

- [x] Task 5: Demo page update (AC: 1)
  - [x] 5.1 Update demo subtitle to include "Per-Series Customization".
  - [x] 5.2 In the primary chart config (demo/index.html line ~313), remove explicit `line.color` from at least one series so it demonstrates auto-palette behavior. Verify the series renders with a distinct palette color.

## Dev Notes

### This Is Primarily a Palette-Addition Story

The per-series config infrastructure (types, resolver merging, renderer consumption) is complete. The main gap is that multiple series without explicit colors all look identical. The work is:
1. **Color palette constants** in themes.ts
2. **Palette assignment logic** in resolver.ts (small change to the per-series loop)
3. **Gradient auto-matching** in the same loop
4. **Tests** validating palette assignment, config updates, and rendering
5. **Demo update** — subtitle and optional palette demonstration

### Existing Code Locations

| File | Purpose | Key Lines |
|------|---------|-----------|
| `src/config/types.ts` | `LineConfig`, `GradientConfig`, `SeriesConfig`, `ResolvedSeriesConfig` | 6-65, 88-92 |
| `src/config/themes.ts` | `DARK_THEME`, `LIGHT_THEME`, `getThemePreset()` — ADD palette here | 1-138 |
| `src/config/resolver.ts` | `resolveConfig()` per-series loop — MODIFY palette assignment | 131-148 |
| `src/config/defaults.ts` | `DEFAULT_CONFIG` — no changes needed | 1-31 |
| `src/renderer/layers/data-layer.ts` | `DataLayerRenderer` — reads `series.config.line.*` per series, no changes needed | 259-306 |
| `src/api/glide-chart.ts` | `GlideChart.setConfig()` — rebuilds series from new resolved config | 373-416 |
| `src/config/resolver.test.ts` | Per-series resolution tests — UPDATE existing + ADD palette tests | existing |
| `src/config/themes.test.ts` | Theme validation — ADD palette WCAG tests | existing |
| `src/api/glide-chart.test.ts` | Integration tests — ADD setConfig per-series tests | existing |
| `src/renderer/layers/data-layer.test.ts` | Rendering tests — ADD palette-to-renderer test | existing |
| `demo/index.html` | Demo page — UPDATE subtitle, optionally adjust series config | 313-327 |

### Per-Series Resolution Logic — Current State (resolver.ts:131-148)

```typescript
for (const seriesEntry of userConfig.series) {
  const resolvedLine = seriesEntry.line
    ? deepMerge(merged.line, seriesEntry.line)      // Series line overrides global
    : { ...merged.line };                            // Copies global as-is (BUG: all same color)
  const resolvedGradient = seriesEntry.gradient
    ? deepMerge(merged.gradient, seriesEntry.gradient)
    : { ...merged.gradient };                        // Copies global as-is (BUG: all same gradient)

  resolvedSeries.push({
    id: seriesEntry.id,
    line: resolvedLine,
    gradient: resolvedGradient,
  });
}
```

The fix: when a series has no explicit `line.color`, assign `palette[seriesIndex % palette.length]` as the color. When a series gets a non-global color (from palette or explicit override), auto-match gradient colors.

### Palette Assignment Rule

Apply palette colors only when `!userConfig?.line?.color` (user did NOT set an explicit global line color). When the user sets a global `line.color`, all series without per-series overrides inherit that global color — do NOT override with palette.

When palette IS applied:
- `palette[0]` matches the theme default line color (backward compatible for single-series)
- `palette[N]` for Nth series (cycling via `% palette.length`)
- Series with explicit `line.color` per-series override keeps its color regardless

### Gradient Auto-Matching Logic

In the per-series loop, after resolving the line color:
```typescript
const seriesLineColor = resolvedLine.color;
// If no explicit gradient colors, match gradient to line color
if (!seriesEntry.gradient?.topColor) {
  resolvedGradient.topColor = seriesLineColor;
}
if (!seriesEntry.gradient?.bottomColor) {
  resolvedGradient.bottomColor = seriesLineColor;
}
```

This ensures each series' gradient fill visually matches its line, not the global gradient color.

### Critical: deepMerge Array Replacement Behavior

`deepMerge()` (resolver.ts:20-44) **replaces** arrays, it does NOT concatenate them. This means:
- `setConfig({ series: [{ id: 'price', line: { color: '#ff0000' } }] })` will **delete** any series not in the new array
- `glide-chart.ts:406-414` iterates `seriesMap` and removes entries not in the resolved series set
- Tests must always include ALL series in `setConfig({ series: [...] })` calls to avoid unintended deletions
- `setConfig({ line: { color: '#aabbcc' } })` (without `series` key) preserves the existing series array via deep merge

### Palette Color Ordering and Stability

Palette assignment is **positional** (index-based). If series order changes in `setConfig`, palette colors shift. This is acceptable behavior — series order is the developer's responsibility. The palette provides visual differentiation, not stable color identity. For stable colors, developers should use explicit per-series `line.color` overrides.

### WCAG Contrast Requirements for Palette Colors

- **Dark theme palette** — each color must have >= 3:1 contrast against `#0a0a0f` (non-text UI element per WCAG AA)
- **Light theme palette** — each color must have >= 3:1 contrast against `#ffffff`
- Use the `wcagContrast()` helper already in `themes.test.ts` from Story 5.1

### Existing Test Coverage (Do NOT Duplicate)

The following per-series rendering behaviors are **already tested** in `data-layer.test.ts`:
- Multiple series render with independent colors (line 248-265)
- 3 series render 3 separate stroke calls (line 269-283)
- Line opacity applied via globalAlpha (line 177-193)
- Gradient disabled skips gradient rendering (line 228-244)
- Mixed gradient enable/disable per series (line 285-301)
- Line width and color set from series config (line 195-209)

Do NOT re-test these. New tests should focus on **palette color assignment** flowing through to rendering.

### Patterns From Story 5.1 to Follow

- WCAG contrast tests use inline `relativeLuminance()` and `wcagContrast()` helpers in themes.test.ts
- Theme switching tests in glide-chart.test.ts verify per-series overrides are preserved
- Demo subtitle format: `"Glide Chart Demo — Feature1, Feature2, ..."`
- Test co-location: resolver tests in resolver.test.ts, theme tests in themes.test.ts, etc.

### What NOT to Do

- Do NOT modify `LineConfig` or `SeriesConfig` types — the existing types already support all needed customization (color, width, opacity per series)
- Do NOT add new config properties — palette assignment happens in the resolver, transparent to consumers
- Do NOT change `DataLayerRenderer` — it already reads per-series config correctly
- Do NOT change `GlideChart.setConfig()` flow — the existing rebuild logic handles per-series config updates
- Do NOT add `lineDash`/`dashPattern` to `LineConfig` — that's not in scope (FR23 says "color and thickness" only); dashPattern exists only on CrosshairConfig
- Do NOT add runtime dependencies
- Do NOT use `export default`
- Do NOT duplicate existing test coverage (see "Existing Test Coverage" section above)

### Key Learnings from Previous Stories

- Story 5.1: Theme presets are `Partial<ChartConfig>` objects; `resolveConfig()` pipeline is defaults <- theme <- user; `setConfig()` deep-merges partial config with previous user config, then re-resolves
- Story 5.1: `hexToRgba()` in data-layer.ts converts hex colors to rgba strings for gradient rendering — palette colors must be valid `#RRGGBB` hex format
- Story 5.1: WCAG contrast test pattern: `wcagContrast(color1, color2)` returns ratio as number, compare with `>= 3` or `>= 4.5`
- Story 4.6: `setConfig()` preserves data buffers and spline caches — only config/renderers rebuild
- Story 2.5: Multi-series rendering iterates `seriesData` array in order, each series gets independent line/gradient config

### Project Structure Notes

- All changes are to existing files — no new files needed
- Palette constants go in `src/config/themes.ts` (alongside theme presets)
- Resolver changes in `src/config/resolver.ts` (small modification to per-series loop)
- Tests distributed across existing test files (co-located pattern)
- Demo update in `demo/index.html`
- Kebab-case files, PascalCase classes, camelCase methods, named exports only

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 5, Story 5.2 acceptance criteria, FR23]
- [Source: _bmad-output/planning-artifacts/architecture.md — Config & Theming section: "Per-series overrides (color, thickness) resolved at merge time"]
- [Source: src/config/types.ts — LineConfig (6-10), GradientConfig (12-18), SeriesConfig (61-65), ResolvedSeriesConfig (88-92)]
- [Source: src/config/resolver.ts — resolveConfig() per-series loop (131-148), deepMerge array replacement (38-39)]
- [Source: src/config/themes.ts — DARK_THEME line color '#00d4aa', LIGHT_THEME line color '#0066cc']
- [Source: src/renderer/layers/data-layer.ts — drawCurve uses series.config.line.color/width/opacity (264-266)]
- [Source: src/api/glide-chart.ts — setConfig() rebuilds series config and renderers (373-416), series deletion (406-414)]
- [Source: _bmad-output/implementation-artifacts/5-1-light-and-dark-theme-presets.md — WCAG test patterns, theme switching behavior]
- [Source: demo/index.html — multi-series configs at lines 313-327, 480-494, 559-567]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Fixed WCAG contrast issue: suggested `#cc8800` for light palette had 2.96:1 contrast, replaced with `#aa7700` (3.93:1)
- Fixed TypeScript readonly assignment error: annotated `resolvedLine` and `resolvedGradient` with mutable `LineConfig`/`GradientConfig` types
- Gradient auto-matching refined: only applies when neither per-series nor global user config explicitly sets gradient colors

### Completion Notes List

- Added `DARK_SERIES_COLORS` (8 colors) and `LIGHT_SERIES_COLORS` (8 colors) palettes to themes.ts
- Added `getSeriesColors(mode)` helper function
- Modified `resolveConfig()` per-series loop to assign palette colors by index when no explicit line.color is set
- Added gradient auto-matching: gradient topColor/bottomColor match series line color when not explicitly configured
- Added 24 new tests across 4 test files (themes, resolver, glide-chart, data-layer)
- Updated 2 existing resolver tests to expect palette colors instead of raw defaults
- Updated demo subtitle and removed explicit colors from primary chart to demonstrate auto-palette
- Fixed pre-existing lint error (unused variable `v` → `_v`) in glide-chart.test.ts
- All 634 tests pass, zero regressions

### Change Log

- 2026-03-30: Implemented per-series color palette with WCAG-compliant colors, gradient auto-matching, and comprehensive tests (Story 5.2)

### File List

- src/config/themes.ts (modified — added DARK_SERIES_COLORS, LIGHT_SERIES_COLORS, getSeriesColors)
- src/config/resolver.ts (modified — palette assignment and gradient auto-matching in per-series loop)
- src/config/themes.test.ts (modified — added palette WCAG contrast tests and getSeriesColors tests)
- src/config/resolver.test.ts (modified — updated 2 existing tests, added 8 palette assignment tests)
- src/api/glide-chart.test.ts (modified — added 3 setConfig per-series tests, fixed pre-existing lint error)
- src/renderer/layers/data-layer.test.ts (modified — added 2 palette-to-renderer integration tests)
- demo/index.html (modified — updated subtitle, removed explicit series colors for auto-palette demo)
- _bmad-output/implementation-artifacts/sprint-status.yaml (modified — status tracking)

### Review Findings

Code review performed 2026-03-30 with Blind Hunter + Edge Case Hunter + manual Acceptance Audit.

**Result: Clean review — 0 patch, 0 decision-needed, 0 defer, 15 dismissed as noise.**

All 15 findings were false positives, pre-existing concerns outside this change's scope, or explicitly addressed by the spec. No code changes required.
