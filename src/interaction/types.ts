import type { DataPoint } from '../core/types';
import type { RingBuffer } from '../core/ring-buffer';

export interface PointerState {
  x: number;
  y: number;
  active: boolean;
  pointerType: string;
}

export type PointerCallback = (state: Readonly<PointerState>) => void;

export interface CrosshairSeriesData {
  id: string;
  buffer: RingBuffer<DataPoint>;
}

export interface CrosshairDataSource {
  getSeries(): Iterable<CrosshairSeriesData>;
}

export interface TooltipDataPoint {
  seriesId: string;
  value: number;
  timestamp: number;
}
