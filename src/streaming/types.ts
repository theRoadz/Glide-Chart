import type { GlideChart } from '../api/glide-chart';
import type { DataPoint } from '../api/types';

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
  /** Max points to buffer before forcing an early flush (default: 10000) */
  maxBatchBufferSize?: number;
  /** Called on state changes */
  onStateChange?: (state: DataSourceState) => void;
  /** Called on errors (parse failures, WebSocket errors) */
  onError?: (error: Error) => void;
}
