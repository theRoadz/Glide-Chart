# Story 7.2: HTML Data Attribute Configuration & Rendering

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a non-technical user,
I want to embed a chart using a div with data attributes and a single script tag,
so that I can add live charts to my website without writing any JavaScript.

## Acceptance Criteria

1. **Given** an HTML page with a script tag loading `glide-chart.umd.js` and a div with `data-glide-chart` attribute, **when** the script loads, **then** the widget auto-discovers all `[data-glide-chart]` elements on the page and creates a GlideChart instance for each with config parsed from data attributes.

2. **Given** data attributes for theme, time window, and appearance, **when** parsed, **then** the chart renders with the specified configuration.

3. **Given** a `data-src` attribute pointing to a JSON endpoint, **when** the widget initializes, **then** it fetches data from the URL and renders the chart.

4. **Given** multiple `[data-glide-chart]` divs on the same page, **then** each widget instance works independently.

5. **Given** the widget script loads, **then** no build step or framework is required by the consumer.

## Tasks / Subtasks

- [x] Task 1: Extend `src/widget/widget.ts` with auto-init logic (AC: 1, 4, 5)
  - [x] 1.1 Create a module-scoped `WeakMap<HTMLElement, GlideChart>` to track instances (avoids TS type issues with augmenting HTMLElement, GC-friendly).
  - [x] 1.2 Add an `init()` function that:
    - Queries `document.querySelectorAll('[data-glide-chart]')`
    - For each element: checks the WeakMap to skip already-initialized elements (prevents double-init when `init()` is called manually after auto-init)
    - Parses data attributes into a `Partial<GlideChartConfig>`, creates `new GlideChart(el, config)`, stores instance in WeakMap
    - Returns an array of created instances
  - [x] 1.3 Add a self-executing auto-init that runs on script load:
    - Guard with `typeof document !== 'undefined'` (safe in SSR-like test environments)
    - Check `document.readyState`. If `'loading'`, add a `DOMContentLoaded` listener. Otherwise, call init immediately.
    - This ensures the UMD bundle auto-discovers elements whether the script is in `<head>` (deferred) or at end of `<body>`
  - [x] 1.4 Attach `init` as a static property on GlideChart: `GlideChart.init = init;` in widget.ts before the default export. This mutates the imported class constructor by adding a property — esbuild inlines everything so this works. The footer `GlideChart = GlideChart.default;` unwraps the namespace but preserves static properties, so `GlideChart.init` remains accessible on the global. **Must be verified in Task 5.2.**

- [x] Task 2: Implement data attribute parser (AC: 2)
  - [x] 2.1 Create `parseDataAttributes(el: HTMLElement): Partial<GlideChartConfig>` — can be in widget.ts or a separate `src/widget/parse-attributes.ts` if it grows beyond ~50 lines. The parser returns only properties for attributes that are actually present on the element — do NOT set `undefined` values, let GlideChart defaults handle missing config. The `series` field with embedded `data` is NOT populated by the parser — data comes from `data-src` fetch separately.
  - [x] 2.2 Map data attributes to config properties using flat `data-*` naming. Access via `el.dataset` (HTML auto-converts `data-line-color` to `dataset.lineColor`):

    | Data Attribute | `dataset` Key | Config Property | Type | Example |
    |---|---|---|---|---|
    | `data-glide-chart` | `glideChart` | *(discovery marker)* | presence | `<div data-glide-chart>` |
    | `data-theme` | `theme` | `theme` | `'light' \| 'dark'` | `data-theme="dark"` |
    | `data-time-window` | `timeWindow` | `timeWindow` | number (seconds) | `data-time-window="300"` |
    | `data-max-points` | `maxPoints` | `maxDataPoints` | number | `data-max-points="500"` |
    | `data-stale-threshold` | `staleThreshold` | `staleThreshold` | number (ms) | `data-stale-threshold="5000"` |
    | `data-zoom` | `zoom` | `zoom` | boolean | `data-zoom="true"` |
    | `data-aria-label` | `ariaLabel` | `ariaLabel` | string | `data-aria-label="BTC Price"` |
    | `data-line-color` | `lineColor` | `line.color` | string | `data-line-color="#00ff00"` |
    | `data-line-width` | `lineWidth` | `line.width` | number | `data-line-width="2"` |
    | `data-line-opacity` | `lineOpacity` | `line.opacity` | number | `data-line-opacity="0.8"` |
    | `data-gradient-enabled` | `gradientEnabled` | `gradient.enabled` | boolean | `data-gradient-enabled="true"` |
    | `data-gradient-top-color` | `gradientTopColor` | `gradient.topColor` | string | `data-gradient-top-color="#00ff00"` |
    | `data-gradient-bottom-color` | `gradientBottomColor` | `gradient.bottomColor` | string | `data-gradient-bottom-color="#000"` |
    | `data-gradient-top-opacity` | `gradientTopOpacity` | `gradient.topOpacity` | number | `data-gradient-top-opacity="0.4"` |
    | `data-gradient-bottom-opacity` | `gradientBottomOpacity` | `gradient.bottomOpacity` | number | `data-gradient-bottom-opacity="0"` |
    | `data-grid-visible` | `gridVisible` | `grid.visible` | boolean | `data-grid-visible="false"` |
    | `data-grid-color` | `gridColor` | `grid.color` | string | `data-grid-color="#333"` |
    | `data-grid-opacity` | `gridOpacity` | `grid.opacity` | number | `data-grid-opacity="0.5"` |
    | `data-grid-line-width` | `gridLineWidth` | `grid.lineWidth` | number | `data-grid-line-width="1"` |
    | `data-grid-dash-pattern` | `gridDashPattern` | `grid.dashPattern` | comma-sep numbers | `data-grid-dash-pattern="5,3"` |
    | `data-animation-enabled` | `animationEnabled` | `animation.enabled` | boolean | `data-animation-enabled="false"` |
    | `data-animation-duration` | `animationDuration` | `animation.duration` | number (ms) | `data-animation-duration="200"` |
    | `data-crosshair-enabled` | `crosshairEnabled` | `crosshair.enabled` | boolean | `data-crosshair-enabled="true"` |
    | `data-tooltip-enabled` | `tooltipEnabled` | `tooltip.enabled` | boolean | `data-tooltip-enabled="false"` |
    | `data-src` | `src` | *(handled separately — fetch URL)* | URL string | `data-src="/api/data.json"` |
    | `data-config` | `config` | *(full JSON config override)* | JSON string | `data-config='{"theme":"dark"}'` |

    Note: Only `enabled` flags are exposed for crosshair and tooltip. Full sub-property customization (colors, fonts, etc.) requires the `data-config` JSON escape hatch.

  - [x] 2.3 Type coercion rules:
    - Strings: used as-is
    - Numbers: `parseFloat()`, skip if `NaN`
    - Booleans: `"true"` / `"false"` string comparison (case-insensitive)
    - Comma-separated numbers (dashPattern): `value.split(',').map(Number).filter(n => !isNaN(n))`
    - JSON (`data-config`): `JSON.parse()`, wrapped in try/catch — `console.warn` on parse failure and skip
  - [x] 2.4 `data-config` is a JSON escape hatch for advanced users. When present, parse it and deep-merge with individual `data-*` attributes. Individual attributes take precedence over `data-config`. After parsing, do NOT validate the JSON structure — pass through as-is and let the GlideChart config resolver handle unknown properties.

- [x] Task 3: Implement `data-src` fetch (AC: 3)
  - [x] 3.1 **Series ID requirement:** `GlideChart.setData(seriesId, points)` throws if the series ID doesn't exist in the chart's series config (`getSeriesOrThrow`). When `data-src` is present, the parser MUST inject a default series entry into the config: `config.series = [{ id: 'default' }]`. For the multi-series JSON format, the init code must construct series entries from the response before calling `setData` — use `chart.setConfig({ series: [...] })` to register series first, then call `setData` for each.
  - [x] 3.2 If `data-src` is present on the element, after creating the GlideChart instance, fetch the URL using `fetch()` (browser-native, no polyfill).
  - [x] 3.3 Expected JSON response format — support two shapes:
    - **Array of DataPoints:** `[{ "t": 1234567890, "v": 42.5 }, ...]` where `t` is timestamp (Unix ms) and `v` is value. Uses series ID `"default"`.
    - **Object with series:** `{ "series": [{ "id": "price", "data": [{ "t": ..., "v": ... }] }] }` for multi-series. Each series ID from the response is used.
  - [x] 3.4 On fetch failure (network error, non-OK status, non-JSON response, CORS error): `console.warn()` with URL and error. Do NOT throw — chart renders empty gracefully.
  - [x] 3.5 Map JSON fields to DataPoint: `{ timestamp: point.t, value: point.v }`. Validate that both `t` and `v` are numbers; skip invalid points.
  - [x] 3.6 The fetch is fire-and-forget (async, non-blocking). The chart renders immediately (empty), then data appears when the fetch completes.

- [x] Task 4: Write tests (AC: 1, 2, 3, 4)
  - [x] 4.1 **Parser tests** (`src/widget/parse-attributes.test.ts` or in `widget.test.ts`):
    - Parses `data-theme` to config.theme
    - Parses numeric attributes (data-time-window, data-line-width) correctly
    - Parses boolean attributes (data-zoom, data-grid-visible) correctly
    - Parses `data-grid-dash-pattern` comma-separated values to number array
    - Ignores unknown data attributes
    - `data-config` JSON parsing and merge with individual attributes (individual wins)
    - `data-config` parse failure logs warning and falls through
    - Missing attributes produce no config keys (rely on defaults)
  - [x] 4.2 **Auto-init tests** (`src/widget/widget.test.ts` — extend existing):
    - Discovers `[data-glide-chart]` elements in DOM
    - Creates GlideChart instance for each discovered element
    - Multiple elements create independent instances
    - Does not throw on elements with no data attributes (uses defaults)
    - Skips already-initialized elements on second `init()` call (double-init prevention)
    - Manual `init()` call works for dynamically added elements
    - Note: the auto-init side effect fires on import in tests. Set up DOM elements with `[data-glide-chart]` BEFORE importing widget.ts, OR extract auto-init to a testable function guarded by `typeof document !== 'undefined'`
  - [x] 4.3 **Fetch tests** (mock global `fetch`):
    - `data-src` triggers fetch on init
    - Successful fetch with array format calls `setData` with series ID `"default"`
    - Successful fetch with object format registers series via `setConfig` then calls `setData` for each
    - Fetch failure logs warning, chart remains empty (no throw)
    - Invalid data points (missing t/v) are skipped
  - [x] 4.4 **Integration-style test:**
    - Full flow: create DOM element with data attributes + data-src, run init, verify chart created with correct config
  - [x] 4.5 Note: GlideChart constructor requires an HTMLElement. In jsdom tests, elements with zero dimensions default to 300x150 internally — don't skip them. Follow existing test patterns from `src/widget/widget.test.ts`. If `parse-attributes.ts` is created as a separate file, add a module boundary test verifying it only imports from `../api/` or `./` (within widget/).

- [x] Task 5: Verify build (AC: 5)
  - [x] 5.1 **Verify the esbuild footer still works** after adding init and auto-init logic:
    - `typeof GlideChart === 'function'` (constructor)
    - `typeof GlideChart.init === 'function'` (static method survived footer unwrap)
    - Auto-init fires on script load in a browser context
  - [x] 5.2 **No changes to tsup.config.ts needed** — widget is excluded from tsup (UMD-only via esbuild).
  - [x] 5.3 Rebuild and verify UMD bundle size stays within 30KB gzip budget.

- [x] Task 6: Verification (AC: 1, 2, 3, 4, 5)
  - [x] 6.1 Run `pnpm test` — all existing 718+ tests must pass plus new tests
  - [x] 6.2 Run `pnpm build` — verify both tsup and UMD build succeed
  - [x] 6.3 Verify `dist/glide-chart.umd.js` bundle size stays under 30KB gzipped
  - [x] 6.4 Tree-shakeability: confirm `dist/index.js` has zero "widget" references
  - [x] 6.5 Verify UMD global: load bundle, confirm `typeof GlideChart === 'function'` and `typeof GlideChart.init === 'function'`

## Dev Notes

### Architecture Compliance

- **Module boundary rule:** `widget/` ONLY imports from `api/`. Never import directly from `core/`, `config/`, `renderer/`, or `interaction/`. If `parse-attributes.ts` is a separate file, it can import from `../api/` or `./` (within widget/) only. [Source: architecture.md — Module Boundaries table]
- **No `export default` rule exception:** `widget.ts` uses `export default GlideChart` (established in Story 7.1) because esbuild's `globalName` + `footer` pattern requires it. This exception is documented and intentional.
- **Side effects are intentional for UMD:** The auto-init code (DOMContentLoaded listener) is a side effect. This is correct — the UMD bundle is meant to self-execute. The `"sideEffects": false` in package.json applies to the ESM/CJS paths only. No package.json change needed.
- **GlideChart constructor:** `constructor(container: HTMLElement, config?: GlideChartConfig)` — container is required, config is optional. Throws if container is not an HTMLElement. Zero-dimension containers default to 300x150 internally.

### Critical: `setData` Requires Pre-Configured Series

`GlideChart.setData(seriesId, points)` calls `getSeriesOrThrow(seriesId)` which throws `"series 'X' not found. Add it via config.series first."` if the series ID is not in the chart's series map. The series map is populated from `resolvedConfig.series` during construction. If no `series` config is passed, the resolved series array is **empty**.

Therefore: when `data-src` is present, the widget MUST include `series: [{ id: 'default' }]` in the config passed to the constructor. For multi-series `data-src` responses, register additional series via `chart.setConfig()` before calling `setData`.

### Callback Configs Not Mappable

`onStaleChange`, `onCrosshairMove`, `onZoom`, `labelFormatter`, tooltip `formatter` require JavaScript functions and are NOT mappable from data attributes. Users who need callbacks use the programmatic API. Only `enabled` flags are exposed for crosshair and tooltip via data attributes — full sub-property customization requires `data-config` JSON.

### CORS and `data-src`

CORS restrictions apply to `data-src` fetch. If the endpoint is on a different origin, the server must include appropriate CORS headers. Fetch failures (including CORS errors) are caught and logged as `console.warn` — the chart renders empty.

### Previous Story Intelligence

From Story 7.1 code review:
- esbuild's `__toCommonJS` wrapping applies even with default-only exports — the `footer` fix is critical
- The `"import"` condition was removed from the `./widget` export in package.json — only `"default"` remains
- `mkdirSync('dist', { recursive: true })` ensures standalone `build:umd` works
- Typecheck: `@ts-expect-error` needed for Vite `?raw` imports in tests
- All 718 tests passing at story 7.1 completion
- UMD bundle: 59.5KB raw, 15.5KB gzipped

### Project Structure Notes

- New/modified files in `src/widget/` only
- Optionally create `src/widget/parse-attributes.ts` if parser logic is substantial (>50 lines); otherwise keep in `widget.ts`
- Test files co-located: `src/widget/parse-attributes.test.ts` or extend `src/widget/widget.test.ts`
- No changes to `src/index.ts`, `tsup.config.ts`, or `scripts/build-umd.js` expected

### References

- [Source: architecture.md — Module Boundaries: widget/ imports only from api/]
- [Source: architecture.md — Build Process: tsup + esbuild separation]
- [Source: architecture.md — Directory Structure: src/widget/widget.ts]
- [Source: prd.md — FR29: Single script tag + data attributes for embedding]
- [Source: prd.md — FR30: No build step or framework required]
- [Source: prd.md — FR31: Configure appearance through data attributes]
- [Source: prd.md — FR32: Specify data source through data attributes]
- [Source: prd.md — NFR15: UMD must not conflict with other scripts]
- [Source: prd.md — NFR16: Must not pollute global namespace beyond GlideChart]
- [Source: epics.md — Epic 7, Story 7.2: HTML Data Attribute Configuration & Rendering]
- [Source: project-context.md — Build outputs, testing rules, anti-patterns]
- [Source: 7-1-umd-widget-bundle-build.md — Review findings and dev learnings]
- [Source: src/api/glide-chart.ts — getSeriesOrThrow requires pre-configured series IDs]
- [Source: src/config/resolver.ts — Empty series array when no series config provided]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- ResizeObserver + matchMedia stubs required for jsdom (consistent with existing test patterns)
- ThemeMode enum used instead of string literal for type safety
- Added `console`, `fetch`, `Response` to eslint globals (first widget source to use browser fetch API)

### Completion Notes List

- Task 1: Extended `widget.ts` with WeakMap instance tracking, `init()` function, auto-init on script load (DOMContentLoaded guard), `GlideChart.init` static property
- Task 2: Created `parse-attributes.ts` with full data attribute parser covering all 26 config attributes per the attribute mapping table. Type coercion for strings, numbers, booleans, comma-separated arrays, and JSON. `data-config` escape hatch with individual attributes taking precedence.
- Task 3: Implemented `data-src` fetch with support for array format (single series "default") and object format (multi-series via `setConfig` + `setData`). Fire-and-forget async, graceful error handling with `console.warn`.
- Task 4: 50 new tests across `parse-attributes.test.ts` (parser unit tests, module boundary) and `widget.test.ts` (auto-init, fetch, integration). All 768 tests pass.
- Task 5: Verified UMD build — `typeof GlideChart === 'function'`, `typeof GlideChart.init === 'function'` confirmed via vm.runInContext. Bundle: 63.4KB raw, 16.6KB gzipped (within 30KB budget).
- Task 6: Full verification — all 768 tests pass, build succeeds, `dist/index.js` has zero "widget" references (tree-shakeable), lint and typecheck clean for new files.

### Change Log

- Story 7.2 implementation complete (Date: 2026-03-31)

### File List

- src/widget/widget.ts (modified — added auto-init, init(), WeakMap, data-src fetch)
- src/widget/parse-attributes.ts (new — data attribute parser)
- src/widget/widget.test.ts (modified — added auto-init, fetch, integration tests)
- src/widget/parse-attributes.test.ts (new — parser unit tests + module boundary test)
- eslint.config.js (modified — added console, fetch, Response globals)

### Review Findings

- [x] [Review][Patch] `parseNumber` accepts `Infinity` — should reject non-finite values [src/widget/parse-attributes.ts:12] — Fixed: `isNaN` → `Number.isFinite`
- [x] [Review][Patch] `data-src` with empty string `""` triggers fetch to invalid URL — guard against empty src [src/widget/widget.ts:86] — Fixed: added `!== ''` check
- [x] [Review][Patch] Multi-series response with undefined `s.data` crashes `toDataPoints` — add guard [src/widget/widget.ts:60] — Fixed: `Array.isArray` guard with fallback to `[]`
- [x] [Review][Patch] Multi-series response with missing/empty `s.id` passes invalid config — validate before use [src/widget/widget.ts:58] — Fixed: filter series with valid string `id`
- [x] [Review][Patch] No AbortController for data-src fetch — use-after-destroy risk — Fixed: added AbortController + abort on destroy
- [x] [Review][Patch] No `destroy()` API to clean up widget instances for SPA usage — Fixed: added `GlideChart.destroy(el)` static method
