# Deferred Work

## ~~Deferred from: code review of 1-1-project-initialization-and-build-pipeline (2026-03-28)~~

- ~~**No `engines` field constrains Node.js version**~~ — Fixed: added `"engines": {"node": ">=20.0.0"}` to package.json
- ~~**No `prepublishOnly` build guard**~~ — Fixed: added `"prepublishOnly": "pnpm build"` script
- ~~**No `.nvmrc` or `.node-version` file**~~ — Fixed: added `.nvmrc` with Node 20

## ~~Deferred from: code review of 1-2-core-data-types-and-ring-buffer (2026-03-28)~~

- ~~**No validation that `TimeRange.start <= end`**~~ — Resolved: inverted range returns empty array by design. Test added to document this behavior.
- ~~**Missing test for `getVisibleWindow` with inverted TimeRange**~~ — Fixed: added test confirming empty array for start > end.

## Deferred from: code review of 1-4-coordinate-scale-and-viewport-mapping (2026-03-28)

- **No NaN/Infinity guard on constructor/validateDimensions** — NaN passes `<= 0` checks silently; Infinity produces nonsensical viewport. Systemic input validation pattern applies across entire codebase.
- **No NaN/Infinity guard on setDomainX/setDomainY** — NaN inputs produce NaN inverse, poisoning all mappings. Same systemic pattern.
- **autoFitX/Y corrupted by NaN in iterable** — NaN sets `hasValues=true` without updating min/max, leaving Infinity/-Infinity domain. Same systemic pattern.
- **autoFitX/Y corrupted by Infinity in iterable** — `Infinity - Infinity = NaN` for range, producing NaN domain. Same systemic pattern.
