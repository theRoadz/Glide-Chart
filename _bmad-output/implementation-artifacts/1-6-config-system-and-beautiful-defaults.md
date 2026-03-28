# Story 1.6: Config System & Beautiful Defaults

Status: done

## Story

As a developer using Glide Chart,
I want a configuration system with sensible defaults that produces a beautiful chart with zero config,
So that I get the "snake in slow motion" aesthetic immediately without any tweaking.

## Acceptance Criteria

1. **Given** no user configuration is provided **When** the config resolver runs **Then** a complete `ResolvedConfig` is produced with beautiful default colors, line thickness, gradient, grid, and animation settings
2. **Given** a partial user configuration **When** merged with defaults **Then** deep merge produces a correct result (user values override defaults, unspecified values retain defaults)
3. **Given** per-series config overrides (e.g., custom color for a specific series) **When** merged **Then** per-series values override global defaults while retaining unspecified series properties from defaults
4. **Given** a resolved config **When** any visual component reads it **Then** property access is plain object lookup (zero overhead at render time — no getters, no proxies, no lazy evaluation)
5. **Given** a `theme: 'dark'` or `theme: 'light'` in user config **When** the resolver runs **Then** the theme preset is applied between defaults and user overrides (merge order: `DEFAULT_CONFIG` ← `themePreset` ← `userConfig`)
6. **Given** a resolved config **When** used by renderers **Then** the config object is treated as immutable (read-only) — no mutations after resolution

## Tasks / Subtasks

- [x]Task 1: Define config types in `src/config/types.ts` (AC: #1, #4, #6)
  - [x]Define `ThemeMode` enum: `Light = 'light'`, `Dark = 'dark'`
  - [x]Define `LineConfig` interface:
    ```typescript
    export interface LineConfig {
      color: string;
      width: number;
      opacity: number;
    }
    ```
  - [x]Define `GradientConfig` interface:
    ```typescript
    export interface GradientConfig {
      enabled: boolean;
      topColor: string;     // color at the line (top of gradient)
      bottomColor: string;  // color at the baseline (bottom)
      topOpacity: number;
      bottomOpacity: number;
    }
    ```
  - [x]Define `GridConfig` interface:
    ```typescript
    export interface GridConfig {
      visible: boolean;
      color: string;
      opacity: number;
      lineWidth: number;
    }
    ```
  - [x]Define `AnimationConfig` interface:
    ```typescript
    export interface AnimationConfig {
      enabled: boolean;
      duration: number;  // milliseconds for data transitions
    }
    ```
  - [x]Define `AxisConfig` interface:
    ```typescript
    export interface AxisConfig {
      visible: boolean;
      labelColor: string;
      labelFontSize: number;
      labelFontFamily: string;
      tickColor: string;
      tickLength: number;
    }
    ```
  - [x]Define `CrosshairConfig` interface:
    ```typescript
    export interface CrosshairConfig {
      enabled: boolean;
      color: string;
      lineWidth: number;
      dashPattern: number[];  // e.g., [4, 4] for dashed
    }
    ```
  - [x]Define `TooltipConfig` interface:
    ```typescript
    export interface TooltipConfig {
      enabled: boolean;
      backgroundColor: string;
      textColor: string;
      fontSize: number;
      fontFamily: string;
      padding: number;
      borderRadius: number;
    }
    ```
  - [x]Define `SeriesConfig` interface:
    ```typescript
    export interface SeriesConfig {
      id: string;
      line?: Partial<LineConfig>;
      gradient?: Partial<GradientConfig>;
    }
    ```
  - [x]Define `ChartConfig` (user-facing, all optional except where noted):
    ```typescript
    export interface ChartConfig {
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
      staleThreshold?: number;  // ms before data is considered stale (FR10)
      zoom?: boolean;
    }
    ```
  - [x]Define `ResolvedConfig` (fully resolved, no optionals, all `Partial<>` replaced with complete types):
    ```typescript
    export interface ResolvedConfig {
      readonly theme: ThemeMode;
      readonly backgroundColor: string;
      readonly line: Readonly<LineConfig>;
      readonly gradient: Readonly<GradientConfig>;
      readonly grid: Readonly<GridConfig>;
      readonly animation: Readonly<AnimationConfig>;
      readonly xAxis: Readonly<AxisConfig>;
      readonly yAxis: Readonly<AxisConfig>;
      readonly crosshair: Readonly<CrosshairConfig>;
      readonly tooltip: Readonly<TooltipConfig>;
      readonly series: readonly Readonly<ResolvedSeriesConfig>[];
      readonly maxDataPoints: number;
      readonly staleThreshold: number;
      readonly zoom: boolean;
    }
    ```
  - [x]Define `ResolvedSeriesConfig` (fully resolved per-series):
    ```typescript
    export interface ResolvedSeriesConfig {
      readonly id: string;
      readonly line: Readonly<LineConfig>;
      readonly gradient: Readonly<GradientConfig>;
    }
    ```

- [x]Task 2: Implement dark theme preset in `src/config/themes.ts` (AC: #5)
  - [x]Define `DARK_THEME` constant (type `Partial<ChartConfig>`):
    - `backgroundColor`: `'#0a0a0f'` (near-black with blue tint — crypto dashboard feel)
    - `line.color`: `'#00d4aa'` (minty teal — the signature Glide Chart color)
    - `line.width`: `2`
    - `line.opacity`: `1`
    - `gradient.enabled`: `true`
    - `gradient.topColor`: `'#00d4aa'`
    - `gradient.bottomColor`: `'#00d4aa'`
    - `gradient.topOpacity`: `0.3`
    - `gradient.bottomOpacity`: `0.0`
    - `grid.visible`: `true`
    - `grid.color`: `'#ffffff'`
    - `grid.opacity`: `0.06`
    - `grid.lineWidth`: `1`
    - `animation.enabled`: `true`
    - `animation.duration`: `300`
    - `xAxis.visible`: `true`
    - `xAxis.labelColor`: `'#8a8a9a'` (muted gray — WCAG AA compliant on dark bg)
    - `xAxis.labelFontSize`: `11`
    - `xAxis.labelFontFamily`: `'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'`
    - `xAxis.tickColor`: `'#3a3a4a'`
    - `xAxis.tickLength`: `4`
    - `yAxis`: same pattern as xAxis
    - `crosshair.enabled`: `true`
    - `crosshair.color`: `'#ffffff'`
    - `crosshair.lineWidth`: `1`
    - `crosshair.dashPattern`: `[4, 4]`
    - `tooltip.enabled`: `true`
    - `tooltip.backgroundColor`: `'#1a1a2e'`
    - `tooltip.textColor`: `'#e0e0e0'`
    - `tooltip.fontSize`: `12`
    - `tooltip.fontFamily`: (same system font stack)
    - `tooltip.padding`: `8`
    - `tooltip.borderRadius`: `4`
    - `zoom`: `true`
    - `maxDataPoints`: `10000`
    - `staleThreshold`: `5000`
  - [x]Define `LIGHT_THEME` constant (type `Partial<ChartConfig>`) — all values explicit:
    - `backgroundColor`: `'#ffffff'`
    - `line.color`: `'#0066cc'` (strong blue)
    - `line.width`: `2`
    - `line.opacity`: `1`
    - `gradient.enabled`: `true`
    - `gradient.topColor`: `'#0066cc'`
    - `gradient.bottomColor`: `'#0066cc'`
    - `gradient.topOpacity`: `0.2`
    - `gradient.bottomOpacity`: `0.0`
    - `grid.visible`: `true`
    - `grid.color`: `'#000000'`
    - `grid.opacity`: `0.08`
    - `grid.lineWidth`: `1`
    - `animation.enabled`: `true`
    - `animation.duration`: `300`
    - `xAxis.visible`: `true`
    - `xAxis.labelColor`: `'#555555'` (WCAG AA on white)
    - `xAxis.labelFontSize`: `11`
    - `xAxis.labelFontFamily`: `'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'`
    - `xAxis.tickColor`: `'#cccccc'`
    - `xAxis.tickLength`: `4`
    - `yAxis`: same pattern as xAxis
    - `crosshair.enabled`: `true`
    - `crosshair.color`: `'#333333'` (dark crosshair on light bg)
    - `crosshair.lineWidth`: `1`
    - `crosshair.dashPattern`: `[4, 4]`
    - `tooltip.enabled`: `true`
    - `tooltip.backgroundColor`: `'#ffffff'`
    - `tooltip.textColor`: `'#333333'`
    - `tooltip.fontSize`: `12`
    - `tooltip.fontFamily`: (same system font stack)
    - `tooltip.padding`: `8`
    - `tooltip.borderRadius`: `4`
    - `zoom`: `true`
    - `maxDataPoints`: `10000`
    - `staleThreshold`: `5000`
  - [x]Export `getThemePreset(mode: ThemeMode): Partial<ChartConfig>` function that returns the appropriate theme object
  - [x]**Color contrast validation**: all label colors must meet WCAG 2.1 AA (4.5:1 ratio) against their background. Verify:
    - Dark: `#8a8a9a` on `#0a0a0f` → ~6.8:1 ✓
    - Light: `#555555` on `#ffffff` → ~7.5:1 ✓

- [x]Task 3: Implement default config in `src/config/defaults.ts` (AC: #1)
  - [x]Define `DEFAULT_CONFIG` constant (type `ResolvedConfig`):
    - Uses dark theme values as the base (dark-first for crypto/DeFi audience)
    - All properties fully specified — no optionals, no undefined
    - `theme`: `ThemeMode.Dark`
    - `series`: empty array `[]` (series are added via user config)
    - All other values match `DARK_THEME` preset values
    - **DRY implementation:** Build `DEFAULT_CONFIG` by spreading/referencing `DARK_THEME` values rather than duplicating them. Import from `./themes` and apply the dark theme values with proper typing to produce a complete `ResolvedConfig`.
  - [x]Export `DEFAULT_CONFIG` as `UPPER_SNAKE_CASE` constant

- [x]Task 4: Implement config resolver in `src/config/resolver.ts` (AC: #1, #2, #3, #5, #6)
  - [x]Implement `deepMerge<T>(target: T, source: Partial<T>): T` — internal helper
    - Recursively merges plain objects
    - Arrays are replaced (not concatenated) — e.g., `dashPattern` replaces entirely
    - Primitives: source overrides target
    - `undefined` values in source are skipped (don't override target)
    - `null` values in source are skipped (config types don't support null — allowing null would break the `ResolvedConfig` type contract)
    - Only recurses into plain objects (`Object.getPrototypeOf(value) === Object.prototype`) — class instances like `Date` are treated as primitives (replaced, not recursed)
    - Does NOT mutate either input — returns a new object
    - Handles nested objects (e.g., `grid: { visible: false }` merges into full `GridConfig`)
  - [x]Implement `resolveConfig(userConfig?: ChartConfig): ResolvedConfig`
    - Step 1: Start with `DEFAULT_CONFIG` (deep clone)
    - Step 2: If `userConfig?.theme` is set, apply `getThemePreset(userConfig.theme)` via deep merge
    - Step 3: Apply `userConfig` overrides via deep merge (excluding `theme` which was already handled)
    - Step 4: Resolve per-series configs — for each series in `userConfig.series`:
      - Deep merge global `line` + `gradient` defaults with per-series overrides
      - Produce a `ResolvedSeriesConfig` with complete `line` and `gradient`
    - Step 5: Deep-freeze the result — implement a recursive `deepFreeze` utility that freezes the top-level object and all nested objects/arrays. This prevents `config.line.color = 'red'` from silently succeeding in non-strict JS consumers. The `Readonly<>` types are the primary compile-time guard; `deepFreeze` is the runtime guard.
    - Return `ResolvedConfig`
  - [x]Input validation in `resolveConfig`:
    - `maxDataPoints` must be a positive integer if provided — throw `ConfigResolver: maxDataPoints must be a positive integer`
    - `staleThreshold` must be a non-negative number if provided — throw `ConfigResolver: staleThreshold must be non-negative`
    - `line.width` must be positive if provided — throw `ConfigResolver: line.width must be positive`
    - `line.opacity` must be 0-1 if provided — throw `ConfigResolver: line.opacity must be between 0 and 1`
    - `gradient.topOpacity`/`bottomOpacity` must be 0-1 if provided
    - Invalid `theme` value (not 'light' or 'dark') — throw `ConfigResolver: invalid theme '${value}'`
    - **Validation timing:** `theme` is validated BEFORE merge (to select correct preset). All other validations run on the FINAL merged result (since user input is intentionally partial and may rely on defaults for valid ranges).
    - Error messages prefixed with `ConfigResolver:`

- [x]Task 5: Write tests for deep merge in `src/config/resolver.test.ts` (AC: #2, #3)
  - [x]Test: merging empty source returns target unchanged
  - [x]Test: primitive override replaces target value
  - [x]Test: nested object merge preserves non-overlapping target properties
  - [x]Test: nested object merge overrides overlapping properties
  - [x]Test: array replacement (not concatenation) — e.g., `dashPattern`
  - [x]Test: `undefined` in source does not override target
  - [x]Test: `null` in source does not override target
  - [x]Test: class instances (e.g., `Date`) are treated as primitives (replaced, not recursed)
  - [x]Test: source and target are not mutated

- [x]Task 6: Write tests for `resolveConfig` in `src/config/resolver.test.ts` (AC: #1, #2, #3, #4, #5, #6)
  - [x]Test: no user config → returns complete `ResolvedConfig` with all dark theme defaults
  - [x]Test: partial user config overrides only specified values
  - [x]Test: `theme: 'light'` applies light theme preset values
  - [x]Test: `theme: 'dark'` explicitly — same as default but via explicit selection
  - [x]Test: user overrides applied ON TOP of theme preset (merge order: defaults ← theme ← user)
  - [x]Test: per-series line color override while retaining default width and opacity
  - [x]Test: per-series gradient override while retaining default line settings
  - [x]Test: multiple series each with different overrides
  - [x]Test: resolved config top-level is frozen (`Object.isFrozen`)
  - [x]Test: resolved config nested objects are frozen (deep freeze — e.g., `Object.isFrozen(config.line)`)
  - [x]Test: resolved config has no `undefined` values at any level
  - [x]Test: invalid `maxDataPoints` (0, negative, non-integer) throws
  - [x]Test: invalid `staleThreshold` (negative) throws
  - [x]Test: invalid `line.opacity` (< 0 or > 1) throws
  - [x]Test: invalid theme string throws
  - [x]Test: series with empty overrides inherits all global defaults

- [x]Task 7: Write tests for defaults in `src/config/defaults.test.ts` (AC: #1)
  - [x]Test: `DEFAULT_CONFIG` has `theme` set to `ThemeMode.Dark`
  - [x]Test: `DEFAULT_CONFIG` has empty `series` array
  - [x]Test: `DEFAULT_CONFIG` has no `undefined` values at any nesting level
  - [x]Test: `DEFAULT_CONFIG.line` has all required fields (color, width, opacity)
  - [x]Test: `DEFAULT_CONFIG.gradient` has all required fields
  - [x]Test: `DEFAULT_CONFIG.grid` has all required fields
  - [x]Test: `DEFAULT_CONFIG.xAxis` and `yAxis` have all required fields
  - [x]Test: `DEFAULT_CONFIG.crosshair` has all required fields
  - [x]Test: `DEFAULT_CONFIG.tooltip` has all required fields
  - [x]Test: `DEFAULT_CONFIG.maxDataPoints` is positive integer
  - [x]Test: `DEFAULT_CONFIG.staleThreshold` is non-negative

- [x]Task 8: Write tests for themes in `src/config/themes.test.ts` (AC: #5)
  - [x]Test: `getThemePreset(ThemeMode.Dark)` returns dark theme values
  - [x]Test: `getThemePreset(ThemeMode.Light)` returns light theme values
  - [x]Test: dark theme background is dark (`#0a0a0f`)
  - [x]Test: light theme background is white (`#ffffff`)
  - [x]Test: dark theme line color is teal (`#00d4aa`)
  - [x]Test: light theme line color is blue (`#0066cc`)
  - [x]Test: both themes have all required config sections defined

- [x]Task 9: Verify integration and quality gates
  - [x]Run `pnpm test` — all tests pass (existing 140 + new config tests)
  - [x]Run `pnpm typecheck` — no type errors
  - [x]Run `pnpm lint` — no lint errors
  - [x]Run `pnpm build` — build succeeds
  - [x]Do NOT update `src/index.ts` — public API exports are Story 1.8's concern

## Dev Notes

### Architecture Compliance

**Module:** `src/config/` — depends on `src/core/` (types only, if needed). Does NOT import from `renderer/`, `interaction/`, or `api/`.

**Import rules for config module:**
- `types.ts` — standalone, no imports from other modules
- `themes.ts` — imports from `./types` only
- `defaults.ts` — imports from `./types` and `./themes`
- `resolver.ts` — imports from `./types`, `./defaults`, `./themes`
- No file in `src/config/` imports from `src/core/`, `src/renderer/`, `src/interaction/`, or `src/api/`

**Config module is a leaf in the dependency graph** for now. Later, `renderer/` and `api/` will import from `config/`.

### Export Visibility

All functions and constants in `src/config/` should be **named exports** from their respective files for testability and internal use. However, NONE of them are re-exported from `src/index.ts` — public API exports happen in Story 1.8. Specifically:
- `deepMerge` — exported from `resolver.ts` (useful for tests), but NOT a public API
- `deepFreeze` — exported from `resolver.ts` (internal utility)
- `resolveConfig` — exported from `resolver.ts` (consumed by the facade in Story 1.8)
- `DEFAULT_CONFIG` — exported from `defaults.ts`
- `DARK_THEME`, `LIGHT_THEME`, `getThemePreset` — exported from `themes.ts`

### Deep Merge Design — Critical Details

The architecture specifies: **"Deep merge: `defaultConfig` ← `themePreset` ← `userConfig`"**. This means:

1. Start with `DEFAULT_CONFIG` (complete `ResolvedConfig`)
2. Apply theme preset on top (only if theme specified by user)
3. Apply user overrides on top of the themed config

**Array handling is REPLACE, not concat.** If a user provides `crosshair: { dashPattern: [2, 2] }`, the entire array replaces the default `[4, 4]`. This matches intuitive config behavior — you don't want `[4, 4, 2, 2]`.

**The `series` array is special.** User-provided `series` replaces the entire series list (default is `[]`). Each series entry is then resolved individually against global line/gradient defaults.

### Resolved Config as Immutable Snapshot

The `ResolvedConfig` is computed once and passed to all layer renderers via constructor injection. Renderers read properties as plain object lookups — zero overhead.

When `chart.setConfig(partial)` is called (Story 1.8), the facade:
1. Calls `resolveConfig(mergedPartial)` to produce a NEW `ResolvedConfig`
2. Passes the new config to all subsystems that need it
3. Marks all layers dirty

**Important:** `ResolvedConfig` uses `readonly` on all properties as the compile-time guard. A recursive `deepFreeze` utility is applied as the runtime guard — this ensures that even non-TypeScript consumers (or JS consumers in non-strict mode) cannot mutate nested config properties like `config.line.color = 'red'`.

### Per-Series Config Resolution

Each series inherits global line/gradient defaults, then applies per-series overrides:

```typescript
// If user provides:
{
  line: { color: '#ff0000', width: 3 },  // global
  series: [
    { id: 'price', line: { color: '#00ff00' } },  // series override
    { id: 'ref', line: {} },  // no override
  ]
}

// Resolved series:
// price → line: { color: '#00ff00', width: 3, opacity: 1 }  (color from series, width from global, opacity from default)
// ref   → line: { color: '#ff0000', width: 3, opacity: 1 }  (all from global user config)
```

### Beautiful Defaults — Design Rationale

The default theme is **dark** because:
- Primary audience is crypto/DeFi developers building trading dashboards
- Dark backgrounds make gradient fills and colored lines pop visually
- The "snake in slow motion" aesthetic is most dramatic on dark backgrounds
- Matches the Polymarket visual language that inspired the project

The signature color is **`#00d4aa` (minty teal)** because:
- High visual contrast on dark backgrounds
- Distinctive — not the default blue/green/red of other charting libraries
- Associates with financial "green" / positive sentiment
- Works well with gradient fade-to-transparent

### Color Choices and WCAG Compliance

All text colors must meet WCAG 2.1 AA contrast ratio (4.5:1 minimum for normal text):

| Element | Color | Background | Ratio | Status |
|---------|-------|------------|-------|--------|
| Dark axis labels | `#8a8a9a` | `#0a0a0f` | ~6.8:1 | ✓ AA |
| Light axis labels | `#555555` | `#ffffff` | ~7.5:1 | ✓ AA |
| Dark tooltip text | `#e0e0e0` | `#1a1a2e` | ~11:1 | ✓ AA |
| Light tooltip text | `#333333` | `#ffffff` | ~12.6:1 | ✓ AA |
| Light crosshair | `#333333` | `#ffffff` | ~12.6:1 | ✓ AA |

### Naming Conventions

- Files: `defaults.ts`, `themes.ts`, `resolver.ts`, `types.ts` (kebab-case)
- Constants: `DEFAULT_CONFIG`, `DARK_THEME`, `LIGHT_THEME` (UPPER_SNAKE_CASE)
- Enum: `ThemeMode` with values `Light`, `Dark` (PascalCase)
- Interfaces: `ChartConfig`, `ResolvedConfig`, `LineConfig`, etc. (PascalCase, no `I` prefix)
- Functions: `resolveConfig`, `deepMerge`, `getThemePreset` (camelCase)
- Error messages: prefixed with `ConfigResolver:` for resolver errors

### Testing Standards

- **Framework:** Vitest with `globals: true` — do NOT import `describe`, `it`, `expect`, or `vi` from `vitest`. They are all available globally.
- **Co-located:** `resolver.test.ts` next to `resolver.ts`, `themes.test.ts` next to `themes.ts`
- **No DOM needed:** Config module is pure TypeScript logic — no canvas, no jsdom dependencies
- **No mocking internal modules:** Test with real implementations. `resolveConfig` uses real `DEFAULT_CONFIG` and real theme presets.
- **Test structure:** Group by function (`describe('resolveConfig', ...)`, `describe('deepMerge', ...)`), then by behavior

### What NOT To Do

- **DO NOT** create layer renderers or drawing logic — those are Stories 1.7, 2.1, etc.
- **DO NOT** create the GlideChart facade or public API — that's Story 1.8
- **DO NOT** update `src/index.ts` exports — that's Story 1.8
- **DO NOT** import from `src/renderer/`, `src/interaction/`, or `src/api/`
- **DO NOT** add any runtime dependencies
- **DO NOT** use `export default`
- **DO NOT** create circular imports
- **DO NOT** use `any` type anywhere
- **DO NOT** implement tooltip rendering, crosshair rendering, or axis rendering — config types define the shape, but rendering is other stories
- **DO NOT** use Proxy, getter traps, or lazy evaluation for config — plain frozen objects only
- **DO NOT** implement `chart.setConfig()` — that's the facade's responsibility (Story 1.8)

### File Locations — Exact Paths

| File | Path | Purpose |
|------|------|---------|
| Config types | `src/config/types.ts` | All config interfaces: `ChartConfig`, `ResolvedConfig`, `ThemeMode`, etc. |
| Theme presets | `src/config/themes.ts` | `DARK_THEME`, `LIGHT_THEME` constants, `getThemePreset()` |
| Theme tests | `src/config/themes.test.ts` | Theme preset validation tests |
| Default config | `src/config/defaults.ts` | `DEFAULT_CONFIG` constant |
| Default tests | `src/config/defaults.test.ts` | Default config completeness tests |
| Config resolver | `src/config/resolver.ts` | `resolveConfig()`, `deepMerge()`, `deepFreeze()` |
| Resolver tests | `src/config/resolver.test.ts` | Deep merge + resolve config tests |

### Previous Story Intelligence

**From Story 1.5 (done — previous story):**
- LayerManager and FrameScheduler implemented in `src/renderer/`
- `Layer` interface has `draw(): void` — layers capture config via constructor injection, not method params
- FrameScheduler owns `save()`/`restore()` bracketing for layers
- Browser globals added to ESLint config for DOM/Canvas API support
- ESLint 10 flat config (`eslint.config.js`)
- 140 total tests passing

**From Story 1.4 (done):**
- `Scale` class in `src/core/scale.ts` — shared coordinate authority
- `Viewport`, `ScaleDomain`, `Padding`, `ScaleOptions` in `src/core/types.ts`
- Private members used underscore prefix to avoid getter name collision — established precedent
- `Readonly<>` return types on getters prevent mutable object exposure

**From Story 1.3 (done):**
- `SplineCache` class with constructor injection pattern
- Error messages prefixed with class name — follow same pattern
- `private` keyword (not underscore prefix) for members without getter collision

**From Story 1.2 (done):**
- `RingBuffer<T>` in `src/core/ring-buffer.ts` — O(1) push/evict
- `DataPoint` type: `{ timestamp: number; value: number }`

**From Story 1.1 (done):**
- TypeScript 6.x (not 5.x as architecture doc says), `ignoreDeprecations: "6.0"` in tsconfig
- ESLint 10 flat config — not `.eslintrc.cjs` as architecture doc lists
- Vitest globals: `true` — do NOT import test utilities from `vitest`
- `sideEffects: false` in package.json

### Existing Code Awareness

**`src/config/types.ts`** — Currently empty (`export { }`). This story replaces its contents with all config type definitions.

**`src/core/types.ts`** — Contains `DataPoint`, `Series`, `TimeRange`, `Viewport`, `ScaleDomain`, `Padding`, `ScaleOptions`. The config module should NOT duplicate these types. `DataPoint` will be used by consumers when calling `addData()` — but the config types don't need to reference it.

**`src/index.ts`** — Currently `export { }`. Do NOT modify — Story 1.8 handles exports.

### Git Intelligence

Recent commits follow: `feat:` prefix, lowercase, concise description with story reference.

Expected commit message for this story: `feat: add config system with themes and beautiful defaults (Story 1.6)`

### Downstream Dependencies

This config system will be consumed by:
- **Story 1.7 (Data Layer Rendering)** — `DataLayer` constructor receives `ResolvedConfig` for line color, gradient settings
- **Story 1.8 (GlideChart Facade)** — calls `resolveConfig()` on construction, passes config to all subsystems
- **Story 2.1 (Grid Lines)** — reads `grid` config for visibility, color, opacity
- **Story 2.2-2.3 (Axes)** — reads `xAxis`/`yAxis` config for labels, fonts, ticks
- **Story 4.1 (Crosshair)** — reads `crosshair` config for appearance
- **Story 5.1 (Themes)** — extends theme presets with more options

Design the types to be **extensible** — new properties can be added to interfaces in future stories without breaking existing consumers.

### References

- [Source: _bmad-output/planning-artifacts/architecture.md — Configuration & Theming decision]
- [Source: _bmad-output/planning-artifacts/architecture.md — Deep merge: defaultConfig ← themePreset ← userConfig]
- [Source: _bmad-output/planning-artifacts/architecture.md — Structure Patterns: src/config/ module]
- [Source: _bmad-output/planning-artifacts/architecture.md — Module Boundaries: config/ can import from core/types]
- [Source: _bmad-output/planning-artifacts/architecture.md — Ownership Hierarchy: ConfigResolver under GlideChart facade]
- [Source: _bmad-output/planning-artifacts/architecture.md — Naming Patterns: UPPER_SNAKE_CASE for constants]
- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1, Story 1.6]
- [Source: _bmad-output/planning-artifacts/prd.md — FR28: Beautiful defaults with zero configuration]
- [Source: _bmad-output/planning-artifacts/prd.md — FR22-27: Appearance & Theming requirements]
- [Source: _bmad-output/planning-artifacts/prd.md — NFR11: WCAG 2.1 AA contrast ratios]
- [Source: _bmad-output/project-context.md — Configuration via deep merge rule]
- [Source: _bmad-output/project-context.md — NEVER mutate config objects]
- [Source: _bmad-output/project-context.md — Named exports only, no export default]
- [Source: _bmad-output/implementation-artifacts/1-5-layered-canvas-and-frame-scheduler.md — Previous story patterns and learnings]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Fixed theme field not propagating: excluded `theme` from destructured user overrides causing `config.theme` to remain `dark` when user specified `light`. Fixed by only excluding `series` from user overrides.
- Fixed unused variable lint error: added eslint-disable comment for destructured `_series` variable.
- Fixed TypeScript strict errors in tests: used non-null assertion (`!`) for series array access, fixed partial type inference in deepMerge tests, removed unused import.

### Completion Notes List

- All 9 tasks completed: types, themes, defaults, resolver, and 4 test suites
- 57 new tests added (197 total, up from 140)
- Config types defined: ThemeMode, LineConfig, GradientConfig, GridConfig, AnimationConfig, AxisConfig, CrosshairConfig, TooltipConfig, SeriesConfig, ChartConfig, ResolvedConfig, ResolvedSeriesConfig
- Dark and light theme presets with WCAG AA compliant colors
- DEFAULT_CONFIG built DRY from DARK_THEME values
- resolveConfig implements 3-layer merge: defaults <- themePreset <- userConfig
- Per-series config resolution inherits global line/gradient defaults
- deepMerge: recursive plain-object merge, array replace, null/undefined skip, no mutation
- deepFreeze: runtime immutability guard on resolved config
- Input validation with prefixed error messages
- All quality gates pass: typecheck, lint, build, tests

### Change Log

- 2026-03-28: Implemented config system with types, themes, defaults, and resolver (Story 1.6)

### File List

- `src/config/types.ts` (modified) — All config interfaces and ThemeMode enum
- `src/config/themes.ts` (new) — DARK_THEME, LIGHT_THEME constants, getThemePreset()
- `src/config/defaults.ts` (new) — DEFAULT_CONFIG constant built from DARK_THEME
- `src/config/resolver.ts` (new) — resolveConfig(), deepMerge(), deepFreeze()
- `src/config/resolver.test.ts` (new) — 28 tests for deepMerge and resolveConfig
- `src/config/defaults.test.ts` (new) — 11 tests for DEFAULT_CONFIG completeness
- `src/config/themes.test.ts` (new) — 7 tests for theme presets

### Review Findings

- [x] [Review][Patch] Per-series line/gradient configs not validated by `validateConfig` [resolver.ts:45-73] — Fixed: extracted `validateLineAndGradient` helper, loop validates each series entry
- [x] [Review][Patch] `NaN` passes `line.width` validation (`NaN <= 0` is `false`) [resolver.ts:54] — Fixed: changed to negated positive check `!(width > 0)` which rejects `NaN`
- [x] [Review][Patch] `NaN` passes `staleThreshold` validation (`NaN < 0` is `false`) [resolver.ts:50] — Fixed: changed to `!(staleThreshold >= 0)` which rejects `NaN`
- [x] [Review][Patch] `Infinity` passes `line.width` validation [resolver.ts:54] — Fixed: added `Number.isFinite` check
