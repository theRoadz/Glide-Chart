---
project_name: 'chartview'
user_name: 'theRoad'
date: '2026-03-27'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'code_quality', 'workflow_rules', 'critical_rules']
status: 'complete'
rule_count: 48
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

- **Language:** TypeScript 6.x (strict mode enabled, target ES2020)
- **Rendering:** Canvas 2D API (no WebGL, no external rendering libraries)
- **Package Manager:** pnpm
- **Build:** tsup (ESM + CJS) + esbuild (UMD widget bundle)
- **Test:** Vitest + @vitest/coverage-v8 + vitest-canvas-mock
- **Lint/Format:** ESLint (TypeScript parser) + Prettier
- **Runtime Dependencies:** Zero — all functionality hand-implemented
- **React:** 18+ as peer dependency (optional wrapper only)
- **Bundle Targets:** ESM (`dist/index.js`), CJS (`dist/index.cjs`), UMD (`dist/glide-chart.umd.js`)
- **Bundle Budget:** Core < 30KB gzipped, Core + React < 50KB gzipped

## Critical Implementation Rules

### Language-Specific Rules

- **Strict mode required** — `strict: true` in tsconfig; no `any` types, no implicit returns, no unchecked index access
- **Named exports only** — `export default` is forbidden everywhere; all exports must be named
- **No `I` prefix on interfaces** — use `ChartConfig` not `IChartConfig`; types and interfaces use PascalCase
- **Private members use `private` keyword only** — no underscore prefix convention (`private buffer` not `private _buffer`)
- **Constants use UPPER_SNAKE_CASE** — e.g., `DEFAULT_CONFIG`, `MAX_BUFFER_SIZE`
- **Enum values use PascalCase** — e.g., `ThemeMode.Dark`, `LayerType.Data`
- **Error messages must be prefixed** with class/module name — e.g., `throw new Error('RingBuffer: capacity must be positive')`
- **No try/catch in rendering code** — let bugs surface immediately; only catch at public API boundary
- **All public methods validate inputs** and throw descriptive errors at the boundary
- **Import paths follow strict DAG** — `core/` imports nothing; `config/` → core; `renderer/` → core, config; `interaction/` → core, config, renderer/types; `api/` → all; `react/` → api only; `widget/` → api only

### Framework-Specific Rules

#### Canvas Rendering

- **Layered canvas architecture** — 4 separate `<canvas>` elements stacked via CSS: background, axis, data, interaction (bottom to top)
- **Context state: `save()`/`restore()` per layer** — NOT per individual draw operation; each layer saves once at draw start, restores once at end
- **Each layer clears its own canvas** at the start of every draw call
- **Pixel alignment** — use 0.5px offset for crisp grid lines and axis lines; use sub-pixel precision for smooth curves
- **All coordinate conversion goes through the shared Scale object** — never manually compute data-to-pixel mapping
- **Single `requestAnimationFrame` loop** — one rAF callback managed by FrameScheduler; layers register dirty flags, not their own rAF calls
- **Dirty flag system** — only re-render layers whose dirty flag is set; never redraw all layers every frame
- **Spline coefficients are cached** — recompute incrementally when new points are added, not from scratch

#### React Wrapper

- **Thin wrapper only** — the React component delegates everything to the vanilla `GlideChart` class
- **React 18+ peer dependency** — never bundle React; it's the consumer's responsibility
- **Refs for canvas container** — use `useRef` for the DOM container, instantiate `GlideChart` in `useEffect`
- **Cleanup in useEffect return** — always call `chart.destroy()` on unmount
- **Props mapped to config** — React props are a thin mapping to `ChartConfig`, no extra abstraction layer

### Testing Rules

- **Co-located tests** — test files live next to source: `ring-buffer.ts` → `ring-buffer.test.ts` (same directory)
- **Canvas mocking via vitest-canvas-mock** — all tests that touch Canvas 2D API must use this; never hand-mock `getContext('2d')`
- **Test file naming** — always `{source-name}.test.ts` or `.test.tsx` for React components
- **No mocking internal modules** — mock only external boundaries (DOM APIs, `requestAnimationFrame`, `performance.now`); test internal modules with real implementations
- **Constructor injection enables testing** — all subsystem dependencies are injected via constructor; tests create isolated instances with test doubles
- **Performance-sensitive code gets benchmark assertions** — ring buffer operations, spline calculations, and render loops should assert O(1) or O(n) behavior where specified
- **Coverage via @vitest/coverage-v8** — run with `vitest --coverage`; aim for high coverage on `core/` and `api/` modules
- **React component tests** — use `@testing-library/react` patterns; test the component behavior, not implementation details

### Code Quality & Style Rules

- **File naming: kebab-case** — `ring-buffer.ts`, `spline-cache.ts`, `glide-chart.ts`
- **One `types.ts` per module** — shared types for each module directory (`core/types.ts`, `renderer/types.ts`, etc.)
- **Entry points are strictly limited** — only `src/index.ts` and `src/react/index.ts` are public entry points; everything else is internal
- **Dependency injection everywhere** — constructor injection for all subsystem dependencies; no singletons, no global state, no service locators
- **Configuration via deep merge** — resolved config = defaults ← theme ← user overrides; use a single `resolveConfig()` function
- **Facade pattern for public API** — `GlideChart` class is the single public surface; consumers never import internal modules directly
- **No barrel re-exports in internal modules** — only entry point `index.ts` files re-export; internal modules import directly from source
- **`sideEffects: false`** — all code must be tree-shakeable; no module-level side effects (no top-level `addEventListener`, no global mutations)

### Development Workflow Rules

- **pnpm only** — never use npm or yarn; lockfile is `pnpm-lock.yaml`
- **Build outputs triple format** — every build must produce ESM (`.js`), CJS (`.cjs`), and type declarations (`.d.ts`); UMD built separately via esbuild
- **Type checking is separate from build** — `tsc --noEmit` for checking; tsup handles actual compilation
- **`tsconfig.build.json` excludes tests** — build config extends base but excludes `**/*.test.ts` and test utilities
- **CI pipeline runs in order** — lint → type-check → test → build → bundle-size check
- **Bundle size is gated** — CI must fail if core exceeds 30KB gzipped or core + React exceeds 50KB gzipped
- **NPM publish via `files` field** — only `dist/` is published; source, tests, and configs are excluded
- **Widget bundle is self-contained** — UMD build includes everything; no external dependencies expected at runtime

### Critical Don't-Miss Rules

#### Anti-Patterns to Avoid

- **NEVER add runtime dependencies** — no lodash, no d3, no external math libs; everything is hand-implemented for bundle size control
- **NEVER use `export default`** — named exports only, everywhere, no exceptions
- **NEVER create circular imports** — module DAG is strictly enforced; if you need a type from a downstream module, it belongs in a shared `types.ts` upstream
- **NEVER call `requestAnimationFrame` directly** — always go through `FrameScheduler`; multiple rAF loops will cause jank
- **NEVER mutate config objects** — config is resolved once via deep merge and treated as read-only thereafter
- **NEVER use global/singleton state** — all state lives in class instances wired via constructor injection

#### Performance Gotchas

- **Ring buffer is O(1) insert/evict** — never copy arrays or shift elements; if you find yourself using `Array.shift()` or `Array.splice()` on time-series data, you're doing it wrong
- **Spline recalculation is incremental** — when a new point is added, only recompute affected coefficients, not the entire curve
- **Avoid allocations in the render loop** — no object creation, no array spreading, no string concatenation inside `draw()` methods; pre-allocate reusable buffers
- **`devicePixelRatio` scaling** — canvas dimensions must account for DPR; set `canvas.width = container.clientWidth * dpr` and use `ctx.scale(dpr, dpr)`

#### Security Rules

- **Widget mode uses HTML `data-*` attributes for config** — never `eval()` or `innerHTML` from user-provided config values
- **Sanitize tooltip content** — any user-provided label or formatter output must be text-only, never injected as HTML

#### Edge Cases

- **Empty dataset** — chart must render gracefully (axes, background) with no data points; never throw on empty series
- **Single data point** — render as a dot, not a line; spline interpolation requires ≥2 points
- **Resize handling** — recalculate canvas dimensions and redraw on `ResizeObserver` callback; debounce is acceptable but not required
- **Time zone agnostic** — all timestamps are Unix milliseconds; display formatting is the consumer's responsibility

---

## Usage Guidelines

**For AI Agents:**

- Read this file before implementing any code
- Follow ALL rules exactly as documented
- When in doubt, prefer the more restrictive option
- Update this file if new patterns emerge

**For Humans:**

- Keep this file lean and focused on agent needs
- Update when technology stack changes
- Review quarterly for outdated rules
- Remove rules that become obvious over time

Last Updated: 2026-03-27
