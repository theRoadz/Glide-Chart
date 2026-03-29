# Story 3.1: Incremental Data Push & Animation

Status: done

## Story

As a developer using Glide Chart,
I want to push new data points to the chart without full re-render,
so that real-time updates are smooth and performant.

## Acceptance Criteria

1. Given a rendered chart with existing data, when `chart.addData('price', { timestamp, value })` is called, then the new point is appended to the ring buffer and only the tail spline segments are recomputed (incremental update).
2. Only the data layer is marked dirty when the data range doesn't change. When the range changes (new min/max), the axis and background layers are also marked dirty.
3. The new point animates smoothly into the curve (smooth visual transition using the existing `animation.duration` config).
4. Performance remains at 60fps with 10,000+ points in the buffer during continuous streaming at 400ms intervals.
5. When `animation.enabled` is `false`, new data points render immediately with no transition.
6. A demo page streaming example demonstrates live data push at configurable intervals.

## Tasks / Subtasks

- [x] Task 1: Implement animation state machine in DataLayerRenderer (AC: #3, #5)
  - [x] 1.1 Add animation state tracking to DataLayerRenderer: `animationStartTime` (from `performance.now()`), `isAnimating` getter, and pre-allocated `prevPathBuf` / `prevPathLen` for the previous frame's pixel coordinates (per-series: parallel arrays indexed by series order)
  - [x] 1.2 Implement private `lerp(a: number, b: number, t: number): number` utility inline in DataLayerRenderer
  - [x] 1.3 Implement `snapshotCurveState()` public method: copies current per-series `pathBuf`/`pathLen` into `prevPathBuf`/`prevPathLen`, records `animationStartTime = performance.now()`
  - [x] 1.4 On `draw()` when `animationConfig.enabled` and `isAnimating`: compute `t = (performance.now() - animationStartTime) / animationConfig.duration`, apply ease-out `t' = 1 - (1-t)^2`, lerp between `prevPathBuf` and current `pathBuf` for each series, render the interpolated curve. For different-length buffers: lerp the overlapping region; for extra target points beyond `prevPathLen`, lerp from the last previous point toward the target
  - [x] 1.5 When animation completes (t >= 1): render final `pathBuf` exactly, set `isAnimating = false`
  - [x] 1.6 When `animationConfig.enabled` is `false`, skip all snapshot/lerp logic — render current data immediately (existing behavior, zero overhead)
  - [x] 1.7 Expose `get needsNextFrame(): boolean` getter (returns `isAnimating`). Do NOT change `draw()` return type — the `Layer` interface requires `draw(): void`
- [x] Task 2: Wire animation into GlideChart facade (AC: #1, #2, #3)
  - [x] 2.1 Pass `resolvedConfig.animation` to DataLayerRenderer constructor (new 5th parameter)
  - [x] 2.2 Update both `new DataLayerRenderer(...)` call sites in `glide-chart.ts` (constructor at line ~126, `setConfig()` at line ~315) to pass animation config
  - [x] 2.3 On `addData()`: before spline recompute, call `dataLayerRenderer.snapshotCurveState()` if animation enabled
  - [x] 2.4 On `setData()`: before buffer clear + repopulate, call `dataLayerRenderer.snapshotCurveState()` if animation enabled
  - [x] 2.5 Update data layer draw callback: after `dataLayerRenderer.draw()`, check `dataLayerRenderer.needsNextFrame` and re-mark `LayerType.Data` dirty if true
  - [x] 2.6 On `clearData()`: render immediately, no animation (clear is an explicit reset, not a visual transition)
  - [x] 2.7 On `setConfig()`: DataLayerRenderer is recreated — animation state is implicitly reset; no special handling needed
- [x] Task 3: Write unit tests for animation behavior (AC: #3, #5)
  - [x] 3.1 Test: animation disabled → `draw()` renders immediately, `needsNextFrame` is false, no `performance.now()` calls
  - [x] 3.2 Test: animation enabled + `snapshotCurveState()` called → `needsNextFrame` is true after `draw()`, subsequent draws interpolate toward final state
  - [x] 3.3 Test: animation completes when elapsed >= duration → final frame renders exact target curve, `needsNextFrame` is false
  - [x] 3.4 Test: rapid successive `snapshotCurveState()` calls during animation → new animation starts from current interpolated position (no visual jump)
  - [x] 3.5 Test: `snapshotCurveState()` with multi-series → each series animates independently using per-series prev/target buffers
  - [x] 3.6 Test: different-length path buffers (new point extends curve) → extra points lerp from last previous position toward target
- [x] Task 4: Write integration tests at GlideChart API level (AC: #1, #2, #4)
  - [x] 4.1 Test: `addData` single point when scale doesn't change → verify `LayerType.Data` dirty flag set AND `LayerType.Axis`/`LayerType.Background` NOT set (spy on `frameScheduler.markDirty` calls). NOTE: existing test "marks data layer dirty" only checks rAF scheduling, not specific layer flags — this test adds specificity
  - [x] 4.2 Test: `addData` single point that extends value range → Data + Axis + Background all marked dirty
  - [x] 4.3 Test: streaming 10,000 addData calls → buffer at capacity, spline valid, no errors (correctness under load)
  - [x] 4.4 Test: animation pumping — after `addData` with animation enabled, data layer draw callback re-marks dirty until animation completes
  - [x] 4.5 Test: `addData` to one series in multi-series chart → only that series animates, other series render at final position
- [x] Task 5: Write performance benchmark test (AC: #4)
  - [x] 5.1 Test: 10,000 points in buffer + 100 sequential addData single-point calls → total time < 500ms (canvas mock bounds)
  - [x] 5.2 Test: single addData call with 10,000 existing points → spline appendPoint completes < 5ms
- [x] Task 6: Add streaming demo to demo page (AC: #6)
  - [x] 6.1 Add a THIRD chart section to `demo/index.html` — "Real-Time Streaming Demo"
  - [x] 6.2 Chart starts with 50 initial data points, then streams new points at configurable interval (default 400ms)
  - [x] 6.3 Add Start/Stop/Speed controls for the streaming demo
  - [x] 6.4 Show point count and FPS counter in the demo UI
  - [x] 6.5 Use `animation: { enabled: true, duration: 300 }` to demonstrate smooth transitions
- [x] Task 7: Verify all existing tests still pass (regression)

## Dev Notes

### Critical: addData Pipeline Already Works

The incremental data push pipeline is **already fully implemented and tested**. The core path (`addData` → `buffer.push` → `splineCache.appendPoint` → `autoFitScale` → dirty flags) works correctly. This story adds **animation** (smooth visual transition) on top of the existing instant-render behavior, plus comprehensive streaming tests and a demo.

**What already works (DO NOT rebuild):**
- `GlideChart.addData(seriesId, point | points)` — validates, pushes to buffer, updates spline, marks dirty (`src/api/glide-chart.ts:176-201`)
- `SplineCache.appendPoint()` — incremental O(1) tail recompute when no eviction (`src/core/spline-cache.ts:29-58`)
- `SplineCache.computeFull()` — full O(n) recompute for batch adds (`src/core/spline-cache.ts:21-27`)
- `autoFitScale()` — recalculates domain bounds, returns boolean for scale change detection (`src/api/glide-chart.ts:403-433`)
- Dirty flag system — `markDirty(LayerType.Data)` + conditional axis/background marks (`src/api/glide-chart.ts:197-201`)
- `FrameScheduler` — rAF loop with sleep/wake on dirty flags (`src/renderer/frame-scheduler.ts`)
- `DataLayerRenderer.draw()` — clears canvas, iterates series, renders curves + gradients (`src/renderer/layers/data-layer.ts:41-67`)

**What this story adds:**
- Animation interpolation in DataLayerRenderer (lerp between old and new curve positions)
- Animation-aware frame pumping (keep data layer dirty during animation)
- Streaming performance tests
- Live streaming demo page

### Animation Design

The `AnimationConfig` already exists in the type system (`config/types.ts:27-30`) with `enabled: boolean` and `duration: number` (ms). Default is `{ enabled: true, duration: 300 }`. The DataLayerRenderer currently ignores it — curves render at their final position immediately.

**Animation approach — per-series path buffer lerp:**
1. GlideChart calls `dataLayerRenderer.snapshotCurveState()` before data mutation — this copies current per-series `pathBuf`/`pathLen` into `prevPathBuf`/`prevPathLen` and records `animationStartTime = performance.now()`
2. GlideChart mutates data (buffer push + spline recompute + scale update)
3. On each `draw()` call while animating: compute `t = (performance.now() - animationStartTime) / duration`, apply ease-out `t' = 1 - (1-t)^2`, then for each series: compute new `pathBuf` from spline, lerp between `prevPathBuf` and new `pathBuf`, render interpolated curve
4. When `t >= 1`: render final `pathBuf` exactly, clear animation state

**Path buffer length mismatch strategy (definitive):**
- Always compute the full target `pathBuf` first (current spline → pixel coords)
- Lerp the overlapping region: `for i in 0..min(prevPathLen, targetPathLen): result[i] = lerp(prev[i], target[i], t')`
- For extra target points beyond `prevPathLen`: lerp from the last previous point's coordinates toward the target position — this creates a smooth "extension" effect
- Pre-allocate `prevPathBuf` as a second `Float64Array` alongside `pathBuf` (same initial size, grows in sync)

**Per-series animation state:**
- Each series has its own `prevPathBuf`/`prevPathLen` (parallel arrays indexed by series order)
- `addData` for one series only snapshots that series' curve state; other series render at final position immediately
- A single `animationStartTime` is shared (all series that were snapshotted animate in sync)

**Rapid successive adds:** New animation starts from the current interpolated position. On `snapshotCurveState()`, if currently animating, the snapshot captures the interpolated curve (not the final target) — this means computing the lerped `pathBuf` at current progress and using that as the new `prevPathBuf`.

**When `animation.enabled === false`:** Zero overhead — `snapshotCurveState()` is never called, no `prevPathBuf` copy, no `performance.now()` calls, no lerp in `draw()`.

**Timing source:** DataLayerRenderer calls `performance.now()` directly inside `draw()` to compute elapsed time. No timing parameter needed on `draw()` — the rAF timestamp in `FrameScheduler._tick()` is not propagated to layers and we do not need to change the `Layer` interface.

### Dirty Flag Pumping During Animation

The FrameScheduler sleeps after 3 idle frames. During animation, the data layer must stay dirty until animation completes.

**Approach:** DataLayerRenderer exposes `get needsNextFrame(): boolean` (returns `true` while animating). The `Layer` interface defines `draw(): void` — do NOT change the return type. Instead, GlideChart's data layer draw callback reads the getter after calling `draw()`:

```typescript
createLayer(LayerType.Data, dataCanvas, dataCtx, () => {
  this.dataLayerRenderer.draw();
  if (this.dataLayerRenderer.needsNextFrame) {
    this.frameScheduler.markDirty(LayerType.Data);
  }
});
```

This keeps the scheduler awake during animation without coupling DataLayerRenderer to FrameScheduler and without modifying the `Layer` interface contract.

### Performance Requirements

- **NFR1**: 60fps with 10,000 visible points
- **NFR2**: 60fps during streaming at 400ms intervals
- **NFR4**: Single addData must NOT cause full re-render of the canvas
- **NFR5**: Memory stable during extended streaming (no leaks)

The existing `SplineCache.appendPoint()` already handles the incremental path — O(1) when no eviction, full recompute on eviction. The `RingBuffer` is O(1) push/evict. The `DataLayerRenderer.pathBuf` is pre-allocated `Float64Array` that grows but never shrinks. These together ensure the hot path is allocation-free.

For animation, pre-allocate `prevPathBuf` as a second `Float64Array` of the same initial size as `pathBuf`. Copy `pathBuf` into `prevPathBuf` before each data update — this is a `Float64Array.set()` call, O(n) but with very low constant (memcpy-speed).

### Existing Tests (DO NOT DUPLICATE)

**glide-chart.test.ts** already has these addData tests:
- `addData > appends point to correct series buffer` (~line 117) — verifies buffer.size increases
- `addData > appends batch of points` (~line 130) — verifies batch of 10 points
- `addData > with invalid seriesId throws descriptive error` (~line 140)
- `addData > marks data layer dirty` (~line 145) — only checks rAF scheduling (not which layers)
- `addData > validates DataPoint — NaN/Infinity/non-number throws` (~lines 160-200)

**setData** tests:
- `setData > replaces dataset and recomputes splines` (~line 221)
- `setData > invalid seriesId throws` (~line 235)

**spline-cache.test.ts** already has:
- `appendPoint > incremental update when no eviction`
- `appendPoint > full recompute on eviction`
- `computeFull > full recompute`

Do NOT duplicate these. The new integration tests (Task 4) add specificity the existing tests lack: verifying *which specific layers* get dirty flags set, animation pumping behavior, and streaming load correctness.

### File Structure

| File | Action | Purpose |
|------|--------|---------|
| `src/renderer/layers/data-layer.ts` | Modify | Add animation state, lerp logic, `needsNextFrame` getter, `snapshotCurveState()` method |
| `src/renderer/layers/data-layer.test.ts` | Modify | Add animation unit tests |
| `src/api/glide-chart.ts` | Modify | Pass animation config to DataLayerRenderer (2 call sites: lines ~126, ~315), call snapshotCurveState before data mutations, wire draw callback to check `needsNextFrame` |
| `src/api/glide-chart.test.ts` | Modify | Add streaming integration tests and dirty flag behavior tests |
| `demo/index.html` | Modify | Add third chart section for streaming demo |

**No new source files needed.** All changes extend existing modules.

### Lifecycle Behavior by Method

| Method | Animation? | Notes |
|--------|-----------|-------|
| `addData(id, point)` | Yes (if enabled) | Snapshot before mutation, animate tail |
| `addData(id, points[])` | Yes (if enabled) | Snapshot before mutation, animate full recompute |
| `setData(id, points)` | Yes (if enabled) | Snapshot before clear+repopulate |
| `clearData(id?)` | No | Immediate render — clear is an explicit reset |
| `setConfig(partial)` | No | DataLayerRenderer is recreated, animation state resets implicitly |
| `resize()` | No | Reuses existing renderer, no data change |

### Architecture Compliance

- **Rendering**: Animation happens inside DataLayerRenderer (data layer only). No new layers needed.
- **Layer interface**: `draw(): void` is NOT changed. Animation state exposed via `get needsNextFrame(): boolean` getter.
- **FrameScheduler**: Not modified. Animation-driven dirty marking happens from GlideChart's draw callback.
- **Config**: Use existing `resolvedConfig.animation.enabled` and `resolvedConfig.animation.duration`. No new config fields.
- **No runtime dependencies**: Lerp and easing are trivial math — hand-implement (2-3 lines each).
- **No allocations in render loop**: Pre-allocate `prevPathBuf` per series. Lerp in-place or into a third pre-allocated buffer.
- **Constructor injection**: DataLayerRenderer receives animation config via constructor. No singletons.
- **Import DAG**: `renderer/` imports from `core/` and `config/` only — maintained. `performance.now()` is a browser global (not an import).
- **Multi-series**: Animation state is per-series. `addData` for one series only animates that series' curve; other series render at final position.

### DataLayerRenderer Constructor Change

Current signature:
```typescript
constructor(ctx, canvas, scale, seriesData)
```

New signature adds animation config:
```typescript
constructor(ctx, canvas, scale, seriesData, animationConfig: Readonly<AnimationConfig>)
```

There are exactly **2 production call sites** in `glide-chart.ts`: the constructor (line ~126) and `setConfig()` (line ~315). There is no recreation in `handleResize()` — resize reuses the existing renderer. There are also ~18 call sites in `data-layer.test.ts` that will need the extra argument (pass `{ enabled: false, duration: 0 }` for existing tests, or create a test helper).

### Demo Page Pattern

The demo at `demo/index.html` currently has:
- Section 1: Single-series chart with controls
- Section 2: Multi-series chart (added in Story 2.5)

Add a **third** section below the multi-series chart. Do NOT modify existing sections. Use the same inline `<script type="module">` pattern importing from `../src/index.ts`.

Streaming demo features:
- Chart with `animation: { enabled: true, duration: 300 }`
- "Start Streaming" / "Stop Streaming" buttons
- Speed dropdown: 100ms / 200ms / 400ms / 1000ms intervals
- Point counter showing buffer size
- Simple FPS counter (count frames per second via rAF)
- Generate random walk data: `value = prev + (Math.random() - 0.5) * spread`

### Git Intelligence

Commit pattern: `feat: add <feature description> (Story X.Y)`. Use same convention.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.1]
- [Source: _bmad-output/planning-artifacts/architecture.md#Animation & Frame Scheduling]
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Management]
- [Source: _bmad-output/planning-artifacts/prd.md#FR6 — Push new data in real-time]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR1-NFR5 — Performance requirements]
- [Source: src/api/glide-chart.ts#addData — existing incremental push pipeline]
- [Source: src/core/spline-cache.ts#appendPoint — incremental spline update]
- [Source: src/renderer/layers/data-layer.ts — DataLayerRenderer to modify for animation]
- [Source: src/renderer/frame-scheduler.ts — rAF loop + dirty flag mechanism]
- [Source: src/config/types.ts#AnimationConfig — existing animation config type]

### Review Findings

- [x] [Review][Patch] `interpolatePath` buffer swap corrupts state across series/frames — fixed: caller saves/restores `pathBuf`/`pathLen` around interpolation [`src/renderer/layers/data-layer.ts:220-228`]
- [x] [Review][Patch] `interpolatePath` with `prevLen === 0` swaps in uninitialized buffer — fixed: early-return guard added [`src/renderer/layers/data-layer.ts:193`]
- [x] [Review][Patch] Division by zero when `duration: 0` with animation enabled — fixed: early-return in `snapshotCurveState` for `duration <= 0` [`src/renderer/layers/data-layer.ts:92,150`]
- [x] [Review][Patch] `clearData()` does not cancel in-flight animation — fixed: calls `cancelAnimation()` [`src/api/glide-chart.ts:233`]
- [x] [Review][Patch] `setData()` snapshot uses old scale's pixel coordinates — fixed: cancels animation if scale changed [`src/api/glide-chart.ts:216`]
- [x] [Review][Patch] Demo speed-change handler leaks duplicate rAF loops — fixed: cancels `fpsRafId` before restart [`demo/index.html`]
- [x] [Review][Patch] Dead code: `origDestroyHandler` captured but never used — fixed: removed [`demo/index.html`]
- [x] [Review][Patch] `snapshotCurveState` sets `_isAnimating = true` even when all series have empty coefficients — fixed: guarded with `anySnapshotted` flag [`src/renderer/layers/data-layer.ts:139-140`]
- [x] [Review][Patch] Constructor allocates animation buffers even when `animation.enabled = false` — fixed: skip `interpBuf`/`prevPathBufs` allocation when animation disabled [`src/renderer/layers/data-layer.ts:57-65`]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

- Task 1: Implemented animation state machine in DataLayerRenderer with per-series `prevPathBuf`/`prevPathLen` arrays, `snapshotCurveState()` method, ease-out quadratic interpolation, `needsNextFrame`/`isAnimating` getters, and `lerp()` utility function. Animation is zero-overhead when disabled.
- Task 2: Wired animation into GlideChart facade — passed animation config to both DataLayerRenderer constructor call sites, added `snapshotCurveState()` calls before data mutations in `addData()` and `setData()`, wired draw callback to pump animation frames via `needsNextFrame`. `clearData()` and `setConfig()` correctly skip/reset animation.
- Task 3: Added 6 unit tests for animation behavior: disabled path, enabled interpolation, completion detection, rapid successive snapshots, multi-series independence, and different-length path buffers.
- Task 4: Added 5 integration tests: dirty flag specificity (Data only vs Data+Axis+Background), streaming 10K points, animation frame pumping, multi-series addData isolation.
- Task 5: Added 2 performance benchmarks: 100 sequential addData with 10K points (<500ms), single addData with 10K points (<5ms).
- Task 6: Added streaming demo as third chart section with Start/Stop/Speed controls, point counter, FPS counter, and animation enabled at 300ms duration.
- Task 7: All 340 tests pass (327 original + 13 new). No regressions.

### File List

- `src/renderer/layers/data-layer.ts` — Modified: added animation state machine, `lerp()`, `snapshotCurveState()`, `needsNextFrame`/`isAnimating` getters, `interpolatePath()`, `AnimationConfig` import
- `src/renderer/layers/data-layer.test.ts` — Modified: added `AnimationConfig` import, `ANIM_OFF`/`ANIM_ON` constants, updated all 17 existing constructor calls with animation config, added 6 animation unit tests
- `src/api/glide-chart.ts` — Modified: passed animation config to DataLayerRenderer (2 call sites), added `snapshotCurveState()` in `addData()`/`setData()`, wired animation frame pumping in draw callbacks (2 call sites)
- `src/api/glide-chart.test.ts` — Modified: added `LayerType` import, 5 integration tests for dirty flag specificity/streaming/animation pumping, 2 performance benchmarks
- `demo/index.html` — Modified: added streaming demo section with controls, FPS counter, point counter

### Change Log

- 2026-03-29: Implemented Story 3.1 — incremental data push animation with per-series path buffer lerp, integration tests, performance benchmarks, and streaming demo page
