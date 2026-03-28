# Deferred Work

## Deferred from: code review of 1-1-project-initialization-and-build-pipeline (2026-03-28)

- **No `engines` field constrains Node.js version** — ESLint 10 requires Node ^20.19.0, Vitest 4 requires ^20.0.0. Without an `engines` field, contributors on unsupported Node versions get cryptic failures.
- **No `prepublishOnly` build guard** — No lifecycle script ensures `pnpm build` runs before `npm publish`. Stale or empty `dist/` artifacts could be published.
- **No `.nvmrc` or `.node-version` file** — No pinned Node version for contributors using nvm/fnm/mise. Increases chance of environment mismatches.
