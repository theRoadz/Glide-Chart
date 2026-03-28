import { SplineCache } from './spline-cache';
import { RingBuffer } from './ring-buffer';
import { computeMonotoneSpline } from './interpolation';
import { DataPoint } from './types';

function makeBuffer(
  capacity: number,
  points: [number, number][],
): RingBuffer<DataPoint> {
  const buf = new RingBuffer<DataPoint>(capacity);
  for (const [timestamp, value] of points) {
    buf.push({ timestamp, value });
  }
  return buf;
}

describe('SplineCache', () => {
  describe('computeFull()', () => {
    it('produces correct number of segments (points - 1)', () => {
      const buf = makeBuffer(100, [
        [0, 1],
        [1, 3],
        [2, 5],
        [3, 8],
        [4, 12],
      ]);
      const cache = new SplineCache(buf);
      cache.computeFull();
      expect(cache.segmentCount).toBe(4);
      expect(cache.isValid).toBe(true);
    });

    it('on empty buffer produces 0 segments', () => {
      const buf = new RingBuffer<DataPoint>(10);
      const cache = new SplineCache(buf);
      cache.computeFull();
      expect(cache.segmentCount).toBe(0);
      expect(cache.isValid).toBe(true);
    });

    it('on 1-point buffer produces 0 segments', () => {
      const buf = makeBuffer(10, [[0, 5]]);
      const cache = new SplineCache(buf);
      cache.computeFull();
      expect(cache.segmentCount).toBe(0);
    });

    it('on 2-point buffer produces 1 linear segment', () => {
      const buf = makeBuffer(10, [
        [0, 0],
        [10, 20],
      ]);
      const cache = new SplineCache(buf);
      cache.computeFull();
      expect(cache.segmentCount).toBe(1);
      const coeffs = cache.getCoefficients();
      expect(coeffs[0]!.a).toBe(0);
      expect(coeffs[0]!.b).toBe(0);
    });
  });

  describe('getCoefficients()', () => {
    it('returns cached data without recomputation', () => {
      const buf = makeBuffer(100, [
        [0, 1],
        [1, 3],
        [2, 5],
      ]);
      const cache = new SplineCache(buf);
      cache.computeFull();

      const coeffs1 = cache.getCoefficients();
      const coeffs2 = cache.getCoefficients();
      // Same reference — no recomputation
      expect(coeffs1).toBe(coeffs2);
    });
  });

  describe('invalidate()', () => {
    it('clears cache and isValid returns false', () => {
      const buf = makeBuffer(100, [
        [0, 1],
        [1, 3],
        [2, 5],
      ]);
      const cache = new SplineCache(buf);
      cache.computeFull();
      expect(cache.isValid).toBe(true);

      cache.invalidate();
      expect(cache.isValid).toBe(false);
      expect(cache.segmentCount).toBe(0);
    });
  });

  describe('appendPoint()', () => {
    it('after computeFull() only modifies last 2-3 segments', () => {
      const buf = makeBuffer(100, [
        [0, 1],
        [1, 3],
        [2, 5],
        [3, 8],
        [4, 12],
        [5, 15],
        [6, 18],
      ]);
      const cache = new SplineCache(buf);
      cache.computeFull();
      const before = cache.getCoefficients().map((c) => ({ ...c }));

      // Push new point
      buf.push({ timestamp: 7, value: 20 });
      cache.appendPoint();

      const after = cache.getCoefficients();
      expect(after.length).toBe(7); // 8 points = 7 segments

      // Earlier segments (0 through ~3) should be unchanged
      for (let i = 0; i < before.length - 3; i++) {
        expect(after[i]!.a).toBeCloseTo(before[i]!.a, 10);
        expect(after[i]!.b).toBeCloseTo(before[i]!.b, 10);
        expect(after[i]!.c).toBeCloseTo(before[i]!.c, 10);
        expect(after[i]!.d).toBeCloseTo(before[i]!.d, 10);
      }
    });

    it('result matches full recompute for tail segments', () => {
      const buf = makeBuffer(100, [
        [0, 1],
        [1, 3],
        [2, 5],
        [3, 8],
        [4, 12],
      ]);
      const cache = new SplineCache(buf);
      cache.computeFull();

      buf.push({ timestamp: 5, value: 15 });
      cache.appendPoint();

      // Full recompute for comparison
      const fullCoeffs = computeMonotoneSpline(buf.toArray());
      const incrementalCoeffs = cache.getCoefficients();

      expect(incrementalCoeffs.length).toBe(fullCoeffs.length);
      for (let i = 0; i < fullCoeffs.length; i++) {
        expect(incrementalCoeffs[i]!.a).toBeCloseTo(fullCoeffs[i]!.a, 8);
        expect(incrementalCoeffs[i]!.b).toBeCloseTo(fullCoeffs[i]!.b, 8);
        expect(incrementalCoeffs[i]!.c).toBeCloseTo(fullCoeffs[i]!.c, 8);
        expect(incrementalCoeffs[i]!.d).toBeCloseTo(fullCoeffs[i]!.d, 8);
      }
    });

    it('multiple appendPoint() calls produce same result as computeFull()', () => {
      const buf = makeBuffer(100, [
        [0, 1],
        [1, 3],
        [2, 5],
      ]);
      const cache = new SplineCache(buf);
      cache.computeFull();

      // Append several points one at a time
      for (let i = 3; i <= 8; i++) {
        buf.push({ timestamp: i, value: i * 2 + 1 });
        cache.appendPoint();
      }

      const fullCoeffs = computeMonotoneSpline(buf.toArray());
      const incrementalCoeffs = cache.getCoefficients();

      expect(incrementalCoeffs.length).toBe(fullCoeffs.length);
      for (let i = 0; i < fullCoeffs.length; i++) {
        expect(incrementalCoeffs[i]!.a).toBeCloseTo(fullCoeffs[i]!.a, 8);
        expect(incrementalCoeffs[i]!.b).toBeCloseTo(fullCoeffs[i]!.b, 8);
        expect(incrementalCoeffs[i]!.c).toBeCloseTo(fullCoeffs[i]!.c, 8);
        expect(incrementalCoeffs[i]!.d).toBeCloseTo(fullCoeffs[i]!.d, 8);
      }
    });

    it('segmentCount returns correct value after compute and after append', () => {
      const buf = makeBuffer(100, [
        [0, 1],
        [1, 3],
        [2, 5],
      ]);
      const cache = new SplineCache(buf);
      cache.computeFull();
      expect(cache.segmentCount).toBe(2);

      buf.push({ timestamp: 3, value: 8 });
      cache.appendPoint();
      expect(cache.segmentCount).toBe(3);
    });

    it('when buffer at capacity — oldest segment removed, first segment recalculated', () => {
      const buf = makeBuffer(5, [
        [0, 1],
        [1, 3],
        [2, 5],
        [3, 8],
        [4, 12],
      ]);
      const cache = new SplineCache(buf);
      cache.computeFull();
      expect(cache.segmentCount).toBe(4);

      // Buffer is full. Push evicts oldest (point 0).
      buf.push({ timestamp: 5, value: 15 });
      cache.appendPoint();

      // Should have 4 segments (5 points - 1)
      expect(cache.segmentCount).toBe(4);

      // Verify against full recompute
      const fullCoeffs = computeMonotoneSpline(buf.toArray());
      const incrementalCoeffs = cache.getCoefficients();

      expect(incrementalCoeffs.length).toBe(fullCoeffs.length);
      for (let i = 0; i < fullCoeffs.length; i++) {
        expect(incrementalCoeffs[i]!.x0).toBeCloseTo(fullCoeffs[i]!.x0, 8);
        expect(incrementalCoeffs[i]!.x1).toBeCloseTo(fullCoeffs[i]!.x1, 8);
        expect(incrementalCoeffs[i]!.a).toBeCloseTo(fullCoeffs[i]!.a, 8);
        expect(incrementalCoeffs[i]!.b).toBeCloseTo(fullCoeffs[i]!.b, 8);
        expect(incrementalCoeffs[i]!.c).toBeCloseTo(fullCoeffs[i]!.c, 8);
        expect(incrementalCoeffs[i]!.d).toBeCloseTo(fullCoeffs[i]!.d, 8);
      }
    });

    it('after multiple evictions — coefficient count equals buffer.size - 1', () => {
      const buf = makeBuffer(4, [
        [0, 1],
        [1, 3],
        [2, 5],
        [3, 8],
      ]);
      const cache = new SplineCache(buf);
      cache.computeFull();

      // Push 3 more points, causing 3 evictions
      for (let i = 4; i <= 6; i++) {
        buf.push({ timestamp: i, value: i * 3 });
        cache.appendPoint();
      }

      expect(cache.segmentCount).toBe(buf.size - 1);
    });

    it('at capacity produces same result as computeFull() from scratch', () => {
      const buf = makeBuffer(5, [
        [0, 1],
        [1, 3],
        [2, 5],
        [3, 8],
        [4, 12],
      ]);
      const cache = new SplineCache(buf);
      cache.computeFull();

      // Multiple evictions
      for (let i = 5; i <= 10; i++) {
        buf.push({ timestamp: i, value: i * 2 });
        cache.appendPoint();
      }

      const fullCoeffs = computeMonotoneSpline(buf.toArray());
      const incrementalCoeffs = cache.getCoefficients();

      expect(incrementalCoeffs.length).toBe(fullCoeffs.length);
      for (let i = 0; i < fullCoeffs.length; i++) {
        expect(incrementalCoeffs[i]!.a).toBeCloseTo(fullCoeffs[i]!.a, 8);
        expect(incrementalCoeffs[i]!.b).toBeCloseTo(fullCoeffs[i]!.b, 8);
        expect(incrementalCoeffs[i]!.c).toBeCloseTo(fullCoeffs[i]!.c, 8);
        expect(incrementalCoeffs[i]!.d).toBeCloseTo(fullCoeffs[i]!.d, 8);
      }
    });
  });
});
