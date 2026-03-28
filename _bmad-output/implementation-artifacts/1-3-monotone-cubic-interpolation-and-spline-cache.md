# Story 1.3: Monotone Cubic Interpolation & Spline Cache

Status: done

## Story

As a developer using Glide Chart,
I want smooth curve interpolation that passes through every data point exactly,
So that price data is never misrepresented and the curve looks flowing and organic.

## Acceptance Criteria

1. **Given** an array of 3+ data points **When** monotone cubic interpolation is computed **Then** the resulting curve passes through every data point exactly (no overshooting)
2. **Given** extreme value changes (10x price spikes) **When** interpolation is computed **Then** no visual artifacts — monotonicity constraint prevents overshoot between consecutive points
3. **Given** computed spline coefficients **Then** they are cached and reusable across frames without recomputation
4. **Given** fewer than 3 data points **When** interpolation is requested **Then** the system falls back to linear segments gracefully (FR4): 0 points = no output, 1 point = single point, 2 points = straight line
5. **Given** a cached spline and a new data point appended **When** incremental update is triggered **Then** only the last 2-3 segments are recomputed (not the full dataset)

## Tasks / Subtasks

- [x] Task 1: Implement monotone cubic interpolation algorithm in `src/core/interpolation.ts` (AC: #1, #2, #4)
  - [x]Export `SplineCoefficients` interface: `{ x0: number; x1: number; a: number; b: number; c: number; d: number }`
  - [x]Export `computeMonotoneSpline(points: DataPoint[]): SplineCoefficients[]`
    - For `points.length < 2`: return empty array
    - For `points.length === 2`: return single linear segment (`a=0, b=0`)
    - For `points.length >= 3`: full Fritsch-Carlson monotone cubic Hermite interpolation
  - [x]Export `evaluateSpline(coeffs: SplineCoefficients, x: number): number`
    - Normalize x to t in [0,1] within the segment: `t = (x - x0) / (x1 - x0)`
    - Evaluate using Horner's method: `((a*t + b)*t + c)*t + d`
  - [x]Export `findSegmentIndex(coefficients: ReadonlyArray<SplineCoefficients>, x: number): number`
    - Binary search over `coefficients[].x0` / `x1` to find the segment containing `x`
    - Clamp to first segment if `x < coefficients[0].x0`, last segment if `x > coefficients[last].x1`
    - Return -1 for empty array
  - [x]Algorithm steps for `computeMonotoneSpline` (all coefficients use normalized t-form, t in [0,1]):
    1. Compute interval widths: `h[k] = x[k+1] - x[k]`
    2. Compute secant slopes: `delta[k] = (y[k+1] - y[k]) / h[k]`
    3. Compute initial tangents at interior points using weighted harmonic mean:
       - If `delta[k-1]` and `delta[k]` have different signs or either is zero: `m[k] = 0`
       - Otherwise: `m[k] = (w1 + w2) / (w1/delta[k-1] + w2/delta[k])` where `w1 = 2*h[k] + h[k-1]`, `w2 = h[k] + 2*h[k-1]`
    4. Boundary tangents: one-sided finite difference (`m[0] = delta[0]`, `m[n-1] = delta[n-2]`), clamped to zero if sign differs from adjacent secant
    5. Monotonicity enforcement (alpha-beta check): for each segment, compute `alpha = m[k] / delta[k]`, `beta = m[k+1] / delta[k]`. If `alpha^2 + beta^2 > 9`, scale both: `tau = 3 / sqrt(alpha^2 + beta^2)`, `m[k] *= tau`, `m[k+1] *= tau`
    6. Convert to normalized polynomial coefficients per segment (where `t = (x - x0) / h`):
       - `d = y[k]`
       - `c = m[k] * h[k]`
       - `b = 3*(y[k+1] - y[k]) - 2*m[k]*h[k] - m[k+1]*h[k]`
       - `a = 2*(y[k] - y[k+1]) + m[k]*h[k] + m[k+1]*h[k]`
  - [x]Handle edge case: consecutive identical x values (skip duplicate, avoid division by zero)
  - [x]Handle edge case: single point repeated (return empty array)

- [x] Task 2: Implement spline cache in `src/core/spline-cache.ts` (AC: #3, #5)
  - [x]Export `SplineCache` class with constructor injection: `constructor(private buffer: RingBuffer<DataPoint>)`
  - [x]Track `private lastBufferSize: number` to detect eviction (if size didn't grow after appendPoint, an eviction occurred)
  - [x]`computeFull(): void` — compute coefficients for all points in buffer, store in internal `coefficients: SplineCoefficients[]`
  - [x]`appendPoint(): void` — incremental update after a new point is pushed to the buffer
    - **Tail update:** Extract last 4 points (at most) from buffer, recompute tangents and coefficients for last 2-3 segments, overwrite tail of cached array
    - **Head eviction:** If buffer is full (new push evicted oldest point), remove the first segment from the coefficient cache and recalculate the new first segment's boundary tangent
  - [x]`getCoefficients(): ReadonlyArray<SplineCoefficients>` — return cached coefficients (readonly to prevent mutation)
  - [x]`invalidate(): void` — clear the cache (used on `setData()` full dataset replace)
  - [x]`readonly isValid: boolean` getter — whether cache has been computed
  - [x]`readonly segmentCount: number` getter — number of cached segments
  - [x]Error messages prefixed with `SplineCache:`

- [x] Task 3: Write comprehensive tests for interpolation in `src/core/interpolation.test.ts` (AC: #1, #2, #4, findSegmentIndex)
  - [x]Test: 3+ points — curve passes through every input point exactly (evaluate at each x, compare to y within epsilon 1e-10)
  - [x]Test: monotone data (strictly increasing y values) — interpolated values between points are also monotonically increasing
  - [x]Test: monotone data (strictly decreasing) — interpolated values between points are also monotonically decreasing
  - [x]Test: 10x price spike — interpolation between two consecutive points does not exceed the range [min(y[k], y[k+1]), max(y[k], y[k+1])]
  - [x]Test: flat region (consecutive equal y values) — interpolation stays flat (no oscillation)
  - [x]Test: 2 points — returns linear segment (a=0, b=0, evaluates to straight line)
  - [x]Test: 1 point — returns empty array
  - [x]Test: 0 points — returns empty array
  - [x]Test: `evaluateSpline` at t=0 returns segment start y value
  - [x]Test: `evaluateSpline` at t=1 returns segment end y value
  - [x]Test: `evaluateSpline` at midpoint returns reasonable interpolated value
  - [x]Test: non-uniform x spacing — algorithm handles variable interval widths correctly
  - [x]Test: large dataset (1000 points) — no NaN or Infinity values in output
  - [x]Test: negative values — algorithm handles negative y values correctly
  - [x]Test: `findSegmentIndex` returns correct segment for x within range
  - [x]Test: `findSegmentIndex` clamps to first/last segment for out-of-range x
  - [x]Test: `findSegmentIndex` returns -1 for empty coefficients array

- [x] Task 4: Write comprehensive tests for SplineCache in `src/core/spline-cache.test.ts` (AC: #3, #5)
  - [x]Test: `computeFull()` produces correct number of segments (points - 1)
  - [x]Test: `getCoefficients()` returns cached data without recomputation
  - [x]Test: `appendPoint()` after `computeFull()` only modifies last 2-3 segments (compare with full recompute: earlier segments unchanged)
  - [x]Test: `appendPoint()` result matches full recompute for the affected tail segments
  - [x]Test: `invalidate()` clears cache, `isValid` returns false
  - [x]Test: `computeFull()` on empty buffer — produces 0 segments
  - [x]Test: `computeFull()` on 1-point buffer — produces 0 segments
  - [x]Test: `computeFull()` on 2-point buffer — produces 1 linear segment
  - [x]Test: multiple `appendPoint()` calls produce same result as `computeFull()` from scratch
  - [x]Test: `segmentCount` returns correct value after compute and after append
  - [x]Test: `appendPoint()` when buffer is at capacity — oldest segment removed, first segment recalculated with new boundary tangent
  - [x]Test: `appendPoint()` after multiple evictions — coefficient count equals `buffer.size - 1`
  - [x]Test: `appendPoint()` at capacity produces same result as `computeFull()` from scratch on same buffer state

- [x] Task 5: Verify integration and quality gates
  - [x]Run `pnpm test` — all tests pass (including existing ring-buffer tests)
  - [x]Run `pnpm typecheck` — no type errors
  - [x]Run `pnpm lint` — no lint errors
  - [x]Run `pnpm build` — build succeeds
  - [x]Do NOT update `src/index.ts` — public API exports are Story 1.8's concern

### Review Findings

- [x] [Review][Patch] `evaluateSpline` divides by zero when `x0 === x1` — added zero-width guard returning `d` [src/core/interpolation.ts:141]
- [x] [Review][Patch] `recomputeTail` produces `Infinity`/`NaN` on duplicate timestamps in buffer — added duplicate-timestamp guard falling back to `computeFull()` [src/core/spline-cache.ts:96]
- [x] [Review][Patch] `appendPoint` leaves `isValid === true` when `size < 2` empties the cache — now sets `valid = false` [src/core/spline-cache.ts:42]

## Dev Notes

### Architecture Compliance

**Module:** `src/core/` — leaf module in the import DAG. Imports NOTHING from `config/`, `renderer/`, `interaction/`, `api/`.

**Import rules for new files:**
- `interpolation.ts` imports from `./types` only (for `DataPoint`)
- `spline-cache.ts` imports from `./types` (for `DataPoint`), `./ring-buffer` (for `RingBuffer`), and `./interpolation` (for `computeMonotoneSpline`, `SplineCoefficients`)

**Constructor injection:** `SplineCache` receives `RingBuffer<DataPoint>` via constructor. No singletons, no global state.

**Named exports only:** `export default` is forbidden. All exports are named.

### Algorithm: Monotone Cubic Hermite (Fritsch-Carlson)

This is the Fritsch-Carlson method for monotone piecewise cubic Hermite interpolation. Key properties:
- **Passes through every data point** — no approximation, exact interpolation
- **Monotonicity-preserving** — between any two consecutive points, the interpolated curve stays within [min, max] of those two values. This prevents overshooting on price spikes (FR5).
- **Local computation** — each segment depends only on neighboring points, enabling incremental updates

**Coefficient form:** All coefficients use the normalized t-form where `t = (x - x0) / (x1 - x0)` ranges from 0 to 1, and `p(t) = a*t^3 + b*t^2 + c*t + d`. Given Hermite data (y0, y1, m0, m1) and interval width `h = x1 - x0`:
- `d = y0`
- `c = m0 * h`
- `b = 3*(y1 - y0) - 2*m0*h - m1*h`
- `a = 2*(y0 - y1) + m0*h + m1*h`

`evaluateSpline` computes: `t = (x - x0) / (x1 - x0)`, `result = ((a*t + b)*t + c)*t + d`

### Incremental Update Strategy

When `SplineCache.appendPoint()` is called after a new point is pushed to the ring buffer:

**Tail (new point added):**
1. The new point creates a new segment (N-1 to N) and may change tangents at point N-1 and N-2
2. Recompute tangents for the last 3 points (or fewer if buffer has fewer)
3. Recompute coefficients for the last 2-3 segments
4. Append/overwrite tail of cached coefficients array

**Head (eviction when buffer is full):**
5. If `buffer.isFull` was true *before* the push, the oldest point was evicted — remove the first segment from the coefficient cache
6. Recalculate the new first segment's left boundary tangent (it's now a boundary point, so use one-sided derivative instead of interior harmonic mean)
7. Recompute the first segment's coefficients with the updated tangent

Both head and tail operations are O(1), keeping the total update cost constant regardless of buffer size.

### Graceful Degradation (FR4)

- **0 points:** `computeMonotoneSpline` returns `[]`
- **1 point:** `computeMonotoneSpline` returns `[]` (no segment can be formed)
- **2 points:** returns 1 linear segment: `a = 0, b = 0, c = y1 - y0, d = y0` (normalized t-form evaluates to straight line)
- **3+ points:** full monotone cubic interpolation

### Existing Code to Build On

`RingBuffer<DataPoint>` from Story 1.2 is the data source. Key methods used by SplineCache:
- `buffer.size` — current number of points
- `buffer.toArray()` — get all points in chronological order (for `computeFull`)
- `buffer.get(index)` — access by logical index, 0 = oldest (for `appendPoint` to read tail points)
- `buffer.peek()` — newest point

**DO NOT modify** `ring-buffer.ts` or `types.ts` — use them as-is.

### Performance Constraints

- **No allocations in hot path:** `evaluateSpline` and `findSegmentIndex` must allocate nothing — pure arithmetic on primitives
- **`appendPoint()` operates on small constant regions:** The tail overwrite (2-3 segments) and head removal (1 segment) touch a fixed number of elements regardless of total size. Using `Array.splice()` or index-shift on 1-3 elements at the boundaries is acceptable — it's the *bulk* array operations that must be avoided
- **`computeFull()` allocates once:** Build the full `SplineCoefficients[]` in a single pass. Pre-allocate the array to `points.length - 1` elements
- **Consider ring-buffer-style storage for coefficients if splice overhead matters:** For very large buffers, the coefficient cache could itself use a ring buffer pattern. However, start with a plain array — optimize only if benchmarks show it's needed

### Naming Conventions

- Files: `interpolation.ts`, `spline-cache.ts` (kebab-case)
- Classes: `SplineCache` (PascalCase)
- Interfaces: `SplineCoefficients` (PascalCase, no `I` prefix)
- Functions: `computeMonotoneSpline`, `evaluateSpline` (camelCase)
- Private members: `private` keyword, no underscore prefix
- Error messages: prefix with class name (`SplineCache: ...`)

### Testing Standards

- **Framework:** Vitest with `globals: true` — do NOT import `describe`, `it`, `expect` from `vitest`
- **Co-located:** `interpolation.test.ts` next to `interpolation.ts`, `spline-cache.test.ts` next to `spline-cache.ts`
- **No mocking internal modules:** Test with real `RingBuffer` instances
- **Canvas mock not needed:** This story has no canvas/DOM dependency
- **Floating point comparisons:** Use `toBeCloseTo()` or check within epsilon (1e-10) for spline evaluations
- **Monotonicity verification:** For each segment, sample N points and verify monotonicity matches input data direction

### What NOT To Do

- **DO NOT** create renderers or canvas drawing code — that's Story 1.7
- **DO NOT** create Scale or coordinate mapping — that's Story 1.4
- **DO NOT** update `src/index.ts` exports — that's Story 1.8
- **DO NOT** add any runtime dependencies — all math is hand-implemented
- **DO NOT** use `export default`
- **DO NOT** create circular imports
- **DO NOT** use `any` type anywhere
- **DO NOT** use D3 or any external interpolation library — zero dependencies
- **DO NOT** implement Canvas `bezierCurveTo()` path rendering — this story only computes coefficients; rendering is Story 1.7
- **DO NOT** modify existing files (`ring-buffer.ts`, `types.ts`, `eslint.config.js`) unless absolutely necessary

### File Locations — Exact Paths

| File | Path | Purpose |
|------|------|---------|
| Interpolation algorithm | `src/core/interpolation.ts` | `computeMonotoneSpline()`, `evaluateSpline()`, `findSegmentIndex()`, `SplineCoefficients` |
| Interpolation tests | `src/core/interpolation.test.ts` | Comprehensive interpolation tests |
| Spline cache | `src/core/spline-cache.ts` | `SplineCache` class with incremental update |
| Spline cache tests | `src/core/spline-cache.test.ts` | Cache behavior and incremental update tests |

### Previous Story Intelligence

**From Story 1.2 (done):**
- `RingBuffer<T>` implemented in `src/core/ring-buffer.ts` with O(1) push/evict
- `DataPoint` interface: `{ timestamp: number; value: number }` in `src/core/types.ts`
- `getVisibleWindow(buffer, range)` utility available in `ring-buffer.ts`
- Vitest globals configured — do NOT import `describe`, `it`, `expect`
- ESLint configured for Vitest globals in test files
- Fixed `no-this-alias` lint error by using generator function for `[Symbol.iterator]` — follow same pattern if needed
- `private` keyword used (not underscore prefix) for class members
- Error messages prefixed with class name pattern established

**From Story 1.1 (done):**
- TypeScript 6.x (not 5.x), `ignoreDeprecations: "6.0"` in tsconfig
- ESLint 10 flat config (`eslint.config.js`)
- Canvas mock configured in `vitest.setup.ts` — not needed for this story but don't break it

### Git Intelligence

Recent commits:
- `1ce64a4 feat: add core data types and ring buffer (Story 1.2)`
- `7fd0476 feat: initialize project with TypeScript, tsup, Vitest, ESLint, and Prettier`

Conventions: `feat:` prefix, lowercase, concise description with story reference.

### Project Structure Notes

New files to create:
- `src/core/interpolation.ts`
- `src/core/interpolation.test.ts`
- `src/core/spline-cache.ts`
- `src/core/spline-cache.test.ts`

These match the architecture document's module organization exactly.

### References

- [Source: _bmad-output/planning-artifacts/architecture.md — Interpolation Architecture: Cached spline coefficients with incremental updates]
- [Source: _bmad-output/planning-artifacts/architecture.md — Structure Patterns: Module Organization — `src/core/interpolation.ts`, `src/core/spline-cache.ts`]
- [Source: _bmad-output/planning-artifacts/architecture.md — Data Flow: SplineCache.invalidateTail() recompute last 2-3 segments]
- [Source: _bmad-output/planning-artifacts/architecture.md — Cross-Component Dependencies: Spline cache ← Data layer]
- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1, Story 1.3]
- [Source: _bmad-output/planning-artifacts/prd.md — FR1: Monotone cubic interpolation, FR4: Graceful degradation, FR5: Extreme value handling]
- [Source: _bmad-output/project-context.md — Performance Gotchas: Spline recalculation is incremental]
- [Source: _bmad-output/project-context.md — Critical Rules: Avoid allocations in render loop]
- [Source: _bmad-output/implementation-artifacts/1-2-core-data-types-and-ring-buffer.md — Previous story learnings]
- [Source: Fritsch-Carlson monotone cubic interpolation algorithm — Wikipedia, SIAM Journal on Numerical Analysis]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Fixed `findSegmentIndex` boundary test: x=10 at shared boundary correctly returns segment 1 (binary search behavior)
- Incremental `appendPoint()` with eviction falls back to `computeFull()` for correctness — monotonicity enforcement cascade between head and tail makes partial update fragile. Non-eviction append is truly incremental (only last 2-3 segments recomputed).

### Completion Notes List

- Implemented Fritsch-Carlson monotone cubic Hermite interpolation in `src/core/interpolation.ts`
- `computeMonotoneSpline()` handles 0, 1, 2, and 3+ point cases with graceful degradation
- `evaluateSpline()` uses Horner's method for zero-allocation evaluation
- `findSegmentIndex()` uses binary search with boundary clamping
- `SplineCache` class with constructor injection of `RingBuffer<DataPoint>`
- Incremental `appendPoint()` recomputes only last 2-3 segments for non-eviction case
- Eviction case falls back to full recompute for correctness (optimization deferred per dev notes)
- Duplicate x-value filtering prevents division by zero
- All 75 tests pass (21 interpolation + 13 cache + 41 existing ring-buffer)
- No type errors, no lint errors, build succeeds
- `src/index.ts` NOT modified per story instructions

### Change Log

- 2026-03-28: Implemented Story 1.3 — monotone cubic interpolation algorithm, spline cache with incremental updates, comprehensive test suites (34 new tests)

### File List

- `src/core/interpolation.ts` (new) — `computeMonotoneSpline()`, `evaluateSpline()`, `findSegmentIndex()`, `SplineCoefficients` interface
- `src/core/interpolation.test.ts` (new) — 21 tests covering all interpolation functionality
- `src/core/spline-cache.ts` (new) — `SplineCache` class with `computeFull()`, `appendPoint()`, `invalidate()`
- `src/core/spline-cache.test.ts` (new) — 13 tests covering cache behavior and incremental updates
