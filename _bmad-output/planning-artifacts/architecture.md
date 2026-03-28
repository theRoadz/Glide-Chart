---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-03-27'
inputDocuments: ["_bmad-output/planning-artifacts/prd.md", "_bmad-output/planning-artifacts/product-brief-chartview.md"]
workflowType: 'architecture'
project_name: 'chartview'
user_name: 'theRoad'
date: '2026-03-27'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
43 functional requirements across 8 categories:
- **Curve Rendering (FR1-5):** Monotone cubic interpolation, multi-series, gradient fills, graceful degradation for sparse data, spike handling — these define the core rendering pipeline architecture
- **Real-Time Data (FR6-10):** Incremental data push, WebSocket feed integration, configurable time window, auto-scroll, stale data indication — requires an efficient update/render loop separate from initial render
- **Interaction (FR11-15):** Crosshair, tooltip, zoom toggle, pinch-zoom, scroll-zoom — event handling layer over the canvas
- **Axes & Scaling (FR16-21):** Time x-axis, value y-axis, decimal precision, custom formatters, locale-aware, timezone-aware — a self-contained axis/scale subsystem
- **Appearance & Theming (FR22-28):** Light/dark themes, per-series customization, grid, tooltip, gradient, animation speed, beautiful defaults — theme system that flows through all visual components
- **Embeddable Widget (FR29-32):** Script tag, no build step, data attributes, data source config — UMD bundle with declarative HTML API
- **Developer Integration (FR33-39):** NPM install, vanilla + React, TypeScript types, dataset replace/clear, destroy/cleanup — public API surface and lifecycle management
- **Package & Distribution (FR40-43):** ESM + CJS + UMD, zero deps, MIT license — build pipeline and export strategy

**Non-Functional Requirements:**
- **Performance (NFR1-7):** 60fps @ 10K points, 60fps during streaming, <100ms initial render, incremental updates, no memory leaks, <50KB total, <30KB core-only
- **Accessibility (NFR8-11):** ARIA labels, screen reader tooltip access, keyboard navigation, WCAG AA contrast
- **Compatibility (NFR12-16):** Modern browsers (last 2 versions), major bundlers, React 18+, UMD isolation, no global namespace pollution

**Scale & Complexity:**
- Primary domain: Frontend library (browser Canvas API)
- Complexity level: Medium
- Estimated architectural components: ~8-10 major modules

### Technical Constraints & Dependencies

- **Zero runtime dependencies** — all math (interpolation, scaling), animation (requestAnimationFrame loop), and formatting (locale, timezone) must be hand-implemented
- **Browser-only** — Canvas 2D API is the sole rendering target; no Node/SSR/Deno for v1
- **Bundle size ceiling** — 50KB total, 30KB core. Every module must be size-conscious; no room for heavy abstractions
- **TypeScript strict mode** — no `any` in public API; full type definitions ship with the package
- **Tree-shakeability** — React wrapper must be in a separate entry point so bundlers can exclude it
- **React 18+** — wrapper must work with concurrent mode and strict mode

### Cross-Cutting Concerns Identified

- **Performance optimization** — Touches rendering, data management, animation, and event handling. Must be designed in from the start, not bolted on.
- **Theming system** — Colors, opacities, and styles flow through line rendering, gradient fills, axes, grid, tooltips, and crosshair. Needs a centralized theme resolution that all visual components consume.
- **Animation/timing** — Curve transitions, data point entry animations, crosshair movement all share a requestAnimationFrame loop. Single animation scheduler to avoid competing rAF calls.
- **Memory management** — Long-running streaming sessions must not leak. Data windowing, canvas buffer management, and event listener cleanup are critical for stability.
- **Lifecycle management** — Chart creation, data updates, resize handling, and destruction must be clean across all three API surfaces (vanilla, React, widget).

## Starter Template Evaluation

### Primary Technology Domain

NPM library (TypeScript) — browser-only Canvas rendering library with vanilla core, React wrapper, and UMD widget bundle. This is not an application; no app-level starter templates apply.

### Starter Options Considered

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **tsup** | Zero-config, esbuild-fast, ESM+CJS native, .d.ts generation | No native UMD — needs supplemental build step | Best for core |
| **Rollup** | Native UMD, best tree-shaking, mature plugin ecosystem | More config, slower builds | Good but heavier |
| **tsc + esbuild** | Maximum control, no abstraction layer | More manual wiring | Viable but unnecessary |
| **tsdown** (Rolldown-powered) | Newer tool, ESM/CJS/UMD native | Too new, less battle-tested for production libraries | Risky |

### Selected Approach: tsup + supplemental UMD build

**Rationale:** tsup provides the fastest path to ESM + CJS dual-format builds with TypeScript declarations, requiring near-zero configuration. Since the UMD widget bundle is architecturally a separate entry point (standalone, self-contained for CDN delivery), a dedicated esbuild step for UMD is clean separation rather than a workaround.

**Initialization Command:**

```bash
mkdir glide-chart && cd glide-chart
pnpm init
pnpm add -D typescript tsup vitest @vitest/coverage-v8 vitest-canvas-mock
pnpm tsc --init
```

**Architectural Decisions Provided by Tooling:**

**Language & Runtime:**
- TypeScript 5.x with strict mode enabled
- Target: ES2020 (covers all modern browsers, last 2 versions)
- Module resolution: Bundler mode

**Build Tooling:**
- tsup for ESM + CJS builds (esbuild under the hood)
- Separate esbuild step for UMD widget bundle with global namespace `GlideChart`
- tsc for declaration file generation (tsup can delegate to this)

**Testing Framework:**
- Vitest for unit and integration tests
- vitest-canvas-mock for Canvas 2D API mocking
- @vitest/coverage-v8 for code coverage

**Code Quality:**
- ESLint with TypeScript parser
- Prettier for formatting
- Strict TypeScript — no `any` in public API

**Package Configuration:**
```json
{
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
  "sideEffects": false
}
```

**Code Organization:**
```
src/
  core/          # Rendering engine, interpolation, animation
  api/           # Public GlideChart class and config types
  react/         # React wrapper component (separate entry point)
  widget/        # UMD widget entry point
  types/         # Shared TypeScript interfaces
dist/            # Build output (ESM, CJS, UMD, .d.ts)
```

**Development Experience:**
- Vitest watch mode for fast test feedback
- tsup watch mode for development builds
- HTML dev page for visual testing during development

**Note:** Project initialization using this setup should be the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
1. Rendering architecture — layered canvas
2. Data management — ring buffer
3. Animation scheduling — single rAF loop with dirty flags
4. Interpolation — cached spline with incremental updates
5. Configuration — resolved config object
6. Public API — facade pattern
7. Event handling — centralized dispatcher

**Deferred Decisions (Post-MVP):**
- Plugin architecture (v2/v3)
- SSR / static image export (future)
- Data decimation algorithm (if benchmarks demand it)

### Rendering Architecture

**Decision:** Layered canvas (multiple stacked canvases)
**Rationale:** Separates static elements (grid, axes, labels) from dynamic elements (line, crosshair, gradient fill). Static layer only redraws on viewport change (zoom, resize, config update). Dynamic layer runs at 60fps during streaming. Avoids the cost of redrawing the entire scene every frame.
**Affects:** All visual components, DOM structure, resize handling

**Layer Structure:**
- **Background layer** — grid lines, background color (redraws on: resize, zoom, config change)
- **Axis layer** — x-axis and y-axis labels, tick marks (redraws on: viewport change, data range change)
- **Data layer** — interpolated line curves, gradient fills (redraws on: new data, zoom, scroll)
- **Interaction layer** — crosshair, tooltip overlay (redraws on: pointer move, keyboard nav)

### Data Management

**Decision:** Ring buffer (circular buffer)
**Rationale:** O(1) insert and eviction, stable memory footprint, no GC pressure from array resizing. Critical for hours-long streaming sessions (NFR5). Fixed capacity set based on configurable time window and data frequency.
**Affects:** Data storage, rendering iteration, series management

**Design:**
- Fixed-capacity buffer sized to `maxDataPoints` (configurable, default based on time window)
- Head/tail pointers for O(1) append and eviction
- Iterator interface for rendering (oldest-to-newest traversal of visible window)
- Per-series ring buffer — each data series manages its own buffer independently

### Animation & Frame Scheduling

**Decision:** Single requestAnimationFrame loop with dirty flags
**Rationale:** One central scheduler owns the frame budget. Each layer has a dirty flag; only dirty layers redraw. When no data is streaming and no interaction is occurring, the loop sleeps (stops requesting frames). Prevents competing rAF calls and gives one place to reason about frame timing.
**Affects:** All rendering, performance profiling, battery usage

**Behavior:**
- Loop starts on chart creation, sleeps when idle (no dirty flags)
- Wakes on: new data push, pointer event, config change, resize
- Frame budget: check dirty flags → redraw dirty layers in order → reset flags
- Sleeps after N consecutive idle frames (no layer was dirty)

### Interpolation Architecture

**Decision:** Cached spline coefficients with incremental updates
**Rationale:** Monotone cubic interpolation is local — each segment depends only on neighboring points. Pre-compute spline coefficients when data changes; cache them. When a new streaming point arrives, only recompute the last 2-3 segments. Avoids redundant computation over 10K+ points every frame.
**Affects:** Curve rendering, data layer performance, visual quality

**Design:**
- Spline coefficient cache stored alongside ring buffer data
- On `addData()`: invalidate and recompute only the tail segments
- On `setData()` (full replace): recompute entire cache
- On zoom/scroll: no recomputation needed — cache is in data space, not screen space
- Graceful fallback: linear interpolation when fewer than 3 data points (FR4)

### Configuration & Theming

**Decision:** Resolved config object (merge defaults + user config)
**Rationale:** Canvas has no DOM context propagation. A single resolved config snapshot is the fastest approach — plain object property access at render time, zero overhead. On config change, recompute the snapshot and mark all layers dirty.
**Affects:** All visual components, theme switching, per-series customization

**Design:**
- Deep merge: `defaultConfig` ← `themePreset` (light/dark) ← `userConfig`
- Immutable snapshot passed to all layer renderers
- `chart.setConfig(partial)` triggers re-merge, new snapshot, all layers dirty
- Theme presets are just partial config objects (light and dark built-in)
- Per-series overrides (color, thickness) resolved at merge time

### Public API

**Decision:** Facade pattern — single `GlideChart` class
**Rationale:** Matches PRD API design. One class, minimal surface area, well-typed methods. Internally delegates to renderer, data store, event handler, and config subsystems. React wrapper maps props/effects to instance methods.
**Affects:** Developer experience, TypeScript types, React wrapper design

**API Surface:**
- `new GlideChart(container, config?)` — create and render
- `chart.addData(seriesId, point | points)` — streaming push
- `chart.setData(seriesId, points)` — full dataset replace
- `chart.clearData(seriesId?)` — clear one or all series
- `chart.setConfig(partialConfig)` — update configuration
- `chart.resize()` — manual resize trigger (also auto-detects via ResizeObserver)
- `chart.destroy()` — cleanup everything (listeners, rAF, canvas elements)

### Event Handling

**Decision:** Centralized event handler on container element
**Rationale:** Single event listener set on the container div (which wraps all canvas layers). A dispatcher normalizes mouse/touch/keyboard events and routes to crosshair or zoom subsystems. One place to register and remove all listeners — clean lifecycle on `destroy()`.
**Affects:** Interaction features, accessibility, lifecycle cleanup

**Design:**
- Container `<div>` receives all pointer, wheel, keyboard, and touch events
- Dispatcher normalizes: mouse → pointer, touch → pointer (with gesture detection for pinch-zoom)
- Routes to: crosshair handler (move events), zoom handler (wheel/pinch), keyboard handler (arrow keys, +/-)
- All listeners removed in `destroy()` via single cleanup function
- `tabindex="0"` on container for keyboard focus (NFR10)

### Decision Impact Analysis

**Implementation Sequence:**
1. Ring buffer data store (foundation — everything depends on data)
2. Resolved config / theming (needed before any rendering)
3. Single rAF scheduler + dirty flag system (rendering infrastructure)
4. Layered canvas setup + background/grid layer (first visual output)
5. Monotone cubic interpolation + spline cache (core differentiator)
6. Data layer rendering (line + gradient fill)
7. Axis layer rendering
8. Centralized event handler + crosshair/tooltip
9. Zoom subsystem
10. Public API facade (`GlideChart` class)
11. React wrapper
12. UMD widget bundle

**Cross-Component Dependencies:**
- Ring buffer ← Data layer, Spline cache (data source)
- Resolved config ← All layers, Event handler (visual properties, feature flags)
- rAF scheduler ← All layers (frame coordination)
- Spline cache ← Data layer (curve rendering depends on cached coefficients)
- Event dispatcher ← Crosshair, Zoom, Keyboard nav (interaction routing)
- GlideChart facade ← All subsystems (public API delegates to internals)

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:** 6 areas where AI agents could make different choices — naming, structure, internal communication, error handling, canvas drawing, and TypeScript conventions.

### Naming Patterns

**File Naming:**
- All source files: `kebab-case.ts` — e.g., `ring-buffer.ts`, `spline-cache.ts`, `glide-chart.ts`
- Test files: `kebab-case.test.ts` co-located next to source — e.g., `ring-buffer.test.ts`
- Type files: `types.ts` per module directory for shared interfaces
- Index files: `index.ts` per directory for public re-exports

**Code Naming:**
- Classes: PascalCase — `GlideChart`, `RingBuffer`, `SplineCache`, `LayerManager`
- Interfaces/Types: PascalCase, no `I` prefix — `ChartConfig`, `DataPoint`, `SeriesOptions`
- Functions/methods: camelCase — `addData()`, `resolveConfig()`, `computeSpline()`
- Constants: UPPER_SNAKE_CASE — `DEFAULT_CONFIG`, `MAX_BUFFER_SIZE`, `LIGHT_THEME`
- Private class members: no underscore prefix, use `private` keyword only
- Enum values: PascalCase — `ThemeMode.Dark`, `LayerType.Data`

**Examples:**
```typescript
// ✅ Good
export interface ChartConfig { ... }
export class RingBuffer<T> { ... }
const DEFAULT_LINE_WIDTH = 2;
private scheduler: FrameScheduler;

// ❌ Bad
export interface IChartConfig { ... }
export class ringBuffer<T> { ... }
const defaultLineWidth = 2;
private _scheduler: FrameScheduler;
```

### Structure Patterns

**Module Organization:**
```
src/
  core/
    ring-buffer.ts          # Data storage
    ring-buffer.test.ts
    spline-cache.ts         # Interpolation cache
    spline-cache.test.ts
    interpolation.ts        # Monotone cubic math
    interpolation.test.ts
    scale.ts                # Data-to-pixel coordinate mapping
    scale.test.ts
    types.ts                # Core data types (DataPoint, Series)
  renderer/
    layer-manager.ts        # Canvas layer creation and orchestration
    layer-manager.test.ts
    frame-scheduler.ts      # rAF loop + dirty flags
    frame-scheduler.test.ts
    layers/
      background-layer.ts   # Grid, background
      axis-layer.ts         # X/Y axis labels and ticks
      data-layer.ts         # Line curves, gradient fills
      interaction-layer.ts  # Crosshair, tooltip
    types.ts                # Renderer types (LayerType, DirtyFlag)
  interaction/
    event-dispatcher.ts     # Centralized event handling
    event-dispatcher.test.ts
    crosshair.ts            # Crosshair logic
    zoom.ts                 # Zoom logic (wheel, pinch)
    keyboard.ts             # Keyboard navigation
    types.ts
  config/
    defaults.ts             # Default config values
    themes.ts               # Light/dark theme presets
    resolver.ts             # Config merge logic
    resolver.test.ts
    types.ts                # ChartConfig, SeriesConfig, ThemeConfig
  api/
    glide-chart.ts          # Public facade class
    glide-chart.test.ts
    types.ts                # Public API types (exported to consumers)
  react/
    glide-chart-component.tsx  # React wrapper
    glide-chart-component.test.tsx
    index.ts
  widget/
    widget.ts               # UMD widget entry point
    widget.test.ts
  index.ts                  # Main entry point (re-exports public API)
```

**Rules:**
- One class/concern per file — no god files
- Co-located tests — `foo.test.ts` sits next to `foo.ts`
- Each directory has a `types.ts` for types shared within that module
- Only `src/api/types.ts` exports types to consumers — internal types stay internal
- `index.ts` files only re-export, never contain logic

### Internal Communication Patterns

**Dependency Injection via Constructor:**
All subsystems receive their dependencies at construction time. No global singletons, no service locators, no event bus.

```typescript
// ✅ Good — explicit dependencies
class DataLayer {
  constructor(
    private readonly buffer: RingBuffer<DataPoint>,
    private readonly splineCache: SplineCache,
    private readonly config: ResolvedConfig,
    private readonly scale: Scale
  ) {}
}

// ❌ Bad — hidden dependencies
class DataLayer {
  private buffer = RingBuffer.getInstance();
}
```

**Ownership Hierarchy:**
```
GlideChart (facade)
  ├── ConfigResolver        → produces ResolvedConfig
  ├── RingBuffer[]          → one per series
  ├── SplineCache[]         → one per series
  ├── Scale                 → shared coordinate mapping
  ├── LayerManager
  │     ├── BackgroundLayer
  │     ├── AxisLayer
  │     ├── DataLayer
  │     └── InteractionLayer
  ├── FrameScheduler        → owns the rAF loop
  └── EventDispatcher       → owns all DOM listeners
```

`GlideChart` creates all subsystems and wires them together. No subsystem creates other subsystems.

### Error Handling Patterns

**Public API — Validate and throw:**
```typescript
// ✅ All public methods validate inputs and throw descriptive errors
addData(seriesId: string, point: DataPoint): void {
  if (!this.series.has(seriesId)) {
    throw new Error(`GlideChart: series '${seriesId}' not found. Add it via config.series first.`);
  }
  // ...
}
```

**Internal code — throw on bugs, never silently fail:**
```typescript
// ✅ Internal invariant violations throw
if (this.head < 0 || this.head >= this.capacity) {
  throw new Error(`RingBuffer: head index ${this.head} out of bounds`);
}
```

**Error message format:** Always prefix with the class/module name — `"GlideChart: ..."`, `"RingBuffer: ..."`. This makes stack traces immediately useful.

**No try/catch in rendering code.** If a layer renderer throws, it's a bug — let it surface. The rAF loop does NOT catch errors from layer draws.

### Canvas Drawing Conventions

**Context State Management:**
The `FrameScheduler` calls `ctx.save()` before each layer draw and `ctx.restore()` after. Layer renderers never call `save()`/`restore()` at the top level — they receive a clean context and return it clean.

```typescript
// In FrameScheduler
for (const layer of this.layers) {
  if (layer.isDirty) {
    layer.ctx.save();
    layer.draw(resolvedConfig, scale);
    layer.ctx.restore();
    layer.isDirty = false;
  }
}
```

**Coordinate Conversion:**
All data-to-pixel conversion goes through the shared `Scale` object. Layer renderers never do manual coordinate math.

```typescript
// ✅ Good — use Scale
const px = scale.xToPixel(dataPoint.timestamp);
const py = scale.yToPixel(dataPoint.value);

// ❌ Bad — manual math in renderer
const px = (timestamp - minTime) / (maxTime - minTime) * canvasWidth;
```

**Pixel Alignment:**
Grid lines and axis ticks use 0.5px offset for crisp rendering on 1x displays:
```typescript
// ✅ Crisp 1px line
ctx.moveTo(Math.round(x) + 0.5, y1);
ctx.lineTo(Math.round(x) + 0.5, y2);
```

Data curves (the smooth lines) do NOT pixel-align — sub-pixel rendering is what makes them smooth.

**Canvas Clearing:**
Each layer clears its own canvas at the start of its `draw()` method:
```typescript
draw(config: ResolvedConfig, scale: Scale): void {
  this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  // ... draw
}
```

### TypeScript Conventions

**Strict Mode Rules:**
- `strict: true` in tsconfig — no exceptions
- No `any` in public API types — use `unknown` + type guards if needed
- No `any` in internal code — use generics or explicit types
- No type assertions (`as`) unless unavoidable (e.g., Canvas API returns `CanvasRenderingContext2D | null`)
- Prefer `interface` for object shapes, `type` for unions/intersections

**Export Rules:**
- Only `src/index.ts` and `src/react/index.ts` are entry points
- Internal modules use relative imports, never path aliases
- Every public type/class/function is explicitly exported from the entry point
- No `export default` — always named exports

```typescript
// ✅ Good
export { GlideChart } from './api/glide-chart';
export type { ChartConfig, DataPoint, SeriesConfig } from './api/types';

// ❌ Bad
export default GlideChart;
```

### Enforcement Guidelines

**All AI Agents MUST:**
1. Follow kebab-case file naming — no exceptions
2. Co-locate tests next to source files
3. Use constructor injection — no singletons or global state
4. Prefix all error messages with the originating class name
5. Use the `Scale` object for all coordinate conversion — no manual math in renderers
6. Never add runtime dependencies — all functionality hand-implemented
7. Keep public API types in `src/api/types.ts` only
8. Use named exports exclusively — no `export default`

## Project Structure & Boundaries

### Complete Project Directory Structure

```
glide-chart/
├── README.md
├── LICENSE                          # MIT
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json                    # Base TypeScript config (strict: true)
├── tsconfig.build.json              # Build-specific config (excludes tests)
├── tsup.config.ts                   # ESM + CJS build config
├── vitest.config.ts                 # Test runner config
├── .eslintrc.cjs                    # ESLint config
├── .prettierrc                      # Prettier config
├── .gitignore
├── .github/
│   └── workflows/
│       ├── ci.yml                   # Lint, test, build on PR
│       └── release.yml              # NPM publish on tag
├── dev/
│   ├── index.html                   # Visual dev page (loads UMD bundle)
│   ├── streaming-demo.html          # Real-time streaming test page
│   └── serve.ts                     # Simple dev server script
├── src/
│   ├── index.ts                     # Main entry point — re-exports public API
│   ├── core/
│   │   ├── ring-buffer.ts           # Circular buffer for time-series data
│   │   ├── ring-buffer.test.ts
│   │   ├── spline-cache.ts          # Cached monotone cubic spline coefficients
│   │   ├── spline-cache.test.ts
│   │   ├── interpolation.ts         # Monotone cubic interpolation algorithm
│   │   ├── interpolation.test.ts
│   │   ├── scale.ts                 # Data-to-pixel coordinate mapping
│   │   ├── scale.test.ts
│   │   └── types.ts                 # DataPoint, Series, TimeRange
│   ├── renderer/
│   │   ├── layer-manager.ts         # Creates/manages stacked canvas elements
│   │   ├── layer-manager.test.ts
│   │   ├── frame-scheduler.ts       # Single rAF loop + dirty flags
│   │   ├── frame-scheduler.test.ts
│   │   ├── layers/
│   │   │   ├── background-layer.ts  # Grid lines, background fill
│   │   │   ├── background-layer.test.ts
│   │   │   ├── axis-layer.ts        # X/Y axis labels, ticks, formatting
│   │   │   ├── axis-layer.test.ts
│   │   │   ├── data-layer.ts        # Smooth curves, gradient fills
│   │   │   ├── data-layer.test.ts
│   │   │   ├── interaction-layer.ts # Crosshair line, tooltip rendering
│   │   │   └── interaction-layer.test.ts
│   │   └── types.ts                 # LayerType, DirtyFlag, RenderContext
│   ├── interaction/
│   │   ├── event-dispatcher.ts      # Centralized DOM event handling
│   │   ├── event-dispatcher.test.ts
│   │   ├── crosshair.ts             # Crosshair position logic + data lookup
│   │   ├── crosshair.test.ts
│   │   ├── zoom.ts                  # Wheel zoom + pinch-to-zoom logic
│   │   ├── zoom.test.ts
│   │   ├── keyboard.ts              # Arrow key nav, +/- zoom (a11y)
│   │   ├── keyboard.test.ts
│   │   └── types.ts                 # PointerState, ZoomState, GestureEvent
│   ├── config/
│   │   ├── defaults.ts              # DEFAULT_CONFIG with beautiful defaults
│   │   ├── themes.ts                # LIGHT_THEME, DARK_THEME presets
│   │   ├── resolver.ts              # Deep merge: defaults ← theme ← user
│   │   ├── resolver.test.ts
│   │   └── types.ts                 # ChartConfig, SeriesConfig, ThemeConfig, AxisConfig
│   ├── api/
│   │   ├── glide-chart.ts           # Public GlideChart facade class
│   │   ├── glide-chart.test.ts
│   │   └── types.ts                 # Public API types (exported to consumers)
│   ├── react/
│   │   ├── glide-chart-component.tsx # <GlideChart /> React wrapper
│   │   ├── glide-chart-component.test.tsx
│   │   └── index.ts                 # React entry point
│   └── widget/
│       ├── widget.ts                # UMD entry — reads data attributes, creates chart
│       └── widget.test.ts
├── dist/                            # Build output (gitignored)
│   ├── index.js                     # ESM bundle
│   ├── index.cjs                    # CJS bundle
│   ├── index.d.ts                   # Type declarations
│   ├── react.js                     # React wrapper ESM
│   ├── react.cjs                    # React wrapper CJS
│   ├── react.d.ts                   # React wrapper types
│   └── glide-chart.umd.js          # UMD widget bundle (CDN-ready)
└── examples/
    ├── basic/                       # Zero-config minimal chart
    │   └── index.html
    ├── streaming/                   # WebSocket real-time feed
    │   └── index.html
    ├── multi-series/                # Price + reference line
    │   └── index.html
    ├── custom-theme/                # Design system integration
    │   └── index.html
    ├── dark-mode/                   # Theme switching
    │   └── index.html
    ├── embed-widget/                # Script tag embed
    │   └── index.html
    ├── gradient-fill/               # Gradient area customization
    │   └── index.html
    └── zoom/                        # Zoom controls
        └── index.html
```

### Architectural Boundaries

**Public API Boundary:**
Only `src/api/types.ts` defines consumer-facing types. Only `src/index.ts` and `src/react/index.ts` are package entry points. Everything else is internal and can be refactored freely without breaking consumers.

```
Public Surface:
  src/index.ts          → GlideChart class + config types
  src/react/index.ts    → <GlideChart /> component + props types
  src/widget/widget.ts  → Self-executing UMD (no programmatic API)

Internal (not exported):
  src/core/*            → Data structures, math, coordinate mapping
  src/renderer/*        → Canvas layer management, frame scheduling
  src/interaction/*     → Event handling, crosshair, zoom
  src/config/*          → Config resolution (consumed via public API)
```

**Module Boundaries:**
Each directory is a self-contained module. Cross-module imports follow strict rules:

| Module | Can Import From | Cannot Import From |
|---|---|---|
| `core/` | (nothing — leaf module) | renderer, interaction, config, api |
| `config/` | core/types | renderer, interaction, api |
| `renderer/` | core, config | interaction, api |
| `interaction/` | core, config, renderer/types | api |
| `api/` | core, config, renderer, interaction | (imports everything — it's the facade) |
| `react/` | api | core, config, renderer, interaction |
| `widget/` | api | core, config, renderer, interaction |

**Key rule:** `react/` and `widget/` ONLY import from `api/`. They never reach into internals. This ensures the facade is the single integration point.

### Requirements to Structure Mapping

**FR Category Mapping:**

| FR Category | Primary Location | Supporting Files |
|---|---|---|
| Curve Rendering (FR1-5) | `src/core/interpolation.ts`, `src/core/spline-cache.ts` | `src/renderer/layers/data-layer.ts` |
| Real-Time Data (FR6-10) | `src/core/ring-buffer.ts`, `src/api/glide-chart.ts` | `src/renderer/frame-scheduler.ts` |
| Interaction (FR11-15) | `src/interaction/*` | `src/renderer/layers/interaction-layer.ts` |
| Axes & Scaling (FR16-21) | `src/core/scale.ts`, `src/renderer/layers/axis-layer.ts` | `src/config/defaults.ts` |
| Appearance & Theming (FR22-28) | `src/config/*` | All layer renderers |
| Embeddable Widget (FR29-32) | `src/widget/widget.ts` | UMD build config |
| Developer Integration (FR33-39) | `src/api/glide-chart.ts`, `src/api/types.ts` | `src/react/*` |
| Package & Distribution (FR40-43) | `tsup.config.ts`, `package.json` | CI/CD workflows |

**Cross-Cutting Concerns Mapping:**

| Concern | Files Involved |
|---|---|
| Performance | `frame-scheduler.ts`, `ring-buffer.ts`, `spline-cache.ts`, all layer renderers |
| Theming | `config/resolver.ts`, `config/themes.ts`, all layer renderers |
| Memory management | `ring-buffer.ts`, `layer-manager.ts`, `event-dispatcher.ts`, `glide-chart.ts` (destroy) |
| Accessibility | `interaction/keyboard.ts`, `interaction-layer.ts` (ARIA), `config/themes.ts` (contrast) |
| Lifecycle | `api/glide-chart.ts` (create/destroy), `react/glide-chart-component.tsx` (mount/unmount) |

### Data Flow

```
Consumer calls chart.addData(seriesId, point)
  → GlideChart facade validates input
    → RingBuffer.push(point) — O(1) append, auto-evict oldest
      → SplineCache.invalidateTail() — recompute last 2-3 segments
        → FrameScheduler.markDirty(LayerType.Data) — flag data layer
          → Next rAF frame:
            → Scale.update() — recalculate data-to-pixel mapping if range changed
            → DataLayer.draw() — render curves from spline cache + gradient fill
            → (AxisLayer.draw() if range changed)
```

### Build Process Structure

**tsup handles:**
- `src/index.ts` → `dist/index.js` (ESM) + `dist/index.cjs` (CJS) + `dist/index.d.ts`
- `src/react/index.ts` → `dist/react.js` (ESM) + `dist/react.cjs` (CJS) + `dist/react.d.ts`

**Separate esbuild step handles:**
- `src/widget/widget.ts` → `dist/glide-chart.umd.js` (IIFE/UMD, self-executing, global `GlideChart`)

**pnpm scripts:**
```json
{
  "build": "tsup && node scripts/build-umd.js",
  "dev": "tsup --watch",
  "test": "vitest",
  "test:coverage": "vitest --coverage",
  "lint": "eslint src/",
  "typecheck": "tsc --noEmit"
}
```

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**
All technology choices (TypeScript 5.x, tsup, Vitest, Canvas 2D API) are fully compatible. Architectural decisions (layered canvas, ring buffer, single rAF, cached spline, resolved config, facade pattern, centralized events) form a coherent system with no contradictions. Each decision reinforces the others.

**Pattern Consistency:**
Naming conventions (kebab-case files, PascalCase classes, camelCase methods) are standard TypeScript and internally consistent. Constructor injection aligns with the ownership hierarchy. Error handling patterns (throw on bugs, validate public input) are uniform. Canvas drawing conventions (Scale for coordinates, scheduler manages save/restore) prevent conflict.

**Structure Alignment:**
Module dependency graph is a clean DAG with no circular dependencies. The facade boundary (react/ and widget/ only import from api/) is enforced by the import rules table. File tree maps 1:1 to the module organization.

### Requirements Coverage Validation ✅

**Functional Requirements (FR1-43):** All 43 FRs have clear architectural support mapped to specific source files and modules. No gaps.

**Non-Functional Requirements (NFR1-16):** All 16 NFRs are addressed by architectural decisions:
- Performance (NFR1-7): Layered canvas, dirty flags, ring buffer, spline cache, zero deps, tree-shakeable
- Accessibility (NFR8-11): ARIA labels, keyboard nav, screen reader tooltip, WCAG AA themes
- Compatibility (NFR12-16): ES2020 target, ESM+CJS+UMD, React 18+ peer dep, scoped UMD global

### Implementation Readiness Validation ✅

**Decision Completeness:** All 7 critical decisions documented with rationale, design details, and affected components. Technology versions specified.

**Structure Completeness:** Complete file tree with every source file, test file, config file, and example directory defined. Module boundaries documented with import rules.

**Pattern Completeness:** 6 conflict categories addressed with concrete code examples and anti-patterns. Enforcement guidelines defined.

### Gap Analysis Results

**Critical Gaps:** None.

**Important Gaps (addressed):**

1. **Stale data visual indicator (FR10):** Config type should include `staleThreshold: number` (milliseconds). When no data arrives within this threshold, the data layer dims the line and the interaction layer can display a "stale" indicator. Specific visual treatment to be defined in implementation.

2. **ResizeObserver:** `LayerManager` is responsible for creating a `ResizeObserver` on the container element. On resize: update all canvas dimensions, recalculate Scale, mark all layers dirty. Cleanup observer in `destroy()`.

3. **Device Pixel Ratio (DPR) handling:** `LayerManager` must set canvas backing store dimensions to `clientWidth * devicePixelRatio` × `clientHeight * devicePixelRatio`, then apply `ctx.scale(dpr, dpr)` on each canvas context. This ensures crisp rendering on Retina/HiDPI displays. Re-applied on resize.

### Architecture Completeness Checklist

**✅ Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**✅ Architectural Decisions**
- [x] Critical decisions documented with rationale
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed

**✅ Implementation Patterns**
- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified (constructor injection)
- [x] Process patterns documented (error handling, canvas conventions)

**✅ Project Structure**
- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High

**Key Strengths:**
- Clean separation of concerns via layered canvas and module boundaries
- Performance architecture designed in from the start (ring buffer, spline cache, dirty flags)
- Zero-dependency constraint eliminates integration risk
- Facade pattern creates a clean public API boundary
- Constructor injection makes all dependencies explicit and testable
- Comprehensive implementation patterns prevent AI agent conflicts

**Areas for Future Enhancement:**
- Data decimation algorithm (if benchmarks show degradation at extreme scale)
- Plugin architecture (v2/v3)
- Performance benchmarking harness
- SSR / static export capabilities

### Implementation Handoff

**AI Agent Guidelines:**
- Follow all architectural decisions exactly as documented
- Use implementation patterns consistently across all components
- Respect module boundaries and import rules
- Refer to this document for all architectural questions
- When in doubt about a pattern, check the examples in the Implementation Patterns section

**First Implementation Priority:**
```bash
mkdir glide-chart && cd glide-chart
pnpm init
pnpm add -D typescript tsup vitest @vitest/coverage-v8 vitest-canvas-mock
pnpm tsc --init
```
Then: configure tsconfig.json, tsup.config.ts, vitest.config.ts, and establish the src/ directory structure.
