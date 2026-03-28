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
