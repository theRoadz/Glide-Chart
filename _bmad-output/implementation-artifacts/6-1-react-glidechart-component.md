# Story 6.1: React GlideChart Component

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a React developer,
I want a `<GlideChart />` component that wraps the core API with props,
so that I can use Glide Chart idiomatically in React with declarative configuration.

## Acceptance Criteria

1. **Given** a React 18+ application, **when** I import `{ GlideChart }` from `'glide-chart/react'`, **then** the import resolves correctly from the separate entry point.

2. **Given** `<GlideChart series={[{ id: 'price', data: points }]} />`, **when** the component mounts, **then** a GlideChart instance is created and renders in the component's container, **and** the smooth curve displays with beautiful defaults.

3. **Given** props change (e.g., new data, config update), **when** React re-renders, **then** the underlying chart instance updates via `setData()` / `setConfig()` (not recreated).

4. **Given** the component unmounts, **when** React triggers cleanup, **then** `chart.destroy()` is called and all resources are freed.

5. **Given** React Strict Mode is enabled (double-mount in dev), **when** the component mounts/unmounts/remounts, **then** no errors occur, no leaked resources remain, and the chart renders correctly after the final mount.

6. **Given** the component uses `ref` forwarding, **when** a parent accesses the ref, **then** the parent can call imperative methods (`addData`, `setData`, `clearData`, `resize`) on the chart instance.

7. **Given** TypeScript is used, **when** a developer uses `<GlideChart />`, **then** full prop type autocomplete is available for all configuration options.

## Tasks / Subtasks

- [x] Task 1: Define React component props types (AC: 7)
  - [x] 1.1 In `src/react/types.ts`, create `GlideChartProps` interface:
    ```typescript
    import type { ChartConfig, DataPoint, SeriesConfig } from '../api/types';

    interface GlideChartSeriesProps extends SeriesConfig {
      data?: DataPoint[];
    }

    interface GlideChartProps extends ChartConfig {
      series?: GlideChartSeriesProps[];
      className?: string;
      style?: React.CSSProperties;
    }
    ```
    `GlideChartProps` extends `ChartConfig` so all config options are top-level props. The `series` property **overrides** `ChartConfig.series` — TypeScript allows this because `GlideChartSeriesProps extends SeriesConfig` (covariant). This adds optional `data` per series (matching `GlideChartConfig` shape). `className` and `style` are pass-through to the container div. Note: `onStaleChange` from `ChartConfig` is inherited and becomes a React callback prop — this is intentional.
  - [x] 1.2 In `src/react/types.ts`, create `GlideChartRef` interface for imperative handle:
    ```typescript
    interface GlideChartRef {
      addData(seriesId: string, point: DataPoint | DataPoint[]): void;
      setData(seriesId: string, points: DataPoint[]): void;
      clearData(seriesId?: string): void;
      resize(): void;
    }
    ```
    Expose only data mutation and resize methods. Do NOT expose `destroy()` (lifecycle managed by React) or `setConfig()` (managed via props). Do NOT expose the raw `GlideChart` instance — consumers should not bypass the React wrapper.
  - [x] 1.3 Export types from `src/react/types.ts` using named exports only.

- [x] Task 2: Create `GlideChart` React component (AC: 1, 2, 3, 4, 5, 6)
  - [x] 2.1 Create `src/react/glide-chart-component.tsx`. Use `forwardRef` with `useImperativeHandle`:
    ```typescript
    import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
    import { GlideChart as GlideChartCore } from '../api/glide-chart';
    import type { GlideChartProps, GlideChartRef } from './types';

    const GlideChart = forwardRef<GlideChartRef, GlideChartProps>(
      function GlideChart(props, ref) {
        const containerRef = useRef<HTMLDivElement>(null);
        const chartRef = useRef<GlideChartCore | null>(null);

        // ... implementation
        return <div ref={containerRef} className={props.className} style={props.style} />;
      }
    );
    ```
  - [x] 2.2 Implement the main `useEffect` for chart lifecycle. This effect creates and destroys the chart instance:
    ```typescript
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const { className, style, series, ...configProps } = props;
      const chartConfig = {
        ...configProps,
        series: series?.map(({ data, ...seriesConfig }) => ({
          ...seriesConfig,
          data,
        })),
      };

      const chart = new GlideChartCore(container, chartConfig);
      chartRef.current = chart;

      return () => {
        chart.destroy();
        chartRef.current = null;
      };
    }, []); // Empty deps - create once, update via methods
    ```
    **Critical for Strict Mode:** In React 18 Strict Mode (dev only), the effect runs setup → cleanup → setup. The first `destroy()` call cleans up fully, then the second setup creates a fresh instance. This works correctly because `GlideChart.destroy()` removes all canvases and listeners, and the constructor re-creates everything from scratch in the same container div.
  - [x] 2.3 Implement a separate `useEffect` for syncing config prop changes to the chart instance. Extract config from props (excluding `className`, `style`, `series`). Use `JSON.stringify` to detect changes — destructured objects are new references every render, so reference equality won't work. `setConfig()` is expensive (recreates renderers, tooltip, calls `markAllDirty`), so only call it when config actually changed:
    ```typescript
    const prevConfigJsonRef = useRef<string>('');

    useEffect(() => {
      const chart = chartRef.current;
      if (!chart) return;

      const { className, style, series, ...configProps } = props;
      // Strip function props for JSON comparison; handle them separately
      const { onStaleChange, tooltip, ...jsonSafeConfig } = configProps;
      const tooltipWithoutFormatter = tooltip ? { ...tooltip, formatter: undefined } : undefined;
      const configJson = JSON.stringify({ ...jsonSafeConfig, tooltip: tooltipWithoutFormatter });

      if (prevConfigJsonRef.current === configJson) return;
      prevConfigJsonRef.current = configJson;

      chart.setConfig(configProps);
    }); // No deps array - runs every render to catch any config prop change
    ```
    **Why `JSON.stringify`:** Destructured `configProps` is a new object every render — reference comparison always fails. `setConfig()` is NOT cheap (recreates renderers, tooltip DOM, marks all layers dirty), so it must only be called when config actually changes. JSON comparison handles all serializable config values. Function-typed props (`onStaleChange`, `tooltip.formatter`) are excluded from the JSON key since they can't be serialized — they are passed through on every `setConfig()` call but the core handles function identity gracefully (deep merge assigns directly).
    **Why no deps array:** Config is a destructured object, so a deps array would need every individual config key. Running on every render with a JSON-based guard is simpler and correct.
  - [x] 2.4 Implement a separate `useEffect` for syncing series data prop changes. When `series` prop changes, compare each series' `data` array reference against previous. For changed series, call `chart.setData()`:
    ```typescript
    const prevSeriesDataRef = useRef<Map<string, DataPoint[] | undefined>>(new Map());

    useEffect(() => {
      const chart = chartRef.current;
      if (!chart || !props.series) return;

      for (const seriesItem of props.series) {
        const prevData = prevSeriesDataRef.current.get(seriesItem.id);
        if (seriesItem.data !== undefined && seriesItem.data !== prevData) {
          chart.setData(seriesItem.id, seriesItem.data);
        }
        prevSeriesDataRef.current.set(seriesItem.id, seriesItem.data);
      }
    }); // Runs every render to catch data changes
    ```
    **Important:** Compare by reference (`!==`), not deep equality. The consumer is expected to provide a new array reference when data changes (standard React immutability pattern). This avoids expensive deep comparisons on potentially 10K+ point arrays.
  - [x] 2.5 Implement `useImperativeHandle` to expose `GlideChartRef` methods:
    ```typescript
    useImperativeHandle(ref, () => ({
      addData(seriesId: string, point: DataPoint | DataPoint[]) {
        chartRef.current?.addData(seriesId, point);
      },
      setData(seriesId: string, points: DataPoint[]) {
        chartRef.current?.setData(seriesId, points);
      },
      clearData(seriesId?: string) {
        chartRef.current?.clearData(seriesId);
      },
      resize() {
        chartRef.current?.resize();
      },
    }), []);
    ```
    Use optional chaining (`?.`) on `chartRef.current` — during Strict Mode's intermediate unmount, the ref is `null`. Methods called during this phase are safely no-ops.

- [x] Task 3: Update `src/react/index.ts` entry point (AC: 1)
  - [x] 3.1 Replace the empty export in `src/react/index.ts` with:
    ```typescript
    export { GlideChart } from './glide-chart-component';
    export type { GlideChartProps, GlideChartRef, GlideChartSeriesProps } from './types';
    ```
    Named exports only. Do NOT re-export core types here — consumers import core types from `'glide-chart'` (the main entry point), React-specific types from `'glide-chart/react'`.

- [x] Task 4: Install React dev dependencies (AC: 1)
  - [x] 4.1 Add all required dev dependencies (these are NOT currently in devDependencies — only in peerDependencies):
    ```bash
    pnpm add -D react react-dom @types/react @types/react-dom @testing-library/react @testing-library/jest-dom
    ```
  - [x] 4.2 Verify `tsup.config.ts` already has `react` entry point and `external: ['react', 'react-dom']`. It does — no changes needed.
  - [x] 4.3 Verify `package.json` exports map already has `"./react"` entry. It does — no changes needed.
  - [x] 4.4 Verify `vitest.config.ts` (or `vite.config.ts`) has `environment: 'jsdom'` configured — required for `@testing-library/react` and DOM APIs in `.test.tsx` files. If only `vitest-canvas-mock` setup exists, add `environment: 'jsdom'` to the vitest config.
  - [x] 4.5 Configure `@testing-library/jest-dom` types: add `@testing-library/jest-dom` to the `types` array in `tsconfig.json`, or add a setup file with `import '@testing-library/jest-dom'` referenced in vitest's `setupFiles`. This enables TypeScript recognition of matchers like `toBeInTheDocument()`.

- [x] Task 5: Unit tests for GlideChart React component (AC: 2, 3, 4, 5, 6, 7)
  - [x] 5.1 Create `src/react/glide-chart-component.test.tsx`. Set up test helpers:
    - Import `render`, `cleanup` from `@testing-library/react`
    - Import `GlideChart` component and types
    - Create helper `createTestData(count)` that returns `DataPoint[]`
    - Use `vi.mock` to mock `../api/glide-chart` — mock the `GlideChart` class constructor and all public methods (`addData`, `setData`, `clearData`, `setConfig`, `resize`, `destroy`). This isolates the React wrapper tests from the core implementation. The mock constructor should store the instance for assertions. **Note:** This is an intentional exception to the "no mocking internal modules" testing rule. The React wrapper tests verify the wrapper's behavior (prop-to-API mapping, lifecycle management), not core chart rendering. The core is already tested extensively in its own test files. Mocking the core here prevents needing Canvas DOM setup in React tests.
  - [x] 5.2 Add test: component renders a container div — verify a `<div>` is in the DOM after mount.
  - [x] 5.3 Add test: component creates GlideChartCore instance on mount — verify mock constructor called with the container element and config derived from props.
  - [x] 5.4 Add test: component calls `destroy()` on unmount — render, then `cleanup()`, verify `destroy` mock was called.
  - [x] 5.5 Add test: React Strict Mode double-mount — render inside `<StrictMode>`, verify `destroy` called once (first mount cleanup), then constructor called twice total, and final instance is active.
  - [x] 5.6 Add test: config prop change calls `setConfig()` — render with `theme: 'dark'`, re-render with `theme: 'light'`, verify `setConfig` mock called with the updated config.
  - [x] 5.7 Add test: series data prop change calls `setData()` — render with initial data, re-render with new data array reference, verify `setData` mock called with new data for that series.
  - [x] 5.8 Add test: same data reference does NOT call `setData()` — render with data, re-render with same array reference, verify `setData` NOT called.
  - [x] 5.9 Add test: ref exposes imperative methods — render with `ref`, call `ref.current.addData(...)`, verify core `addData` mock called. Repeat for `setData`, `clearData`, `resize`.
  - [x] 5.10 Add test: `className` and `style` are applied to container div — render with `className="my-chart"` and `style={{ width: '100%' }}`, verify the rendered div has those attributes.
  - [x] 5.11 Add test: component with no series prop renders without error — verify constructor called with undefined series.
  - [x] 5.12 Add test: imperative methods are no-ops when chart is null — call `ref.current.addData(...)` after unmount, verify no errors thrown.

- [x] Task 6: Build verification (AC: 1)
  - [x] 6.1 Run `pnpm build` and verify `dist/react.js`, `dist/react.cjs`, `dist/react.d.ts`, and `dist/react.d.cts` are generated.
  - [x] 6.2 Verify `dist/react.js` does NOT contain React library code (it should be externalized).
  - [x] 6.3 Run `pnpm test` and verify all existing tests still pass (no regressions).
  - [x] 6.4 Run `pnpm typecheck` and verify no TypeScript errors.

## Dev Notes

### Thin Wrapper Pattern — The Core Architectural Rule

The React component is a **thin wrapper** around the vanilla `GlideChart` class. Per architecture: "the React component delegates everything to the vanilla GlideChart class." The component's ONLY responsibilities are:
1. Providing a container `<div>` for the core to render into
2. Mapping props to core API calls (`setConfig`, `setData`)
3. Managing lifecycle (`new GlideChart()` on mount, `destroy()` on unmount)
4. Exposing imperative handle for data mutations

Do NOT add any logic that duplicates or overrides core functionality. No custom rendering, no custom event handling, no custom state management beyond what's needed for the prop-to-API bridge.

### forwardRef and React 18 Compatibility

The component uses `forwardRef` for React 18 compatibility. React 19 supports `ref` as a regular prop, making `forwardRef` unnecessary. However, since this project targets React 18+ (`"react": ">=18"` in peerDependencies), `forwardRef` is required. The named function expression `forwardRef(function GlideChart(...))` gives the component a proper display name in React DevTools without needing a separate `displayName` assignment.

### Import DAG Compliance

Per architecture module boundary rules:
- `react/` → `api/` only (imports `GlideChart` class and types from `api/`)
- `react/` must NEVER import from `core/`, `config/`, `renderer/`, `interaction/`, or `streaming/`
- All types needed by the React wrapper must be re-exported through `api/types.ts`

### React Strict Mode (Double-Mount) Handling

React 18 Strict Mode calls setup → cleanup → setup in development. The component handles this naturally:
1. First `useEffect` setup: creates `GlideChart` instance
2. Strict Mode cleanup: calls `destroy()`, sets `chartRef.current = null`
3. Second `useEffect` setup: creates a NEW `GlideChart` instance in the same container

This works because `GlideChart.destroy()` (in `glide-chart.ts`) removes all canvas elements, event listeners, and stops the rAF loop. The constructor then re-creates everything fresh. The container `<div>` persists across mounts (managed by React's DOM, not by us).

### Props vs Imperative API — Design Decision

**Props** are for declarative configuration: theme, grid, axis, tooltip settings, and initial series data. When props change, the wrapper calls `setConfig()` or `setData()`.

**Imperative handle (ref)** is for streaming/mutation: `addData()` for real-time pushes, `setData()` for bulk updates, `clearData()`, `resize()`. These are called by the consumer directly, not through props, because:
- `addData()` is called at 400ms intervals during streaming — re-rendering React on every data push would be wasteful
- The consumer controls when to push data, not React's render cycle

Story 6.2 will add callback event props (`onCrosshairMove`, `onZoom`) and streaming data diffing.

### Config Syncing Strategy

The wrapper extracts config from props on every render and uses `JSON.stringify` comparison (excluding function-typed props) to detect changes. `setConfig()` is expensive — it recreates BackgroundLayerRenderer, YAxisRenderer, XAxisRenderer, DataLayerRenderer, Crosshair, Tooltip, and calls `markAllDirty()`. Only call it when config actually changed. Key behaviors:
- `setConfig()` performs deep merge internally (in `resolver.ts`), so partial updates work
- `setConfig()` marks all layers dirty and triggers a re-render on the next frame
- Function-type props like `tooltip.formatter` and `onStaleChange` are preserved through deep merge (functions are assigned directly, not deep-merged)
- Function props are excluded from JSON comparison (not serializable) but passed through on every actual `setConfig()` call

### Data Syncing Strategy

Series data is compared by **reference equality** per series ID. When the consumer provides a new array reference for a series' `data`, `setData()` is called. This is efficient:
- No deep comparison of 10K+ point arrays
- Follows standard React immutability pattern (new data = new reference)
- Initial data provided via props is passed to the constructor's `GlideChartConfig.series[].data`

### What NOT to Do

- Do NOT use reference equality (`===`) to compare config objects — destructured objects are new references every render, so this always triggers `setConfig()`. Use JSON comparison for serializable props
- Do NOT add `useLayoutEffect` — `useEffect` is correct here since the chart renders to its own canvases asynchronously via rAF, not synchronously into React's DOM
- Do NOT re-export core types from the React entry point — consumers import `DataPoint`, `ChartConfig` etc. from `'glide-chart'`, not `'glide-chart/react'`
- Do NOT expose the raw `GlideChartCore` instance via ref — the `GlideChartRef` interface is intentionally limited to safe operations
- Do NOT call `chart.destroy()` inside the render function — only in `useEffect` cleanup
- Do NOT add `React.memo()` to the component — the consumer can wrap it if needed; premature optimization adds complexity
- Do NOT import from `core/`, `config/`, `renderer/`, or `interaction/` — only `api/`

### Existing Code Locations

| File | Purpose | Change |
|------|---------|--------|
| `src/react/index.ts` | React entry point — currently empty export | Replace with component + type exports |
| `src/react/types.ts` | NEW — React prop types and ref interface | Create |
| `src/react/glide-chart-component.tsx` | NEW — React wrapper component | Create |
| `src/react/glide-chart-component.test.tsx` | NEW — React wrapper tests | Create |
| `package.json` | Dev dependencies — add react, types, testing-library | Modify |

### Key Types from Core (for Reference)

```typescript
// From src/api/types.ts — already exported from 'glide-chart'
interface GlideChartConfig extends ChartConfig {
  series?: Array<SeriesConfig & { data?: DataPoint[] }>;
}

interface ChartConfig {
  theme?: ThemeMode;
  backgroundColor?: string;
  line?: Partial<LineConfig>;
  gradient?: Partial<GradientConfig>;
  grid?: Partial<GridConfig>;
  animation?: Partial<AnimationConfig>;
  xAxis?: Partial<AxisConfig>;
  yAxis?: Partial<AxisConfig>;
  crosshair?: Partial<CrosshairConfig>;
  tooltip?: Partial<TooltipConfig>;
  series?: SeriesConfig[];
  maxDataPoints?: number;
  staleThreshold?: number;
  timeWindow?: number;
  zoom?: boolean;
  ariaLabel?: string;
  onStaleChange?: (event: StaleChangeEvent) => void;
}

interface DataPoint { timestamp: number; value: number; }
interface SeriesConfig { id: string; line?: Partial<LineConfig>; gradient?: Partial<GradientConfig>; }
```

### Git Intelligence

Recent commits follow pattern: `feat: add <feature> with review fixes (Story X.Y)`. All 5 epics (30+ stories) are complete. The codebase is mature with established patterns for:
- Co-located tests (`*.test.ts` next to `*.ts`)
- Kebab-case files, PascalCase classes, camelCase methods
- Named exports only, no default exports
- Constructor injection, no singletons
- Error messages prefixed with class name

### Project Structure Notes

- Creates 3 new files in `src/react/`: `types.ts`, `glide-chart-component.tsx`, `glide-chart-component.test.tsx`
- Modifies 1 existing file: `src/react/index.ts`
- May modify `package.json` for dev dependencies
- Follows architecture's prescribed structure: `src/react/glide-chart-component.tsx`
- Uses `.tsx` extension for component file (JSX syntax)

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 6, Story 6.1 AC]
- [Source: _bmad-output/planning-artifacts/architecture.md — React Wrapper rules, Module DAG, Public API]
- [Source: _bmad-output/planning-artifacts/prd.md — FR35: Import and use React wrapper component, NFR14: React 18+]
- [Source: _bmad-output/project-context.md — React wrapper rules, testing rules, code quality rules]
- [Source: src/api/glide-chart.ts — GlideChart constructor, public methods, destroy() cleanup]
- [Source: src/api/types.ts — GlideChartConfig, ChartConfig, DataPoint, SeriesConfig]
- [Source: src/react/index.ts — Currently empty, ready for exports]
- [Source: package.json — exports map with ./react entry, peerDependencies for react]
- [Source: tsup.config.ts — react entry point already configured, external: ['react', 'react-dom']]

### Review Findings

- [x] [Review][Decision] Series config changes (non-data fields like line color) silently ignored after mount — fixed: config sync now includes series config (minus data) in JSON comparison and setConfig call
- [x] [Review][Decision] Function-valued props (`tooltip.formatter`, `onStaleChange`) silently non-reactive — fixed: tracked by reference in separate refs, trigger setConfig when identity changes
- [x] [Review][Patch] Import DAG violation: `react/` imports from `core/` and `config/` instead of `api/` — fixed: all imports routed through `api/types`
- [x] [Review][Patch] Redundant `setConfig()` call on first render after constructor — fixed: prevConfigJsonRef initialized in mount effect
- [x] [Review][Patch] `prevSeriesDataRef` never prunes removed series entries — fixed: prune loop added after sync
- [x] [Review][Patch] Double data load on mount — fixed: prevSeriesDataRef initialized with initial data in mount effect
- [x] [Review][Patch] `prevSeriesDataRef` and `prevConfigJsonRef` not reset on cleanup — fixed: both reset in cleanup function

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Mock constructor needed `function` keyword (not arrow) for `new` operator compatibility with vitest
- React dev dependencies were already installed (in devDependencies via prior setup)
- Pre-existing TS errors in `src/api/glide-chart.test.ts` — not introduced by this story

### Completion Notes List

- Created `GlideChartProps`, `GlideChartSeriesProps`, and `GlideChartRef` type interfaces in `src/react/types.ts`
- Implemented thin React wrapper component using `forwardRef`, `useImperativeHandle`, and three `useEffect` hooks (lifecycle, config sync, data sync)
- Config change detection uses `JSON.stringify` with function props excluded; data change detection uses reference equality
- Strict Mode double-mount handled naturally via destroy/recreate pattern
- Updated `src/react/index.ts` entry point with named exports
- Added `@testing-library/jest-dom/vitest` to setup file and types to tsconfig
- 11 unit tests covering: mount/unmount, Strict Mode, config sync, data sync, ref imperative API, className/style passthrough, no-series rendering, null-chart safety
- All 687 tests pass (27 files), build produces all expected outputs, React is properly externalized

### File List

- `src/react/types.ts` (new) — React prop types and ref interface
- `src/react/glide-chart-component.tsx` (new) — React wrapper component
- `src/react/glide-chart-component.test.tsx` (new) — 11 unit tests for React wrapper
- `src/react/index.ts` (modified) — replaced empty export with component + type exports
- `vitest.setup.ts` (modified) — added `@testing-library/jest-dom/vitest` import
- `tsconfig.json` (modified) — added `@testing-library/jest-dom` to types array

### Change Log

- Story 6.1: React GlideChart Component — implemented thin React wrapper with full test coverage (Date: 2026-03-30)
