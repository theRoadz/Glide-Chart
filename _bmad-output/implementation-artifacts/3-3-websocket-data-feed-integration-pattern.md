# Story 3.3: WebSocket Data Feed Integration Pattern

Status: done

## Story

As a developer using Glide Chart,
I want a clear pattern for connecting WebSocket feeds to the chart,
so that I can integrate Pyth Hermes and similar real-time data sources.

## Acceptance Criteria

1. **Smooth updates at 400ms intervals**
   - Given a WebSocket connection delivering price updates at 400ms intervals
   - When each message is received and passed to `chart.addData()`
   - Then the chart updates smoothly with no dropped frames or visual stutter
   - And the ring buffer evicts old data to maintain stable memory

2. **Burst handling under high volatility**
   - Given multiple data points arrive in a burst (high volatility moment)
   - When they are pushed rapidly
   - Then the chart handles the burst gracefully without frame drops
   - And all points are recorded in the buffer (none silently dropped)

## Tasks / Subtasks

- [x] Task 1: Create `WebSocketDataSource` utility class (AC: #1, #2)
  - [x] 1.1 Create `src/streaming/types.ts` with `DataSourceState`, `WebSocketDataSourceConfig`, `DataSourceEventMap`
  - [x] 1.2 Create `src/streaming/websocket-data-source.ts` with connection management
  - [x] 1.3 Implement `connect(url)` — opens WebSocket, sets state to `connecting`
  - [x] 1.4 Implement `disconnect()` — closes WebSocket cleanly, sets state to `disconnected`
  - [x] 1.5 Implement configurable `messageParser` for transforming raw messages to `DataPoint`
  - [x] 1.6 Implement configurable `seriesId` mapping
  - [x] 1.7 Implement auto-reconnect with configurable backoff (disabled by default)
  - [x] 1.8 Implement batch buffering: accumulate points within a configurable `batchInterval` (default 0 = immediate) and flush as a single `addData(seriesId, points[])` call
  - [x] 1.9 Implement `destroy()` — closes connection, removes all listeners, clears timers

- [x] Task 2: Export from package entry points (AC: #1)
  - [x] 2.1 Create `src/streaming/index.ts` re-exporting public types and `WebSocketDataSource`
  - [x] 2.2 Add `src/streaming/index.ts` export to `src/index.ts`

- [x] Task 3: Unit tests for `WebSocketDataSource` (AC: #1, #2)
  - [x] 3.1 Create `src/streaming/websocket-data-source.test.ts`
  - [x] 3.2 Test: connect → receives message → calls `chart.addData()` with parsed point
  - [x] 3.3 Test: burst of messages → all points reach buffer (none dropped)
  - [x] 3.4 Test: disconnect → reconnect with backoff when `autoReconnect` enabled
  - [x] 3.5 Test: `destroy()` cleans up WebSocket, timers, and listeners
  - [x] 3.6 Test: batch buffering accumulates and flushes points at interval
  - [x] 3.7 Test: state transitions (disconnected → connecting → connected → disconnected)
  - [x] 3.8 Test: invalid message from WebSocket does not crash (calls `onError` callback)

- [x] Task 4: Integration demo page (AC: #1, #2)
  - [x] 4.1 Create `demo/websocket-demo.html` with simulated WebSocket feed
  - [x] 4.2 Demo shows: connection state indicator, point counter, reconnect button
  - [x] 4.3 Use a mock WebSocket (local `setInterval` generating synthetic data) since Pyth Hermes requires a real endpoint
  - [x] 4.4 Demonstrate burst handling by injecting rapid bursts on button click

- [x] Task 5: Verify existing streaming performance (AC: #1, #2)
  - [x] 5.1 Add a performance test: push 100 points in <16ms and verify no frame scheduler starvation
  - [x] 5.2 Verify ring buffer eviction works correctly during sustained streaming

## Dev Notes

### Critical Design Decisions

**This is a utility/pattern, NOT a core dependency.** The `WebSocketDataSource` is an optional helper class that wraps the browser `WebSocket` API and calls `chart.addData()`. It lives in `src/streaming/` and imports only from `src/api/` (following module boundary rules). Consumers can ignore it and wire WebSocket → `addData()` themselves.

**Zero runtime dependencies rule applies.** Use the native browser `WebSocket` API directly. No socket.io, no reconnecting-websocket library.

### Architecture Compliance

**Module Boundaries (from architecture.md):**
- `src/streaming/` is a NEW module at the same level as `src/api/`
- It can import from `src/api/` (GlideChart, types) — same rules as `react/` and `widget/`
- It CANNOT import from `core/`, `config/`, `renderer/`, or `interaction/`
- Public types exported through `src/api/types.ts` as needed

**Naming Conventions:**
- Files: `kebab-case.ts` → `websocket-data-source.ts`, `types.ts`
- Tests: co-located → `websocket-data-source.test.ts`
- Class: `WebSocketDataSource` (PascalCase)
- Config interface: `WebSocketDataSourceConfig` (PascalCase, no `I` prefix)
- Constants: `UPPER_SNAKE_CASE` for defaults like `DEFAULT_RECONNECT_DELAY`
- Named exports only — no `export default`

**Error Handling:**
- Prefix all errors: `'WebSocketDataSource: ...'`
- Public methods (`connect`, `disconnect`, `destroy`) validate inputs and throw descriptive errors
- WebSocket errors/close events: call user-provided `onError`/`onStateChange` callbacks, never throw
- Invalid messages from WebSocket: log via `onError` callback, skip the message, do not crash

### Proposed API Surface

```typescript
// src/streaming/types.ts
export type DataSourceState = 'disconnected' | 'connecting' | 'connected';

export interface WebSocketDataSourceConfig {
  /** The GlideChart instance to push data into */
  chart: GlideChart;
  /** Series ID to push data into (default: first series) */
  seriesId?: string;
  /** Transform raw WebSocket message to DataPoint(s). Return null to skip. */
  messageParser: (data: string | ArrayBuffer) => DataPoint | DataPoint[] | null;
  /** Auto-reconnect on close/error (default: false) */
  autoReconnect?: boolean;
  /** Initial reconnect delay in ms (default: 1000). Doubles each attempt, capped at maxReconnectDelay. */
  reconnectDelay?: number;
  /** Max reconnect delay in ms (default: 30000) */
  maxReconnectDelay?: number;
  /** Max reconnect attempts before giving up. 0 = unlimited (default: 0) */
  maxReconnectAttempts?: number;
  /** Batch interval in ms. 0 = push each message immediately (default: 0) */
  batchInterval?: number;
  /** Called on state changes */
  onStateChange?: (state: DataSourceState) => void;
  /** Called on errors (parse failures, WebSocket errors) */
  onError?: (error: Error) => void;
}
```

```typescript
// src/streaming/websocket-data-source.ts
export class WebSocketDataSource {
  get state(): DataSourceState;
  constructor(config: WebSocketDataSourceConfig);
  connect(url: string | URL): void;
  disconnect(): void;
  destroy(): void;
}
```

### Batch Buffering Strategy

When `batchInterval > 0`, accumulate incoming parsed points in an array. On each interval tick, flush the array via `chart.addData(seriesId, points[])`. This reduces the number of spline recomputations during bursts (batch `addData` calls `computeFull()` once instead of `appendPoint()` N times). When `batchInterval === 0` (default), call `chart.addData()` immediately per message for lowest latency.

### Auto-Reconnect Strategy

Use exponential backoff: `delay = min(reconnectDelay * 2^attempt, maxReconnectDelay)`. Reset attempt counter on successful connection (state reaches `connected` and stays for >1 message). Stop after `maxReconnectAttempts` if non-zero. Use `setTimeout` (not `setInterval`). Clear all timers in `destroy()`.

### WebSocket Mock Strategy for Tests

Use a minimal mock class:
```typescript
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = MockWebSocket.CONNECTING;
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  close() { /* ... */ }
  // Test helpers:
  simulateOpen() { ... }
  simulateMessage(data: string) { ... }
  simulateClose(code?: number) { ... }
  simulateError() { ... }
}
```

Stub `globalThis.WebSocket` with `vi.stubGlobal('WebSocket', MockWebSocket)`.

### Previous Story Intelligence (Story 3.2)

- `autoFitScaleWindowed()` handles time-window viewport — streaming + time window already works
- `addData()` supports both single point and batch `DataPoint[]` — use batch for burst handling
- Batch `addData(seriesId, points[])` calls `computeFull()` on spline cache (not incremental) — acceptable for burst flushes but single-point calls use `appendPoint()` for O(1)
- Animation system snapshots curve state before mutation — works automatically
- `staleThreshold` config already exists in `ResolvedConfig` (Story 3.4 will implement the visual indicator)

### Git Intelligence

Recent commits show consistent patterns:
- Story branch → implementation → tests → demo page → review fixes
- Tests co-located with source files
- Demo pages in `demo/` directory
- All code follows strict TypeScript, named exports, error prefix conventions
- `vitest-canvas-mock` + `jsdom` for rendering tests, manual RAF mocking via `vi.stubGlobal`

### File Structure

**New files:**
- `src/streaming/types.ts` — DataSourceState, WebSocketDataSourceConfig
- `src/streaming/websocket-data-source.ts` — WebSocketDataSource class
- `src/streaming/websocket-data-source.test.ts` — unit tests
- `src/streaming/index.ts` — re-exports
- `demo/websocket-demo.html` — integration demo

**Modified files:**
- `src/index.ts` — add `export * from './streaming/index'`
- `src/api/types.ts` — re-export `DataSourceState`, `WebSocketDataSourceConfig` from streaming types

### Testing Standards

- Framework: Vitest + jsdom
- Mock WebSocket globally via `vi.stubGlobal`
- Mock timers via `vi.useFakeTimers()` for reconnect delay and batch interval testing
- Do NOT mock GlideChart internals — use a minimal spy/stub for `addData()` calls
- Test state transitions explicitly
- Test that `destroy()` leaves no dangling timers or listeners
- No `any` types in tests

### Performance Considerations

- The frame scheduler already batches renders per rAF frame — rapid `addData()` calls won't cause multiple renders within one frame
- Ring buffer eviction is O(1) — stable memory under sustained streaming
- Batch interval (when configured) reduces spline recomputation frequency during bursts
- For typical 400ms WebSocket feeds, single-point `addData()` with `appendPoint()` is optimal (O(1) spline update)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 3, Story 3.3]
- [Source: _bmad-output/planning-artifacts/prd.md#FR6, FR7, NFR1-NFR5]
- [Source: _bmad-output/planning-artifacts/architecture.md#Module Boundaries, Naming Patterns, Error Handling]
- [Source: _bmad-output/project-context.md#Critical Implementation Rules]
- [Source: src/api/glide-chart.ts#addData method, lines 180-210]
- [Source: src/config/types.ts#ChartConfig, ResolvedConfig]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- No blocking issues encountered during implementation.

### Completion Notes List

- Implemented `WebSocketDataSource` utility class in `src/streaming/` module following architecture boundary rules (imports only from `src/api/` and `src/core/types`)
- Supports immediate mode (default, lowest latency) and batch buffering mode (configurable interval, reduces spline recomputations during bursts)
- Auto-reconnect with exponential backoff: configurable delay, max delay cap, max attempts
- Full error isolation: messageParser errors, WebSocket errors, and addData failures are caught and reported via `onError` callback without crashing
- 29 unit tests covering: constructor validation, state transitions, immediate & batch message handling, burst handling (50 points none dropped), auto-reconnect with backoff/cap/max-attempts, destroy cleanup, error handling, performance (100 points < 16ms)
- Demo page with mock WebSocket server simulating 400ms price updates, burst injection, and reconnect testing
- Added browser globals (WebSocket, URL, timer functions, DOM event types) to ESLint config
- All 391 tests pass, zero regressions

### Change Log

- 2026-03-29: Implemented Story 3.3 — WebSocket Data Feed Integration Pattern (all tasks complete)

### File List

**New files:**
- src/streaming/types.ts
- src/streaming/websocket-data-source.ts
- src/streaming/websocket-data-source.test.ts
- src/streaming/index.ts
- demo/websocket-demo.html

**Modified files:**
- src/index.ts (added streaming exports)
- src/api/types.ts (added DataSourceState, WebSocketDataSourceConfig re-exports)
- eslint.config.js (added browser globals: WebSocket, URL, timer functions, DOM event types)

### Review Findings

- [x] [Review][Decision] #1 `streaming/` imports from `core/types` — architecture boundary violation. Fixed: changed all imports to use `../api/types` instead of `../core/types`
- [x] [Review][Patch] #2 Silent data loss when no `seriesId` configured — Fixed: `pushToChart` now calls `onError` when seriesId is undefined
- [x] [Review][Patch] #3 `reconnectAttempts` not reset on successful reconnect — Fixed: reset counter in `onopen` handler
- [x] [Review][Patch] #4 `onStateChange` callback throwing crashes internal state machine — Fixed: wrapped in try/catch
- [x] [Review][Patch] #5 `onError` callback throwing crashes the caller — Fixed: all `onError` calls go through `safeCallOnError` with try/catch
- [x] [Review][Patch] #6 `event.data` cast ignores Blob — Accepted: type assertion matches the `messageParser` signature; Blob handling is caller responsibility via `messageParser`
- [x] [Review][Patch] #7 `destroy()` does not flush batch buffer — Fixed: `destroy()` now calls `flushBatch()` before clearing
- [x] [Review][Patch] #8 `messageCount` tracked but never exposed or used — Fixed: removed dead code
- [x] [Review][Patch] #9 WebSocket constructor exception leaves object stuck in `connecting` state — Fixed: wrapped in try/catch, recovers to `disconnected`
- [x] [Review][Patch] #10 `disconnect()` throws on destroyed instance but `destroy()` silently returns — Fixed: `disconnect()` now silently returns like `destroy()`
- [x] [Review][Patch] #11 `src/index.ts` bypasses `streaming/index.ts` barrel — Fixed: imports now go through `./streaming`
- [x] [Review][Patch] #12 Unbounded `batchBuffer` growth under extreme throughput — Fixed: added `maxBatchBufferSize` config (default 10000) with early flush when cap is hit
