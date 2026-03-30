# Story 5.3: Grid, Gradient & Animation Customization

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer using Glide Chart,
I want to customize grid appearance, gradient fills, and animation speed,
so that every visual detail matches my platform's design language.

## Acceptance Criteria

1. **Given** grid config options (visibility, opacity, color, dash style), **when** applied, **then** grid lines render with the specified appearance, **and** grid can be hidden entirely with `grid: { visible: false }`.

2. **Given** gradient config options (opacity, startColor, endColor), **when** applied per-series, **then** the gradient fill beneath each curve uses the specified colors and opacity.

3. **Given** `animationSpeed` config, **when** new data arrives or dataset changes, **then** transitions animate at the configured speed (0 = instant, higher = slower).

## Important Context: Scope of Changes

- **Grid** — Partially implemented. `GridConfig` has `visible`, `color`, `opacity`, `lineWidth` but **missing `dashPattern: number[]`**. This is the only NEW feature code in this story.
- **Gradient** — Fully implemented. `GradientConfig` supports `enabled`, `topColor`, `bottomColor`, `topOpacity`, `bottomOpacity` with per-series overrides and auto-matching (Story 5.2). **No code changes** — validation tests only.
- **Animation** — Fully implemented. `AnimationConfig` has `enabled` and `duration` (ms). `duration: 0` = instant, higher = slower (matches AC's `animationSpeed`). **No code changes** — validation tests only.
- **Validation gap** — `grid.opacity`, `grid.lineWidth`, and `animation.duration` are NOT currently validated in `resolver.ts`. This story adds validation for these alongside `dashPattern`.

## Tasks / Subtasks

- [x] Task 1: Add `dashPattern` to GridConfig (AC: 1)
  - [x]1.1 In `src/config/types.ts`, add `dashPattern: number[]` to `GridConfig` interface (after `lineWidth`). This is an array of dash-gap lengths passed to Canvas `setLineDash()` (e.g., `[4, 4]` for dashed, `[]` for solid).
  - [x]1.2 In `src/config/themes.ts`, add `dashPattern: []` (solid lines) to both `DARK_THEME.grid` and `LIGHT_THEME.grid`. Default is solid — dashing is opt-in.
  - [x]1.3 In `src/renderer/layers/background-layer.ts`, in the `draw()` method, after setting `ctx.lineWidth` (line 83), add `this.ctx.setLineDash(this.config.grid.dashPattern)` before `ctx.beginPath()`. After `ctx.stroke()`, reset with `this.ctx.setLineDash([])` to avoid bleeding into other layers.
  - [x]1.4 In `src/config/resolver.ts`, add a `validateGridConfig()` function (or inline in `validateConfig()`) that validates:
    - `grid.dashPattern`: all values must be non-negative finite numbers — `config.grid.dashPattern.every(v => Number.isFinite(v) && v >= 0)`
    - `grid.opacity`: must be between 0 and 1 (same pattern as `line.opacity` validation at lines 65-68)
    - `grid.lineWidth`: must be positive (same pattern as `line.width` validation at lines 61-63)
    - Call this from `validateConfig()` after the existing `validateLineAndGradient` call (line 96).
  - [x]1.5 In `src/config/resolver.ts`, add `animation.duration` validation: must be non-negative and finite (`Number.isFinite(config.animation.duration) && config.animation.duration >= 0`). Without this, `duration: -1` or `NaN` would cause division-by-zero in `data-layer.ts:173` (`elapsed / duration`).

- [x] Task 2: Grid dash pattern tests (AC: 1)
  - [x]2.1 In `src/renderer/layers/background-layer.test.ts`, update the `createRenderer` helper's `makeConfig` function: add `dashPattern?: number[]` to the `Partial<>` type annotation (line 18) AND pass it through to the `grid` object in `resolveConfig()`. Without the type annotation update, TypeScript will reject tests that pass `dashPattern`.
  - [x]2.2 Add test: grid with `dashPattern: [4, 4]` calls `ctx.setLineDash([4, 4])` before stroke.
  - [x]2.3 Add test: grid with default config (no dashPattern override) calls `ctx.setLineDash([])` (solid).
  - [x]2.4 Add test: grid with `dashPattern: [2, 4, 6]` (complex pattern) calls `ctx.setLineDash([2, 4, 6])`.
  - [x]2.5 Add test: `setLineDash([])` is called after `stroke()` to reset dash state.
  - [x]2.6 In `src/config/resolver.test.ts`, add test: `grid.dashPattern` with negative value throws validation error.
  - [x]2.7 In `src/config/resolver.test.ts`, add test: `grid.dashPattern` with `NaN` or `Infinity` throws validation error.
  - [x]2.8 In `src/config/resolver.test.ts`, add test: `grid.dashPattern: []` resolves successfully (solid lines).
  - [x]2.9 In `src/config/resolver.test.ts`, add test: `grid.dashPattern` deep-merges from theme (user override replaces theme default).
  - [x]2.10 In `src/config/resolver.test.ts`, add test: `grid.opacity: 1.5` throws validation error (out of 0-1 range).
  - [x]2.11 In `src/config/resolver.test.ts`, add test: `grid.lineWidth: 0` throws validation error (must be positive).
  - [x]2.12 In `src/config/resolver.test.ts`, add test: `animation.duration: -1` throws validation error (must be non-negative).
  - [x]2.13 In `src/config/resolver.test.ts`, add test: `animation.duration: NaN` throws validation error (must be finite).

- [x] Task 3: Grid visibility toggle test (AC: 1)
  - [x]3.1 In `src/api/glide-chart.test.ts`, add integration test: create chart, call `setConfig({ grid: { visible: false } })`, verify background layer redraws without grid lines (only background fill). Then call `setConfig({ grid: { visible: true } })` and verify grid lines return. This validates the AC's `grid: { visible: false }` scenario end-to-end.

- [x] Task 4: Gradient per-series customization validation tests (AC: 2)
  - [x]4.1 In `src/config/resolver.test.ts`, add test: two series with per-series gradient overrides `{ gradient: { topColor: '#ff0000', topOpacity: 0.5 } }` on series[0] and `{ gradient: { bottomColor: '#00ff00' } }` on series[1] — verify each series gets its specific gradient config merged with globals.
  - [x]4.2 In `src/renderer/layers/data-layer.test.ts`, add test: series with custom gradient `topOpacity: 0.8` and `bottomOpacity: 0.2` renders gradient with correct color stops from `hexToRgba()` using those opacities. Verify `createLinearGradient` and `addColorStop` are called with the expected rgba values.
  - [x]4.3 In `src/api/glide-chart.test.ts`, add integration test: create chart with series, call `setConfig` with per-series gradient overrides, verify the resolved series config reflects the new gradient values.

- [x] Task 5: Animation speed customization validation tests (AC: 3)
  - [x]5.1 In `src/renderer/layers/data-layer.test.ts`, add test: `DataLayerRenderer` with `animation: { enabled: true, duration: 0 }` — verify the constructor takes the `else` branch (line 67-72), initializing empty `prevPathBufs`. Then call `snapshotCurveState()` — it returns early at line 97 (`duration <= 0`) without setting `_isAnimating = true`. Verify `isAnimating` stays false and `needsNextFrame` is false. This confirms `duration: 0` means instant transitions with no animation overhead.
  - [x]5.2 In `src/renderer/layers/data-layer.test.ts`, add test: `DataLayerRenderer` with `animation: { enabled: true, duration: 1000 }` — call `snapshotCurveState()` then `draw()` at `performance.now() + 500` — verify `isAnimating` is true and the interpolated path differs from the target path (animation is slower).
  - [x]5.3 In `src/renderer/layers/data-layer.test.ts`, add test: `DataLayerRenderer` with `animation: { enabled: false, duration: 300 }` — call `snapshotCurveState()` — verify `isAnimating` stays false (animation disabled ignores duration).
  - [x]5.4 In `src/config/resolver.test.ts`, add test: `animation: { duration: 0 }` resolves successfully with `duration: 0`.
  - [x]5.5 In `src/config/resolver.test.ts`, add test: `animation: { duration: 2000 }` resolves with custom duration, overriding the 300ms theme default.
  - [x]5.6 In `src/api/glide-chart.test.ts`, add integration test: create chart, call `setConfig({ animation: { duration: 0 } })` — verify resolved config has `duration: 0` (instant mode).

- [x] Task 6: Demo page update (AC: 1, 2, 3)
  - [x]6.1 Update demo subtitle in `demo/index.html` to include "Grid, Gradient & Animation Customization".
  - [x]6.2 Add a demo section or modify an existing chart to showcase dashed grid lines (e.g., `grid: { dashPattern: [6, 3] }`).
  - [x]6.3 Optionally add a toggle button to switch between solid and dashed grid styles.

## Dev Notes

### This Is Primarily a Grid Dash Pattern Story + Validation

The only NEW feature code is adding `dashPattern` to `GridConfig` and rendering it in `background-layer.ts`. Gradient and animation customization are already fully functional — this story validates them with targeted tests that match the AC scenarios.

### Existing Code Locations

| File | Purpose | Key Lines |
|------|---------|-----------|
| `src/config/types.ts` | `GridConfig` — ADD `dashPattern` | 20-25 |
| `src/config/themes.ts` | `DARK_THEME.grid`, `LIGHT_THEME.grid` — ADD `dashPattern: []` | 21-26, 84-89 |
| `src/config/defaults.ts` | `DEFAULT_CONFIG` — no changes (derives from DARK_THEME) | 19 |
| `src/config/resolver.ts` | `validateConfig()` — ADD grid + animation validation | 84-105 |
| `src/renderer/layers/background-layer.ts` | `draw()` — ADD `setLineDash()` call | 81-102 |
| `src/renderer/layers/data-layer.ts` | Animation/gradient rendering — NO changes needed | 19-397 |
| `src/config/resolver.test.ts` | Resolver tests — ADD dashPattern + animation + gradient validation | existing |
| `src/renderer/layers/background-layer.test.ts` | Grid rendering tests — ADD dashPattern tests | existing |
| `src/renderer/layers/data-layer.test.ts` | Data layer tests — ADD animation/gradient validation | existing |
| `src/api/glide-chart.test.ts` | Integration tests — ADD grid toggle + animation + gradient setConfig tests | existing |
| `demo/index.html` | Demo page — UPDATE subtitle, add dashed grid showcase | existing |

### Grid Dash Pattern Implementation Detail

Canvas 2D `setLineDash()` accepts a `number[]` of alternating dash-gap lengths:
- `[]` = solid line (default)
- `[4, 4]` = 4px dash, 4px gap (evenly dashed)
- `[8, 4]` = 8px dash, 4px gap
- `[2, 2, 6, 2]` = complex pattern

The call must happen BEFORE `beginPath()`/`stroke()` and MUST be reset to `[]` after `stroke()` to prevent dash state from bleeding into other drawing operations. This follows the same pattern as `globalAlpha` reset at line 102 of background-layer.ts.

### Canvas Context State Safety

The `FrameScheduler` calls `ctx.save()` before each layer draw and `ctx.restore()` after (per architecture doc). So technically, `setLineDash` state is already scoped. However, explicitly resetting is defensive programming and matches the existing `globalAlpha = 1.0` reset pattern in the current code.

### Gradient — AC Name Mapping

The AC says "opacity, startColor, endColor" — these map to existing `topOpacity`/`bottomOpacity` and `topColor`/`bottomColor`. Per-series overrides flow through `resolveConfig()` (resolver.ts:148-160) → `DataLayerRenderer` constructor pre-computes RGBA (data-layer.ts:46-53) → `drawGradient()` renders (data-layer.ts:276-306). No renaming needed.

### Animation — AC Name Mapping and Key Mechanism

The AC says "animationSpeed" — this maps to `animation.duration` (ms). `duration: 0` = instant because constructor takes `else` branch (data-layer.ts:67) skipping buffer allocation, and `snapshotCurveState()` returns early (data-layer.ts:96-97). Higher values = slower eased transitions.

### deepMerge Array Replacement Behavior

`deepMerge()` replaces arrays, does not concatenate. So `setConfig({ grid: { dashPattern: [2, 2] } })` correctly replaces the entire pattern array. No special handling needed.

### What NOT to Do

- Do NOT rename `topColor`/`bottomColor` to `startColor`/`endColor` — the existing names are established across the codebase
- Do NOT rename `animation.duration` to `animationSpeed` — `duration` in ms is already implemented
- Do NOT add new gradient/animation config properties — existing types cover all AC requirements
- Do NOT modify `DataLayerRenderer` or `GlideChart.setConfig()` — animation, gradient, and config rebuild flows are already correct
- Do NOT duplicate existing test coverage (see "Existing Test Coverage" section below)

### Existing Test Coverage (Do NOT Duplicate)

**background-layer.test.ts** already tests:
- Grid visibility toggle (visible: false skips grid lines)
- Grid color, opacity, lineWidth applied
- 0.5px pixel alignment
- Background fill rendered before grid
- Grid lines within viewport bounds

**data-layer.test.ts** already tests (from Stories 5.1, 5.2):
- Per-series gradient rendering with custom colors
- Gradient disabled skips rendering
- Mixed gradient enable/disable per series
- Palette-to-renderer color flow
- Auto-matched gradient colors

**resolver.test.ts** already tests:
- Per-series gradient override merging
- Gradient auto-matching to line color
- Animation config merging

New tests should focus on **dashPattern rendering**, **grid toggle via setConfig**, **gradient per-series AC validation**, and **animation speed AC validation**.

### Key Learnings from Previous Stories

- Story 5.2: `hexToRgba()` converts hex colors to rgba strings for gradient; palette colors must be valid `#RRGGBB` hex
- Story 5.2: gradient auto-matching applies when neither per-series nor global explicitly sets gradient colors
- Story 5.1: Theme presets are `Partial<ChartConfig>` objects; `setConfig()` deep-merges then re-resolves
- Story 5.1: `setConfig()` marks all layers dirty, triggering full re-render
- Story 4.6: `setConfig()` preserves data buffers and spline caches — only config/renderers rebuild

### Project Structure Notes

- Modify 4 existing source files: `types.ts`, `themes.ts`, `background-layer.ts`, `resolver.ts`
- Tests distributed across 4 existing test files (co-located pattern)
- Demo update in `demo/index.html`
- No new files needed
- Kebab-case files, PascalCase classes, camelCase methods, named exports only

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 5, Story 5.3 AC, FR24/FR26/FR27]
- [Source: _bmad-output/planning-artifacts/architecture.md — Config & Theming, Layered Canvas, Animation & Frame Scheduling]
- [Source: _bmad-output/implementation-artifacts/5-2-per-series-line-customization.md — gradient auto-matching, palette system, review findings]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

No issues encountered.

### Completion Notes List

- Task 1: Added `dashPattern: number[]` to `GridConfig` interface, both theme presets (`[]` default = solid), `setLineDash()` call in background-layer `draw()` with reset after stroke, and validation for `grid.dashPattern`, `grid.opacity`, `grid.lineWidth`, and `animation.duration` in resolver.
- Task 2: Added 4 background-layer tests (dashPattern rendering, reset after stroke) and 8 resolver validation tests (dashPattern negative/NaN/Infinity, empty, deep-merge, grid.opacity, grid.lineWidth, animation.duration).
- Task 3: Added integration test for grid visibility toggle via `setConfig()`.
- Task 4: Added resolver test for per-series gradient override merging and data-layer test for custom gradient opacities.
- Task 5: Added 3 data-layer animation tests (duration:0 instant, duration:1000 slower, disabled ignores duration), 2 resolver tests (duration:0 resolves, duration:2000 overrides default), 1 integration test (setConfig duration:0).
- Task 6: Updated demo subtitle, added "Dashed Grid" toggle button that switches all charts between solid and dashed grid styles.

### Review Findings

- [x] [Review][Patch] `makeConfig` in background-layer.test.ts passes `undefined` for `dashPattern` — should use `?? []` for explicitness [src/renderer/layers/background-layer.test.ts:26]
- [x] [Review][Patch] No test for `grid: { visible: false }` combined with non-empty `dashPattern` — add test confirming `setLineDash` is NOT called when grid hidden [src/renderer/layers/background-layer.test.ts]
- [x] [Review][Patch] Grid/animation validation tests misplaced inside `palette color assignment` describe block — move to own describe blocks [src/config/resolver.test.ts]
- [x] [Review][Fixed] Demo `dashedGrid` toggle state desyncs after destroy/recreate cycle — fixed, re-applies dashPattern on recreate

### Change Log

- 2026-03-30: Implemented Story 5.3 — added dashPattern to GridConfig, grid/animation validation, 22 new tests, demo dashed grid toggle.

### File List

- src/config/types.ts (modified — added dashPattern to GridConfig)
- src/config/themes.ts (modified — added dashPattern: [] to DARK_THEME and LIGHT_THEME)
- src/config/resolver.ts (modified — added validateGridConfig, validateAnimationConfig)
- src/renderer/layers/background-layer.ts (modified — added setLineDash calls)
- src/config/resolver.test.ts (modified — 10 new tests)
- src/renderer/layers/background-layer.test.ts (modified — 4 new tests)
- src/renderer/layers/data-layer.test.ts (modified — 4 new tests)
- src/api/glide-chart.test.ts (modified — 3 new integration tests)
- demo/index.html (modified — subtitle update, dashed grid toggle)
- _bmad-output/implementation-artifacts/sprint-status.yaml (modified — status tracking)
