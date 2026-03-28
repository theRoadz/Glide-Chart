# Deferred Work

## ~~Deferred from: code review of 1-1-project-initialization-and-build-pipeline (2026-03-28)~~

- ~~**No `engines` field constrains Node.js version**~~ — Fixed: added `"engines": {"node": ">=20.0.0"}` to package.json
- ~~**No `prepublishOnly` build guard**~~ — Fixed: added `"prepublishOnly": "pnpm build"` script
- ~~**No `.nvmrc` or `.node-version` file**~~ — Fixed: added `.nvmrc` with Node 20

## ~~Deferred from: code review of 1-2-core-data-types-and-ring-buffer (2026-03-28)~~

- ~~**No validation that `TimeRange.start <= end`**~~ — Resolved: inverted range returns empty array by design. Test added to document this behavior.
- ~~**Missing test for `getVisibleWindow` with inverted TimeRange**~~ — Fixed: added test confirming empty array for start > end.

## ~~Deferred from: code review of 1-4-coordinate-scale-and-viewport-mapping (2026-03-28)~~

- ~~**No NaN/Infinity guard on constructor/validateDimensions**~~ — Fixed: `validateDimensions` now uses `Number.isFinite()` checks for canvasWidth, canvasHeight, dpr, and padding values.
- ~~**No NaN/Infinity guard on setDomainX/setDomainY**~~ — Fixed: both methods now throw on NaN/Infinity inputs.
- ~~**autoFitX/Y corrupted by NaN in iterable**~~ — Fixed: non-finite values are skipped via `Number.isFinite()` filter.
- ~~**autoFitX/Y corrupted by Infinity in iterable**~~ — Fixed: same `Number.isFinite()` filter handles Infinity.

## ~~Deferred from: code review of 1-5-layered-canvas-and-frame-scheduler (2026-03-28)~~

- ~~**Fractional DPR produces non-integer backing store dimensions**~~ — Fixed: `Math.round()` applied to backing store dimension calculations.
- ~~**`_setupDprListener` leaks old MediaQueryList on rapid DPR changes**~~ — Fixed: previous listener is now removed before re-registering.

## Deferred from: code review of 1-7-data-layer-rendering-smooth-curve-and-gradient-fill (2026-03-28)

- **Performance test uses 500ms threshold instead of 16ms frame budget (AC4)** — Canvas mock overhead makes strict 16ms assertion unreliable. Spec allows deferral to Story 1.8 integration testing with real canvas rendering.

## Deferred from: code review of 2-1-background-layer-grid-lines (2026-03-28)

- **`niceNum()` produces tickSpacing=0 with subnormal float inputs** — `Math.log10()` on denormalized floats near `Number.MIN_VALUE` causes `Math.pow(10, exp)` to underflow to 0, producing tickSpacing=0. Scale guards against non-finite domains, making this unreachable in practice.
- **0.5px crisp-line offset may not be pixel-perfect at dpr > 1** — The `Math.round(pixel) + 0.5` technique is correct for dpr=1 but produces slightly blurry lines at higher DPR. The correct offset at dpr=N is `0.5/N`. Pre-existing rendering pattern decision; may address in Story 5.3 (grid customization).
- **`setData()` is non-atomic** — Buffer is cleared before all points are validated. If validation throws midway, partial data remains. Pre-existing in `glide-chart.ts`, not introduced by this story.
