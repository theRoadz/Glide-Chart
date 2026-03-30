# Story 5.1: Light & Dark Theme Presets

Status: done

## Story

As a developer using Glide Chart,
I want built-in light and dark theme presets,
so that I can match my application's theme with a single config flag.

## Acceptance Criteria

1. **Given** `theme: 'dark'` is set in config, **when** the chart renders, **then** background, grid, axes, line colors, and tooltip use the dark theme palette, **and** all colors meet WCAG 2.1 AA contrast ratios.
2. **Given** `theme: 'light'` is set, **when** the chart renders, **then** the light theme palette is applied.
3. **Given** `chart.setConfig({ theme: 'dark' })` is called on a rendered chart, **when** the theme switches, **then** all layers re-render with the new theme immediately.

## Important Context: Theme Infrastructure Already Exists

The theme system is **already fully implemented** in the config layer. Both `DARK_THEME` and `LIGHT_THEME` presets exist in `src/config/themes.ts`, the `resolveConfig()` pipeline in `src/config/resolver.ts` applies them via `defaults ← theme ← user`, and `setConfig()` in `src/api/glide-chart.ts` recreates all renderers with the new resolved config.

**What is missing and needs implementation:**

1. **`config.backgroundColor` is never rendered** — the background layer only draws grid lines. No code applies `resolvedConfig.backgroundColor` to the container or canvas. Theme switching changes the config value but the visible background never updates. This is the primary implementation gap.
2. **WCAG contrast validation tests** — no tests verify that theme color combinations meet WCAG 2.1 AA contrast ratios.
3. **Dynamic theme switching integration test** — no end-to-end test verifies that `setConfig({ theme: 'light' })` on a rendered dark chart actually changes all visual elements.
4. **Demo page** — a theme toggle button already exists and works (`#btn-theme`, line 176, wired at lines 371-378). Only a subtitle update is needed after the backgroundColor fix.

## Tasks / Subtasks

- [x] Task 1: Apply `config.backgroundColor` to the background canvas (AC: 1, 2)
  - [x] 1.1 In `BackgroundLayerRenderer.draw()`, add a full-canvas `fillRect` with `config.backgroundColor` before drawing grid lines. This ensures the background color is visible and changes with theme.
  - [x] 1.2 Add test in `src/renderer/layers/background-layer.test.ts`: verify `fillRect` is called with the configured background color before grid line strokes.
  - [x] 1.3 Add test: with `backgroundColor: '#ffffff'` (light), verify `fillStyle` is set to `'#ffffff'`.
  - [x] 1.4 Add test: with `grid.visible: false`, background color fill still renders (fill is unconditional; grid is conditional).

- [x] Task 2: WCAG 2.1 AA contrast validation tests (AC: 1, 2)
  - [x] 2.1 Create a `wcagContrast` helper function (inline in test file or in a test utility) that computes luminance contrast ratio from two hex colors per WCAG 2.1 formula.
  - [x] 2.2 Add test in `src/config/themes.test.ts`: dark theme axis label color (`#8a8a9a`) vs background (`#0a0a0f`) has contrast ratio >= 4.5:1.
  - [x] 2.3 Add test: dark theme crosshair color (`#ffffff`) vs background (`#0a0a0f`) has contrast ratio >= 4.5:1.
  - [x] 2.4 Add test: dark theme tooltip text (`#e0e0e0`) vs tooltip background (`#1a1a2e`) has contrast ratio >= 4.5:1.
  - [x] 2.5 Add test: light theme axis label color (`#555555`) vs background (`#ffffff`) has contrast ratio >= 4.5:1.
  - [x] 2.6 Add test: light theme crosshair color (`#333333`) vs background (`#ffffff`) has contrast ratio >= 4.5:1.
  - [x] 2.7 Add test: light theme tooltip text (`#333333`) vs tooltip background (`#ffffff`) has contrast ratio >= 4.5:1.
  - [x] 2.8 Add test: line colors (dark `#00d4aa`, light `#0066cc`) vs respective backgrounds have contrast ratio >= 3:1 (relaxed AA for large elements/non-text).

- [x] Task 3: Theme switching integration tests (AC: 3)
  - [x] 3.1 Add test in `src/api/glide-chart.test.ts`: create chart with dark theme, call `setConfig({ theme: ThemeMode.Light })`, verify `resolvedConfig` has all light theme values (backgroundColor, line.color, grid.color, crosshair.color, tooltip.backgroundColor, tooltip.textColor, axis label colors).
  - [x] 3.2 Add test: create chart with light theme, switch to dark, verify all dark theme values applied.
  - [x] 3.3 Add test: switch theme with per-series color overrides — series-specific colors are preserved, non-overridden values change to new theme.
  - [x] 3.4 Add test: switch theme and verify all layers marked dirty (frameScheduler.markAllDirty called).
  - [x] 3.5 Add test: theme switch preserves data — buffers and spline caches remain intact after `setConfig`.
  - [x] 3.6 Add test: stale overlay renders correct theme-aware colors — dark theme uses `rgba(255, 255, 255, 0.8)` text / `rgba(255, 68, 102, 0.3)` bg; light theme uses `rgba(0, 0, 0, 0.7)` text / `rgba(255, 68, 102, 0.2)` bg (see glide-chart.ts lines 629-632).
  - [x] 3.7 Add test: `onStaleChange` callback persists and fires correctly after theme switch via `setConfig`.

- [x] Task 4: Demo page verification and subtitle update (AC: 1, 2, 3)
  - [x] 4.1 Verify the existing "Toggle Theme" button (`#btn-theme`, line 176) works correctly after the backgroundColor canvas fix — the chart background should visibly change when toggling themes.
  - [x] 4.2 Update demo subtitle to include "Theme Switching".
  - [x] 4.3 Note: The demo has THREE GlideChart instances. The existing theme toggle at lines 371-378, 498-502, and 624-628 already syncs all three. Do NOT duplicate or break this logic.

## Dev Notes

### This Is Primarily a Gap-Filling Story

The theme presets, config types, resolver pipeline, `setConfig()` flow, and demo toggle button are all complete. The main work is:
1. **One rendering fix** — apply `backgroundColor` in `BackgroundLayerRenderer.draw()`
2. **Validation tests** — WCAG contrast, theme switching, background rendering, stale overlay colors
3. **Demo verification** — verify existing toggle works after the fix, update subtitle

### Existing Code Locations

| File | Purpose | Lines |
|------|---------|-------|
| `src/config/types.ts` | `ThemeMode` enum, `ChartConfig`, `ResolvedConfig` types | 1-111 |
| `src/config/themes.ts` | `DARK_THEME`, `LIGHT_THEME` presets, `getThemePreset()` | 1-138 |
| `src/config/defaults.ts` | `DEFAULT_CONFIG` (dark theme base) | 1-31 |
| `src/config/resolver.ts` | `resolveConfig()`, `deepMerge()`, `deepFreeze()`, validation | 1-167 |
| `src/api/glide-chart.ts` | `GlideChart` class, `setConfig()` method (~lines 373-548) | full |
| `src/renderer/layers/background-layer.ts` | `BackgroundLayerRenderer` — grid lines only, NO background fill | 1-100 |
| `src/renderer/layers/data-layer.ts` | `DataLayerRenderer` — line + gradient rendering with hex-to-rgba conversion | full |
| `src/renderer/layers/y-axis-layer.ts` | Y-axis labels and ticks, uses `config.yAxis.labelColor`, `tickColor` | full |
| `src/renderer/layers/x-axis-layer.ts` | X-axis labels and ticks, uses `config.xAxis.labelColor`, `tickColor` | full |
| `src/interaction/crosshair.ts` | Crosshair rendering, uses `config.crosshair.color`, `lineWidth`, `dashPattern` | full |
| `src/interaction/tooltip.ts` | Tooltip styling, `applyStyles()` at line 272 applies tooltip config colors | full |
| `demo/index.html` | Demo page — dark/light CSS vars, existing theme toggle button | full |
| `src/renderer/layers/background-layer.test.ts` | Existing tests (174 lines, 16 tests) — `makeConfig()` helper needs `backgroundColor` extension | full |
| `src/config/themes.test.ts` | Existing tests (55 lines) — theme preset validation, no WCAG tests | full |
| `src/api/glide-chart.test.ts` | Existing tests — `setConfig` block has only 1 test (line color change), no theme tests | full |

### Background Color Rendering Gap — Details

`BackgroundLayerRenderer.draw()` (background-layer.ts:60-99) currently:
1. Calls `ctx.clearRect()` — makes canvas transparent
2. Checks `config.grid.visible` — returns early if false (leaving canvas **transparent**)
3. Draws grid lines

The `config.backgroundColor` field exists in `ResolvedConfig` and resolves correctly per theme, but no code paints it. The fix is simple:

```typescript
draw(): void {
  this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

  // Fill background color (always, even if grid is hidden)
  this.ctx.fillStyle = this.config.backgroundColor;
  this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

  if (!this.config.grid.visible) {
    return;
  }
  // ... existing grid drawing code
}
```

Currently, the demo page's dark background comes from its own CSS `background: var(--bg)`, not from the chart. After this fix, the chart itself will paint its background, making theme switching actually visible.

### WCAG 2.1 AA Contrast Ratio Formula

The relative luminance contrast ratio is `(L1 + 0.05) / (L2 + 0.05)` where L1 is the lighter color. Relative luminance is computed from linearized sRGB channels. For normal text, AA requires >= 4.5:1. For large text or non-text UI, AA requires >= 3:1.

Expected contrast ratios (computed via WCAG 2.1 formula):
- Dark: `#8a8a9a` vs `#0a0a0f` → 5.82:1 (passes AA ≥ 4.5:1 for text)
- Dark: `#e0e0e0` vs `#1a1a2e` → 12.92:1 (passes AA for text)
- Dark: `#00d4aa` vs `#0a0a0f` → 10.34:1 (passes AA ≥ 3:1 for non-text)
- Dark: `#ffffff` vs `#0a0a0f` → 19.75:1 (passes AA for crosshair)
- Light: `#555555` vs `#ffffff` → 7.46:1 (passes AA for text)
- Light: `#333333` vs `#ffffff` → 12.63:1 (passes AA for text)
- Light: `#0066cc` vs `#ffffff` → 5.57:1 (passes AA ≥ 3:1 for non-text)

### How `setConfig()` Processes Theme Changes

When `setConfig({ theme: ThemeMode.Light })` is called (glide-chart.ts ~373):
1. Deep-merges `{ theme: 'light' }` into stored `this.userConfig`
2. Calls `resolveConfig(mergedUserConfig)` → pipeline applies light theme preset, then user overrides
3. Stores new `this.resolvedConfig` (frozen)
4. Recreates all renderers: BackgroundLayerRenderer, YAxisRenderer, XAxisRenderer, DataLayerRenderer
5. Recreates Crosshair and Tooltip (which re-apply styles from new config)
6. Calls `frameScheduler.markAllDirty()` to trigger full re-render
7. All layers redraw on next rAF with new theme colors

### Stale Overlay Is Already Theme-Aware (But Has Hardcoded Colors)

`drawStaleOverlay()` in glide-chart.ts (lines 629-632) checks `this.resolvedConfig.theme === 'dark'` and uses hardcoded theme-aware colors:
- Dark: text `rgba(255, 255, 255, 0.8)`, bg `rgba(255, 68, 102, 0.3)`
- Light: text `rgba(0, 0, 0, 0.7)`, bg `rgba(255, 68, 102, 0.2)`

These are intentionally NOT in the theme presets (they're overlay-only, not exposed in config). No source changes needed, but **tests should verify these colors change correctly when theme switches** (Task 3.6).

### Demo Page Has Three Chart Instances

The demo page creates THREE separate GlideChart instances (primary chart, a smaller chart, and a streaming chart). The existing theme toggle button at lines 371-378, 498-502, and 624-628 already calls `setConfig({ theme })` on all three and toggles CSS class `body.light`. Do NOT modify this logic — only update the subtitle.

### Patterns to Follow

- **Test co-location:** background-layer tests in `src/renderer/layers/background-layer.test.ts`, theme tests in `src/config/themes.test.ts`, integration tests in `src/api/glide-chart.test.ts`
- **Canvas mock:** Use `vitest-canvas-mock` — already configured
- **Config assertion:** Access `resolvedConfig` via the chart's internal state or by checking renderer behavior
- **Named exports only** — no `export default`
- **Error prefix:** `BackgroundLayerRenderer: <message>` or `ConfigResolver: <message>`

### Color Utility: hexToRgba

`hexToRgba(hex, alpha)` in `src/renderer/layers/data-layer.ts` (lines 379-397) converts hex colors to CSS rgba strings. It handles both `#RGB` and `#RRGGBB` formats. It is exported and used by `DataLayerRenderer`. No changes needed to this utility.

### What NOT to Do

- Do NOT rewrite the theme presets — `DARK_THEME` and `LIGHT_THEME` already exist and are correct
- Do NOT modify `resolveConfig()` — the merge pipeline works correctly
- Do NOT change the `setConfig()` recreation flow — it correctly recreates all renderers
- Do NOT modify config types — `ThemeMode`, `ChartConfig`, `ResolvedConfig` are all complete
- Do NOT add new color properties — the existing type system covers all themed elements
- Do NOT add CSS-based background coloring — use canvas `fillRect` on the background layer
- Do NOT add new runtime dependencies

### Key Learnings from Previous Stories

- Story 4.6: `setConfig()` deep-merges partial config with previous user config, so theme switch preserves other user overrides (verified in resolver tests)
- Story 4.5: `KeyboardNavigator.deactivate()` is called on `setConfig()` — no regression concern for theme switching
- Story 4.4/4.3: Zoom state is reset on `setConfig()` — theme switch resets zoom (acceptable behavior, consistent with existing design)
- All stories: Demo subtitle pattern is `"Glide Chart Demo — Feature1, Feature2"`

### Project Structure Notes

- Background layer fix: `src/renderer/layers/background-layer.ts` (existing file modification)
- Background layer tests: `src/renderer/layers/background-layer.test.ts` (existing file, 174 lines, 16 tests — has a `makeConfig()` helper that currently only accepts grid overrides; extend it to include `backgroundColor`)
- WCAG tests: `src/config/themes.test.ts` (existing file, add new describe block)
- Integration tests: `src/api/glide-chart.test.ts` (existing file, add new describe block)
- Demo: `demo/index.html` (existing file modification)
- Kebab-case file naming, PascalCase classes, camelCase methods

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 5, Story 5.1 acceptance criteria]
- [Source: _bmad-output/planning-artifacts/architecture.md — Config system, theme presets, resolved config pattern]
- [Source: _bmad-output/planning-artifacts/epics.md — FR22 light/dark theme switching, NFR11 WCAG AA contrast]
- [Source: src/config/themes.ts — DARK_THEME (lines 7-67), LIGHT_THEME (lines 69-129), getThemePreset()]
- [Source: src/config/resolver.ts — resolveConfig() (lines 113-167), deepMerge(), theme application pipeline]
- [Source: src/config/types.ts — ThemeMode enum, ChartConfig, ResolvedConfig interfaces]
- [Source: src/renderer/layers/background-layer.ts — BackgroundLayerRenderer.draw() (lines 60-99), missing backgroundColor fill]
- [Source: src/api/glide-chart.ts — setConfig() (lines 373-548), drawStaleOverlay theme awareness (lines 629-632)]
- [Source: src/interaction/tooltip.ts — applyStyles() (line 272), applies tooltip colors from config]
- [Source: _bmad-output/implementation-artifacts/4-6-dataset-replace-clear-and-destroy-api.md — setConfig deep-merge behavior]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Background layer test for "marks all layers dirty" initially failed because frameScheduler._running was true after tickFrame() — fixed by checking dirty flags directly instead of rAF callback presence.

### Completion Notes List

- Task 1: Added 2-line `fillStyle`/`fillRect` in `BackgroundLayerRenderer.draw()` before grid visibility check. This is the primary rendering fix — `config.backgroundColor` is now painted on every draw. Added 3 new tests (background fill before grid, custom backgroundColor, fill when grid hidden) and updated 1 existing test (grid.visible=false now also asserts fillRect).
- Task 2: Created `relativeLuminance()` and `wcagContrast()` WCAG 2.1 helper functions inline in themes.test.ts. Added 8 contrast ratio tests (4 dark, 4 light) covering axis labels, crosshair, tooltip text, and line colors. All pass with comfortable margins above AA thresholds.
- Task 3: Added 7 theme switching integration tests in glide-chart.test.ts covering dark→light, light→dark, per-series override preservation, dirty flag verification, data buffer persistence, stale overlay theme awareness, and onStaleChange callback persistence.
- Task 4: Verified existing theme toggle button logic (3 chart instances synced at lines 371-378, 498-502, 624-628) — no changes needed. Updated demo subtitle to append "Theme Switching". No toggle logic modified.

### Review Findings

- [x] [Review][Patch] Test "uses configured backgroundColor" does not verify fillStyle value [background-layer.test.ts:157-167] — Fixed: spy before draw, assert ctx.fillStyle === '#ffffff'.
- [x] [Review][Patch] Stale overlay test only checks theme string, not actual rgba colors [glide-chart.test.ts] — Fixed: trigger staleness, spy fillStyle assignments, verify dark rgba(255,68,102,0.3)/rgba(255,255,255,0.8) and light rgba(255,68,102,0.2)/rgba(0,0,0,0.7).
- [x] [Review][Patch] onStaleChange test checks registration, not firing [glide-chart.test.ts] — Fixed: trigger staleness after theme switch, verify callback fires with {seriesId, isStale: true}.
- [x] [Review][Defer] Stale overlay compares string literal instead of ThemeMode enum [glide-chart.ts:630] — deferred, pre-existing

### Change Log

- 2026-03-30: Story 5.1 implementation complete — backgroundColor canvas rendering fix, WCAG contrast tests, theme switching integration tests, demo subtitle update.

### File List

- src/renderer/layers/background-layer.ts (modified — added backgroundColor fillRect)
- src/renderer/layers/background-layer.test.ts (modified — 4 new/updated tests for background fill)
- src/config/themes.test.ts (modified — 8 new WCAG contrast ratio tests with helper functions)
- src/api/glide-chart.test.ts (modified — 7 new theme switching integration tests)
- demo/index.html (modified — subtitle updated to include "Theme Switching")
- _bmad-output/implementation-artifacts/sprint-status.yaml (modified — story status tracking)
- _bmad-output/implementation-artifacts/5-1-light-and-dark-theme-presets.md (modified — task checkboxes, dev record, status)
