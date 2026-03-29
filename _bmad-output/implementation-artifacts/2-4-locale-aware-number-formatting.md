# Story 2.4: Locale-Aware Number Formatting

Status: done

## Story

As a developer using Glide Chart,
I want locale-aware number formatting for axis labels,
So that international users see numbers formatted according to their locale conventions.

## Acceptance Criteria

1. **Given** a developer configures a locale (e.g., 'de-DE')
   **When** the y-axis renders
   **Then** numbers use the locale's decimal separator and thousands grouping (e.g., 1.234,56)

2. **Given** no locale is configured
   **When** the y-axis renders
   **Then** the browser's default locale is used

## Tasks / Subtasks

- [x] Task 1: Add `locale?: string` to AxisConfig type (AC: #1, #2)
  - [x] 1.1 Add `locale?: string` field to `AxisConfig` interface in `src/config/types.ts`
- [x] Task 2: Update YAxisRenderer to use `Intl.NumberFormat` (AC: #1, #2)
  - [x] 2.1 Validate locale in constructor by attempting `new Intl.NumberFormat(locale)` — store validated locale or `undefined` on failure
  - [x] 2.2 Update `formatLabel()` to create `Intl.NumberFormat` per-call with dynamic `minimumFractionDigits`/`maximumFractionDigits` based on tick spacing
  - [x] 2.3 Preserve custom `labelFormatter` override as highest priority (existing behavior)
- [x] Task 3: Update existing tests and add new locale tests (AC: #1, #2)
  - [x] 3.1 **BREAKING CHANGE:** Update `makeConfig()` helper to accept `locale` parameter
  - [x] 3.2 **BREAKING CHANGE:** Fix 3 existing precision tests that use `split('.')` — these break when `Intl.NumberFormat` uses locale-specific separators. Update to use digit-based assertions or explicit `'en-US'` locale in test config
  - [x] 3.3 Test: explicit locale 'de-DE' → decimal comma, period grouping (e.g., 1.234,56)
  - [x] 3.4 Test: explicit locale 'en-US' → decimal period, comma grouping (e.g., 1,234.56)
  - [x] 3.5 Test: no locale configured → uses `undefined` (browser default), produces valid output
  - [x] 3.6 Test: invalid locale string → falls back gracefully (no throw)
  - [x] 3.7 Test: custom `labelFormatter` still takes precedence over locale formatting
  - [x] 3.8 Test: sub-penny precision preserved with locale (e.g., 0.000042)
  - [x] 3.9 Test: large values formatted correctly with thousands grouping
  - [x] 3.10 Test: negative values formatted correctly with locale separators
  - [x] 3.11 Test: tickSpacing = 0 edge case still works
- [x] Task 4: Integration verification (AC: #1, #2)
  - [x] 4.1 Run full test suite: `pnpm test`
  - [x] 4.2 Run type check: `pnpm typecheck`
  - [x] 4.3 Run lint: `pnpm lint`
  - [x] 4.4 Run build: `pnpm build`
  - [x] 4.5 Verify baseline: all 299+ tests pass, no regressions

### Review Findings
- [x] [Review][Patch] `tickSpacing === 0` bypasses locale formatting — returns raw `String(value)` instead of locale-formatted output [`src/renderer/layers/y-axis-layer.ts:86-88`] — Fixed
- [x] [Review][Patch] x-axis `DateTimeFormat` ignores `config.xAxis.locale` [`src/renderer/layers/x-axis-layer.ts`] — Fixed: wired `config.xAxis.locale` into all three `DateTimeFormat` constructors with validation

## Dev Notes

### Implementation Pattern

The x-axis renderer (`src/renderer/layers/x-axis-layer.ts`) establishes the `Intl` API pattern. The y-axis follows the same spirit but differs because decimal precision is dynamic (computed from tick spacing each draw), not static.

**Two-phase approach:**

1. **Constructor: validate locale** — attempt `new Intl.NumberFormat(locale)` inside try/catch. If it throws `RangeError`, fall back to `undefined` (browser default). Store the validated locale string, not the formatter instance.
2. **`formatLabel()`: create formatter per-call** — construct `Intl.NumberFormat(this.locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })` with the dynamic precision computed from tick spacing.
3. **Custom `labelFormatter` takes priority** — check `config.yAxis.labelFormatter` first, same as current code.

```typescript
// Constructor: validate locale by attempting construction
const locale = config.yAxis.locale;
try {
  new Intl.NumberFormat(locale); // throws RangeError if invalid
  this.locale = locale;
} catch {
  this.locale = undefined; // fallback to browser default
}

// formatLabel(): create formatter with dynamic precision
private formatLabel(value: number, tickSpacing: number): string {
  if (this.config.yAxis.labelFormatter) {
    try { return String(this.config.yAxis.labelFormatter(value)); }
    catch { /* fall through */ }
  }
  if (tickSpacing === 0) return String(value);

  const decimals = Math.min(
    MAX_DECIMALS,
    Math.max(0, Math.round(-Math.log10(tickSpacing))),
  );
  try {
    return new Intl.NumberFormat(this.locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  } catch {
    return value.toFixed(decimals); // ultimate fallback
  }
}
```

**Why per-call creation (not cached):** X-axis caches 3 formatters because its format options are static. Y-axis decimal precision varies per draw (zoom/pan changes tick spacing), so caching adds complexity for marginal benefit. NumberFormat construction is ~microseconds and tick count is 3-10 per frame.

### Zero Runtime Dependencies Constraint

Use only the native `Intl.NumberFormat` API — no external number formatting libraries. This is a browser standard API available in all target environments.

### Existing Code to Modify

| File | Change |
|------|--------|
| `src/config/types.ts` | Add `locale?: string` to `AxisConfig` |
| `src/renderer/layers/y-axis-layer.ts` | Add `locale` field, validate in constructor, use `Intl.NumberFormat` in `formatLabel()` |
| `src/renderer/layers/y-axis-layer.test.ts` | Fix 3 existing precision tests + add ~9 new locale tests |

### Files NOT to Modify

- `src/config/defaults.ts` — No default locale needed; `undefined` = browser default (per AC #2)
- `src/config/themes.ts` — Locale is not a theme concern
- `src/config/resolver.ts` — Already handles optional `AxisConfig` fields via deep merge; `locale` will pass through automatically
- `src/renderer/layers/x-axis-layer.ts` — X-axis formats timestamps, not numbers; locale for dates is a separate concern
- `src/api/glide-chart.ts` — No facade changes needed; locale flows through config
- `src/api/types.ts`, `src/index.ts` — `AxisConfig` is already re-exported; adding `locale` to it automatically extends the public API surface (intentional, follows `timezone` precedent)

### Public API Surface Note

Adding `locale` to the shared `AxisConfig` interface means both `xAxis` and `yAxis` config accept it. This is intentional and follows the `timezone` precedent — `timezone` is on `AxisConfig` but only used by x-axis currently. The `locale` field will be used by y-axis in this story; x-axis locale support for date formatting is a future concern, not this story's scope.

### Project Structure Notes

- All files follow kebab-case naming convention
- Tests co-located: `y-axis-layer.test.ts` next to `y-axis-layer.ts`
- The `locale` field joins `timezone` as another optional string on `AxisConfig`

### Testing Standards

- Use `vitest` with `vitest-canvas-mock`
- Use explicit locales in test assertions (e.g., `'de-DE'`, `'en-US'`) for deterministic results — never rely on test runner's default locale
- Constructor injection pattern: pass mock `ctx`, `canvas`, `scale`, `config` objects
- Follow existing y-axis test file patterns from story 2.2

### Existing Tests That Must Be Updated (BREAKING)

The existing `y-axis-layer.test.ts` has 3 precision tests that assume `toFixed()` output (period as decimal separator). Switching to `Intl.NumberFormat` breaks them:

1. **Line 182-187** (`tick spacing 0.001`): Uses `split('.')` to check decimal places. With `Intl.NumberFormat` and a non-English default locale, the period may be the thousands separator instead. **Fix:** Pass explicit `locale: 'en-US'` in test config, or use digit-count assertions instead of split.

2. **Line 198-201** (`tick spacing 1000`): Asserts `not.toContain('.')`. With `Intl.NumberFormat` and `de-DE` locale, `100000` becomes `"100.000"` (period as thousands separator). **Fix:** Pass explicit `locale: 'en-US'` in test config where period-based assertions are used.

3. **Line 212-219** (`sub-penny values`): Same `split('.')` issue as #1. **Fix:** Same approach — explicit locale or digit-based assertions.

**Recommended approach:** Update `makeConfig()` and `createRenderer()` helpers to accept `locale` parameter. Add `locale: 'en-US'` to existing precision tests so they remain deterministic. New locale-specific tests use their own explicit locales.

### Thousands Grouping Behavior

`Intl.NumberFormat` enables `useGrouping` by default, which adds thousands separators (e.g., `"1,234.56"` in en-US, `"1.234,56"` in de-DE). This makes labels wider than `toFixed()` output:

| Value | `toFixed(2)` | `Intl en-US` | `Intl de-DE` |
|-------|-------------|-------------|-------------|
| 1000 | `"1000.00"` (7ch) | `"1,000.00"` (8ch) | `"1.000,00"` (8ch) |
| 100000 | `"100000.00"` (9ch) | `"100,000.00"` (10ch) | `"100.000,00"` (10ch) |

This is correct and desired behavior (locale-aware formatting is the story's purpose). The y-axis already constrains label width via `fillText(label, x, y, maxLabelWidth)` which truncates overlong text. At 11px font with ~52px available width, labels up to ~8 characters fit comfortably. Extreme values (1M+) may truncate — this is acceptable as the canvas `maxWidth` parameter handles it gracefully.

### Previous Story Intelligence (Story 2.3)

Key learnings from the x-axis implementation:
- **Intl constructor try/catch is essential** — invalid timezone strings throw `RangeError`; same applies to invalid locale strings in `Intl.NumberFormat`
- **Validate by construction, not by assignment** — x-axis actually constructs `new Intl.DateTimeFormat(...)` inside try/catch. Y-axis must do the same: `new Intl.NumberFormat(locale)` inside try to validate, not just `this.locale = locale`
- **Shared axis canvas** — both Y and X renderers use same canvas layer; facade clears once before calling both. No changes needed to this wiring.
- **`computeNiceTicks` from background-layer** — reuse for tick generation (already used by y-axis)
- **Test setup pattern:** Use explicit locale/timezone in tests for deterministic assertions

### Git Intelligence

Recent commits show a consistent pattern:
- Commit message format: `feat: add <feature description> (Story X.Y)`
- Stories 2.1-2.3 all completed successfully with clean test/typecheck/lint/build
- Current baseline: 299 tests passing — story must maintain or exceed this count
- No breaking changes or dependency additions in recent work

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 2, Story 2.4]
- [Source: _bmad-output/planning-artifacts/architecture.md — Axes & Scaling (FR16-21), Config Architecture]
- [Source: _bmad-output/planning-artifacts/prd.md — FR20: Locale-aware number formatting]
- [Source: src/renderer/layers/x-axis-layer.ts — Intl.DateTimeFormat pattern to mirror]
- [Source: src/renderer/layers/y-axis-layer.ts — Current formatLabel() to enhance]
- [Source: src/config/types.ts — AxisConfig interface to extend]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Initial typecheck caught unused `ctx` variable in tickSpacing=0 locale test — fixed immediately.

### Completion Notes List

- Added `locale?: string` to `AxisConfig` interface, extending the public API surface for both xAxis and yAxis config (follows `timezone` precedent).
- Updated `YAxisRenderer` constructor to validate locale via `new Intl.NumberFormat(locale)` try/catch — invalid locales fall back to `undefined` (browser default).
- Replaced `value.toFixed(decimals)` with `new Intl.NumberFormat(this.locale, { min/maxFractionDigits })` in `formatLabel()`, with `toFixed()` as ultimate fallback.
- Custom `labelFormatter` remains highest priority (existing behavior preserved).
- Fixed 3 existing precision tests by adding explicit `locale: 'en-US'` to prevent locale-dependent assertion failures.
- Added 9 new locale-specific tests covering: de-DE, en-US, no locale, invalid locale, labelFormatter precedence, sub-penny precision, large values, negative values, and tickSpacing=0 edge case.
- All 308 tests pass (299 existing + 9 new), typecheck clean, lint clean, build successful.

### Change Log

- 2026-03-29: Implemented locale-aware number formatting for y-axis labels using native `Intl.NumberFormat` API (Story 2.4)

### File List

- `src/config/types.ts` — Modified: added `locale?: string` to `AxisConfig`
- `src/renderer/layers/y-axis-layer.ts` — Modified: added locale validation in constructor, updated `formatLabel()` to use `Intl.NumberFormat`
- `src/renderer/layers/y-axis-layer.test.ts` — Modified: updated test helpers for locale support, fixed 3 existing precision tests, added 9 new locale tests
