# Deferred Work

## ~~Deferred from: code review of 1-1-project-initialization-and-build-pipeline (2026-03-28)~~

- ~~**No `engines` field constrains Node.js version**~~ — Fixed: added `"engines": {"node": ">=20.0.0"}` to package.json
- ~~**No `prepublishOnly` build guard**~~ — Fixed: added `"prepublishOnly": "pnpm build"` script
- ~~**No `.nvmrc` or `.node-version` file**~~ — Fixed: added `.nvmrc` with Node 20

## ~~Deferred from: code review of 1-2-core-data-types-and-ring-buffer (2026-03-28)~~

- ~~**No validation that `TimeRange.start <= end`**~~ — Resolved: inverted range returns empty array by design. Test added to document this behavior.
- ~~**Missing test for `getVisibleWindow` with inverted TimeRange**~~ — Fixed: added test confirming empty array for start > end.
