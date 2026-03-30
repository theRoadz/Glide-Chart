# Story 6.2: React Streaming & Event Props

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a React developer,
I want to push streaming data and handle chart events via props,
so that I can integrate real-time feeds and user interactions the React way.

## Acceptance Criteria

1. **Given** a `data` prop that changes over time (new points appended), **when** the prop updates, **then** new points are pushed via `addData()` (not full dataset replace).

2. **Given** callback props like `onCrosshairMove`, `onZoom`, **when** the corresponding chart events occur, **then** the React callbacks fire with the relevant data.

3. **Given** the React wrapper component, **when** imported from `'glide-chart/react'` and the consumer only imports core from `'glide-chart'`, **then** the component is tree-shakeable — importing only core does NOT include React code.

## Tasks / Subtasks

- [x] Task 1: Add `onCrosshairMove` and `onZoom` callback support to the core `ChartConfig` (AC: 2)
  - [x] 1.1 In `src/config/types.ts`, add event type interfaces and callback fields to `ChartConfig`:
    ```typescript
    // Add before ChartConfig interface:
    export interface CrosshairMoveEvent {
      x: number;          // Pointer pixel X
      y: number;          // Pointer pixel Y
      timestamp: number;  // Data-space timestamp at pointer X
      active: boolean;    // Whether pointer is within plot area
      points: ReadonlyArray<Readonly<{ seriesId: string; value: number; timestamp: number }>>;
    }

    export interface ZoomEvent {
      domainXMin: number;  // New visible time range start
      domainXMax: number;  // New visible time range end
      isZoomed: boolean;   // Whether chart is currently zoomed
    }

    // Add to ChartConfig:
    onCrosshairMove?: (event: CrosshairMoveEvent) => void;
    onZoom?: (event: ZoomEvent) => void;
    ```
    These callback types use the same `TooltipDataPoint`-shaped point data the tooltip already computes. `CrosshairMoveEvent.active = false` signals pointer exit (no point data). `ZoomEvent` reports the new domain after zoom is applied.
  - [x] 1.2 In `src/api/types.ts`, add re-exports for the new event types:
    ```typescript
    export type { CrosshairMoveEvent, ZoomEvent } from '../config/types';
    ```
  - [x] 1.3 In `src/index.ts`, add re-exports for the new event types:
    ```typescript
    export type { CrosshairMoveEvent, ZoomEvent } from './api/types';
    ```

- [x] Task 2: Wire event callbacks in the `GlideChart` facade class (AC: 2)
  - [x] 2.1 In `src/api/glide-chart.ts`, add private fields for the new callbacks:
    ```typescript
    private _onCrosshairMove: ((event: CrosshairMoveEvent) => void) | undefined;
    private _onZoom: ((event: ZoomEvent) => void) | undefined;
    ```
  - [x] 2.2 In the constructor, store callback references from config:
    ```typescript
    this._onCrosshairMove = config?.onCrosshairMove;
    this._onZoom = config?.onZoom;
    ```
  - [x] 2.3 In the pointer event subscription (`eventDispatcher.subscribe`), after the existing logic that marks interaction dirty and updates tooltip, fire `onCrosshairMove`. Build the event from existing data — the tooltip `update` method already computes nearest data points. To avoid duplicating that lookup, extract a helper that builds crosshair data points from the `crosshairDataSource` and `scale` (similar to tooltip's internal logic). Wrap the callback in try/catch to match the existing `handleStaleChange` error isolation pattern:
    ```typescript
    // Inside eventDispatcher.subscribe callback, after tooltip.update:
    if (this._onCrosshairMove) {
      try {
        this._onCrosshairMove(this.buildCrosshairMoveEvent(state));
      } catch { /* Consumer callback errors must not crash the chart */ }
    }
    ```
  - [x] 2.4 Create a private `buildCrosshairMoveEvent(state: PointerState): CrosshairMoveEvent` method that:
    - Checks if pointer is within the plot area (`scale.viewport`)
    - If outside: returns `{ x: state.x, y: state.y, timestamp: 0, active: false, points: [] }`
    - If inside: converts `state.x` to timestamp via `scale.pixelToX()`, finds nearest data points across all series (iterate `crosshairDataSource.getSeries()`, **linear scan with early-exit** in each buffer's visible window — this is the same approach the tooltip uses in `tooltip.ts:update()` lines 194-220). For each series, iterate the buffer and find the point with the smallest `|point.timestamp - timestamp|`, breaking when distance starts increasing (data is time-sorted).
    - **Critical:** This method runs on every pointer move. Allocate a small plain array per call — this is a consumer callback (not per-frame canvas rendering), so a small allocation is acceptable. Do NOT try to reuse tooltip's internal `resultPool` — it's private to Tooltip.
  - [x] 2.5 Add `this.fireZoomCallback()` after the existing zoom handling in both subscribeWheel and subscribePinch callbacks. In each case, add the call after the `tooltip.update` line:
    ```typescript
    // In subscribeWheel callback, add after tooltip.update:
    this.fireZoomCallback();

    // In subscribePinch callback, add after tooltip.update:
    this.fireZoomCallback();
    ```
  - [x] 2.6 Also add `this.fireZoomCallback()` after the keyboard handler call, since keyboard +/- keys trigger zoom. The deduplication in `fireZoomCallback` (see 2.7) ensures arrow keys don't fire spurious zoom events:
    ```typescript
    this.eventDispatcher.subscribeKeyboard((keyboardState) => {
      this.keyboardNavigator.handleKeyboard(keyboardState, this.resolvedConfig, this.pointerState);
      this.fireZoomCallback();
    });
    ```
  - [x] 2.7 Create a private `fireZoomCallback()` method with **domain deduplication** to prevent spurious fires on non-zoom keyboard events (arrow keys):
    ```typescript
    private _prevZoomDomainMin = 0;
    private _prevZoomDomainMax = 0;

    private fireZoomCallback(): void {
      if (!this._onZoom) return;
      const { min, max } = this.scale.domainX;
      if (min === this._prevZoomDomainMin && max === this._prevZoomDomainMax) return;
      this._prevZoomDomainMin = min;
      this._prevZoomDomainMax = max;
      try {
        this._onZoom({
          domainXMin: min,
          domainXMax: max,
          isZoomed: this.zoomHandler.isZoomed,
        });
      } catch { /* Consumer callback errors must not crash the chart */ }
    }
    ```
    **Why deduplication is required:** The keyboard subscriber fires after ALL key events (arrows, +/-). Without domain comparison, `onZoom` would fire on every ArrowLeft/ArrowRight press even though the domain didn't change. Initialize `_prevZoomDomainMin`/`_prevZoomDomainMax` to 0 — the first real zoom will always differ.
  - [x] 2.8 In `setConfig()`, extract the new callbacks from the **merged** `this.userConfig` (NOT from `partialConfig`). Place these lines right after the existing `this._onStaleChange = this.userConfig.onStaleChange;` at line 419:
    ```typescript
    // Existing line 419:
    this._onStaleChange = this.userConfig.onStaleChange;
    // Add immediately after:
    this._onCrosshairMove = this.userConfig.onCrosshairMove;
    this._onZoom = this.userConfig.onZoom;
    ```
    **Why `this.userConfig` and not `partialConfig`:** `setConfig()` first deep-merges `partialConfig` into `this.userConfig` (line ~367). Extracting from the merged result ensures that `setConfig({ theme: 'dark' })` (without specifying callbacks) preserves previously-set callbacks, because `deepMerge` keeps existing keys when the partial doesn't override them. Using `partialConfig.onXxx ?? this._onXxx` would work but diverges from the existing single-path pattern.
  - [x] 2.9 In `destroy()`, clear the callback references for GC safety. Add after the existing cleanup at the end of `destroy()`:
    ```typescript
    this._onCrosshairMove = undefined;
    this._onZoom = undefined;
    ```
    Match the cleanup pattern — the existing `_onStaleChange` is not currently nulled in destroy (pre-existing gap), but it's good practice to null the new ones.

- [x] Task 3: Add streaming data diffing to the React wrapper (AC: 1)
  - [x] 3.1 In `src/react/types.ts`, add `streaming` to the existing `GlideChartProps` interface. Do NOT redefine `GlideChartSeriesProps` — it already exists unchanged. Only add one field:
    ```typescript
    // Add to existing GlideChartProps:
    /** When true, data prop increases are pushed via addData() instead of setData(). Default: false. */
    streaming?: boolean;
    ```
    When `streaming` is `true` and the new data array is longer than the previous snapshot length (by reference check first — if same reference, skip), push only the new tail points via `addData()`. When `streaming` is `false` (default), use `setData()` for full replacement (current behavior from Story 6.1).
  - [x] 3.2 In `src/react/glide-chart-component.tsx`, modify the data sync `useEffect` to support streaming mode. Add a **separate** `prevDataLengthRef` to track the length at the time each reference was stored. This is necessary because `prevData.length` reads the *current* length of the stored array reference — if a consumer mutates in-place (violating React convention), the stored reference's `.length` would reflect the mutation:
    ```typescript
    const prevDataLengthRef = useRef<Map<string, number>>(new Map());
    ```
    In the data sync effect:
    ```typescript
    for (const seriesItem of props.series) {
      const prevData = prevSeriesDataRef.current.get(seriesItem.id);
      if (seriesItem.data !== undefined && seriesItem.data !== prevData) {
        const prevLength = prevDataLengthRef.current.get(seriesItem.id) ?? 0;
        if (props.streaming && prevLength > 0 && seriesItem.data.length > prevLength) {
          // Streaming: push only new tail points
          const newPoints = seriesItem.data.slice(prevLength);
          chart.addData(seriesItem.id, newPoints);
        } else {
          chart.setData(seriesItem.id, seriesItem.data);
        }
      }
      prevSeriesDataRef.current.set(seriesItem.id, seriesItem.data);
      if (seriesItem.data !== undefined) {
        prevDataLengthRef.current.set(seriesItem.id, seriesItem.data.length);
      }
    }
    ```
    **Important design notes:**
    - Reference check (`!==`) is the gate — if same reference, no action (standard React immutability).
    - `prevDataLengthRef` captures the length *at storage time* as a snapshot, making the diff immune to in-place array mutation (defensive against non-idiomatic React usage).
    - When `streaming=true` and new array is longer than the snapshot: `addData()` with the tail slice.
    - When `streaming=true` but new array is shorter or same length: fall back to `setData()` (data was replaced, not appended).
    - When `streaming=false` (default): always `setData()` (current behavior, no regression).
  - [x] 3.3 Initialize `prevDataLengthRef` in the mount effect alongside `prevSeriesDataRef` initialization:
    ```typescript
    if (series) {
      for (const s of series) {
        prevSeriesDataRef.current.set(s.id, s.data);
        if (s.data !== undefined) {
          prevDataLengthRef.current.set(s.id, s.data.length);
        }
      }
    }
    ```
    Reset in cleanup:
    ```typescript
    prevDataLengthRef.current = new Map();
    ```
    Also prune `prevDataLengthRef` alongside `prevSeriesDataRef` in the series pruning loop.

- [x] Task 4: Wire event callback props in the React wrapper (AC: 2)
  - [x] 4.1 The `onCrosshairMove` and `onZoom` callbacks are inherited from `ChartConfig` (which `GlideChartProps extends`). They flow through the existing config sync mechanism — no new prop handling needed. Verify this by tracing: `GlideChartProps extends ChartConfig` → `ChartConfig.onCrosshairMove` → extracted in config sync effect → passed to `chart.setConfig()`. The existing function-prop tracking pattern (used for `onStaleChange` and `tooltip.formatter`) must be extended:
  - [x] 4.2 In `glide-chart-component.tsx`, add tracking refs for the new callbacks:
    ```typescript
    const prevOnCrosshairMoveRef = useRef(props.onCrosshairMove);
    const prevOnZoomRef = useRef(props.onZoom);
    ```
  - [x] 4.3 In the config sync `useEffect`, add change detection for the new callbacks:
    ```typescript
    const onCrosshairMoveChanged = props.onCrosshairMove !== prevOnCrosshairMoveRef.current;
    const onZoomChanged = props.onZoom !== prevOnZoomRef.current;
    ```
    Add to the skip condition:
    ```typescript
    if (!configChanged && !formatterChanged && !onStaleChanged && !onCrosshairMoveChanged && !onZoomChanged) return;
    ```
    Update refs after calling `setConfig`:
    ```typescript
    prevOnCrosshairMoveRef.current = props.onCrosshairMove;
    prevOnZoomRef.current = props.onZoom;
    ```
  - [x] 4.4 In the JSON comparison, exclude `onCrosshairMove` and `onZoom` (they are functions, not JSON-serializable):
    ```typescript
    const { onStaleChange: _onStaleChange, onCrosshairMove: _onCrosshairMove, onZoom: _onZoom, tooltip, ...jsonSafeConfig } = configProps;
    ```
    Apply the same destructuring update in the mount effect's initial JSON computation.
  - [x] 4.5 Initialize the new tracking refs in the mount effect (alongside the existing `prevOnStaleChangeRef` and `prevFormatterRef` initialization):
    ```typescript
    prevOnCrosshairMoveRef.current = props.onCrosshairMove;
    prevOnZoomRef.current = props.onZoom;
    ```
    **Note on cleanup:** The existing code does NOT reset `prevOnStaleChangeRef` or `prevFormatterRef` in the cleanup function — only `prevConfigJsonRef` and `prevSeriesDataRef` are reset. For consistency, do NOT reset the new callback refs in cleanup either. The refs are re-initialized on the next mount setup anyway, so the reset is unnecessary.

- [x] Task 5: Update React entry point exports (AC: 3)
  - [x] 5.1 Verify `src/react/index.ts` still exports only React-specific types. Do NOT re-export `CrosshairMoveEvent` or `ZoomEvent` from the React entry point — consumers import event types from `'glide-chart'` (main entry). React entry only exports: `GlideChart`, `GlideChartProps`, `GlideChartRef`, `GlideChartSeriesProps`.

- [x] Task 6: Unit tests for core event callbacks (AC: 2)
  - [x] 6.1 In `src/api/glide-chart.test.ts`, add tests for `onCrosshairMove`:
    - Test: callback fires when pointer events are dispatched on the container
    - Test: callback receives correct event shape (`x`, `y`, `timestamp`, `active`, `points`)
    - Test: callback fires with `active: false` when pointer leaves chart
    - Test: callback errors do not crash the chart
    - Test: callback is updated via `setConfig()`
  - [x] 6.2 In `src/api/glide-chart.test.ts`, add tests for `onZoom`:
    - Test: callback fires on wheel zoom with correct domain values
    - Test: callback fires on keyboard +/- zoom
    - Test: callback does NOT fire on arrow key navigation (domain dedup prevents it)
    - Test: callback fires with `isZoomed: true` after zoom
    - Test: callback errors do not crash the chart
    - Test: callback is updated via `setConfig()`
    - Test: callback does NOT fire when `zoom: false`
    - Test: `setData()` resets zoom but does NOT fire `onZoom` (intentional — zoom reset is a side effect of data replacement, not a user zoom action)

- [x] Task 7: Unit tests for React streaming and event props (AC: 1, 2, 3)
  - [x] 7.1 In `src/react/glide-chart-component.test.tsx`, add streaming tests:
    - Test: `streaming={true}` + longer data array → `addData()` called with new tail points (not `setData()`)
    - Test: `streaming={true}` + shorter data array → falls back to `setData()`
    - Test: `streaming={true}` + same reference → no API call
    - Test: `streaming={false}` (default) + longer data array → `setData()` called (not `addData()`)
  - [x] 7.2 In `src/react/glide-chart-component.test.tsx`, add event prop tests:
    - Test: `onCrosshairMove` prop is passed through to core config
    - Test: `onZoom` prop is passed through to core config
    - Test: changing `onCrosshairMove` identity triggers `setConfig()`
    - Test: changing `onZoom` identity triggers `setConfig()`
    - Test: `onCrosshairMove` and `onZoom` excluded from JSON config comparison
  - [x] 7.3 Verify tree-shakeability: `dist/index.js` does NOT contain React imports. `dist/react.js` does NOT contain `react` library code (only external reference). Run `pnpm build` and inspect outputs.

- [x] Task 8: Build and regression verification (AC: 1, 2, 3)
  - [x] 8.1 Run `pnpm build` and verify all outputs generated correctly.
  - [x] 8.2 Run `pnpm test` and verify ALL tests pass (no regressions).
  - [x] 8.3 Run `pnpm typecheck` and verify no TypeScript errors.
  - [x] 8.4 Verify `dist/react.js` does not bundle React code (externalized).

## Dev Notes

### Core Change: Adding Event Callbacks to ChartConfig

This story modifies the core `ChartConfig` — the callbacks are vanilla API, not React-specific. Follow the existing `onStaleChange` pattern:
- Private field on `GlideChart` class, set from config in constructor
- Wrapped in try/catch when firing (consumer errors must not crash chart)
- Updated in `setConfig()` by extracting from `this.userConfig` AFTER deepMerge (line 419 pattern — NOT `partialConfig ?? fallback`)
- Type defined in `config/types.ts`, re-exported through `api/types.ts` → `index.ts`
- **Note:** `onStaleChange` uses an inline type in `ChartConfig`, but the new callbacks use named interfaces (`CrosshairMoveEvent`, `ZoomEvent`). Named types are preferred — this is intentional divergence.

### Streaming Data Diffing — Design Decision

The `streaming` prop is a **hint** to the wrapper about how to apply data changes. When `true`:
- Consumer provides a new array reference with appended points (e.g., `[...prev, newPoint]`)
- Wrapper detects the array grew and calls `addData()` with only the new tail
- This avoids full `setData()` → clear buffer → recompute all splines
- `addData()` only recomputes tail spline segments (O(1) vs O(n))

When `false` (default): wrapper always calls `setData()` — no behavior change from Story 6.1.

**Why not auto-detect?** Auto-detecting append vs replace requires deep comparison of the shared prefix, which is O(n) on potentially 10K+ arrays. An explicit `streaming` flag is O(1) and unambiguous.

### Event Callback Performance Considerations

`onCrosshairMove` fires on every pointer move (potentially 60+ times/sec). Keep the event construction cheap:
- The nearest-point lookup is a **linear scan with early-exit** per series buffer (same as tooltip), NOT binary search. With typically 1-3 series and time-sorted data, the early-exit makes this fast enough.
- Allocate a plain object literal per call — acceptable for consumer callbacks.
- The try/catch around the callback is essentially free in V8 when no error is thrown.

`onZoom` uses **domain deduplication** (`_prevZoomDomainMin`/`_prevZoomDomainMax`) to avoid spurious fires on non-zoom keyboard events.

### Zoom Reset Behavior

`setData()` and `clearData()` call `this.zoomHandler.resetZoom()` internally, which resets `_isZoomed = false`. These methods do NOT fire `onZoom` — zoom reset is a side effect of data replacement, not a user zoom action. Document this in tests as intentional behavior.

### Import DAG Compliance

Per architecture module boundary rules:
- `react/` → `api/` only (imports `GlideChart` class and types from `api/`)
- `react/` must NEVER import from `core/`, `config/`, `renderer/`, `interaction/`, or `streaming/`
- New event types (`CrosshairMoveEvent`, `ZoomEvent`) are defined in `config/types.ts`, re-exported through `api/types.ts`
- React wrapper accesses them via `../api/types` (if needed for type annotations)

### Thin Wrapper Rule

The React component remains a **thin wrapper**. The streaming diff logic is the only "smart" behavior it adds — and it's a simple length comparison + slice, not domain logic. All event handling happens in the core; the React wrapper just passes callback props through to `setConfig()`.

### What NOT to Do

- Do NOT add a pub/sub event system — the callback pattern (`onXxx` prop/config) matches React conventions and the existing `onStaleChange` pattern
- Do NOT expose `EventDispatcher` subscriptions to consumers — these are internal
- Do NOT fire `onCrosshairMove` from the keyboard navigation path — keyboard crosshair movement updates `pointerState` differently via `KeyboardNavigator`. If needed, add in a follow-up
- Do NOT fire `onZoom` from `setData()`/`clearData()` zoom resets — those are data operations, not user zoom actions
- Do NOT add `onDataChange`, `onRender`, or other events not specified in the acceptance criteria
- Do NOT import from `core/`, `config/`, `renderer/`, or `interaction/` in the React wrapper
- Do NOT deep-compare data arrays for streaming detection — use reference equality + length comparison only
- Do NOT remove or change the existing `onStaleChange` behavior

### Existing Code Locations

| File | Purpose | Change |
|------|---------|--------|
| `src/config/types.ts` | Config type definitions | Add `CrosshairMoveEvent`, `ZoomEvent` interfaces; add `onCrosshairMove`, `onZoom` to `ChartConfig` |
| `src/api/types.ts` | API type re-exports | Add re-exports for new event types |
| `src/index.ts` | Package entry point | Add re-exports for new event types |
| `src/api/glide-chart.ts` | Core facade class | Add callback fields, wire to event subscriptions, add `buildCrosshairMoveEvent()` and `fireZoomCallback()` |
| `src/api/glide-chart.test.ts` | Core tests | Add tests for `onCrosshairMove` and `onZoom` |
| `src/react/types.ts` | React prop types | Add `streaming` prop to `GlideChartProps` |
| `src/react/glide-chart-component.tsx` | React wrapper | Add streaming diff logic, add callback tracking refs |
| `src/react/glide-chart-component.test.tsx` | React tests | Add streaming and event prop tests |

### Key Internal Types (DO NOT expose — for reference only)

```typescript
// src/interaction/types.ts — used by buildCrosshairMoveEvent(), NOT exported to consumers
interface PointerState { x: number; y: number; active: boolean; pointerType: string; }
interface TooltipDataPoint { seriesId: string; value: number; timestamp: number; }
```

### Previous Story Intelligence (6.1)

Key learnings from Story 6.1 implementation:
- Mock constructor needs `function` keyword (not arrow) for `new` operator compatibility with vitest
- React dev dependencies already installed (no `pnpm add` needed)
- Config sync uses `JSON.stringify` with function props excluded — extend this pattern for `onCrosshairMove` and `onZoom`
- Function-typed props tracked by reference in separate refs — add refs for the two new callbacks
- `prevConfigJsonRef` and `prevSeriesDataRef` reset in cleanup, but `prevOnStaleChangeRef` and `prevFormatterRef` are NOT — follow the existing pattern (don't reset callback refs)
- Pre-existing TS errors in `src/api/glide-chart.test.ts` — not introduced by this story, don't fix

### Git Intelligence

Recent commits follow pattern: `feat: add <feature> with review fixes (Story X.Y)`. Codebase conventions:
- Co-located tests (`*.test.ts` next to `*.ts`)
- Kebab-case files, PascalCase classes, camelCase methods
- Named exports only, no default exports
- Constructor injection, no singletons
- Error messages prefixed with class name
- Try/catch around consumer callbacks (never crash the chart)

### Project Structure Notes

- Modifies 5 existing files: `config/types.ts`, `api/types.ts`, `index.ts`, `api/glide-chart.ts`, `react/glide-chart-component.tsx`
- Modifies 1 existing type file: `react/types.ts`
- Modifies 2 existing test files: `api/glide-chart.test.ts`, `react/glide-chart-component.test.tsx`
- No new files created — all changes are additions to existing files
- Follows architecture's module boundaries strictly

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 6, Story 6.2 AC]
- [Source: _bmad-output/planning-artifacts/architecture.md — React Wrapper rules, Module DAG, Event Handling]
- [Source: _bmad-output/planning-artifacts/prd.md — FR35: React wrapper, NFR14: React 18+]
- [Source: src/config/types.ts — ChartConfig with onStaleChange callback pattern]
- [Source: src/api/glide-chart.ts — EventDispatcher subscriptions, handleStaleChange pattern, setConfig callback updates]
- [Source: src/interaction/types.ts — PointerState, TooltipDataPoint shapes]
- [Source: src/interaction/tooltip.ts — Tooltip.update() nearest-point lookup pattern]
- [Source: src/interaction/zoom-handler.ts — ZoomHandler.applyZoom(), isZoomed getter, handleWheel/handlePinch]
- [Source: src/react/glide-chart-component.tsx — Config sync, data sync, function-prop tracking refs]
- [Source: src/react/types.ts — GlideChartProps extends ChartConfig, GlideChartRef]
- [Source: _bmad-output/implementation-artifacts/6-1-react-glidechart-component.md — Previous story learnings and review fixes]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Initial `fireZoomCallback` used `_prevZoomDomainMin=0` / `_prevZoomDomainMax=0` defaults, causing spurious fire when domain was already set. Fixed by initializing prev values from `scale.domainX` after autoFitScale in constructor.
- Keyboard +/- zoom test required arrow key navigation first to set `currentIndex >= 0` in KeyboardNavigator. Updated test to navigate with ArrowRight before pressing +.

### Completion Notes List

- Task 1: Added `CrosshairMoveEvent` and `ZoomEvent` interfaces to `config/types.ts`. Added `onCrosshairMove` and `onZoom` callback fields to `ChartConfig`. Re-exported types through `api/types.ts` and `index.ts`.
- Task 2: Wired event callbacks in `GlideChart` facade — private fields, constructor init, pointer subscription fires `onCrosshairMove`, wheel/pinch/keyboard subscriptions fire `onZoom` with domain deduplication. `setConfig()` extracts callbacks from merged config. `destroy()` clears references.
- Task 3: Added `streaming` prop to `GlideChartProps`. Modified data sync effect to use `addData()` for tail-append when `streaming=true` and array grew. Uses `prevDataLengthRef` snapshot for mutation-safe length comparison.
- Task 4: Added `prevOnCrosshairMoveRef` and `prevOnZoomRef` tracking refs. Extended config sync skip condition. Excluded new callbacks from JSON comparison in both mount and sync effects.
- Task 5: Verified `src/react/index.ts` exports only React-specific types. No changes needed.
- Task 6: Added 13 tests for `onCrosshairMove` (5 tests) and `onZoom` (8 tests) in `glide-chart.test.ts`.
- Task 7: Added 9 tests for streaming (4 tests) and event props (5 tests) in `glide-chart-component.test.tsx`. Verified tree-shakeability: `dist/index.js` has zero React references.
- Task 8: Build succeeds, all 713 tests pass (22 new), pre-existing TS errors only.

### Change Log

- 2026-03-31: Implemented Story 6.2 — React streaming data diffing and event callback props

### File List

- src/config/types.ts (modified) — Added CrosshairMoveEvent, ZoomEvent interfaces and onCrosshairMove, onZoom to ChartConfig
- src/api/types.ts (modified) — Added re-exports for CrosshairMoveEvent, ZoomEvent
- src/index.ts (modified) — Added re-exports for CrosshairMoveEvent, ZoomEvent
- src/api/glide-chart.ts (modified) — Added callback fields, buildCrosshairMoveEvent(), fireZoomCallback(), wired to event subscriptions, setConfig update, destroy cleanup
- src/api/glide-chart.test.ts (modified) — Added 13 tests for onCrosshairMove and onZoom callbacks
- src/react/types.ts (modified) — Added streaming prop to GlideChartProps
- src/react/glide-chart-component.tsx (modified) — Added streaming diff logic, prevDataLengthRef, callback tracking refs for onCrosshairMove/onZoom
- src/react/glide-chart-component.test.tsx (modified) — Added 9 tests for streaming and event prop behavior

### Review Findings

- [x] [Review][Patch] Re-baseline `_prevZoomDomainMin/Max` after `setConfig()` zoom reset [src/api/glide-chart.ts:564] — fixed
- [x] [Review][Patch] Clear `_onStaleChange` in `destroy()` for GC safety (pre-existing gap) [src/api/glide-chart.ts:623] — fixed
