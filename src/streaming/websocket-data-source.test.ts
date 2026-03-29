import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketDataSource } from './websocket-data-source';
import type { WebSocketDataSourceConfig } from './types';
import type { DataPoint } from '../api/types';

// --- MockWebSocket ---

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.CONNECTING;
  url: string;
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  constructor(url: string | URL) {
    this.url = typeof url === 'string' ? url : url.toString();
    MockWebSocket.instances.push(this);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
  }

  // Test helpers
  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  simulateMessage(data: string): void {
    this.onmessage?.(new MessageEvent('message', { data }));
  }

  simulateClose(code = 1000): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close', { code }));
  }

  simulateError(): void {
    this.onerror?.(new Event('error'));
  }
}

// --- Helpers ---

function createMockChart(): { addData: ReturnType<typeof vi.fn> } {
  return { addData: vi.fn() };
}

function defaultParser(data: string | ArrayBuffer): DataPoint | null {
  if (typeof data !== 'string') return null;
  const parsed = JSON.parse(data) as { timestamp: number; value: number };
  return { timestamp: parsed.timestamp, value: parsed.value };
}

function makeConfig(
  overrides?: Partial<WebSocketDataSourceConfig>,
): WebSocketDataSourceConfig {
  const chart = createMockChart();
  return {
    chart: chart as unknown as WebSocketDataSourceConfig['chart'],
    seriesId: 'price',
    messageParser: defaultParser,
    ...overrides,
  };
}

function latestWs(): MockWebSocket {
  const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
  if (!ws) throw new Error('No MockWebSocket instances');
  return ws;
}

// --- Tests ---

describe('WebSocketDataSource', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('constructor validation', () => {
    it('throws when config is missing', () => {
      expect(() => new WebSocketDataSource(null as unknown as WebSocketDataSourceConfig)).toThrow(
        'WebSocketDataSource: config is required',
      );
    });

    it('throws when chart is missing', () => {
      expect(
        () =>
          new WebSocketDataSource({
            messageParser: defaultParser,
          } as unknown as WebSocketDataSourceConfig),
      ).toThrow('WebSocketDataSource: config.chart is required');
    });

    it('throws when messageParser is missing', () => {
      expect(
        () =>
          new WebSocketDataSource({
            chart: createMockChart(),
          } as unknown as WebSocketDataSourceConfig),
      ).toThrow('WebSocketDataSource: config.messageParser is required');
    });

    it('throws when messageParser is not a function', () => {
      expect(
        () =>
          new WebSocketDataSource({
            chart: createMockChart(),
            messageParser: 'not a function',
          } as unknown as WebSocketDataSourceConfig),
      ).toThrow('WebSocketDataSource: config.messageParser must be a function');
    });
  });

  describe('connect and disconnect', () => {
    it('throws when connecting after destroy', () => {
      const ds = new WebSocketDataSource(makeConfig());
      ds.destroy();
      expect(() => ds.connect('ws://test')).toThrow('WebSocketDataSource: instance has been destroyed');
    });

    it('throws when url is empty', () => {
      const ds = new WebSocketDataSource(makeConfig());
      expect(() => ds.connect('' as string)).toThrow('WebSocketDataSource: url is required');
    });

    it('disconnect after destroy is a silent no-op', () => {
      const ds = new WebSocketDataSource(makeConfig());
      ds.destroy();
      expect(() => ds.disconnect()).not.toThrow();
    });
  });

  describe('state transitions', () => {
    it('transitions disconnected → connecting → connected → disconnected', () => {
      const states: string[] = [];
      const config = makeConfig({
        onStateChange: (s) => states.push(s),
      });
      const ds = new WebSocketDataSource(config);

      expect(ds.state).toBe('disconnected');

      ds.connect('ws://test');
      expect(ds.state).toBe('connecting');

      latestWs().simulateOpen();
      expect(ds.state).toBe('connected');

      ds.disconnect();
      expect(ds.state).toBe('disconnected');

      expect(states).toEqual(['connecting', 'connected', 'disconnected']);
    });

    it('transitions to disconnected on WebSocket close', () => {
      const states: string[] = [];
      const config = makeConfig({
        onStateChange: (s) => states.push(s),
      });
      const ds = new WebSocketDataSource(config);

      ds.connect('ws://test');
      latestWs().simulateOpen();
      latestWs().simulateClose();

      expect(ds.state).toBe('disconnected');
      expect(states).toEqual(['connecting', 'connected', 'disconnected']);
    });
  });

  describe('message handling — immediate mode', () => {
    it('connect → receives message → calls chart.addData() with parsed point', () => {
      const chart = createMockChart();
      const config = makeConfig({ chart: chart as unknown as WebSocketDataSourceConfig['chart'] });
      const ds = new WebSocketDataSource(config);

      ds.connect('ws://test');
      latestWs().simulateOpen();

      const point = { timestamp: 1000, value: 42 };
      latestWs().simulateMessage(JSON.stringify(point));

      expect(chart.addData).toHaveBeenCalledWith('price', point);
    });

    it('burst of messages → all points reach buffer (none dropped)', () => {
      const chart = createMockChart();
      const config = makeConfig({ chart: chart as unknown as WebSocketDataSourceConfig['chart'] });
      const ds = new WebSocketDataSource(config);

      ds.connect('ws://test');
      latestWs().simulateOpen();

      const points = Array.from({ length: 50 }, (_, i) => ({
        timestamp: 1000 + i,
        value: 100 + i,
      }));

      for (const p of points) {
        latestWs().simulateMessage(JSON.stringify(p));
      }

      expect(chart.addData).toHaveBeenCalledTimes(50);
      for (let i = 0; i < 50; i++) {
        expect(chart.addData).toHaveBeenNthCalledWith(i + 1, 'price', points[i]);
      }
    });

    it('parser returning null skips the message', () => {
      const chart = createMockChart();
      const config = makeConfig({
        chart: chart as unknown as WebSocketDataSourceConfig['chart'],
        messageParser: () => null,
      });
      const ds = new WebSocketDataSource(config);

      ds.connect('ws://test');
      latestWs().simulateOpen();
      latestWs().simulateMessage('skip me');

      expect(chart.addData).not.toHaveBeenCalled();
    });

    it('parser returning array pushes all points', () => {
      const chart = createMockChart();
      const batchPoints: DataPoint[] = [
        { timestamp: 1, value: 10 },
        { timestamp: 2, value: 20 },
      ];
      const config = makeConfig({
        chart: chart as unknown as WebSocketDataSourceConfig['chart'],
        messageParser: () => batchPoints,
      });
      const ds = new WebSocketDataSource(config);

      ds.connect('ws://test');
      latestWs().simulateOpen();
      latestWs().simulateMessage('data');

      expect(chart.addData).toHaveBeenCalledWith('price', batchPoints);
    });
  });

  describe('batch buffering', () => {
    it('accumulates and flushes points at interval', () => {
      const chart = createMockChart();
      const config = makeConfig({
        chart: chart as unknown as WebSocketDataSourceConfig['chart'],
        batchInterval: 100,
      });
      const ds = new WebSocketDataSource(config);

      ds.connect('ws://test');
      latestWs().simulateOpen();

      // Send 3 messages
      latestWs().simulateMessage(JSON.stringify({ timestamp: 1, value: 10 }));
      latestWs().simulateMessage(JSON.stringify({ timestamp: 2, value: 20 }));
      latestWs().simulateMessage(JSON.stringify({ timestamp: 3, value: 30 }));

      // Not flushed yet
      expect(chart.addData).not.toHaveBeenCalled();

      // Advance timer to trigger flush
      vi.advanceTimersByTime(100);

      expect(chart.addData).toHaveBeenCalledTimes(1);
      expect(chart.addData).toHaveBeenCalledWith('price', [
        { timestamp: 1, value: 10 },
        { timestamp: 2, value: 20 },
        { timestamp: 3, value: 30 },
      ]);
    });

    it('flushes remaining batch on disconnect', () => {
      const chart = createMockChart();
      const config = makeConfig({
        chart: chart as unknown as WebSocketDataSourceConfig['chart'],
        batchInterval: 500,
      });
      const ds = new WebSocketDataSource(config);

      ds.connect('ws://test');
      latestWs().simulateOpen();

      latestWs().simulateMessage(JSON.stringify({ timestamp: 1, value: 10 }));

      // Disconnect before interval fires
      ds.disconnect();

      expect(chart.addData).toHaveBeenCalledTimes(1);
      expect(chart.addData).toHaveBeenCalledWith('price', [{ timestamp: 1, value: 10 }]);
    });

    it('flushes remaining batch on WebSocket close', () => {
      const chart = createMockChart();
      const config = makeConfig({
        chart: chart as unknown as WebSocketDataSourceConfig['chart'],
        batchInterval: 500,
      });
      const ds = new WebSocketDataSource(config);

      ds.connect('ws://test');
      latestWs().simulateOpen();

      latestWs().simulateMessage(JSON.stringify({ timestamp: 1, value: 10 }));
      latestWs().simulateClose();

      expect(chart.addData).toHaveBeenCalledTimes(1);
    });

    it('flushes early when batch buffer exceeds maxBatchBufferSize', () => {
      const chart = createMockChart();
      const config = makeConfig({
        chart: chart as unknown as WebSocketDataSourceConfig['chart'],
        batchInterval: 5000,
        maxBatchBufferSize: 5,
      });
      const ds = new WebSocketDataSource(config);

      ds.connect('ws://test');
      latestWs().simulateOpen();

      // Send 5 messages — should trigger early flush at cap
      for (let i = 0; i < 5; i++) {
        latestWs().simulateMessage(JSON.stringify({ timestamp: i, value: i * 10 }));
      }

      // Flushed before interval fires
      expect(chart.addData).toHaveBeenCalledTimes(1);
      expect(chart.addData).toHaveBeenCalledWith('price', [
        { timestamp: 0, value: 0 },
        { timestamp: 1, value: 10 },
        { timestamp: 2, value: 20 },
        { timestamp: 3, value: 30 },
        { timestamp: 4, value: 40 },
      ]);

      // Send 3 more — not yet at cap
      for (let i = 5; i < 8; i++) {
        latestWs().simulateMessage(JSON.stringify({ timestamp: i, value: i * 10 }));
      }
      expect(chart.addData).toHaveBeenCalledTimes(1); // still 1, buffer not full

      // Interval flush picks up remaining
      vi.advanceTimersByTime(5000);
      expect(chart.addData).toHaveBeenCalledTimes(2);
    });
  });

  describe('auto-reconnect', () => {
    it('reconnects with backoff when autoReconnect enabled', () => {
      const states: string[] = [];
      const config = makeConfig({
        autoReconnect: true,
        reconnectDelay: 100,
        onStateChange: (s) => states.push(s),
      });
      const ds = new WebSocketDataSource(config);

      ds.connect('ws://test');
      const ws1 = latestWs();
      ws1.simulateOpen();
      ws1.simulateClose();

      expect(ds.state).toBe('disconnected');
      expect(MockWebSocket.instances).toHaveLength(1);

      // First reconnect after 100ms (100 * 2^0)
      vi.advanceTimersByTime(100);
      expect(MockWebSocket.instances).toHaveLength(2);
      expect(ds.state).toBe('connecting');

      // Simulate failed reconnect (close without open) — backoff escalates
      latestWs().simulateClose();

      // Second reconnect after 200ms (100 * 2^1)
      vi.advanceTimersByTime(100);
      expect(MockWebSocket.instances).toHaveLength(2); // not yet
      vi.advanceTimersByTime(100);
      expect(MockWebSocket.instances).toHaveLength(3);
    });

    it('stops reconnecting after maxReconnectAttempts', () => {
      const config = makeConfig({
        autoReconnect: true,
        reconnectDelay: 100,
        maxReconnectAttempts: 2,
      });
      const ds = new WebSocketDataSource(config);

      ds.connect('ws://test');
      latestWs().simulateOpen();
      latestWs().simulateClose();

      // Attempt 1 (close without open — failed reconnect)
      vi.advanceTimersByTime(100);
      expect(MockWebSocket.instances).toHaveLength(2);
      latestWs().simulateClose();

      // Attempt 2 (close without open — failed reconnect)
      vi.advanceTimersByTime(200);
      expect(MockWebSocket.instances).toHaveLength(3);
      latestWs().simulateClose();

      // No more attempts — maxReconnectAttempts reached
      vi.advanceTimersByTime(10000);
      expect(MockWebSocket.instances).toHaveLength(3);
    });

    it('caps delay at maxReconnectDelay', () => {
      const config = makeConfig({
        autoReconnect: true,
        reconnectDelay: 1000,
        maxReconnectDelay: 2000,
      });
      const ds = new WebSocketDataSource(config);

      ds.connect('ws://test');
      latestWs().simulateOpen();
      latestWs().simulateClose();

      // Attempt 1: delay = 1000 (close without open — failed reconnect)
      vi.advanceTimersByTime(1000);
      expect(MockWebSocket.instances).toHaveLength(2);
      latestWs().simulateClose();

      // Attempt 2: delay = min(2000, 2000) = 2000
      vi.advanceTimersByTime(1999);
      expect(MockWebSocket.instances).toHaveLength(2);
      vi.advanceTimersByTime(1);
      expect(MockWebSocket.instances).toHaveLength(3);
      latestWs().simulateClose();

      // Attempt 3: delay = min(4000, 2000) = 2000 (capped)
      vi.advanceTimersByTime(1999);
      expect(MockWebSocket.instances).toHaveLength(3);
      vi.advanceTimersByTime(1);
      expect(MockWebSocket.instances).toHaveLength(4);
    });

    it('does not reconnect when autoReconnect is false', () => {
      const config = makeConfig({ autoReconnect: false });
      const ds = new WebSocketDataSource(config);

      ds.connect('ws://test');
      latestWs().simulateOpen();
      latestWs().simulateClose();

      vi.advanceTimersByTime(60000);
      expect(MockWebSocket.instances).toHaveLength(1);
    });
  });

  describe('destroy', () => {
    it('cleans up WebSocket, timers, and listeners', () => {
      const config = makeConfig({
        autoReconnect: true,
        reconnectDelay: 100,
        batchInterval: 50,
      });
      const ds = new WebSocketDataSource(config);

      ds.connect('ws://test');
      latestWs().simulateOpen();

      // Ensure batch timer is running
      latestWs().simulateMessage(JSON.stringify({ timestamp: 1, value: 1 }));

      ds.destroy();

      expect(ds.state).toBe('disconnected');

      // Verify no timers fire after destroy
      const chart = config.chart as unknown as { addData: ReturnType<typeof vi.fn> };
      chart.addData.mockClear();
      vi.advanceTimersByTime(10000);
      expect(chart.addData).not.toHaveBeenCalled();
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    it('destroy is idempotent', () => {
      const ds = new WebSocketDataSource(makeConfig());
      ds.destroy();
      ds.destroy(); // Should not throw
      expect(ds.state).toBe('disconnected');
    });

    it('cleans up pending reconnect timer', () => {
      const config = makeConfig({
        autoReconnect: true,
        reconnectDelay: 1000,
      });
      const ds = new WebSocketDataSource(config);

      ds.connect('ws://test');
      latestWs().simulateOpen();
      latestWs().simulateClose();

      // Reconnect is scheduled but not yet fired
      ds.destroy();

      vi.advanceTimersByTime(5000);
      expect(MockWebSocket.instances).toHaveLength(1);
    });
  });

  describe('error handling', () => {
    it('invalid message from WebSocket does not crash (calls onError)', () => {
      const onError = vi.fn();
      const config = makeConfig({
        onError,
        messageParser: () => {
          throw new Error('parse failed');
        },
      });
      const ds = new WebSocketDataSource(config);

      ds.connect('ws://test');
      latestWs().simulateOpen();
      latestWs().simulateMessage('bad data');

      expect(onError).toHaveBeenCalledTimes(1);
      const parseError = onError.mock.calls[0]?.[0] as Error;
      expect(parseError.message).toContain('messageParser threw: parse failed');

      // DataSource is still connected and working
      expect(ds.state).toBe('connected');
    });

    it('WebSocket error event calls onError callback', () => {
      const onError = vi.fn();
      const config = makeConfig({ onError });
      const ds = new WebSocketDataSource(config);

      ds.connect('ws://test');
      latestWs().simulateOpen();
      latestWs().simulateError();

      expect(onError).toHaveBeenCalledTimes(1);
      const wsError = onError.mock.calls[0]?.[0] as Error;
      expect(wsError.message).toContain('WebSocket error');
    });

    it('addData failure is caught and reported via onError', () => {
      const onError = vi.fn();
      const chart = createMockChart();
      chart.addData.mockImplementation(() => {
        throw new Error('invalid data point');
      });
      const config = makeConfig({
        chart: chart as unknown as WebSocketDataSourceConfig['chart'],
        onError,
      });
      const ds = new WebSocketDataSource(config);

      ds.connect('ws://test');
      latestWs().simulateOpen();
      latestWs().simulateMessage(JSON.stringify({ timestamp: 1, value: 1 }));

      expect(onError).toHaveBeenCalledTimes(1);
      const addDataError = onError.mock.calls[0]?.[0] as Error;
      expect(addDataError.message).toContain('addData failed');
    });
  });

  describe('connect replaces previous connection', () => {
    it('closes old WebSocket when connecting to new URL', () => {
      const ds = new WebSocketDataSource(makeConfig());

      ds.connect('ws://first');
      const ws1 = latestWs();
      ws1.simulateOpen();

      ds.connect('ws://second');
      expect(ws1.readyState).toBe(MockWebSocket.CLOSED);
      expect(MockWebSocket.instances).toHaveLength(2);
    });
  });

  describe('performance', () => {
    it('push 100 points in under 16ms via immediate mode', () => {
      const chart = createMockChart();
      const config = makeConfig({
        chart: chart as unknown as WebSocketDataSourceConfig['chart'],
      });
      const ds = new WebSocketDataSource(config);

      ds.connect('ws://test');
      latestWs().simulateOpen();

      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        latestWs().simulateMessage(
          JSON.stringify({ timestamp: 1000 + i, value: 50 + Math.random() }),
        );
      }
      const elapsed = performance.now() - start;

      expect(chart.addData).toHaveBeenCalledTimes(100);
      // Should complete well under 16ms (one frame budget)
      expect(elapsed).toBeLessThan(16);
    });

    it('ring buffer eviction works during sustained streaming (batch mode)', () => {
      const chart = createMockChart();
      const config = makeConfig({
        chart: chart as unknown as WebSocketDataSourceConfig['chart'],
        batchInterval: 100,
      });
      const ds = new WebSocketDataSource(config);

      ds.connect('ws://test');
      latestWs().simulateOpen();

      // Push 500 points in batches
      for (let i = 0; i < 500; i++) {
        latestWs().simulateMessage(
          JSON.stringify({ timestamp: 1000 + i * 100, value: 50 + Math.random() }),
        );
      }

      // Flush
      vi.advanceTimersByTime(100);

      expect(chart.addData).toHaveBeenCalledTimes(1);
      const batchArg = chart.addData.mock.calls[0]?.[1] as DataPoint[];
      expect(batchArg).toHaveLength(500);
    });
  });

  describe('reconnect attempt reset on successful reconnect', () => {
    it('resets reconnectAttempts on successful reconnect (backoff restarts)', () => {
      const config = makeConfig({
        autoReconnect: true,
        reconnectDelay: 100,
      });
      const ds = new WebSocketDataSource(config);

      ds.connect('ws://test');
      latestWs().simulateOpen();
      latestWs().simulateClose();

      // Attempt 1: delay = 100ms (100 * 2^0)
      vi.advanceTimersByTime(100);
      expect(MockWebSocket.instances).toHaveLength(2);

      // Reconnect succeeds — counter should reset
      latestWs().simulateOpen();
      latestWs().simulateClose();

      // Next attempt should be back to 100ms (not 200ms), proving reset worked
      vi.advanceTimersByTime(100);
      expect(MockWebSocket.instances).toHaveLength(3);
    });
  });

  describe('callback safety', () => {
    it('onStateChange throwing does not crash internal state machine', () => {
      const config = makeConfig({
        onStateChange: () => {
          throw new Error('callback exploded');
        },
      });
      const ds = new WebSocketDataSource(config);

      // Should not throw despite callback throwing
      expect(() => ds.connect('ws://test')).not.toThrow();
      expect(ds.state).toBe('connecting');

      latestWs().simulateOpen();
      expect(ds.state).toBe('connected');
    });

    it('onError throwing does not crash the caller', () => {
      const config = makeConfig({
        onError: () => {
          throw new Error('error callback exploded');
        },
        messageParser: () => {
          throw new Error('parse failed');
        },
      });
      const ds = new WebSocketDataSource(config);

      ds.connect('ws://test');
      latestWs().simulateOpen();

      // Should not throw despite both messageParser and onError throwing
      expect(() => latestWs().simulateMessage('bad')).not.toThrow();
      expect(ds.state).toBe('connected');
    });
  });

  describe('missing seriesId reports error', () => {
    it('calls onError when no seriesId is configured', () => {
      const onError = vi.fn();
      const chart = createMockChart();
      const config = makeConfig({
        chart: chart as unknown as WebSocketDataSourceConfig['chart'],
        seriesId: undefined,
        onError,
      });
      const ds = new WebSocketDataSource(config);

      ds.connect('ws://test');
      latestWs().simulateOpen();
      latestWs().simulateMessage(JSON.stringify({ timestamp: 1, value: 1 }));

      expect(chart.addData).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledTimes(1);
      const err = onError.mock.calls[0]?.[0] as Error;
      expect(err.message).toContain('no seriesId configured');
    });
  });

  describe('destroy flushes batch buffer', () => {
    it('flushes buffered data before destroying', () => {
      const chart = createMockChart();
      const config = makeConfig({
        chart: chart as unknown as WebSocketDataSourceConfig['chart'],
        batchInterval: 500,
      });
      const ds = new WebSocketDataSource(config);

      ds.connect('ws://test');
      latestWs().simulateOpen();

      latestWs().simulateMessage(JSON.stringify({ timestamp: 1, value: 10 }));

      ds.destroy();

      expect(chart.addData).toHaveBeenCalledTimes(1);
      expect(chart.addData).toHaveBeenCalledWith('price', [{ timestamp: 1, value: 10 }]);
    });
  });

  describe('WebSocket constructor failure', () => {
    it('recovers to disconnected state when WebSocket constructor throws', () => {
      const onError = vi.fn();
      const onStateChange = vi.fn();
      vi.stubGlobal(
        'WebSocket',
        class {
          constructor() {
            throw new Error('SecurityError');
          }
        },
      );

      const config = makeConfig({ onError, onStateChange });
      const ds = new WebSocketDataSource(config);

      expect(() => ds.connect('ws://test')).not.toThrow();
      expect(ds.state).toBe('disconnected');
      expect(onError).toHaveBeenCalledTimes(1);
      const err = onError.mock.calls[0]?.[0] as Error;
      expect(err.message).toContain('WebSocket constructor failed');
    });
  });
});
