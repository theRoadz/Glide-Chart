# Story 1.2: Core Data Types & Ring Buffer

Status: done

## Story

As a developer using Glide Chart,
I want an efficient data storage layer for time-series data,
So that the chart can handle large datasets with stable memory and O(1) operations.

## Acceptance Criteria

1. **Given** a `RingBuffer` instance with a configured capacity **When** I push data points beyond capacity **Then** the oldest points are evicted automatically (FIFO)
2. **Given** a `RingBuffer` at or beyond capacity **Then** memory usage remains constant regardless of total points pushed (no array copying, no `Array.shift()`, no `Array.splice()`)
3. **Given** a `RingBuffer` with data **When** iterated **Then** points yield in oldest-to-newest chronological order
4. **Given** the `DataPoint` type **Then** it includes `timestamp` (number, Unix ms) and `value` (number)
5. **Given** a `RingBuffer` with data and a time range **When** querying the visible window **Then** only points within the specified range are returned, in order
6. **Given** all source files **Then** kebab-case file naming and constructor injection patterns are followed
7. **Given** all test files **Then** tests are co-located next to source files (`ring-buffer.test.ts` next to `ring-buffer.ts`)

## Tasks / Subtasks

- [x] Task 1: Define core data types in `src/core/types.ts` (AC: #4)
  - [x] Define `DataPoint` interface: `{ timestamp: number; value: number }`
  - [x] Define `Series` interface: `{ id: string; data: DataPoint[] }` — this is the config/input shape for how consumers provide initial data; runtime storage uses `RingBuffer<DataPoint>` (one per series)
  - [x] Define `TimeRange` interface: `{ start: number; end: number }`
  - [x] All types use named exports only — no `export default`
  - [x] No `I` prefix on interfaces — `DataPoint` not `IDataPoint`

- [x] Task 2: Implement `RingBuffer<T>` in `src/core/ring-buffer.ts` (AC: #1, #2, #3)
  - [x] Class `RingBuffer<T>` with generic type parameter
  - [x] Constructor accepts `capacity: number` — validate > 0, throw `RingBuffer: capacity must be positive` if not
  - [x] Internal storage: pre-allocated `Array<T | undefined>` of fixed length `capacity`
  - [x] Head and tail pointer indices (not array shift/splice) for O(1) operations
  - [x] `push(item: T): void` — O(1) append, overwrites oldest when full
  - [x] `get(index: number): T | undefined` — access by logical index (0 = oldest)
  - [x] `size: number` (getter) — current number of items
  - [x] `capacity: number` (readonly) — maximum buffer size
  - [x] `isEmpty: boolean` (getter)
  - [x] `isFull: boolean` (getter)
  - [x] `clear(): void` — reset buffer without reallocating
  - [x] `toArray(): T[]` — return items in oldest-to-newest order (for iteration/rendering)
  - [x] `[Symbol.iterator]()` — iterate oldest-to-newest
  - [x] `peek(): T | undefined` — return newest item without removing
  - [x] `peekOldest(): T | undefined` — return oldest item without removing
  - [x] Use `private` keyword for internal members — no underscore prefix
  - [x] Error messages prefixed with `RingBuffer:` for useful stack traces
  - [x] `push()` must have zero overhead beyond pointer arithmetic — no event emission, no object allocation, no side effects. This is critical for burst scenarios (Story 3.3) where many points arrive rapidly
  - [x] `clear()` must set all occupied slots to `undefined` after resetting pointers — prevents GC from retaining stale references to large objects

- [x] Task 3: Add `getVisibleWindow` utility function in `src/core/ring-buffer.ts` (AC: #5)
  - [x] Export a standalone function `getVisibleWindow(buffer: RingBuffer<DataPoint>, range: TimeRange): DataPoint[]`
  - [x] Returns points where `range.start <= timestamp <= range.end` in chronological order
  - [x] Uses linear scan via `buffer.toArray().filter()` for simplicity — data is chronologically ordered so binary search is a future optimization opportunity, not required now
  - [x] Import `DataPoint` and `TimeRange` from `./types`

- [x] Task 4: Write comprehensive tests in `src/core/ring-buffer.test.ts` (AC: #1, #2, #3, #5, #7)
  - [x] Test construction: valid capacity, zero capacity throws, negative capacity throws
  - [x] Test push and size: push items, verify size grows, verify capacity unchanged
  - [x] Test FIFO eviction: push beyond capacity, verify oldest items evicted, verify size === capacity
  - [x] Test iteration order: after wrapping, `toArray()` and `[Symbol.iterator]` yield oldest-to-newest
  - [x] Test `get()`: logical indexing — index 0 is always oldest
  - [x] Test `peek()` and `peekOldest()`: return newest/oldest without mutation
  - [x] Test `clear()`: resets size to 0, capacity unchanged
  - [x] Test empty buffer edge cases: `get()` returns undefined, `peek()` returns undefined, iteration yields nothing
  - [x] Test single-item buffer: capacity 1, push/evict cycle
  - [x] Test O(1) behavior assertion: push N items, verify no array reallocation (buffer internal array length stays constant)
  - [x] Test `clear()` resets slots: after clear, stale references are not retained
  - [x] Test `getVisibleWindow()`: returns correct subset for given time range
  - [x] Test `getVisibleWindow()` with empty range: returns empty array
  - [x] Test `getVisibleWindow()` with range covering all data: returns all points
  - [x] Test `getVisibleWindow()` after buffer wrap: still returns correct window
  - [x] Test `getVisibleWindow()` on empty buffer: returns empty array

### Review Findings

- [x] [Review][Patch] Add test for `getVisibleWindow` with single-point range (start === end) [src/core/ring-buffer.test.ts]
- [x] [Review][Defer] No validation that `TimeRange.start <= end` — deferred, pre-existing interface design
- [x] [Review][Defer] Missing test for `getVisibleWindow` with inverted TimeRange (start > end) — deferred, not a bug

- [x] Task 5: Remove placeholder test and update exports (AC: #6)
  - [x] Delete `src/core/placeholder.test.ts` (replaced by real tests)
  - [x] Update `src/core/types.ts` with the new type definitions
  - [x] Do NOT update `src/index.ts` yet — public API exports are Story 1.8's concern
  - [x] Run `pnpm test` — all tests pass
  - [x] Run `pnpm typecheck` — no type errors
  - [x] Run `pnpm lint` — no lint errors
  - [x] Run `pnpm build` — build succeeds

## Dev Notes

### Architecture Compliance

**Module:** `src/core/` — this is the leaf module in the import DAG. It imports NOTHING from other project modules (`config/`, `renderer/`, `interaction/`, `api/`).

**Import DAG enforcement:** `core/` is the foundation. All other modules depend on `core/types.ts` for `DataPoint`, `Series`, `TimeRange`. Do NOT import from any other `src/` module.

**Constructor injection:** `RingBuffer` receives capacity via constructor. No singletons, no global state, no service locators.

**Named exports only:** Every export must be a named export. `export default` is forbidden.

### Ring Buffer Implementation — Critical Details

**O(1) Insert/Evict Pattern:**
```typescript
// Use head/tail pointer arithmetic, NOT array operations
push(item: T): void {
  this.buffer[this.tail] = item;
  this.tail = (this.tail + 1) % this.capacity;
  if (this.count < this.capacity) {
    this.count++;
  } else {
    this.head = (this.head + 1) % this.capacity; // evict oldest
  }
}
```

**NEVER use:**
- `Array.shift()` — O(n), copies entire array
- `Array.splice()` — O(n), copies entire array
- `Array.unshift()` — O(n), copies entire array
- `Array.push()` with `Array.shift()` combo — the eviction pattern that kills performance

**Pre-allocate storage:** Create the array at full capacity upfront. `new Array<T | undefined>(capacity)`. The array length never changes.

**Logical-to-physical index mapping:**
```typescript
get(logicalIndex: number): T | undefined {
  if (logicalIndex < 0 || logicalIndex >= this.count) return undefined;
  const physicalIndex = (this.head + logicalIndex) % this.capacity;
  return this.buffer[physicalIndex];
}
```

### File Locations — Exact Paths

| File | Path | Purpose |
|------|------|---------|
| Core types | `src/core/types.ts` | `DataPoint`, `Series`, `TimeRange` |
| Ring buffer | `src/core/ring-buffer.ts` | Generic `RingBuffer<T>` class + `getVisibleWindow()` utility |
| Ring buffer tests | `src/core/ring-buffer.test.ts` | Comprehensive RingBuffer + getVisibleWindow tests |

These files match the architecture exactly (`architecture.md` — Structure Patterns: `src/core/` lists `ring-buffer.ts`, `types.ts`).

### Naming Conventions

- Files: kebab-case (`ring-buffer.ts`)
- Classes: PascalCase (`RingBuffer`)
- Interfaces: PascalCase, no `I` prefix (`DataPoint`, `TimeRange`)
- Constants: UPPER_SNAKE_CASE (e.g., `DEFAULT_CAPACITY` if needed)
- Private members: `private` keyword, no underscore prefix
- Error messages: prefix with class name (`RingBuffer: ...`)

### Testing Standards

- **Framework:** Vitest with `globals: true` — do NOT import `describe`, `it`, `expect` from `vitest`, they are available globally
- **Co-located:** Test files next to source files in `src/core/`
- **No mocking internal modules:** Test `RingBuffer` with real implementations
- **Canvas mock not needed:** This story has no canvas/DOM dependency
- **Performance assertions:** Verify the internal array length remains constant after wrapping (proves no reallocation)
- **Edge cases to cover:** empty buffer, single element, capacity 1, exact capacity fill, one-past-capacity wrap, many-wraps

### What NOT To Do

- **DO NOT** create `src/index.ts` exports for these types — public API surface is Story 1.8
- **DO NOT** add any runtime dependencies
- **DO NOT** use `export default`
- **DO NOT** create circular imports
- **DO NOT** create a `TimeSeriesBuffer` wrapper class — the architecture specifies `RingBuffer<DataPoint>` used directly by downstream consumers (DataLayer, SplineCache). The `getVisibleWindow` utility is a standalone function in `ring-buffer.ts`
- **DO NOT** implement spline cache or interpolation — that's Story 1.3
- **DO NOT** implement Scale or coordinate mapping — that's Story 1.4
- **DO NOT** use `any` type anywhere — strict TypeScript
- **DO NOT** use underscore prefix for private members

### Previous Story Intelligence

**From Story 1.1 (done):**
- Project uses TypeScript 6.x (not 5.x as originally planned) — `ignoreDeprecations: "6.0"` is set in tsconfig
- ESLint 10 flat config format (`eslint.config.js`) is in use
- Vitest configured with `globals: true`, `environment: 'jsdom'`, `vitest-canvas-mock` setup
- `tsconfig.json` has `"types": ["vitest/globals"]` for test type support
- All dev dependencies installed — no new dependencies needed for this story
- Directory structure: `src/core/`, `src/core/types.ts` (empty), `src/core/placeholder.test.ts` (to be replaced)

**Review findings from 1.1 that affect this story:**
- Package.json exports map has `types` condition before `import`/`require` — maintain this pattern
- Canvas mock configured in `vitest.setup.ts` — not needed for this story but don't break it

### Git Intelligence

**Single commit so far:** `7fd0476 feat: initialize project with TypeScript, tsup, Vitest, ESLint, and Prettier`
- All build tooling, test framework, and project structure are in place
- No source code yet beyond empty placeholders — this story writes the first real code

### Project Structure Notes

- `src/core/types.ts` exists but is empty (`export { }`) — will be populated with `DataPoint`, `Series`, `TimeRange`
- `src/core/placeholder.test.ts` exists — should be deleted after real tests are created
- New files: `ring-buffer.ts`, `ring-buffer.test.ts`

### References

- [Source: _bmad-output/planning-artifacts/architecture.md — Data Management decision: Ring buffer]
- [Source: _bmad-output/planning-artifacts/architecture.md — Structure Patterns: Module Organization]
- [Source: _bmad-output/planning-artifacts/architecture.md — Naming Patterns]
- [Source: _bmad-output/planning-artifacts/architecture.md — Error Handling Patterns]
- [Source: _bmad-output/planning-artifacts/architecture.md — Data Flow]
- [Source: _bmad-output/planning-artifacts/architecture.md — Ownership Hierarchy: RingBuffer[] one per series]
- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1, Story 1.2]
- [Source: _bmad-output/project-context.md — Performance Gotchas: Ring buffer is O(1) insert/evict]
- [Source: _bmad-output/project-context.md — Testing Rules: Co-located tests, no mocking internal modules]
- [Source: _bmad-output/implementation-artifacts/1-1-project-initialization-and-build-pipeline.md — Dev Agent Record]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Fixed ESLint config to add Vitest globals for test files (describe, it, expect, etc.)
- Fixed `no-this-alias` lint error in `[Symbol.iterator]` by converting to generator function

### Completion Notes List

- **Task 1:** Defined `DataPoint`, `Series`, and `TimeRange` interfaces in `src/core/types.ts` with named exports only, no `I` prefix
- **Task 2:** Implemented `RingBuffer<T>` generic class with O(1) push/evict using head/tail pointer arithmetic on a pre-allocated array. All methods implemented: push, get, size, capacity, isEmpty, isFull, clear, toArray, Symbol.iterator (generator), peek, peekOldest. Constructor validates positive integer capacity. Clear nullifies all slots to prevent GC retention.
- **Task 3:** Implemented `getVisibleWindow()` standalone function using `buffer.toArray().filter()` with inclusive range matching
- **Task 4:** 38 comprehensive tests covering: construction validation, push/size behavior, FIFO eviction, iteration order, logical indexing via get(), peek/peekOldest, clear with slot reset verification, empty buffer edge cases, capacity-1 buffer, O(1) behavior assertion, and all getVisibleWindow scenarios
- **Task 5:** Deleted placeholder test, verified all validations pass (test, typecheck, lint, build). Also added Vitest globals to ESLint config for test files.

### Change Log

- 2026-03-28: Implemented Story 1.2 — Core data types (DataPoint, Series, TimeRange) and RingBuffer<T> with getVisibleWindow utility. 38 tests, all passing. ESLint config updated for Vitest globals.

### File List

- `src/core/types.ts` — Modified: added DataPoint, Series, TimeRange interfaces
- `src/core/ring-buffer.ts` — New: RingBuffer<T> class + getVisibleWindow() utility
- `src/core/ring-buffer.test.ts` — New: 38 comprehensive tests
- `src/core/placeholder.test.ts` — Deleted: replaced by real tests
- `eslint.config.js` — Modified: added Vitest globals for test files
