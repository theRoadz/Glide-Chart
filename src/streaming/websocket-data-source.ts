import type { DataPoint } from '../api/types';
import type { DataSourceState, WebSocketDataSourceConfig } from './types';

const DEFAULT_RECONNECT_DELAY = 1000;
const DEFAULT_MAX_RECONNECT_DELAY = 30000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 0;
const DEFAULT_BATCH_INTERVAL = 0;
const DEFAULT_MAX_BATCH_BUFFER_SIZE = 10000;

export class WebSocketDataSource {
  private currentState: DataSourceState = 'disconnected';
  private ws: WebSocket | null = null;
  private config: WebSocketDataSourceConfig;
  private seriesId: string | undefined;
  private destroyed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private batchTimer: ReturnType<typeof setInterval> | null = null;
  private batchBuffer: DataPoint[] = [];
  private reconnectAttempts = 0;
  private url: string | URL | null = null;

  get state(): DataSourceState {
    return this.currentState;
  }

  constructor(config: WebSocketDataSourceConfig) {
    if (!config) {
      throw new Error('WebSocketDataSource: config is required');
    }
    if (!config.chart) {
      throw new Error('WebSocketDataSource: config.chart is required');
    }
    if (!config.messageParser) {
      throw new Error('WebSocketDataSource: config.messageParser is required');
    }
    if (typeof config.messageParser !== 'function') {
      throw new Error('WebSocketDataSource: config.messageParser must be a function');
    }

    this.config = config;
    this.seriesId = config.seriesId;
  }

  connect(url: string | URL): void {
    if (this.destroyed) {
      throw new Error('WebSocketDataSource: instance has been destroyed');
    }
    if (!url) {
      throw new Error('WebSocketDataSource: url is required');
    }

    // Close existing connection if any
    this.closeWebSocket();
    this.clearReconnectTimer();

    this.url = url;
    this.reconnectAttempts = 0;
    this.openConnection();
  }

  disconnect(): void {
    if (this.destroyed) {
      return;
    }

    this.clearReconnectTimer();
    this.flushBatch();
    this.closeWebSocket();
    this.setState('disconnected');
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.clearReconnectTimer();
    this.flushBatch();
    this.clearBatchTimer();
    this.batchBuffer = [];
    this.closeWebSocket();
    this.currentState = 'disconnected';
    this.url = null;
  }

  private openConnection(): void {
    const urlString = typeof this.url === 'string' ? this.url : this.url!.toString();

    this.setState('connecting');

    let ws: WebSocket;
    try {
      ws = new WebSocket(urlString);
    } catch (err) {
      this.setState('disconnected');
      const error =
        err instanceof Error
          ? new Error(`WebSocketDataSource: WebSocket constructor failed: ${err.message}`)
          : new Error('WebSocketDataSource: WebSocket constructor failed');
      this.safeCallOnError(error);
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.reconnectAttempts = 0;
      this.setState('connected');
      this.startBatchTimer();
    };

    ws.onmessage = (event: MessageEvent) => {
      if (this.ws !== ws) return;
      this.handleMessage(event.data as string | ArrayBuffer);
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.flushBatch();
      this.clearBatchTimer();
      this.ws = null;

      if (this.destroyed) return;

      this.setState('disconnected');
      this.maybeReconnect();
    };

    ws.onerror = () => {
      if (this.ws !== ws) return;
      const error = new Error('WebSocketDataSource: WebSocket error');
      this.safeCallOnError(error);
    };
  }

  private handleMessage(data: string | ArrayBuffer): void {
    let parsed: DataPoint | DataPoint[] | null;

    try {
      parsed = this.config.messageParser(data);
    } catch (err) {
      const error =
        err instanceof Error
          ? new Error(`WebSocketDataSource: messageParser threw: ${err.message}`)
          : new Error('WebSocketDataSource: messageParser threw an unknown error');
      this.safeCallOnError(error);
      return;
    }

    if (parsed === null || parsed === undefined) {
      return;
    }

    const batchInterval = this.config.batchInterval ?? DEFAULT_BATCH_INTERVAL;

    if (batchInterval > 0) {
      // Accumulate in batch buffer
      if (Array.isArray(parsed)) {
        for (const p of parsed) {
          this.batchBuffer.push(p);
        }
      } else {
        this.batchBuffer.push(parsed);
      }
      // Flush early if buffer exceeds cap
      const maxSize = this.config.maxBatchBufferSize ?? DEFAULT_MAX_BATCH_BUFFER_SIZE;
      if (this.batchBuffer.length >= maxSize) {
        this.flushBatch();
      }
    } else {
      // Immediate push
      this.pushToChart(parsed);
    }
  }

  private pushToChart(data: DataPoint | DataPoint[]): void {
    const seriesId = this.resolveSeriesId();
    if (seriesId === undefined) {
      const error = new Error(
        'WebSocketDataSource: no seriesId configured — data points are being dropped',
      );
      this.safeCallOnError(error);
      return;
    }

    try {
      if (Array.isArray(data)) {
        if (data.length > 0) {
          this.config.chart.addData(seriesId, data);
        }
      } else {
        this.config.chart.addData(seriesId, data);
      }
    } catch (err) {
      const error =
        err instanceof Error
          ? new Error(`WebSocketDataSource: addData failed: ${err.message}`)
          : new Error('WebSocketDataSource: addData failed with unknown error');
      this.safeCallOnError(error);
    }
  }

  private resolveSeriesId(): string | undefined {
    if (this.seriesId !== undefined) {
      return this.seriesId;
    }
    return undefined;
  }

  private flushBatch(): void {
    if (this.batchBuffer.length === 0) return;
    const points = this.batchBuffer;
    this.batchBuffer = [];
    this.pushToChart(points);
  }

  private startBatchTimer(): void {
    const batchInterval = this.config.batchInterval ?? DEFAULT_BATCH_INTERVAL;
    if (batchInterval <= 0) return;

    this.clearBatchTimer();
    this.batchTimer = setInterval(() => {
      this.flushBatch();
    }, batchInterval);
  }

  private clearBatchTimer(): void {
    if (this.batchTimer !== null) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
  }

  private maybeReconnect(): void {
    if (!this.config.autoReconnect) return;
    if (this.destroyed) return;
    if (!this.url) return;

    const maxAttempts = this.config.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS;
    if (maxAttempts > 0 && this.reconnectAttempts >= maxAttempts) {
      return;
    }

    const baseDelay = this.config.reconnectDelay ?? DEFAULT_RECONNECT_DELAY;
    const maxDelay = this.config.maxReconnectDelay ?? DEFAULT_MAX_RECONNECT_DELAY;
    const delay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempts), maxDelay);

    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.destroyed && this.url) {
        this.openConnection();
      }
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private closeWebSocket(): void {
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      try {
        ws.close();
      } catch {
        // Ignore close errors
      }
    }
  }

  private setState(newState: DataSourceState): void {
    if (this.currentState === newState) return;
    this.currentState = newState;
    try {
      this.config.onStateChange?.(newState);
    } catch {
      // User callback threw — swallow to protect internal state machine
    }
  }

  private safeCallOnError(error: Error): void {
    try {
      this.config.onError?.(error);
    } catch {
      // User callback threw — swallow to protect internal state
    }
  }
}
