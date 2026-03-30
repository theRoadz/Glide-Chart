# Story 4.6: Dataset Replace, Clear & Destroy API

Status: done

## Story

As a developer using Glide Chart,
I want to replace, clear, and destroy the chart programmatically,
So that I can manage chart lifecycle in my application.

## Acceptance Criteria

1. **Given** a GlideChart instance, **when** `chart.setData('price', newDataset)` is called, **then** the entire dataset is replaced and the chart re-renders with new data, **and** the spline cache is fully recomputed.
2. **Given** a GlideChart instance, **when** `chart.clearData('price')` is called, **then** the specified series data is cleared and the chart updates. **When** `chart.clearData()` is called (no argument), **then** all series are cleared.
3. **Given** a GlideChart instance, **when** `chart.destroy()` is called, **then** all DOM elements (canvases) are removed, **and** all event listeners are removed, **and** ResizeObserver is disconnected, **and** rAF loop is stopped, **and** no references are retained (GC-safe).

## Important Context: These Methods Already Exist

`setData()`, `clearData()`, and `destroy()` are **already fully implemented** in `src/api/glide-chart.ts` (lines 312-605). They were built incrementally across Stories 1.8, 3.1, 3.4, 4.3, 4.4, and 4.5. This story's purpose is to **validate completeness, harden edge cases, add missing test coverage, and ensure the API contract is bulletproof** — NOT to rewrite these methods from scratch.

### Current Implementation Status

- **`setData(seriesId, points)`** (lines 312-340): Clears buffer, pushes validated points, recomputes full spline, deactivates keyboard nav, resets zoom, auto-fits scale, marks all layers dirty. Handles animation snapshot.
- **`clearData(seriesId?)`** (lines 342-371): Cancels animation, clears buffer/spline for specified or all series, removes stale tracking, deactivates keyboard nav, resets zoom, auto-fits scale, marks all layers dirty.
- **`destroy()`** (lines 566-605): Sets destroyed flag, destroys tooltip/keyboardNavigator/zoomHandler/eventDispatcher/staleDetector/frameScheduler/layerManager, clears all buffers/caches, nulls out all references.
- **`assertNotDestroyed()`** (lines 690-694): Guard that throws after destroy.

### Current Test Coverage

`src/api/glide-chart.test.ts` (1279 lines) has tests for setData, clearData, and destroy but the following gaps need attention:

## Tasks / Subtasks

- [x] Task 1: Audit and harden `setData()` edge cases (AC: 1)
  - [x] 1.1 Add test: `setData` with empty array `[]` — should clear the series (buffer size 0), `computeFull()` on empty buffer is safe (returns empty arrays, sets `valid = true`)
  - [x] 1.2 Add test: `setData` with single point — graceful degradation, no spline (n < 2 returns `[]`), no crash
  - [x] 1.3 Add test: `setData` with 2 points — produces 1 linear segment (n-1=1 coefficient)
  - [x] 1.4 Add test: `setData` with 10,000 points — performance check, should complete under reasonable time
  - [x] 1.5 Verify existing: `setData` on one series in multi-series leaves others untouched — **already covered** at `glide-chart.test.ts` line ~353, verify still passes
  - [x] 1.6 Add test: `setData` with unsorted timestamps — buffer accepts them (doesn't sort), but spline interpolation behavior is undefined (negative intervals produce inverted deltas). Test should verify no crash and document the undefined behavior.
  - [x] 1.7 Verify existing: `setData` after zoom resets zoom state — **already implicit** in existing tests via `zoomHandler.resetZoom()` call, verify still passes
  - [x] 1.8 Add test: `setData` records stale data arrival when staleDetector is active

- [x] Task 2: Audit and harden `clearData()` edge cases (AC: 2)
  - [x] 2.1 Verify existing: `clearData('price')` then immediately `addData('price', point)` — **already covered** at `glide-chart.test.ts` lines ~251-254
  - [x] 2.2 Verify existing: `clearData()` (all) then `addData` on each series — **already covered** at lines ~264-267
  - [x] 2.3 Add test: `clearData` on already-empty series — should be a no-op, no crash (`buffer.clear()` is idempotent, `splineCache.invalidate()` always succeeds)
  - [x] 2.4 Verify existing: `clearData` with invalid seriesId throws — **already covered** at line ~274
  - [x] 2.5 Add test: `clearData` while animation is in-progress cancels animation (`cancelAnimation()` called at line 344 before any state change)
  - [x] 2.6 Add test: `clearData` resets keyboard navigator index (via `deactivate()`)
  - [x] 2.7 Verify existing: `clearData('price')` on multi-series only clears specified — **already covered** at lines ~251-254

- [x] Task 3: Audit and harden `destroy()` completeness (AC: 3)
  - [x] 3.1 Add test: After `destroy()`, container element has no child canvas elements (LayerManager removes them via `removeChild`)
  - [x] 3.2 Verify existing: After `destroy()`, all public methods throw — **already covered** at lines ~322-339
  - [x] 3.3 Verify existing: `destroy()` called twice throws — **already covered** at line ~337
  - [x] 3.4 Add test: After `destroy()`, no rAF callbacks fire (frameScheduler stopped)
  - [x] 3.5 Verify existing: After `destroy()`, ResizeObserver disconnected — **already covered** at line ~313
  - [x] 3.6 Add test: After `destroy()`, no DOM event listeners remain on container
  - [x] 3.7 Add test: After `destroy()`, staleDetector timers are cleared (no lingering setInterval)
  - [x] 3.8 Add test: All references nulled for GC — check `seriesMap.size === 0` and key subsystem references (`scale`, `layerManager`, `frameScheduler`, `eventDispatcher`, `resolvedConfig`, `tooltip`, `crosshair`) are null after destroy

- [x] Task 4: Add integration test suite for lifecycle sequences (AC: 1,2,3)
  - [x] 4.1 Test lifecycle: create → addData → setData → clearData → addData → destroy
  - [x] 4.2 Test lifecycle: create → setData → setData (replace twice) → destroy
  - [x] 4.3 Test lifecycle: create → addData(many) → clearData() → setData(new) → destroy
  - [x] 4.4 Test lifecycle: create → destroy immediately (no data ever added)
  - [x] 4.5 Test lifecycle: multi-series create → setData on each → clearData(one) → destroy

- [x] Task 5: Verify and fix any gaps found during audit
  - [x] 5.1 If `setData([])` doesn't properly handle empty array, fix it — validation confirms it works (`computeFull()` on empty buffer returns empty arrays safely)
  - [x] 5.2 If `clearData` on empty series throws unexpectedly, fix it — validation confirms `buffer.clear()` is idempotent (resets head/tail/count to 0)
  - [x] 5.3 If any destroy cleanup is missing (leaked listeners, timers), fix it
  - [x] 5.4 Ensure animation state is properly reset on both `setData` and `clearData`

- [x] Task 6: Update demo page (AC: all)
  - [x] 6.1 ~~Add "Replace Data" button~~ — **already exists** as "New Random Data" button (`btn-random`) calling `setData()` with random datasets
  - [x] 6.2 ~~Add "Clear Data" button~~ — **already exists** as "Clear Data" button (`btn-clear`) calling `clearData()`
  - [x] 6.3 ~~Add "Destroy Chart" button~~ — **already exists** as "Destroy/Recreate" toggle button (`btn-destroy`) calling `destroy()` with re-create
  - [x] 6.4 Update demo subtitle to include Story 4.6

## Dev Notes

### This Is a Hardening Story, Not a Greenfield Story

The core `setData()`, `clearData()`, and `destroy()` implementations are already complete and tested. **Do NOT rewrite them.** The goal is:
1. Fill test coverage gaps for edge cases
2. Verify lifecycle sequences work end-to-end
3. Fix any bugs discovered during the audit
4. Add demo UI for manual verification

### Existing Code Locations

- **Public API:** `src/api/glide-chart.ts` — the GlideChart class
- **API types:** `src/api/types.ts` — GlideChartConfig, re-exports DataPoint etc.
- **Test file:** `src/api/glide-chart.test.ts` (1279 lines, 60+ existing tests)
- **Ring buffer:** `src/core/ring-buffer.ts` — `clear()` zeros the buffer
- **Spline cache:** `src/core/spline-cache.ts` — `computeFull()` and `invalidate()`
- **Stale detector:** `src/core/stale-detector.ts` — `removeSeries()`, `destroy()`
- **Frame scheduler:** `src/renderer/frame-scheduler.ts` — `destroy()` cancels rAF
- **Layer manager:** `src/renderer/layer-manager.ts` — `destroy()` disconnects ResizeObserver, removes canvases
- **Event dispatcher:** `src/interaction/event-dispatcher.ts` — `destroy()` removes all DOM listeners
- **Keyboard navigator:** `src/interaction/keyboard-navigator.ts` — `deactivate()`, `destroy()`
- **Zoom handler:** `src/interaction/zoom-handler.ts` — `resetZoom()`, `destroy()`
- **Demo page:** `demo/index.html`

### Patterns to Follow

- **Test co-location:** Add new tests to existing `src/api/glide-chart.test.ts` — do NOT create a separate test file
- **Test structure:** Follow existing `describe`/`it` blocks pattern. Use `beforeEach` setup that already exists
- **Assertion style:** Use Vitest `expect()` — already configured
- **Mock pattern:** The test file already mocks `canvas.getContext('2d')` via `vitest-canvas-mock` and uses `vi.fn()` for callbacks
- **Error message format:** `GlideChart: <message>` prefix
- **Constructor injection:** All dependencies passed via constructor, no singletons

### SplineCache Empty-Buffer Safety

`computeFull()` on an empty buffer is safe and does not need special handling:
- `buffer.toArray()` returns `[]`
- `computeMonotoneSpline([])` returns `[]` (guard: `if (n < 2) return []`)
- `SplineCache.computeTangents([])` returns `[]` (guard: `if (n < 2) return new Array<number>(n).fill(0)`)
- Cache becomes `valid = true` with empty coefficient/tangent arrays
- Similarly, `invalidate()` always succeeds — sets `coefficients = []`, `tangents = []`, `valid = false`
- `RingBuffer.clear()` is idempotent — resets head/tail/count to 0, fills array with undefined

### Demo Page Already Has Lifecycle Buttons

The demo (`demo/index.html`) already has all 3 lifecycle buttons wired:
- **"New Random Data"** (`btn-random`, ~line 403) — calls `setData()` with fresh random datasets
- **"Clear Data"** (`btn-clear`, ~line 380) — calls `clearData()` on all series, stops streaming
- **"Destroy/Recreate"** (`btn-destroy`, ~line 430) — calls `destroy()`, toggles to recreate mode
Only the subtitle update (Task 6.4) is new work.

### Key Review Findings from Story 4.5 to Carry Forward

- `KeyboardNavigator.deactivate()` is called on both `setData()` and `clearData()` (review finding from 4.5, already fixed)
- `currentIndex` is clamped before navigation to handle ring buffer eviction (review finding from 4.5, already fixed)
- These fixes are in place — verify they still work correctly in lifecycle sequences

### Concurrency Note

JavaScript is single-threaded, so there are no true race conditions between `addData`, `setData`, `clearData`, and `destroy`. A `setTimeout` callback calling `addData` while `clearData` is mid-execution is impossible — one completes before the other starts. No mutex or locking patterns are needed. The `assertNotDestroyed()` guard handles the only real sequencing concern (calls after destroy).

### What NOT to Do

- Do NOT rewrite `setData()`, `clearData()`, or `destroy()` — they work correctly
- Do NOT add new public API methods — the API surface is complete per the architecture doc
- Do NOT add new dependencies
- Do NOT change the existing test setup/teardown patterns
- Do NOT add excessive logging or debug output

### Project Structure Notes

- All test additions go in `src/api/glide-chart.test.ts` (co-located with source)
- Demo changes go in `demo/index.html`
- No new source files should be needed for this story
- Kebab-case file naming, PascalCase classes, camelCase methods

### References

- [Source: _bmad-output/planning-artifacts/architecture.md — Public API section, Lifecycle management]
- [Source: _bmad-output/planning-artifacts/epics.md — Epic 4, Story 4.6 acceptance criteria]
- [Source: _bmad-output/planning-artifacts/prd.md — FR37 dataset replace, FR38 clear data, FR39 destroy/dispose]
- [Source: src/api/glide-chart.ts — setData() lines 312-340, clearData() lines 342-371, destroy() lines 566-605]
- [Source: src/api/glide-chart.test.ts — existing test suite, 1279 lines]
- [Source: _bmad-output/implementation-artifacts/4-5-keyboard-navigation-and-accessibility.md — review findings on deactivate/resetZoom]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

- All 6 tasks completed: 8 setData edge-case tests, 7 clearData edge-case tests, 8 destroy completeness tests, 5 lifecycle integration tests, 2 animation state tests added
- Audit confirmed: `setData([])` works safely (empty buffer + computeFull returns empty arrays), `clearData` on empty series is idempotent, `destroy()` properly nulls all references for GC
- No bugs found during audit — all existing implementations are correct
- Task 5 (verify/fix gaps): No fixes needed; all edge cases pass. Animation cancellation confirmed on both `setData` (via scale change) and `clearData` (explicit cancel before state change)
- Demo subtitle updated to include "Dataset Lifecycle"
- Total: 97 tests in glide-chart.test.ts (up from 60), 593 tests across full suite — zero regressions

### Review Findings

- [x] [Review][Patch] #2 — Performance test uses wall-clock `performance.now()` with no CI guard; widened threshold to 1000ms [src/api/glide-chart.test.ts:1325]
- [x] [Review][Patch] #5 — DOM listener removal test: fixed spy ordering, now asserts removeEventListener count >= addEventListener count [src/api/glide-chart.test.ts:1600]
- [x] [Review][Patch] #8 — `vi.useFakeTimers()` tests now wrap body in `try/finally` for `vi.useRealTimers()` [src/api/glide-chart.test.ts:1395,1621]
- [x] [Review][Patch] #10 — Added test: `setData` with invalid seriesId throws [src/api/glide-chart.test.ts]
- [x] [Review][Patch] #14 — Added test: `setData` with `points.length > maxDataPoints` verifies ring buffer retains correct count [src/api/glide-chart.test.ts]
- [x] [Review][Defer] #11 — `setData` with duplicate timestamps causes division by zero in `SplineCache.computeTangents` — deferred, pre-existing in spline math
- [x] [Review][Defer] #13 — `setData` partial failure (invalid point mid-array) leaves buffer in inconsistent state — deferred, pre-existing non-atomic setData design

### Change Log

- 2026-03-30: Story 4.6 implementation — added 37 new tests for setData/clearData/destroy edge cases and lifecycle sequences. Updated demo subtitle. No source code changes needed (hardening story).

### File List

- src/api/glide-chart.test.ts (modified — added 37 new tests across 6 describe blocks)
- demo/index.html (modified — updated subtitle to include "Dataset Lifecycle")
