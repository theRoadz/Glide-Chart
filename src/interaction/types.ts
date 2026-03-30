import type { DataPoint } from '../core/types';
import type { RingBuffer } from '../core/ring-buffer';

export interface PointerState {
  x: number;
  y: number;
  active: boolean;
  pointerType: string;
}

export type PointerCallback = (state: Readonly<PointerState>) => void;

export interface CrosshairDataSource {
  getBuffers(): Iterable<RingBuffer<DataPoint>>;
}
