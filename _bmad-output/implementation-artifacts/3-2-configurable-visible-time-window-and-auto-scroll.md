# Story 3.2: Configurable Visible Time Window & Auto-Scroll

Status: done

## Story

As a developer using Glide Chart,
I want to configure a visible time window and have the chart auto-scroll,
so that the most recent data is always visible during live streaming.

## Acceptance Criteria

1. Given a developer configures `timeWindow: 300` (5 minutes in seconds), when data streams in beyond the window, then the chart viewport shows only the last 5 minutes of data, older data scrolls off the left edge smoothly, the x-axis labels update as the window moves, and the y-axis auto-scales to the visible data range.
2. Given a developer configures `timeWindow` in different units, when values like 60 (1 min), 3600 (1 hour) are used, then the viewport adjusts accordingly.
3. Given `timeWindow` is configured and new data arrives via `addData()`, the chart auto-scrolls so the latest data point is at the right edge of the viewport.
4. Given no `timeWindow` is configured (default), the chart behaves as it does today — auto-fits to the full data range (no scrolling, no windowing).
5. Given `timeWindow` is configured and `setData()` replaces the entire dataset, the time window is applied to the new data.
6. Given `timeWindow` is changed via `setConfig()`, the viewport immediately adjusts to the new window size.

## Tasks / Subtasks

- [x] Task 1: Add `timeWindow` to config types and defaults (AC: #2, #4)
  - [x] 1.1 Add `timeWindow?: number` to `ChartConfig` in `src/config/types.ts` — value is in **seconds**, `undefined` or `0` means "show all data" (current behavior)
  - [x] 1.2 Add `readonly timeWindow: number` to `ResolvedConfig` — resolved default is `0` (show all)
  - [x] 1.3 Add `timeWindow: 0` to both theme presets in `src/config/themes.ts`
  - [x] 1.4 Add `timeWindow: 0` to `DEFAULT_CONFIG` in `src/config/defaults.ts`
  - [x] 1.5 Verify `resolveConfig()` in `src/config/resolver.ts` handles `timeWindow` automatically — no code change needed, the generic `deepMerge()` utility merges all fields including new ones
  - [x] 1.6 Export `timeWindow` in `src/api/types.ts` (it's already re-exported via `ChartConfig` — verify)
  - [x] 1.7 Write unit test in `resolver.test.ts`: `timeWindow` merges correctly (default 0, user override preserved)

- [x] Task 2: Implement time-windowed auto-fit in `GlideChart` (AC: #1, #3, #4, #5)
  - [x] 2.1 Modify `autoFitScale()` in `src/api/glide-chart.ts` to support time windowing:
    - If `resolvedConfig.timeWindow > 0`: compute `windowStart = latestTimestamp - (timeWindow * 1000)` (convert seconds → ms since timestamps are Unix ms). Set `scale.setDomainX(windowStart, latestTimestamp)` instead of `autoFitX`. Only auto-fit Y-axis to values **within the visible time window** (filter by timestamp range).
    - If `resolvedConfig.timeWindow === 0`: current behavior (auto-fit to full data range)
  - [x] 2.2 Use the existing `getVisibleWindow(buffer, range)` from `src/core/ring-buffer.ts:86-93` to filter visible points in `autoFitScale()` — no new helper needed
  - [x] 2.3 Ensure `addData()` triggers the windowed auto-fit (existing call to `autoFitScale()` suffices — verify the dirty flag logic still works: scale always changes when auto-scrolling, so axis/background layers get marked dirty)
  - [x] 2.4 Ensure `setData()` applies the time window after replacing data
  - [x] 2.5 Ensure `setConfig()` with changed `timeWindow` triggers `autoFitScale()` + `markAllDirty()` (already calls `markAllDirty()` at end — verify `autoFitScale()` is called after config update)

- [x] Task 3: Handle edge cases (AC: #1, #4)
  - [x] 3.1 Empty dataset with `timeWindow` configured: no crash, axes render with default domain
  - [x] 3.2 All data older than time window: viewport shows the window range, no data points visible — chart renders empty data area with axes
  - [x] 3.3 Single data point within window: renders as dot (existing behavior)
  - [x] 3.4 `timeWindow` configured but data span is shorter than window: show all data within the window boundaries (right edge = latest timestamp, left edge = latest - window; y-axis fits to all data)
  - [x] 3.5 Negative or non-finite `timeWindow` values: clamp to `0` at config resolve time (consistent with how `maxDataPoints` and `staleThreshold` are handled — silently defaulted, not throwing)

- [x] Task 4: Write unit tests for time-windowed auto-fit (AC: #1, #2, #3, #4, #5)
  - [x] 4.1 Test: `timeWindow: 300` with 10 minutes of data → `scale.domainX` covers only last 5 minutes
  - [x] 4.2 Test: `timeWindow: 60` → viewport covers last 60 seconds
  - [x] 4.3 Test: `timeWindow: 3600` → viewport covers last hour
  - [x] 4.4 Test: `addData` with `timeWindow` → domain X shifts right (auto-scroll), y-axis fits to visible range only
  - [x] 4.5 Test: `setData` with `timeWindow` → domain applies to new dataset
  - [x] 4.6 Test: `setConfig({ timeWindow: 120 })` on running chart → viewport adjusts immediately
  - [x] 4.7 Test: `timeWindow: 0` (default) → full data range (backward-compatible behavior)
  - [x] 4.8 Test: data span shorter than `timeWindow` → all data visible, left edge is `latest - window*1000`
  - [x] 4.9 Test: y-axis auto-scales to visible window only (data outside window with extreme values does NOT affect y range)

- [x] Task 5: Write integration tests for auto-scroll during streaming (AC: #1, #3)
  - [x] 5.1 Test: stream 100 points over simulated 10-minute span with `timeWindow: 300` → verify `scale.domainX.max` tracks latest timestamp, `scale.domainX.min` is `max - 300000`
  - [x] 5.2 Test: auto-scroll marks axis and background dirty on every `addData` (since domainX shifts each time)
  - [x] 5.3 Test: animation still works with time window (snapshot + interpolation unaffected by windowed domain)

- [x] Task 6: Update demo page (AC: #1, #3)
  - [x] 6.1 Update the existing streaming demo (third chart section in `demo/index.html`) to add a `timeWindow` dropdown/control: Off / 30s / 60s / 5min
  - [x] 6.2 When a time window is selected, call `chart.setConfig({ timeWindow: value })` to apply it live
  - [x] 6.3 The streaming demo already has Start/Stop/Speed controls — the time window control should complement these

- [x] Task 7: Verify all existing tests pass (regression)

## Dev Notes

### Critical: autoFitScale() Is the Only Change Point

The core change is in `autoFitScale()` at `src/api/glide-chart.ts:423-453`. Currently it auto-fits X to the **full** data range. With `timeWindow`, it must:

1. Find the latest timestamp across all series
2. Compute `windowStart = latestTimestamp - (timeWindow * 1000)` (seconds → ms)
3. Set `scale.setDomainX(windowStart, latestTimestamp)` (explicit domain, not auto-fit)
4. Filter values to only those within `[windowStart, latestTimestamp]` for Y auto-fit

**Everything else already works.** The `addData()` → `autoFitScale()` → `markDirty()` pipeline handles the auto-scroll naturally: each new point shifts the window, which changes the domain, which triggers axis/background redraws.

### Key Insight: Auto-Scroll Happens Automatically

When `timeWindow` is active and `addData()` pushes a new point:
- `autoFitScale()` computes new `windowStart` based on the new latest timestamp
- `scale.domainX` shifts right by the timestamp delta
- `autoFitScale()` returns `true` (scale changed) → axis + background layers marked dirty
- x-axis labels re-render with new time positions
- y-axis re-fits to visible data only
- Data layer renders only visible curve (points outside viewport clip naturally via canvas)

No explicit "scroll" animation is needed — the domain shift IS the scroll. The smooth visual effect comes from the animation system in Story 3.1 (lerp between old and new curve positions).

### timeWindow Config Design

- **Type**: `number` (seconds). Seconds chosen over milliseconds because the PRD says "seconds, minutes, hours" and seconds is the natural unit for configuration (e.g., `timeWindow: 300` for 5 min is more readable than `300000`).
- **Default**: `0` (show all data — backward compatible)
- **Internally**: Convert to milliseconds when comparing to timestamps: `timeWindow * 1000`
- **Validation**: `timeWindow` must be a non-negative finite number. Clamp negative or non-finite values to `0` at resolve time (consistent with `maxDataPoints`/`staleThreshold` handling).

### Y-Axis Must Only Fit to Visible Data

This is the most important correctness concern. Currently `autoFitScale()` iterates ALL points in ALL buffers for Y auto-fit. With `timeWindow`, the Y domain must only consider points within `[windowStart, latestTimestamp]`. If a huge spike exists in old data that has scrolled off-screen, it must NOT affect the visible Y range.

**Implementation approach**: In the `autoFitScale()` method, when `timeWindow > 0`, use `getVisibleWindow(buffer, { start: windowStart, end: latestTimestamp })` from `src/core/ring-buffer.ts:86-93` to filter each series' buffer, then collect only the visible values for `autoFitY`.

### Data Outside the Window Still Exists in the Buffer

The ring buffer retains all points up to `maxDataPoints` capacity. The time window only affects the **viewport** (which portion of data is shown). Points outside the window are still in memory and available if the user changes `timeWindow` or disables it. This is by design — the ring buffer handles memory management via capacity eviction, not time-based eviction.

### setConfig with timeWindow

When `setConfig({ timeWindow: newValue })` is called:
- `resolveConfig()` produces new config with updated `timeWindow`
- `setConfig()` already calls `markAllDirty()` at the end (`glide-chart.ts:350`)
- **Missing**: `autoFitScale()` is NOT currently called in `setConfig()`. It IS called indirectly via `handleResize()` but NOT on config change alone. **This needs to be added**: after config merge and renderer recreation, call `this.autoFitScale()` before `markAllDirty()`.
  - Actually, verify: `setConfig()` recreates renderers but does NOT re-fit the scale. For the existing config (no `timeWindow`), this was fine because scale only changes on data changes. With `timeWindow`, changing `timeWindow` must re-fit the scale. **Add `this.autoFitScale()` to `setConfig()` after renderer recreation, before `markAllDirty()`.**

### Performance Consideration

The current `autoFitScale()` iterates ALL points in ALL buffers. With `timeWindow`, it still must iterate visible points to find min/max values for Y-axis. For 10,000 points with a 5-minute window showing ~750 points (at 400ms intervals), this is fast.

However, for the X domain, no iteration is needed — just `latestTimestamp - timeWindow * 1000`. Find the max timestamp across series using `buffer.peek()` which returns the newest item in O(1) (`ring-buffer.ts:74-78`).

### Spline Computation Covers Full Buffer (Acceptable)

`DataLayerRenderer.computeCurvePoints()` evaluates ALL spline coefficients, including segments outside the visible time window. Points outside the window map to off-screen pixel coordinates via `scale.xToPixel()` and are naturally clipped by canvas bounds — no explicit clipping is needed. This is acceptable for v1: at 10,000 points with a 5-minute window showing ~750 visible points, the extra computation is negligible. Future optimization (computing splines only for visible range) can be added if profiling shows it's a bottleneck.

### Existing Infrastructure to Reuse

| Component | Location | Reuse Notes |
|-----------|----------|-------------|
| `autoFitScale()` | `src/api/glide-chart.ts:423-453` | **Modify** — add time-window branch |
| `getVisibleWindow()` | `src/core/ring-buffer.ts:86-93` | Reuse for filtering visible points |
| `RingBuffer.peek()` | `src/core/ring-buffer.ts:74-78` | Returns newest item — use for latest timestamp (O(1)) |
| `RingBuffer.peekOldest()` | `src/core/ring-buffer.ts:80-83` | Exists — use for empty checks |
| `Scale.setDomainX()` | `src/core/scale.ts:45-56` | Use directly for time-windowed X domain |
| `Scale.autoFitY()` | `src/core/scale.ts:97-121` | Reuse for Y-axis fit on visible data |
| Animation system | `src/renderer/layers/data-layer.ts` | **No changes** — animation works on pixel-space path buffers, independent of domain |
| Streaming demo | `demo/index.html` | **Modify** — add time window control |

### File Structure

| File | Action | Purpose |
|------|--------|---------|
| `src/config/types.ts` | Modify | Add `timeWindow` to `ChartConfig` and `ResolvedConfig` |
| `src/config/themes.ts` | Modify | Add `timeWindow: 0` to both themes |
| `src/config/defaults.ts` | Modify | Add `timeWindow: 0` to `DEFAULT_CONFIG` |
| `src/config/resolver.ts` | Verify only | `deepMerge()` handles `timeWindow` automatically — no code change needed |
| `src/config/resolver.test.ts` | Modify | Test `timeWindow` resolution (verify merge works) |
| `src/api/glide-chart.ts` | Modify | Modify `autoFitScale()` for time windowing; add `autoFitScale()` call in `setConfig()` |
| `src/api/glide-chart.test.ts` | Modify | Add time window unit and integration tests |
| `demo/index.html` | Modify | Add time window control to streaming demo |

**No new source files needed.** All changes extend existing modules.

### Project Structure Notes

- All file modifications follow existing kebab-case naming
- Config changes follow the resolved config pattern: `ChartConfig` (partial) → `ResolvedConfig` (complete)
- `timeWindow` flows through the standard config pipeline: `themes.ts` → `defaults.ts` → `resolver.ts` → `glide-chart.ts`
- Import DAG is maintained: `api/` imports from `core/`, `config/`; no new cross-module imports needed

### Previous Story Intelligence (Story 3.1)

**Key learnings from Story 3.1:**
- Animation system works via per-series path buffer lerp in `DataLayerRenderer` — completely pixel-space, independent of domain changes. Time window domain shifts will NOT interfere with animation.
- `autoFitScale()` returns boolean indicating whether scale changed — this drives dirty flag propagation for axis/background layers. With time windowing, scale changes on EVERY `addData()` call (domain shifts), so axis/background will always be marked dirty during streaming. This is correct behavior.
- `snapshotCurveState()` captures pixel coordinates before data mutation. Time window changes the domain, which changes pixel coordinates, but the snapshot captures the pre-change state correctly.
- Review findings from 3.1: `setData()` cancels animation if scale changed — same logic applies with time window.
- `clearData()` cancels animation — no special handling for time window (cleared data = no data = no window to apply).

### Git Intelligence

Commit pattern: `feat: add <feature description> (Story X.Y)`. Recent commits:
- `b2d75d1 feat: add incremental data push animation and streaming demo (Story 3.1)`
- `c7c11a8 feat: add multi-series rendering tests, demo, and review fixes (Story 2.5)`

Use same convention: `feat: add configurable time window and auto-scroll (Story 3.2)`

### Architecture Compliance

- **Config system**: `timeWindow` follows the resolved config pattern (deep merge: defaults ← theme ← user)
- **Scale**: Time-windowed X domain uses `scale.setDomainX()` directly — no manual coordinate math
- **Dirty flags**: Auto-scroll naturally triggers axis/background dirty via `autoFitScale()` return value
- **Ring buffer**: Data windowing is viewport-only; buffer retains all points up to capacity
- **No runtime dependencies**: All logic is simple arithmetic (timestamp comparison, subtraction)
- **Constructor injection**: No new singletons or globals
- **Import DAG**: Maintained — no new cross-module imports
- **No allocations in render loop**: Domain calculation is O(1); Y-axis visible filtering runs outside the render loop (in `autoFitScale()`, which runs on data change, not on every frame)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.2]
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Management — ring buffer design]
- [Source: _bmad-output/planning-artifacts/architecture.md#Animation & Frame Scheduling — dirty flag behavior]
- [Source: _bmad-output/planning-artifacts/prd.md#FR8 — Configurable visible time window]
- [Source: _bmad-output/planning-artifacts/prd.md#FR9 — Auto-scroll to most recent data]
- [Source: src/api/glide-chart.ts#autoFitScale — current auto-fit implementation to modify]
- [Source: src/core/ring-buffer.ts#getVisibleWindow — visible window filtering]
- [Source: src/core/scale.ts#setDomainX — explicit domain setting for time window]
- [Source: src/config/types.ts — ChartConfig and ResolvedConfig to extend]
- [Source: _bmad-output/implementation-artifacts/3-1-incremental-data-push-and-animation.md — previous story context]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

None required — clean implementation.

### Completion Notes List

- Added `timeWindow` (seconds) to `ChartConfig` (optional) and `ResolvedConfig` (default 0 = show all data)
- Added `timeWindow: 0` to both dark and light theme presets and DEFAULT_CONFIG
- Added clamping logic in resolver: negative/NaN/Infinity values silently default to 0
- Implemented `autoFitScaleWindowed()` method in GlideChart that sets X domain to `[latest - window*1000, latest]` and Y domain to only visible data within the window
- Uses `RingBuffer.peek()` for O(1) latest timestamp lookup and `getVisibleWindow()` for filtering
- Added `autoFitScale()` call to `setConfig()` so changing `timeWindow` immediately adjusts the viewport
- Auto-scroll works naturally: each `addData()` shifts the domain via `autoFitScale()`, marking axis/background dirty
- All edge cases handled: empty data, data shorter than window, multi-series with old data, single point
- 7 resolver tests + 12 GlideChart tests added (14 total new tests, 361 total passing)
- Demo page updated with Time Window dropdown (Off/30s/60s/5min) using `setConfig()` live

### Implementation Plan

Core change: `autoFitScale()` in `glide-chart.ts` now delegates to `autoFitScaleWindowed()` when `timeWindow > 0`. The windowed method uses `peek()` for O(1) latest timestamp, `setDomainX()` for explicit window, and `getVisibleWindow()` + `autoFitY()` for Y-axis scoped to visible data only. No new source files created.

### File List

- `src/config/types.ts` — Added `timeWindow` to `ChartConfig` and `ResolvedConfig`
- `src/config/themes.ts` — Added `timeWindow: 0` to DARK_THEME and LIGHT_THEME
- `src/config/defaults.ts` — Added `timeWindow` to DEFAULT_CONFIG
- `src/config/resolver.ts` — Added timeWindow clamping logic (negative/NaN/Infinity → 0)
- `src/config/resolver.test.ts` — Added 7 tests for timeWindow resolution
- `src/api/glide-chart.ts` — Added `autoFitScaleWindowed()`, modified `autoFitScale()` to branch on timeWindow, added `autoFitScale()` call in `setConfig()`
- `src/api/glide-chart.test.ts` — Added 12 tests (9 unit + 3 integration) for timeWindow behavior
- `demo/index.html` — Added Time Window dropdown control to streaming demo section

### Change Log

- 2026-03-29: Implemented Story 3.2 — configurable time window and auto-scroll. Added `timeWindow` config, windowed auto-fit, edge case handling, 14 new tests, demo control.

### Review Findings

- [x] [Review][Decision] Demo defaults to `timeWindow: 60` instead of Off — dismissed (demo showcases feature; library default is correctly 0)
- [x] [Review][Patch] `getVisibleWindow` allocates O(n) array copy per `addData` during streaming — fixed: iterate in-place via iterator
- [x] [Review][Patch] No upper bound on `timeWindow` — huge values cause `windowStart` underflow to `-Infinity` — fixed: guard non-finite `windowStart`
- [x] [Review][Patch] Tiny `timeWindow` values (e.g. 0.001s) can create degenerate zero-width X domain — fixed: clamp minimum to 1 second
- [x] [Review][Patch] Empty visible window resets Y-axis to `[0, 1]` instead of preserving previous domain — fixed: preserve previous Y domain
- [x] [Review][Patch] `timeWindow` config field has no JSDoc indicating unit is seconds — fixed: added JSDoc
- [x] [Review][Patch] Spline computation covers full buffer, not just visible window — fixed: skip coefficients outside visible X domain in computeCurvePoints
