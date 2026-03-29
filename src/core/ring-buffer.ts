import { DataPoint, TimeRange } from './types';

export class RingBuffer<T> {
  readonly capacity: number;
  private buffer: Array<T | undefined>;
  private head: number;
  private tail: number;
  private count: number;

  constructor(capacity: number) {
    if (capacity <= 0 || !Number.isInteger(capacity)) {
      throw new Error('RingBuffer: capacity must be positive');
    }
    this.capacity = capacity;
    this.buffer = new Array<T | undefined>(capacity);
    this.head = 0;
    this.tail = 0;
    this.count = 0;
  }

  push(item: T): void {
    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    } else {
      this.head = (this.head + 1) % this.capacity;
    }
  }

  get(index: number): T | undefined {
    if (index < 0 || index >= this.count) return undefined;
    const physicalIndex = (this.head + index) % this.capacity;
    return this.buffer[physicalIndex];
  }

  get size(): number {
    return this.count;
  }

  get isEmpty(): boolean {
    return this.count === 0;
  }

  get isFull(): boolean {
    return this.count === this.capacity;
  }

  clear(): void {
    this.head = 0;
    this.tail = 0;
    this.count = 0;
    for (let i = 0; i < this.capacity; i++) {
      this.buffer[i] = undefined;
    }
  }

  toArray(): T[] {
    const result: T[] = [];
    for (let i = 0; i < this.count; i++) {
      const physicalIndex = (this.head + i) % this.capacity;
      result.push(this.buffer[physicalIndex] as T);
    }
    return result;
  }

  *[Symbol.iterator](): Iterator<T> {
    for (let i = 0; i < this.count; i++) {
      const physicalIndex = (this.head + i) % this.capacity;
      yield this.buffer[physicalIndex] as T;
    }
  }

  peek(): T | undefined {
    if (this.count === 0) return undefined;
    const newestIndex = (this.tail - 1 + this.capacity) % this.capacity;
    return this.buffer[newestIndex];
  }

  peekOldest(): T | undefined {
    if (this.count === 0) return undefined;
    return this.buffer[this.head];
  }
}

export function getVisibleWindow(
  buffer: RingBuffer<DataPoint>,
  range: TimeRange,
): DataPoint[] {
  const result: DataPoint[] = [];
  for (const point of buffer) {
    if (point.timestamp >= range.start && point.timestamp <= range.end) {
      result.push(point);
    }
  }
  return result;
}
