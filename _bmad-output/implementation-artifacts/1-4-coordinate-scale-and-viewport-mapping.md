# Story 1.4: Coordinate Scale & Viewport Mapping

Status: done

## Story

As a developer using Glide Chart,
I want a Scale system that maps data coordinates to pixel coordinates,
So that all rendering components use consistent, accurate positioning.

## Acceptance Criteria

1. **Given** a dataset with a time range and value range **When** the Scale is computed for a given canvas size **Then** `xToPixel(timestamp)` correctly maps time to horizontal position
2. **Given** a dataset with a time range and value range **When** the Scale is computed **Then** `yToPixel(value)` correctly maps value to vertical position (y-axis is inverted: higher values = lower pixel y)
3. **Given** a dataset **When** the Scale auto-calculates domain bounds **Then** appropriate min/max with padding are computed so data doesn't touch canvas edges
4. **Given** a canvas with a known devicePixelRatio **When** the Scale is computed **Then** DPR is accounted for in all pixel calculations
5. **Given** a canvas that resizes **When** `update()` is called with new dimensions **Then** the Scale recalculates all mappings correctly
6. **Given** pixel coordinates from user interaction **When** inverse mapping is needed **Then** `pixelToX(px)` and `pixelToY(py)` return correct data-space values (needed by crosshair/tooltip in Story 4.1-4.2)

## Tasks / Subtasks

- [x] Task 1: Define Scale types in `src/core/types.ts` (AC: #1-#6)
  - [x] Add `Viewport` interface: `{ x: number; y: number; width: number; height: number }` — the drawable area inside padding
  - [x] Add `ScaleDomain` interface: `{ min: number; max: number }` — data-space bounds for one axis
  - [x] Add `Padding` interface: `{ top: number; right: number; bottom: number; left: number }`
  - [x] Add `ScaleOptions` interface:
    ```typescript
    export interface ScaleOptions {
      canvasWidth: number;
      canvasHeight: number;
      dpr: number;
      padding: Padding;
    }
    ```
  - [x] Do NOT remove or modify existing types (`DataPoint`, `Series`, `TimeRange`)

- [x] Task 2: Implement Scale class in `src/core/scale.ts` (AC: #1-#6)
  - [x] Constructor: `constructor(options: ScaleOptions)`
    - Accept `canvasWidth`, `canvasHeight`, `dpr`, `padding` (top/right/bottom/left)
    - Compute initial `Viewport` from canvas size minus padding
    - Store DPR for pixel calculations
  - [x] `update(canvasWidth: number, canvasHeight: number, dpr: number): void`
    - Recalculate viewport when canvas resizes
    - Called by LayerManager on ResizeObserver callback (Story 1.5)
  - [x] `setDomainX(min: number, max: number): void` — set time-axis domain
    - If `min > max`, swap them (defensive — don't throw, just correct silently)
    - If `min === max`, store as-is; zero-width guard handles mapping
  - [x] `setDomainY(min: number, max: number): void` — set value-axis domain
    - Same swap-if-inverted behavior as `setDomainX`
  - [x] `autoFitY(values: Iterable<number>, paddingPercent?: number): void`
    - Scan values for min/max, apply percentage padding (default 10%)
    - Handle edge cases: empty values (set domain 0-1), single value (pad ±1), all same value (pad ±1)
  - [x] `autoFitX(timestamps: Iterable<number>, paddingPercent?: number): void`
    - Same pattern for time axis: scan for min/max, apply padding
    - For time axis, default padding can be 0% (exact fit) since time windows are usually precise
  - [x] `xToPixel(timestamp: number): number` — maps data x to canvas pixel x
    - Formula: `viewport.x + ((timestamp - domainX.min) / (domainX.max - domainX.min)) * viewport.width`
    - Returns CSS pixel coordinates (DPR-independent, since canvas context is already scaled by DPR via `ctx.scale(dpr, dpr)`)
  - [x] `yToPixel(value: number): number` — maps data y to canvas pixel y (INVERTED: canvas y=0 is top)
    - Formula: `viewport.y + viewport.height - ((value - domainY.min) / (domainY.max - domainY.min)) * viewport.height`
  - [x] `pixelToX(px: number): number` — inverse of xToPixel (for crosshair interaction)
    - Formula: `domainX.min + ((px - viewport.x) / viewport.width) * (domainX.max - domainX.min)`
  - [x] `pixelToY(py: number): number` — inverse of yToPixel (for crosshair interaction)
    - Formula: `domainY.min + ((viewport.y + viewport.height - py) / viewport.height) * (domainY.max - domainY.min)`
  - [x] Readonly getters: `readonly viewport: Viewport`, `readonly domainX: ScaleDomain`, `readonly domainY: ScaleDomain`, `readonly dpr: number`
  - [x] Input validation (constructor and `update()`):
    - `canvasWidth` must be > 0 — throw `Scale: canvasWidth must be positive`
    - `canvasHeight` must be > 0 — throw `Scale: canvasHeight must be positive`
    - `dpr` must be > 0 — throw `Scale: dpr must be positive`
    - Padding values must be >= 0 — throw `Scale: padding values must be non-negative`
    - Padding must not consume entire canvas (viewport width/height must be > 0) — throw `Scale: padding exceeds canvas dimensions`
  - [x] Guard against zero-width domains: if `domainX.max === domainX.min`, map all points to viewport center
  - [x] Out-of-domain behavior: `xToPixel`/`yToPixel` extrapolate linearly beyond the domain (returning pixel values outside the viewport). This is correct — renderers clip via canvas bounds. Do NOT clamp.
  - [x] Error messages prefixed with `Scale:`

- [x] Task 3: Write comprehensive tests in `src/core/scale.test.ts` (AC: #1-#6)
  - [x] Test: constructor creates correct viewport from canvas size and padding
  - [x] Test: `xToPixel` maps domain min to viewport left edge, domain max to viewport right edge
  - [x] Test: `yToPixel` maps domain min to viewport BOTTOM edge, domain max to viewport TOP edge (inverted y)
  - [x] Test: `xToPixel` maps domain midpoint to viewport horizontal center
  - [x] Test: `yToPixel` maps domain midpoint to viewport vertical center
  - [x] Test: `pixelToX` is exact inverse of `xToPixel` (round-trip: `pixelToX(xToPixel(v)) === v`)
  - [x] Test: `pixelToY` is exact inverse of `yToPixel` (round-trip)
  - [x] Test: `update()` recalculates viewport correctly with new canvas size
  - [x] Test: `autoFitY` with normal dataset computes min/max with 10% padding
  - [x] Test: `autoFitY` with empty values defaults to domain 0-1
  - [x] Test: `autoFitY` with single value pads ±1
  - [x] Test: `autoFitY` with all identical values pads ±1
  - [x] Test: `autoFitX` with normal timestamps computes exact domain (0% default padding)
  - [x] Test: `autoFitX` with empty timestamps defaults to domain 0-1
  - [x] Test: `autoFitX` with single timestamp pads ±1
  - [x] Test: `autoFitX` with all identical timestamps pads ±1
  - [x] Test: zero-width domain (min === max) maps to viewport center, does not throw or produce NaN/Infinity
  - [x] Test: DPR is stored and accessible via getter
  - [x] Test: padding reduces viewport correctly (e.g., canvas 800x600, padding 50 all sides → viewport 700x500 at offset 50,50)
  - [x] Test: asymmetric padding (different values per side) computes viewport correctly
  - [x] Test: `setDomainX` / `setDomainY` update the domain and affect subsequent pixel calculations
  - [x] Test: negative values in domain map correctly (e.g., domain -100 to 100)
  - [x] Test: very large domains (timestamps in milliseconds, e.g., 1.7 trillion) don't lose precision
  - [x] Test: constructor throws on non-positive canvasWidth
  - [x] Test: constructor throws on non-positive canvasHeight
  - [x] Test: constructor throws on non-positive dpr
  - [x] Test: constructor throws on negative padding values
  - [x] Test: constructor throws when padding exceeds canvas dimensions
  - [x] Test: `update()` with new DPR value updates the stored dpr
  - [x] Test: `update()` with new canvas size recalculates viewport and mapping
  - [x] Test: `setDomainX` with min > max silently swaps values
  - [x] Test: `setDomainY` with min > max silently swaps values
  - [x] Test: `xToPixel` with value outside domain extrapolates (returns pixel outside viewport)
  - [x] Test: `yToPixel` with value outside domain extrapolates (returns pixel outside viewport)

- [x] Task 4: Verify integration and quality gates
  - [x] Run `pnpm test` — all tests pass (including existing ring-buffer and interpolation tests)
  - [x] Run `pnpm typecheck` — no type errors
  - [x] Run `pnpm lint` — no lint errors
  - [x] Run `pnpm build` — build succeeds
  - [x] Do NOT update `src/index.ts` — public API exports are Story 1.8's concern

### Review Findings

- [x] [Review][Patch] Getters expose mutable internal objects — fixed: return types now `Readonly<>` [src/core/scale.ts:23-33]
- [x] [Review][Patch] Constructor stores padding by reference — fixed: shallow copy via spread [src/core/scale.ts:14]
- [x] [Review][Dismiss] Private fields use underscore prefix — needed to avoid name collision with public getters; existing classes (ring-buffer, spline-cache) don't have this collision because they lack same-name getters
- [x] [Review][Defer] No NaN/Infinity guard on constructor/validateDimensions — NaN passes `<= 0` checks silently [src/core/scale.ts:143-155] — deferred, systemic input validation pattern across codebase
- [x] [Review][Defer] No NaN/Infinity guard on setDomainX/setDomainY — NaN inputs produce NaN inverse [src/core/scale.ts:47-63] — deferred, systemic input validation pattern
- [x] [Review][Defer] autoFitX/Y corrupted by NaN or Infinity in iterable — NaN poisons hasValues without updating min/max [src/core/scale.ts:65-113] — deferred, systemic input validation pattern
- [x] [Review][Defer] autoFitX/Y corrupted by Infinity in iterable — Infinity - Infinity = NaN for range [src/core/scale.ts:65-113] — deferred, systemic input validation pattern

## Dev Notes

### Architecture Compliance

**Module:** `src/core/` — leaf module in the import DAG. Imports NOTHING from `config/`, `renderer/`, `interaction/`, `api/`.

**Import rules for new files:**
- `scale.ts` imports from `./types` only (for `Viewport`, `ScaleDomain`, `ScaleOptions`)

**Constructor injection:** The `Scale` instance is created by the `GlideChart` facade (Story 1.8) and passed to all layer renderers. Layer renderers receive Scale via constructor — they never create their own Scale instance.

**Named exports only:** `export default` is forbidden. All exports are named.

### Scale Design Rationale

The Scale is a **shared coordinate authority** — every layer renderer uses the same Scale instance for data-to-pixel mapping. This prevents drift between layers (e.g., data curve doesn't align with grid lines).

**CSS pixels vs. backing store pixels:**
The Scale operates in CSS pixel space, NOT backing-store pixel space. The `LayerManager` (Story 1.5) applies `ctx.scale(dpr, dpr)` on each canvas context, so renderers work in CSS pixels and the context automatically maps to physical pixels. This means:
- `xToPixel()` / `yToPixel()` return CSS pixel values
- DPR is stored on Scale for reference (canvas sizing needs it) but does NOT multiply into the coordinate mapping formulas
- Layer renderers draw using CSS pixel coordinates — the canvas context handles DPR scaling

**Viewport padding:**
Padding reserves space for axes labels and tick marks. The axis layer (Story 2.2/2.3) renders in the padding area; the data layer renders inside the viewport. Typical defaults:
- `top: 10` — small buffer above highest data
- `right: 10` — small buffer after latest timestamp
- `bottom: 30` — space for x-axis labels
- `left: 60` — space for y-axis labels

These values come from ResolvedConfig (Story 1.6). For Story 1.4, accept them as constructor parameters.

### Auto-Fit Domain Calculation

**Y-axis auto-fit (`autoFitY`):**
1. Scan all visible values for min and max
2. Apply padding: `paddedMin = min - (max - min) * paddingPercent`, `paddedMax = max + (max - min) * paddingPercent`
3. Edge cases:
   - Empty: domain = `{ min: 0, max: 1 }`
   - Single value or all same: domain = `{ min: value - 1, max: value + 1 }`

**X-axis auto-fit (`autoFitX`):**
Same pattern, but default paddingPercent = 0 (time windows are usually exact).

### Zero-Width Domain Guard

When `domain.max === domain.min` (can happen with a single data point or flat data after autoFit edge case handling), the mapping formula would divide by zero. Guard:
```
if (domainX.max === domainX.min) → map to viewport.x + viewport.width / 2
if (domainY.max === domainY.min) → map to viewport.y + viewport.height / 2
```

### How Scale Integrates with Other Components

From the architecture data flow:
```
Consumer calls chart.addData(seriesId, point)
  → RingBuffer.push(point)
    → SplineCache.appendPoint()
      → FrameScheduler.markDirty(LayerType.Data)
        → Next rAF frame:
          → Scale.update() ← recalculate if data range changed
          → DataLayer.draw(config, scale) ← uses scale for coordinate conversion
          → AxisLayer.draw(config, scale) ← uses scale for tick positions
```

Every layer's `draw()` signature is: `draw(config: ResolvedConfig, scale: Scale): void`

### DPR Runtime Change Awareness

`devicePixelRatio` can change at runtime (e.g., user drags window between monitors, or changes OS display scaling). Fractional DPR values (1.25, 1.5, 2.25) are common on Windows/Android. Scale stores DPR but does NOT need to handle DPR-change detection — that's `LayerManager`'s job (Story 1.5) via `matchMedia(\`(resolution: ${dpr}dppx)\`)`. When DPR changes, LayerManager calls `scale.update(width, height, newDpr)`.

### Performance Constraints

- **No allocations in `xToPixel` / `yToPixel` / `pixelToX` / `pixelToY`:** These are called thousands of times per frame (once per data point per draw). Pure arithmetic only — no object creation, no closures, no string operations.
- **Precompute reciprocals:** When `setDomainX`/`setDomainY`/`autoFitX`/`autoFitY` are called, precompute `1 / (max - min)` and store it. Use multiplication instead of division in `xToPixel`/`yToPixel` for faster hot-path execution.
- **`autoFitY` / `autoFitX` allocate nothing** beyond iterating the input. Use a simple min/max scan loop over the iterable — no `Math.min(...spread)` which would allocate an argument array.
- **`update()` is called on resize only** — not per frame. Simple arithmetic, no performance concern.

### Existing Code to Build On

**From Story 1.2 — `src/core/types.ts`:**
```typescript
export interface DataPoint { timestamp: number; value: number; }
export interface Series { id: string; data: DataPoint[]; }
export interface TimeRange { start: number; end: number; }
```

Add `Viewport`, `ScaleDomain`, `Padding`, and `ScaleOptions` to this file. Do NOT remove existing types.

**From Story 1.3 — `src/core/interpolation.ts` and `src/core/spline-cache.ts`:**
Scale does not depend on these. But the data-layer renderer (Story 1.7) will use both Scale and SplineCache together. Scale maps the spline's data-space x values to pixel coordinates.

### Naming Conventions

- Files: `scale.ts`, `scale.test.ts` (kebab-case)
- Class: `Scale` (PascalCase)
- Interfaces: `Viewport`, `ScaleDomain`, `ScaleOptions`, `Padding` (PascalCase, no `I` prefix)
- Methods: `xToPixel`, `yToPixel`, `pixelToX`, `pixelToY`, `autoFitX`, `autoFitY` (camelCase)
- Private members: `private` keyword, no underscore prefix
- Error messages: prefix with `Scale:` (e.g., `throw new Error('Scale: canvasWidth must be positive')`)

### Testing Standards

- **Framework:** Vitest with `globals: true` — do NOT import `describe`, `it`, `expect` from `vitest`
- **Co-located:** `scale.test.ts` next to `scale.ts` in `src/core/`
- **No mocking internal modules:** Test with real values and math verification
- **Canvas mock not needed:** This story has no canvas/DOM dependency — Scale is pure math
- **Floating point comparisons:** Use `toBeCloseTo()` for round-trip tests where floating point drift is possible
- **Large number precision:** Test with Unix millisecond timestamps (e.g., `1711900000000`) to verify no precision loss

### What NOT To Do

- **DO NOT** create canvas elements or touch the DOM — that's Story 1.5
- **DO NOT** create config resolver or theme logic — that's Story 1.6
- **DO NOT** render anything on canvas — that's Story 1.7
- **DO NOT** update `src/index.ts` exports — that's Story 1.8
- **DO NOT** add any runtime dependencies
- **DO NOT** use `export default`
- **DO NOT** create circular imports
- **DO NOT** use `any` type anywhere
- **DO NOT** modify existing files (`ring-buffer.ts`, `interpolation.ts`, `spline-cache.ts`) — only add to `types.ts`

### File Locations — Exact Paths

| File | Path | Purpose |
|------|------|---------|
| Scale types | `src/core/types.ts` | Add `Viewport`, `ScaleDomain`, `Padding`, `ScaleOptions` interfaces |
| Scale class | `src/core/scale.ts` | `Scale` class with coordinate mapping methods |
| Scale tests | `src/core/scale.test.ts` | Comprehensive coordinate mapping tests |

### Previous Story Intelligence

**From Story 1.3 (done):**
- Fritsch-Carlson monotone cubic interpolation implemented in `src/core/interpolation.ts`
- `SplineCache` class in `src/core/spline-cache.ts` with constructor injection of `RingBuffer<DataPoint>`
- Vitest globals confirmed working — do NOT import `describe`, `it`, `expect`
- `private` keyword used (not underscore prefix) for class members
- Error messages prefixed with class name pattern established
- Eviction case in SplineCache falls back to `computeFull()` — noted as a pattern decision
- Review found: `evaluateSpline` divides by zero when `x0 === x1` — **same zero-division risk exists in Scale when domain width is zero; make sure to guard against it**

**From Story 1.2 (done):**
- `RingBuffer<T>` in `src/core/ring-buffer.ts` — O(1) push/evict
- `DataPoint` interface: `{ timestamp: number; value: number }` in `src/core/types.ts`
- `getVisibleWindow(buffer, range)` utility — returns `DataPoint[]` filtered by time range
- Fixed `no-this-alias` lint error by using generator function for `[Symbol.iterator]`

**From Story 1.1 (done):**
- TypeScript 6.x (not 5.x), `ignoreDeprecations: "6.0"` in tsconfig
- ESLint 10 flat config (`eslint.config.js`)
- Canvas mock configured in `vitest.setup.ts` — not needed for this story

### Git Intelligence

Recent commits:
- `5fbbb1e feat: add monotone cubic interpolation and spline cache (Story 1.3)`
- `1ce64a4 feat: add core data types and ring buffer (Story 1.2)`
- `7fd0476 feat: initialize project with TypeScript, tsup, Vitest, ESLint, and Prettier`

Conventions: `feat:` prefix, lowercase, concise description with story reference.

### Project Structure Notes

Files to create:
- `src/core/scale.ts` (new)
- `src/core/scale.test.ts` (new)

File to modify:
- `src/core/types.ts` (add `Viewport`, `ScaleDomain`, `ScaleOptions` interfaces — do NOT remove existing types)

These match the architecture document's module organization exactly: `src/core/scale.ts` is listed in the structure.

### References

- [Source: _bmad-output/planning-artifacts/architecture.md — Structure Patterns: Module Organization — `src/core/scale.ts`]
- [Source: _bmad-output/planning-artifacts/architecture.md — Coordinate Conversion — all data-to-pixel via shared Scale object]
- [Source: _bmad-output/planning-artifacts/architecture.md — Canvas Drawing Conventions — `draw(config, scale)` signature]
- [Source: _bmad-output/planning-artifacts/architecture.md — Data Flow — `Scale.update()` recalculate on range change]
- [Source: _bmad-output/planning-artifacts/architecture.md — DPR handling — canvas dimensions at clientWidth*dpr]
- [Source: _bmad-output/planning-artifacts/architecture.md — Ownership Hierarchy — Scale is shared coordinate mapping]
- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1, Story 1.4]
- [Source: _bmad-output/project-context.md — All coordinate conversion through shared Scale object]
- [Source: _bmad-output/project-context.md — Canvas context: save()/restore() per layer, ctx.scale(dpr, dpr)]
- [Source: _bmad-output/project-context.md — Performance Gotchas: Avoid allocations in render loop]
- [Source: _bmad-output/implementation-artifacts/1-3-monotone-cubic-interpolation-and-spline-cache.md — Previous story learnings]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Fixed unused `Padding` import in test file caught by `tsc --noEmit`

### Completion Notes List

- Added 4 new interfaces (`Viewport`, `ScaleDomain`, `Padding`, `ScaleOptions`) to `src/core/types.ts` without modifying existing types
- Implemented `Scale` class in `src/core/scale.ts` with all coordinate mapping methods (`xToPixel`, `yToPixel`, `pixelToX`, `pixelToY`), domain management (`setDomainX`, `setDomainY`, `autoFitX`, `autoFitY`), viewport calculation, and `update()` for resize handling
- Performance optimization: precomputed inverse domain widths for hot-path multiplication instead of division
- Zero-width domain guard maps to viewport center (no NaN/Infinity)
- Inverted min/max silently swapped (defensive behavior)
- All edge cases handled: empty iterables, single values, identical values
- 30 tests covering all acceptance criteria, edge cases, validation, round-trips, large timestamps, negative domains, and extrapolation
- All 109 tests pass (including existing ring-buffer and interpolation tests), typecheck clean, lint clean, build succeeds

### Change Log

- 2026-03-28: Implemented Story 1.4 — Scale class with coordinate mapping, viewport computation, auto-fit domain calculation, and comprehensive test suite

### File List

- `src/core/types.ts` (modified) — added `Viewport`, `ScaleDomain`, `Padding`, `ScaleOptions` interfaces
- `src/core/scale.ts` (new) — `Scale` class with coordinate mapping methods
- `src/core/scale.test.ts` (new) — 30 comprehensive tests for Scale
