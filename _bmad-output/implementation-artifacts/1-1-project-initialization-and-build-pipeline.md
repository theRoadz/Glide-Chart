# Story 1.1: Project Initialization & Build Pipeline

Status: done

## Story

As a developer contributing to Glide Chart,
I want a fully configured TypeScript project with build tooling, test framework, and package exports,
So that I have a working foundation to build the library on.

## Acceptance Criteria

1. **Given** a fresh clone of the repository **When** I run `pnpm install && pnpm build` **Then** ESM and CJS bundles are generated in `dist/`
2. **Given** the build completes **Then** TypeScript declaration files (`.d.ts`) are generated alongside bundles
3. **Given** the project TypeScript config **Then** strict mode is enabled with no `any` types permitted
4. **Given** the test framework **When** I run `pnpm test` **Then** Vitest runs successfully with a placeholder test passing
5. **Given** the `package.json` **Then** correct `exports` map exists for `.` and `./react` entry points
6. **Given** the `package.json` **Then** `sideEffects: false` is set for tree-shaking
7. **Given** the project root **Then** an MIT LICENSE file is present
8. **Given** `package.json` dependencies **Then** zero runtime dependencies exist (all deps are devDependencies)

## Tasks / Subtasks

- [x] Task 1: Initialize pnpm project and install dev dependencies (AC: #1, #8)
  - [x] Run `pnpm init` in project root
  - [x] Install dev dependencies: `typescript tsup vitest @vitest/coverage-v8 vitest-canvas-mock eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser prettier`
  - [x] Verify zero `dependencies` in package.json — everything under `devDependencies`
- [x] Task 2: Configure TypeScript (AC: #3)
  - [x] Create `tsconfig.json` — strict: true, target: ES2020, module: ESNext, moduleResolution: Bundler, no `any`, noUncheckedIndexedAccess: true
  - [x] Create `tsconfig.build.json` — extends base, excludes `**/*.test.ts` and test utilities
- [x] Task 3: Configure tsup for ESM + CJS builds (AC: #1, #2, #5)
  - [x] Create `tsup.config.ts` with two entry points: `src/index.ts` and `src/react/index.ts`
  - [x] Output formats: ESM (`.js`) + CJS (`.cjs`)
  - [x] Enable `dts: true` for declaration file generation
  - [x] Set `clean: true` to clear dist before builds
  - [x] Mark `react` and `react-dom` as external
- [x] Task 4: Configure package.json exports and metadata (AC: #5, #6)
  - [x] Set `"type": "module"` for ESM-first
  - [x] Add `main`, `module`, `types` fields
  - [x] Add `exports` map for `.` and `./react` with import/require/types conditions
  - [x] Set `"sideEffects": false`
  - [x] Set `"files": ["dist"]`
  - [x] Add pnpm scripts: `build`, `dev`, `test`, `test:coverage`, `lint`, `typecheck`
- [x] Task 5: Configure Vitest (AC: #4)
  - [x] Create `vitest.config.ts` with coverage provider v8
  - [x] Configure include pattern: `src/**/*.test.ts`
  - [x] Setup vitest-canvas-mock in a setup file for Canvas 2D API mocking
- [x] Task 6: Configure ESLint + Prettier (AC: #3)
  - [x] Create `eslint.config.js` with TypeScript parser, no-explicit-any rule (flat config for ESLint 10)
  - [x] Create `.prettierrc` with project formatting rules
- [x] Task 7: Create source directory structure and entry points (AC: #1)
  - [x] Create `src/index.ts` — main entry point (empty named export placeholder)
  - [x] Create `src/react/index.ts` — React entry point (empty named export placeholder)
  - [x] Create directory stubs: `src/core/`, `src/renderer/`, `src/renderer/layers/`, `src/interaction/`, `src/config/`, `src/api/`, `src/widget/`
- [x] Task 8: Create placeholder test (AC: #4)
  - [x] Create `src/core/placeholder.test.ts` with a passing sanity test
- [x] Task 9: Create project files (AC: #7)
  - [x] Create MIT LICENSE file with current year
  - [x] Create `.gitignore` — node_modules, dist, coverage, .env, IDE files
- [x] Task 10: Validate the full pipeline (AC: #1, #2, #4)
  - [x] Run `pnpm install` — succeeds with no errors
  - [x] Run `pnpm typecheck` — `tsc --noEmit` passes
  - [x] Run `pnpm test` — placeholder test passes
  - [x] Run `pnpm build` — ESM, CJS, and .d.ts files appear in `dist/`
  - [x] Verify `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts` exist
  - [x] Verify `dist/react.js`, `dist/react.cjs`, `dist/react.d.ts` exist

## Dev Notes

### Architecture Compliance

**Import DAG (strictly enforced):**
`core/` imports nothing; `config/` -> core; `renderer/` -> core, config; `interaction/` -> core, config, renderer/types; `api/` -> all; `react/` -> api only; `widget/` -> api only.

This story only creates empty entry points — no cross-module imports yet. But the directory structure must match the architecture exactly.

**Named exports only** — `export default` is forbidden everywhere. Entry points use `export { }` or `export type { }`.

### Technical Stack — Exact Versions & Config

| Tool | Version | Notes |
|------|---------|-------|
| TypeScript | 5.x (latest stable) | strict: true, target ES2020 |
| tsup | latest stable | ESM + CJS, dts generation |
| esbuild | (bundled with tsup) | UMD build is a LATER story, not this one |
| Vitest | latest stable | v8 coverage provider |
| vitest-canvas-mock | latest stable | Canvas 2D API mocking for tests |
| @vitest/coverage-v8 | latest stable | Coverage reporting |
| ESLint | latest stable | TypeScript parser |
| Prettier | latest stable | Code formatting |
| pnpm | user's installed version | Only package manager allowed |

### tsup.config.ts — Required Shape

```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    react: 'src/react/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  external: ['react', 'react-dom'],
  splitting: false,
  sourcemap: true,
})
```

### tsconfig.json — Required Shape

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": false,
    "jsx": "react-jsx",
    "lib": ["ES2020", "DOM", "DOM.Iterable"]
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

### tsconfig.build.json — Required Shape

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "dist", "**/*.test.ts", "**/*.test.tsx"]
}
```

### vitest.config.ts — Required Shape

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules', 'dist'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/types.ts', 'src/index.ts', 'src/react/index.ts'],
    },
    clearMocks: true,
    restoreMocks: true,
  },
})
```

### vitest.setup.ts — Canvas Mock Setup

```typescript
import 'vitest-canvas-mock'
```

### package.json — Required exports Map

```json
{
  "name": "glide-chart",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    },
    "./react": {
      "import": "./dist/react.js",
      "require": "./dist/react.cjs",
      "types": "./dist/react.d.ts"
    }
  },
  "files": ["dist"],
  "sideEffects": false,
  "license": "MIT",
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest",
    "test:coverage": "vitest --coverage",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  }
}
```

**Note:** The `build` script is just `tsup` for this story. The UMD esbuild step (`tsup && node scripts/build-umd.js`) is added in a later story (Epic 7 - Widget Bundle).

### Complete Directory Structure to Create

```
glide-chart/
├── .eslintrc.cjs
├── .gitignore
├── .prettierrc
├── LICENSE
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── tsup.config.ts
├── vitest.config.ts
├── vitest.setup.ts
├── src/
│   ├── index.ts                    # Main entry — placeholder named export
│   ├── core/
│   │   ├── types.ts                # (empty, created for structure)
│   │   └── placeholder.test.ts     # Sanity test
│   ├── renderer/
│   │   ├── types.ts                # (empty)
│   │   └── layers/
│   ├── interaction/
│   │   └── types.ts                # (empty)
│   ├── config/
│   │   └── types.ts                # (empty)
│   ├── api/
│   │   └── types.ts                # (empty)
│   ├── react/
│   │   └── index.ts                # React entry — placeholder named export
│   └── widget/
```

### Naming Conventions (Enforce from Day 1)

- **Files:** kebab-case — `ring-buffer.ts`, `spline-cache.ts`
- **Tests:** co-located — `ring-buffer.test.ts` next to `ring-buffer.ts`
- **Types:** one `types.ts` per module directory
- **Classes:** PascalCase — `RingBuffer`, `GlideChart`
- **Constants:** UPPER_SNAKE_CASE — `DEFAULT_CONFIG`
- **Private members:** `private` keyword only, no underscore prefix
- **Enums:** PascalCase values — `ThemeMode.Dark`

### Critical Anti-Patterns to Avoid

- **DO NOT** add any runtime dependencies — zero deps is a hard requirement
- **DO NOT** use `export default` anywhere — named exports only
- **DO NOT** create a UMD build step yet — that's Epic 7, Story 7-1
- **DO NOT** create CI/CD workflows yet — keep scope to local tooling only
- **DO NOT** create README.md or documentation
- **DO NOT** add example files or dev server — those are separate concerns
- **DO NOT** use npm or yarn — pnpm only

### Project Structure Notes

- Directory structure matches architecture.md exactly (section: Complete Project Directory Structure)
- Entry points are `src/index.ts` (main) and `src/react/index.ts` (React wrapper)
- The `src/widget/` directory is created empty — widget entry point comes in Epic 7
- Empty `types.ts` files in each module directory establish the convention early
- `dist/` directory is gitignored — build output only

### References

- [Source: _bmad-output/planning-artifacts/architecture.md — Starter Template Evaluation]
- [Source: _bmad-output/planning-artifacts/architecture.md — Complete Project Directory Structure]
- [Source: _bmad-output/planning-artifacts/architecture.md — Package Configuration]
- [Source: _bmad-output/planning-artifacts/architecture.md — Build Process Structure]
- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1, Story 1.1]
- [Source: _bmad-output/planning-artifacts/prd.md — Technical Architecture, Developer Tool Specific Requirements]
- [Source: _bmad-output/project-context.md — Technology Stack & Versions, Development Workflow Rules]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- TypeScript 6.x required `ignoreDeprecations: "6.0"` in tsconfig to suppress deprecated `baseUrl` warning from tsup's DTS generation
- ESLint 10 requires flat config format (`eslint.config.js`) instead of `.eslintrc.cjs`
- esbuild build scripts needed explicit approval via `pnpm.onlyBuiltDependencies` in package.json
- Package.json exports map: `types` condition must come before `import`/`require` to avoid esbuild warnings

### Completion Notes List

- All 10 tasks completed successfully
- Full pipeline validated: `pnpm install`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm lint` all pass
- ESM + CJS + DTS output confirmed in `dist/`
- Zero runtime dependencies — all packages are devDependencies
- Directory structure matches architecture exactly
- Named exports only — no `export default` anywhere

### Change Log

- 2026-03-28: Story 1-1 implemented — project initialization with TypeScript, tsup, Vitest, ESLint, Prettier

### File List

- package.json (new)
- pnpm-lock.yaml (new)
- tsconfig.json (new)
- tsconfig.build.json (new)
- tsup.config.ts (new)
- vitest.config.ts (new)
- vitest.setup.ts (new)
- eslint.config.js (new)
- .prettierrc (new)
- .gitignore (new)
- LICENSE (new)
- src/index.ts (new)
- src/react/index.ts (new)
- src/core/types.ts (new)
- src/core/placeholder.test.ts (new)
- src/renderer/types.ts (new)
- src/renderer/layers/.gitkeep (new)
- src/interaction/types.ts (new)
- src/config/types.ts (new)
- src/api/types.ts (new)
- src/widget/.gitkeep (new)

### Review Findings

- [x] [Review][Decision] **CJS consumers get wrong `.d.ts` types instead of `.d.cts`** — fixed: exports map now splits types per import/require condition
- [x] [Review][Patch] **Canvas mock non-functional without jsdom environment** [vitest.config.ts] — fixed: added `environment: 'jsdom'` and `jsdom` devDep
- [x] [Review][Patch] **ESLint flat config uses legacy `recommended.rules`** [eslint.config.js] — fixed: added `@eslint/js` recommended config
- [x] [Review][Patch] **React not declared as `peerDependency`** [package.json] — fixed: added optional peerDependencies for react/react-dom
- [x] [Review][Patch] **Vitest `globals: true` but no `vitest/globals` types** [tsconfig.json] — fixed: added `"types": ["vitest/globals"]`
- [x] [Review][Patch] **Coverage config misses `.tsx` patterns** [vitest.config.ts] — fixed: added `.tsx` to include and `.test.tsx` to exclude
- [x] [Review][Patch] **tsup does not reference `tsconfig.build.json`** [tsup.config.ts] — fixed: added `tsconfig: 'tsconfig.build.json'`
- [x] [Review][Patch] **`project-context.md` says TS 5.x but project uses TS 6.x** [_bmad-output/project-context.md] — fixed: updated to TS 6.x
- [x] [Review][Defer] **No `engines` field constrains Node.js version** [package.json] — deferred, pre-existing
- [x] [Review][Defer] **No `prepublishOnly` build guard** [package.json] — deferred, pre-existing
- [x] [Review][Defer] **No `.nvmrc` or `.node-version` file** — deferred, pre-existing
