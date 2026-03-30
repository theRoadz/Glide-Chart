# Story 3.4: Stale Data Visual Indicator

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer using Glide Chart,
I want the chart to visually indicate when the data feed is stale or disconnected,
so that users are never misled by outdated price data.

## Acceptance Criteria

1. **Stale detection triggers on threshold breach** — Given a `staleThreshold` is configured (e.g., 5000ms), when no new data arrives within the threshold, then the chart visually indicates staleness (line dims, opacity reduces) and the stale indicator is visible without user interaction.

2. **Stale clears immediately on new data** — Given a stale chart, when new data resumes via `addData()`, then the stale visual indicator clears immediately and the chart resumes normal rendering.

3. **Stale detection disabled when threshold is 0** — Given `staleThreshold: 0`, when no data arrives, then no stale indicator is shown and no timer runs. Note: the default is `5000` (enabled) from theme presets — consumers who don't want stale detection must explicitly set `staleThreshold: 0`.

4. **Per-series stale tracking** — Given multiple series with data arriving at different rates, when one series goes stale but others are still active, then only the stale series dims visually.

5. **Stale callback notifies consumer** — Given an `onStaleChange` callback is configured, when stale state transitions (fresh→stale or stale→fresh), then the callback fires with `{ seriesId, isStale, lastDataTimestamp }`.

6. **Cleanup on destroy** — Given a chart with active stale timers, when `chart.destroy()` is called, then all stale check intervals are cleared with no dangling timers.

7. **Performance: zero overhead when disabled** — Given `staleThreshold: 0`, then no `setInterval`/`setTimeout` is registered, no timestamp tracking occurs, and the frame scheduler is not woken.

## Tasks / Subtasks

- [x] Task 1: Create `StaleDetector` class in `src/core/stale-detector.ts` (AC: 1, 2, 3, 4, 5, 6, 7)
  - [x] 1.1 Define `StaleDetectorConfig` and `StaleChangeEvent` interfaces in `src/core/stale-detector.ts`
  - [x] 1.2 Implement `StaleDetector` class with per-series timestamp tracking
  - [x] 1.3 Implement `recordDataArrival(seriesId)` — updates last-data timestamp for a series
  - [x] 1.4 Implement `startChecking()` — starts a single `setInterval` that checks all series
  - [x] 1.5 Implement `stopChecking()` / `destroy()` — clears interval, resets state
  - [x] 1.6 Implement stale transition detection with `onStaleChange` callback
  - [x] 1.7 Implement `removeSeries(seriesId)` — removes a series from tracking (used when series removed via `clearData`/`setConfig`)
  - [x] 1.8 Implement `getStaleSeriesIds(): ReadonlySet<string>` — returns current stale series for renderer consumption
  - [x] 1.9 Skip all work when `staleThreshold <= 0`

- [x] Task 2: Modify `DataLayerRenderer` to support stale dimming (AC: 1, 2, 4)
  - [x] 2.1 Add a `staleSeriesIds` field (type `ReadonlySet<string>`) to `DataLayerRenderer` with a public setter `setStaleSeriesIds(ids: ReadonlySet<string>)` — do NOT change `draw()` signature (it stays zero-param)
  - [x] 2.2 In the `draw()` loop, match stale state via `this.staleSeriesIds.has(series.config.id)` — `SeriesRenderData.config` is `ResolvedSeriesConfig` which has `.id`
  - [x] 2.3 For stale series in `drawCurve()`: multiply `ctx.globalAlpha` by `0.3` instead of using `series.config.line.opacity` directly
  - [x] 2.4 For stale series in `drawGradient()`: set `ctx.globalAlpha = 0.15` before `ctx.fill()` and restore to `1` after — gradient colors are pre-baked RGBA strings in the constructor, so `ctx.globalAlpha` is the only way to dim them dynamically
  - [x] 2.5 When series is not stale, render at normal configured opacity (no change to existing behavior)

- [x] Task 3: Integrate `StaleDetector` into `GlideChart` facade (AC: 1, 2, 3, 5, 6)
  - [x] 3.1 Create `StaleDetector` in constructor when `staleThreshold > 0`; store the `onStaleChange` callback in a private `_onStaleChange` field on `GlideChart` (NOT in `ResolvedConfig`)
  - [x] 3.2 Call `staleDetector.recordDataArrival(seriesId)` in `addData()` and `setData()`
  - [x] 3.3 On stale transition callback: update stale series set, call `dataLayerRenderer.setStaleSeriesIds()`, mark data layer AND interaction layer dirty
  - [x] 3.4 Wrap `onStaleChange` invocations in try/catch — consumer callback errors must NOT crash the chart (same pattern as Story 3.3 `safeCallOnError`)
  - [x] 3.5 In `clearData(seriesId)`: call `staleDetector.removeSeries(seriesId)` to clear that series' stale state; in `clearData()` (no arg): reset all stale state
  - [x] 3.6 In `setConfig()`: re-extract `onStaleChange` from merged user config; if `staleThreshold` changed, recreate StaleDetector; if series were removed (lines 289-297), untrack them from StaleDetector; if series were added, they start fresh (no stale state)
  - [x] 3.7 Clean up `StaleDetector` in `destroy()`
  - [x] 3.8 Add `onStaleChange` to `ChartConfig` in `src/config/types.ts`; export `StaleChangeEvent` type from `src/api/types.ts` → `src/index.ts` so consumers can type their callbacks

- [x] Task 4: Render stale overlay on interaction layer (AC: 1, 4)
  - [x] 4.1 When any series is stale, draw a semi-transparent overlay on the interaction layer canvas
  - [x] 4.2 Display "STALE" text indicator — position in upper-right corner of the chart viewport (not centered, to avoid obscuring data). When only some series are stale in multi-series charts, include the series ID in the label (e.g., "STALE: price")
  - [x] 4.3 Use theme-appropriate colors (light text on dark theme, dark text on light theme) with sufficient contrast
  - [x] 4.4 Accessibility: ARIA live region for stale state changes is deferred to Epic 4 Story 4.5 (keyboard-navigation-and-accessibility). For now, the visual canvas indicator is sufficient.

- [x] Task 5: Unit tests for `StaleDetector` (AC: 1, 2, 3, 4, 5, 6, 7)
  - [x] 5.1 Test: stale fires after threshold with no data
  - [x] 5.2 Test: stale clears when `recordDataArrival` called
  - [x] 5.3 Test: no timer created when threshold is 0
  - [x] 5.4 Test: per-series independent stale tracking
  - [x] 5.5 Test: `onStaleChange` callback fires with correct event data
  - [x] 5.6 Test: `destroy()` clears interval (no dangling timers)
  - [x] 5.7 Test: multiple rapid data arrivals don't cause redundant callbacks
  - [x] 5.8 Test: `removeSeries()` stops tracking and clears stale state for that series
  - [x] 5.9 Test: `getStaleSeriesIds()` returns correct set
  - [x] 5.10 Test: `onStaleChange` callback throwing does not crash StaleDetector

- [x] Task 6: Integration tests in `glide-chart.test.ts` (AC: 1, 2, 3, 5, 6)
  - [x] 6.1 Test: chart dims series line after staleThreshold elapses
  - [x] 6.2 Test: chart clears stale state after addData
  - [x] 6.3 Test: staleThreshold: 0 produces no side effects (no interval created)
  - [x] 6.4 Test: destroy cleans up stale detector timers
  - [x] 6.5 Test: clearData(seriesId) resets stale state for that series
  - [x] 6.6 Test: setConfig() recreates StaleDetector when staleThreshold changes
  - [x] 6.7 Test: setConfig() removing a series cleans up its stale tracking
  - [x] 6.8 Test: onStaleChange callback throwing does not break chart rendering

- [x] Task 7: Update demo page (AC: 1, 2)
  - [x] 7.1 Add stale threshold config to streaming demo
  - [x] 7.2 Add "pause feed" button to demonstrate stale indicator
  - [x] 7.3 Show stale state in the connection status UI

## Dev Notes

### Architecture & Design Decisions

**StaleDetector placement: `src/core/stale-detector.ts`** — This is a data-concern module (tracks data timestamps), belongs in `core/` alongside `ring-buffer.ts`. It has no renderer dependencies. The `core/` module boundary rules allow it to be imported by `renderer/`, `api/`, etc.

**Single `setInterval` for all series** — Do NOT create one timer per series. A single interval (e.g., 1000ms check frequency) iterates all series and compares `Date.now() - lastDataTimestamp > staleThreshold`. This avoids timer proliferation in multi-series scenarios.

**Stale check interval frequency** — Use `Math.min(staleThreshold, 1000)` as the check interval. This gives responsive detection without excessive CPU usage. For a 5000ms threshold, checking every 1000ms is sufficient.

**Visual treatment: opacity reduction on data layer** — The primary visual indicator is reducing stale series' line opacity by multiplying `ctx.globalAlpha` by `0.3`. For gradients, gradient colors are **pre-baked as RGBA strings in the constructor** (see `hexToRgba()` calls in `DataLayerRenderer` constructor lines 44-51), so you CANNOT change them at render time. Instead, set `ctx.globalAlpha = 0.15` before `ctx.fill()` in `drawGradient()` and restore to `1` after. Add a `staleSeriesIds: ReadonlySet<string>` field to `DataLayerRenderer` with a public setter — do NOT change the `draw()` method signature (it stays zero-param). Match series via `series.config.id` (available from `ResolvedSeriesConfig`) inside the draw loop.

**Secondary indicator: "STALE" text on interaction layer** — A small text indicator on the interaction layer canvas provides explicit feedback. Use `ctx.fillText('STALE', x, y)` on the interaction layer. This layer already exists and has pointer-events enabled, making it the correct place for UI overlays.

**Callback pattern: `onStaleChange`** — Follows the same pattern as `WebSocketDataSource.onStateChange`. The callback receives `{ seriesId: string, isStale: boolean, lastDataTimestamp: number }`. This lets consumers (e.g., the WebSocket demo) update their own UI in response to stale state. **All `onStaleChange` invocations MUST be wrapped in try/catch** to prevent consumer callback errors from crashing the chart's internal state machine (same pattern as Story 3.3 review findings #4 and #5 which fixed `onStateChange`/`onError` crash bugs).

### Critical: What NOT to Do

- **Do NOT use `setTimeout` per data arrival** — This would create/cancel timers on every `addData()` call (potentially 2-3x per second during streaming). Use a polling `setInterval` instead.
- **Do NOT import from `renderer/` or `config/` in `StaleDetector`** — It's a `core/` module. Pass the threshold value as a constructor parameter.
- **Do NOT modify `FrameScheduler` internals** — The facade calls `frameScheduler.markDirty(LayerType.Data)` when stale state changes. The scheduler's existing dirty-flag mechanism handles the rest.
- **Do NOT add a new `LayerType.Stale`** — Use the existing interaction layer for the text indicator and the data layer for opacity dimming.
- **Do NOT use `requestAnimationFrame` for stale checking** — `setInterval` is correct here because stale detection is time-based, not frame-based. The rAF loop may be sleeping when data stops flowing.
- **Do NOT try to modify gradient RGBA color strings at render time** — They are pre-baked in the `DataLayerRenderer` constructor. Use `ctx.globalAlpha` before `ctx.fill()` to dim gradients.
- **Do NOT change `draw()` method signature** — Keep it zero-param. Use a setter (`setStaleSeriesIds`) to pass stale state to the renderer.
- **Do NOT let `onStaleChange` callback errors propagate** — Wrap in try/catch. Consumer code must never crash the chart.

### Existing Code to Reuse

- **`staleThreshold` config already exists** in `ChartConfig` (line 80) and `ResolvedConfig` (line 105) in `src/config/types.ts`. Default is `5000` (5 seconds) from `src/config/themes.ts` lines 64 and 125. Resolver validates it's non-negative in `src/config/resolver.ts` line 92.
- **`DataLayerRenderer.drawCurve()`** (line 254 of `data-layer.ts`) sets `ctx.globalAlpha = series.config.line.opacity` — this is where stale dimming hooks in by overriding the alpha value.
- **`DataLayerRenderer.drawGradient()`** (line 268) uses `hexToRgba()` with configured opacity — stale dimming reduces this proportionally.
- **Interaction layer canvas** is created by `LayerManager` but currently has an empty draw callback (line 164 of `glide-chart.ts`). The stale text indicator goes here.
- **`GlideChart.addData()`** (line 180) is where `staleDetector.recordDataArrival(seriesId)` must be called.
- **`GlideChart.setData()`** (line 212) also needs `recordDataArrival`.
- **`GlideChart.clearData()`** (line 236) must reset stale state — call `staleDetector.removeSeries(seriesId)` for single-series clear, or reset all stale state for no-arg clear.
- **`GlideChart.setConfig()`** (line 257) — lines 289-297 remove series from `seriesMap`; each removed series must be untracked from StaleDetector. Lines 272-285 add new series; they start with no stale state. The `onStaleChange` callback must be re-extracted from `this.userConfig` after `deepMerge` since it's not in `ResolvedConfig`.
- **`GlideChart.destroy()`** (line 369) must call `staleDetector.destroy()`.

### Config Types Changes

Add to `ChartConfig` in `src/config/types.ts`:
```typescript
onStaleChange?: (event: { seriesId: string; isStale: boolean; lastDataTimestamp: number }) => void;
```

This is a callback, not a resolved config value — it should NOT go in `ResolvedConfig`. Store it in a private `_onStaleChange` field on the `GlideChart` class, extracted from the user config in the constructor and re-extracted in `setConfig()` after `deepMerge`.

Also define and export the event type for consumer use:
```typescript
// In src/core/stale-detector.ts (or a dedicated types section)
export interface StaleChangeEvent {
  seriesId: string;
  isStale: boolean;
  lastDataTimestamp: number;
}
```
Re-export `StaleChangeEvent` from `src/api/types.ts` → `src/index.ts` so consumers can type their callbacks. `StaleDetector` and `StaleDetectorConfig` are internal — do NOT export them.

### Module Boundaries

| New File | Module | Can Import From |
|---|---|---|
| `src/core/stale-detector.ts` | core | (nothing — leaf module) |
| `src/core/stale-detector.test.ts` | core | core |

### Naming Conventions

- File: `stale-detector.ts` (kebab-case)
- Test: `stale-detector.test.ts` (co-located)
- Class: `StaleDetector` (PascalCase)
- Config interface: `StaleDetectorConfig` (PascalCase, no `I` prefix)
- Constants: `DEFAULT_CHECK_INTERVAL` (UPPER_SNAKE_CASE)
- Callback type: `StaleChangeCallback`

### Testing Standards

- **Framework:** Vitest with `vi.useFakeTimers()` for interval control
- **Mock strategy:** Use fake timers exclusively. `vi.advanceTimersByTime(threshold + 1)` to trigger stale. No real `setTimeout`/`setInterval` in tests.
- **Canvas mocking:** Existing `vitest-canvas-mock` setup handles `DataLayerRenderer` tests
- **No `any` types** in tests — use proper typing
- **Co-located tests** next to source files

### Previous Story Intelligence (Story 3.3)

- `WebSocketDataSource` established the callback pattern (`onStateChange`, `onError`) — follow same approach for `onStaleChange`
- `addData()` supports both single point and batch `DataPoint[]` — `recordDataArrival` should be called once per `addData()` call regardless of batch size
- Story 3.3 noted: "`staleThreshold` config already exists in `ResolvedConfig` (Story 3.4 will implement visual indicator)" — confirming this is expected
- Review finding #1 from 3.3 fixed architecture boundary violation (streaming importing from core) — ensure `StaleDetector` in `core/` follows boundaries correctly

### Git Intelligence

Recent commits follow pattern: `feat: add <description> (Story X.Y)`. All stories in Epic 3 have been completed sequentially (3.1→3.2→3.3). The codebase has 391+ passing tests. ESLint config includes browser globals.

Files most relevant to this story (from recent commits):
- `src/renderer/layers/data-layer.ts` — line rendering with opacity
- `src/api/glide-chart.ts` — facade orchestration, addData/setData/destroy
- `src/config/types.ts` — ChartConfig with staleThreshold
- `src/config/themes.ts` — default staleThreshold: 5000

### Project Structure Notes

- All files follow kebab-case naming
- Tests are co-located (`foo.test.ts` next to `foo.ts`)
- `src/core/` is a leaf module with no external imports
- The interaction layer canvas exists but has an empty draw callback — this is where the "STALE" text goes
- `src/index.ts` re-exports from all modules — add `StaleChangeEvent` re-export via `src/api/types.ts`

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 3, Story 3.4]
- [Source: _bmad-output/planning-artifacts/prd.md — FR10: stale data indication]
- [Source: _bmad-output/planning-artifacts/prd.md — NFR2: 60fps during streaming]
- [Source: _bmad-output/planning-artifacts/architecture.md — Stale data visual indicator section]
- [Source: _bmad-output/planning-artifacts/architecture.md — Layer system and dirty flag mechanism]
- [Source: _bmad-output/planning-artifacts/architecture.md — Module boundaries table]
- [Source: src/config/types.ts:80 — staleThreshold in ChartConfig]
- [Source: src/config/types.ts:105 — staleThreshold in ResolvedConfig]
- [Source: src/config/themes.ts:64,125 — default staleThreshold: 5000]
- [Source: src/renderer/layers/data-layer.ts:254-266 — drawCurve with globalAlpha]
- [Source: src/api/glide-chart.ts:180-210 — addData method]
- [Source: src/api/glide-chart.ts:369-394 — destroy method]
- [Source: _bmad-output/implementation-artifacts/3-3-websocket-data-feed-integration-pattern.md — Previous story context]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

None — clean implementation with no debugging required.

### Completion Notes List

- Created `StaleDetector` class in `src/core/stale-detector.ts` with single `setInterval` polling, per-series timestamp tracking, `onStaleChange` callback with try/catch protection, and full lifecycle management (`startChecking`, `stopChecking`, `destroy`, `removeSeries`). Check interval uses `Math.min(threshold, 1000)` per spec.
- Modified `DataLayerRenderer` with `staleSeriesIds` field and `setStaleSeriesIds()` setter. Stale series get `globalAlpha * 0.3` in `drawCurve()` and `globalAlpha = 0.15` in `drawGradient()`. Non-stale series render normally (no behavior change).
- Integrated `StaleDetector` into `GlideChart` facade: constructor creates detector when threshold > 0, `addData`/`setData` call `recordDataArrival`, `clearData` calls `removeSeries`, `setConfig` recreates detector on threshold change, `destroy` cleans up. Consumer `onStaleChange` stored as private field, not in `ResolvedConfig`.
- Added "STALE" text overlay on interaction layer canvas with theme-appropriate colors, positioned in upper-right corner. Multi-series partial stale shows series IDs in label.
- Added `onStaleChange` to `ChartConfig` in `src/config/types.ts`. Exported `StaleChangeEvent` type via `src/api/types.ts` → `src/index.ts`.
- 12 unit tests for `StaleDetector` covering all ACs including edge cases (threshold 0, negative threshold, callback errors, rapid data arrivals).
- 8 integration tests in `glide-chart.test.ts` covering full facade integration (stale detection, clearing, disable, destroy cleanup, setConfig recreation, series removal, callback error resilience).
- Updated websocket demo with `staleThreshold: 5000`, "Pause Feed" button, `onStaleChange` callback, and stale status in connection bar.
- All 418 tests pass. No lint errors. No type errors in production code (pre-existing test file TS issues unrelated to this story).

### Change Log

- 2026-03-29: Implemented Story 3.4 — Stale Data Visual Indicator (all 7 tasks, 20 tests added)

### File List

- `src/core/stale-detector.ts` (new) — StaleDetector class with config/event interfaces
- `src/core/stale-detector.test.ts` (new) — 12 unit tests for StaleDetector
- `src/renderer/layers/data-layer.ts` (modified) — Added staleSeriesIds field, setter, dimming in drawCurve/drawGradient
- `src/api/glide-chart.ts` (modified) — StaleDetector integration, handleStaleChange, drawStaleOverlay, lifecycle hooks
- `src/api/glide-chart.test.ts` (modified) — 8 integration tests for stale data indicator
- `src/config/types.ts` (modified) — Added onStaleChange to ChartConfig
- `src/api/types.ts` (modified) — Re-exported StaleChangeEvent from core
- `src/index.ts` (modified) — Added StaleChangeEvent to public exports
- `demo/websocket-demo.html` (modified) — Stale threshold config, pause button, stale status UI

### Review Findings

- [x] [Review][Patch] DPR coordinate math error in `drawStaleOverlay` — margin double-scaled on HiDPI displays [src/api/glide-chart.ts:497] — Fixed
- [x] [Review][Patch] Stale overlay label can overflow canvas with many long series IDs [src/api/glide-chart.ts:480] — Fixed
- [x] [Review][Patch] `setData([])` marks series as fresh despite empty data [src/api/glide-chart.ts:241] — Fixed
- [x] [Review][Patch] `removeSeries` fires callback with `lastDataTimestamp: 0` (epoch) [src/core/stale-detector.ts:65] — Fixed
- [x] [Review][Patch] No minimum floor on stale check interval — 1ms threshold creates 1ms polling [src/core/stale-detector.ts:39] — Fixed
- [x] [Review][Patch] `setConfig` resets stale timestamps to `Date.now()`, masking genuinely stale series — Fixed: added getState/restoreState to preserve timestamps across detector recreation
- [x] [Review][Patch] Shared mutable Set reference between detector and renderer — Fixed: getStaleSeriesIds() now returns a copy
