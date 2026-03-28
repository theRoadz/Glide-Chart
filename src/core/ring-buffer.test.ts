import { RingBuffer, getVisibleWindow } from './ring-buffer';
import { DataPoint } from './types';

describe('RingBuffer', () => {
  describe('construction', () => {
    it('creates a buffer with valid capacity', () => {
      const buf = new RingBuffer<number>(10);
      expect(buf.capacity).toBe(10);
      expect(buf.size).toBe(0);
      expect(buf.isEmpty).toBe(true);
      expect(buf.isFull).toBe(false);
    });

    it('throws on zero capacity', () => {
      expect(() => new RingBuffer<number>(0)).toThrow(
        'RingBuffer: capacity must be positive',
      );
    });

    it('throws on negative capacity', () => {
      expect(() => new RingBuffer<number>(-5)).toThrow(
        'RingBuffer: capacity must be positive',
      );
    });

    it('throws on non-integer capacity', () => {
      expect(() => new RingBuffer<number>(3.5)).toThrow(
        'RingBuffer: capacity must be positive',
      );
    });
  });

  describe('push and size', () => {
    it('increases size as items are pushed', () => {
      const buf = new RingBuffer<number>(5);
      buf.push(1);
      expect(buf.size).toBe(1);
      buf.push(2);
      expect(buf.size).toBe(2);
      buf.push(3);
      expect(buf.size).toBe(3);
    });

    it('does not exceed capacity', () => {
      const buf = new RingBuffer<number>(3);
      buf.push(1);
      buf.push(2);
      buf.push(3);
      buf.push(4);
      expect(buf.size).toBe(3);
      expect(buf.capacity).toBe(3);
    });

    it('reports isFull correctly', () => {
      const buf = new RingBuffer<number>(2);
      expect(buf.isFull).toBe(false);
      buf.push(1);
      expect(buf.isFull).toBe(false);
      buf.push(2);
      expect(buf.isFull).toBe(true);
    });

    it('reports isEmpty correctly', () => {
      const buf = new RingBuffer<number>(2);
      expect(buf.isEmpty).toBe(true);
      buf.push(1);
      expect(buf.isEmpty).toBe(false);
    });
  });

  describe('FIFO eviction', () => {
    it('evicts oldest items when pushing beyond capacity', () => {
      const buf = new RingBuffer<number>(3);
      buf.push(1);
      buf.push(2);
      buf.push(3);
      buf.push(4); // evicts 1
      expect(buf.toArray()).toEqual([2, 3, 4]);
      expect(buf.size).toBe(3);
    });

    it('evicts multiple items correctly', () => {
      const buf = new RingBuffer<number>(3);
      buf.push(1);
      buf.push(2);
      buf.push(3);
      buf.push(4); // evicts 1
      buf.push(5); // evicts 2
      buf.push(6); // evicts 3
      expect(buf.toArray()).toEqual([4, 5, 6]);
    });

    it('handles many wraps correctly', () => {
      const buf = new RingBuffer<number>(3);
      for (let i = 0; i < 100; i++) {
        buf.push(i);
      }
      expect(buf.toArray()).toEqual([97, 98, 99]);
      expect(buf.size).toBe(3);
    });
  });

  describe('iteration order', () => {
    it('toArray returns oldest-to-newest after wrapping', () => {
      const buf = new RingBuffer<number>(3);
      buf.push(10);
      buf.push(20);
      buf.push(30);
      buf.push(40); // evicts 10
      expect(buf.toArray()).toEqual([20, 30, 40]);
    });

    it('Symbol.iterator yields oldest-to-newest', () => {
      const buf = new RingBuffer<number>(3);
      buf.push(1);
      buf.push(2);
      buf.push(3);
      buf.push(4); // evicts 1
      expect([...buf]).toEqual([2, 3, 4]);
    });

    it('toArray returns correct order before wrapping', () => {
      const buf = new RingBuffer<number>(5);
      buf.push(1);
      buf.push(2);
      buf.push(3);
      expect(buf.toArray()).toEqual([1, 2, 3]);
    });
  });

  describe('get', () => {
    it('returns item at logical index (0 = oldest)', () => {
      const buf = new RingBuffer<number>(3);
      buf.push(10);
      buf.push(20);
      buf.push(30);
      expect(buf.get(0)).toBe(10);
      expect(buf.get(1)).toBe(20);
      expect(buf.get(2)).toBe(30);
    });

    it('returns correct items after wrapping', () => {
      const buf = new RingBuffer<number>(3);
      buf.push(1);
      buf.push(2);
      buf.push(3);
      buf.push(4); // evicts 1
      expect(buf.get(0)).toBe(2);
      expect(buf.get(1)).toBe(3);
      expect(buf.get(2)).toBe(4);
    });

    it('returns undefined for out-of-range index', () => {
      const buf = new RingBuffer<number>(3);
      buf.push(1);
      expect(buf.get(-1)).toBeUndefined();
      expect(buf.get(1)).toBeUndefined();
      expect(buf.get(100)).toBeUndefined();
    });
  });

  describe('peek and peekOldest', () => {
    it('peek returns newest item', () => {
      const buf = new RingBuffer<number>(3);
      buf.push(1);
      buf.push(2);
      buf.push(3);
      expect(buf.peek()).toBe(3);
    });

    it('peekOldest returns oldest item', () => {
      const buf = new RingBuffer<number>(3);
      buf.push(1);
      buf.push(2);
      buf.push(3);
      expect(buf.peekOldest()).toBe(1);
    });

    it('peek returns newest after wrapping', () => {
      const buf = new RingBuffer<number>(3);
      buf.push(1);
      buf.push(2);
      buf.push(3);
      buf.push(4);
      expect(buf.peek()).toBe(4);
      expect(buf.peekOldest()).toBe(2);
    });

    it('peek does not mutate buffer', () => {
      const buf = new RingBuffer<number>(3);
      buf.push(1);
      buf.push(2);
      buf.peek();
      buf.peekOldest();
      expect(buf.size).toBe(2);
      expect(buf.toArray()).toEqual([1, 2]);
    });
  });

  describe('clear', () => {
    it('resets size to 0 and keeps capacity', () => {
      const buf = new RingBuffer<number>(5);
      buf.push(1);
      buf.push(2);
      buf.push(3);
      buf.clear();
      expect(buf.size).toBe(0);
      expect(buf.capacity).toBe(5);
      expect(buf.isEmpty).toBe(true);
    });

    it('allows reuse after clear', () => {
      const buf = new RingBuffer<number>(3);
      buf.push(1);
      buf.push(2);
      buf.clear();
      buf.push(10);
      buf.push(20);
      expect(buf.toArray()).toEqual([10, 20]);
    });

    it('resets slots to undefined to prevent stale references', () => {
      const buf = new RingBuffer<{ data: string }>(3);
      buf.push({ data: 'a' });
      buf.push({ data: 'b' });
      buf.push({ data: 'c' });
      buf.clear();
      // After clear, get should return undefined for all indices
      expect(buf.get(0)).toBeUndefined();
      expect(buf.get(1)).toBeUndefined();
      expect(buf.get(2)).toBeUndefined();
      // Also verify toArray is empty
      expect(buf.toArray()).toEqual([]);
    });
  });

  describe('empty buffer edge cases', () => {
    it('get returns undefined on empty buffer', () => {
      const buf = new RingBuffer<number>(5);
      expect(buf.get(0)).toBeUndefined();
    });

    it('peek returns undefined on empty buffer', () => {
      const buf = new RingBuffer<number>(5);
      expect(buf.peek()).toBeUndefined();
    });

    it('peekOldest returns undefined on empty buffer', () => {
      const buf = new RingBuffer<number>(5);
      expect(buf.peekOldest()).toBeUndefined();
    });

    it('iteration yields nothing on empty buffer', () => {
      const buf = new RingBuffer<number>(5);
      expect([...buf]).toEqual([]);
      expect(buf.toArray()).toEqual([]);
    });
  });

  describe('single-item buffer (capacity 1)', () => {
    it('holds one item and evicts on next push', () => {
      const buf = new RingBuffer<number>(1);
      buf.push(1);
      expect(buf.size).toBe(1);
      expect(buf.isFull).toBe(true);
      expect(buf.toArray()).toEqual([1]);

      buf.push(2);
      expect(buf.size).toBe(1);
      expect(buf.toArray()).toEqual([2]);
    });

    it('peek and peekOldest return same item', () => {
      const buf = new RingBuffer<number>(1);
      buf.push(42);
      expect(buf.peek()).toBe(42);
      expect(buf.peekOldest()).toBe(42);
    });

    it('handles many push/evict cycles', () => {
      const buf = new RingBuffer<number>(1);
      for (let i = 0; i < 50; i++) {
        buf.push(i);
      }
      expect(buf.size).toBe(1);
      expect(buf.peek()).toBe(49);
    });
  });

  describe('O(1) behavior assertion', () => {
    it('internal array length stays constant after wrapping', () => {
      const buf = new RingBuffer<number>(100);
      // Push beyond capacity
      for (let i = 0; i < 500; i++) {
        buf.push(i);
      }
      // Access internal buffer via toArray length check — size is capped
      expect(buf.size).toBe(100);
      expect(buf.capacity).toBe(100);
      // Verify no reallocation by checking the buffer holds exactly capacity items
      expect(buf.toArray().length).toBe(100);
    });
  });
});

describe('getVisibleWindow', () => {
  function makePoints(timestamps: number[]): DataPoint[] {
    return timestamps.map((t) => ({ timestamp: t, value: t * 10 }));
  }

  function fillBuffer(
    capacity: number,
    points: DataPoint[],
  ): RingBuffer<DataPoint> {
    const buf = new RingBuffer<DataPoint>(capacity);
    for (const p of points) {
      buf.push(p);
    }
    return buf;
  }

  it('returns correct subset for given time range', () => {
    const points = makePoints([100, 200, 300, 400, 500]);
    const buf = fillBuffer(10, points);
    const result = getVisibleWindow(buf, { start: 200, end: 400 });
    expect(result).toEqual([
      { timestamp: 200, value: 2000 },
      { timestamp: 300, value: 3000 },
      { timestamp: 400, value: 4000 },
    ]);
  });

  it('returns empty array for range with no matching points', () => {
    const points = makePoints([100, 200, 300]);
    const buf = fillBuffer(10, points);
    const result = getVisibleWindow(buf, { start: 400, end: 500 });
    expect(result).toEqual([]);
  });

  it('returns all points when range covers all data', () => {
    const points = makePoints([100, 200, 300]);
    const buf = fillBuffer(10, points);
    const result = getVisibleWindow(buf, { start: 0, end: 1000 });
    expect(result).toEqual(points);
  });

  it('returns correct window after buffer wraps', () => {
    const points = makePoints([100, 200, 300, 400, 500]);
    const buf = fillBuffer(3, points); // keeps 300, 400, 500
    const result = getVisibleWindow(buf, { start: 300, end: 400 });
    expect(result).toEqual([
      { timestamp: 300, value: 3000 },
      { timestamp: 400, value: 4000 },
    ]);
  });

  it('returns empty array on empty buffer', () => {
    const buf = new RingBuffer<DataPoint>(10);
    const result = getVisibleWindow(buf, { start: 0, end: 1000 });
    expect(result).toEqual([]);
  });

  it('returns matching point for single-point range (start === end)', () => {
    const points = makePoints([100, 200, 300]);
    const buf = fillBuffer(10, points);
    const result = getVisibleWindow(buf, { start: 200, end: 200 });
    expect(result).toEqual([{ timestamp: 200, value: 2000 }]);
  });

  it('returns empty for single-point range with no exact match', () => {
    const points = makePoints([100, 200, 300]);
    const buf = fillBuffer(10, points);
    const result = getVisibleWindow(buf, { start: 150, end: 150 });
    expect(result).toEqual([]);
  });

  it('includes boundary timestamps (inclusive range)', () => {
    const points = makePoints([100, 200, 300]);
    const buf = fillBuffer(10, points);
    const result = getVisibleWindow(buf, { start: 100, end: 300 });
    expect(result).toEqual(points);
  });

  it('returns empty array for inverted range (start > end)', () => {
    const points = makePoints([100, 200, 300, 400, 500]);
    const buf = fillBuffer(10, points);
    const result = getVisibleWindow(buf, { start: 400, end: 200 });
    expect(result).toEqual([]);
  });
});
