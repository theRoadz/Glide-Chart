import {
  computeMonotoneSpline,
  evaluateSpline,
  findSegmentIndex,
  SplineCoefficients,
} from './interpolation';
import { DataPoint } from './types';

function makePoints(pairs: [number, number][]): DataPoint[] {
  return pairs.map(([timestamp, value]) => ({ timestamp, value }));
}

describe('computeMonotoneSpline', () => {
  it('returns empty array for 0 points', () => {
    expect(computeMonotoneSpline([])).toEqual([]);
  });

  it('returns empty array for 1 point', () => {
    const points = makePoints([[1, 10]]);
    expect(computeMonotoneSpline(points)).toEqual([]);
  });

  it('returns linear segment for 2 points', () => {
    const points = makePoints([
      [0, 0],
      [10, 20],
    ]);
    const coeffs = computeMonotoneSpline(points);
    expect(coeffs).toHaveLength(1);
    expect(coeffs[0]!.a).toBe(0);
    expect(coeffs[0]!.b).toBe(0);
    // Evaluate at endpoints
    expect(evaluateSpline(coeffs[0]!, 0)).toBeCloseTo(0, 10);
    expect(evaluateSpline(coeffs[0]!, 10)).toBeCloseTo(20, 10);
    // Midpoint should be linear
    expect(evaluateSpline(coeffs[0]!, 5)).toBeCloseTo(10, 10);
  });

  it('curve passes through every input point exactly (3+ points)', () => {
    const points = makePoints([
      [0, 0],
      [1, 2],
      [3, 1],
      [5, 4],
      [7, 3],
    ]);
    const coeffs = computeMonotoneSpline(points);
    expect(coeffs).toHaveLength(4);

    for (const p of points) {
      const segIdx = findSegmentIndex(coeffs, p.timestamp);
      const val = evaluateSpline(coeffs[segIdx]!, p.timestamp);
      expect(val).toBeCloseTo(p.value, 10);
    }
  });

  it('monotone increasing data produces monotone increasing interpolation', () => {
    const points = makePoints([
      [0, 1],
      [1, 3],
      [2, 5],
      [3, 8],
      [4, 12],
    ]);
    const coeffs = computeMonotoneSpline(points);
    const samples = 100;
    let prev = -Infinity;
    for (let i = 0; i <= samples; i++) {
      const x = (i / samples) * 4;
      const segIdx = findSegmentIndex(coeffs, x);
      const val = evaluateSpline(coeffs[segIdx]!, x);
      expect(val).toBeGreaterThanOrEqual(prev - 1e-10);
      prev = val;
    }
  });

  it('monotone decreasing data produces monotone decreasing interpolation', () => {
    const points = makePoints([
      [0, 12],
      [1, 8],
      [2, 5],
      [3, 3],
      [4, 1],
    ]);
    const coeffs = computeMonotoneSpline(points);
    const samples = 100;
    let prev = Infinity;
    for (let i = 0; i <= samples; i++) {
      const x = (i / samples) * 4;
      const segIdx = findSegmentIndex(coeffs, x);
      const val = evaluateSpline(coeffs[segIdx]!, x);
      expect(val).toBeLessThanOrEqual(prev + 1e-10);
      prev = val;
    }
  });

  it('10x price spike — no overshoot between consecutive points', () => {
    const points = makePoints([
      [0, 100],
      [1, 105],
      [2, 1000],
      [3, 950],
      [4, 110],
    ]);
    const coeffs = computeMonotoneSpline(points);

    for (const seg of coeffs) {
      const y0 = evaluateSpline(seg, seg.x0);
      const y1 = evaluateSpline(seg, seg.x1);
      const lo = Math.min(y0, y1);
      const hi = Math.max(y0, y1);

      // Sample within segment
      for (let i = 1; i < 50; i++) {
        const x = seg.x0 + (i / 50) * (seg.x1 - seg.x0);
        const val = evaluateSpline(seg, x);
        expect(val).toBeGreaterThanOrEqual(lo - 1e-8);
        expect(val).toBeLessThanOrEqual(hi + 1e-8);
      }
    }
  });

  it('flat region stays flat', () => {
    const points = makePoints([
      [0, 5],
      [1, 5],
      [2, 5],
      [3, 5],
    ]);
    const coeffs = computeMonotoneSpline(points);

    for (const seg of coeffs) {
      for (let i = 0; i <= 10; i++) {
        const x = seg.x0 + (i / 10) * (seg.x1 - seg.x0);
        const val = evaluateSpline(seg, x);
        expect(val).toBeCloseTo(5, 10);
      }
    }
  });

  it('handles non-uniform x spacing correctly', () => {
    const points = makePoints([
      [0, 0],
      [1, 2],
      [5, 3],
      [6, 5],
      [20, 8],
    ]);
    const coeffs = computeMonotoneSpline(points);
    expect(coeffs).toHaveLength(4);

    // All points pass through exactly
    for (const p of points) {
      const segIdx = findSegmentIndex(coeffs, p.timestamp);
      const val = evaluateSpline(coeffs[segIdx]!, p.timestamp);
      expect(val).toBeCloseTo(p.value, 10);
    }
  });

  it('large dataset (1000 points) — no NaN or Infinity', () => {
    const points = makePoints(
      Array.from(
        { length: 1000 },
        (_, i) => [i, Math.sin(i * 0.1) * 100 + 500] as [number, number],
      ),
    );
    const coeffs = computeMonotoneSpline(points);
    expect(coeffs).toHaveLength(999);

    for (const c of coeffs) {
      expect(Number.isFinite(c.a)).toBe(true);
      expect(Number.isFinite(c.b)).toBe(true);
      expect(Number.isFinite(c.c)).toBe(true);
      expect(Number.isFinite(c.d)).toBe(true);
    }
  });

  it('handles negative y values correctly', () => {
    const points = makePoints([
      [0, -10],
      [1, -5],
      [2, -20],
      [3, -1],
    ]);
    const coeffs = computeMonotoneSpline(points);

    for (const p of points) {
      const segIdx = findSegmentIndex(coeffs, p.timestamp);
      const val = evaluateSpline(coeffs[segIdx]!, p.timestamp);
      expect(val).toBeCloseTo(p.value, 10);
    }
  });

  it('handles consecutive identical x values (skips duplicates)', () => {
    const points = makePoints([
      [0, 1],
      [1, 3],
      [1, 5],
      [2, 7],
    ]);
    const coeffs = computeMonotoneSpline(points);
    // Duplicate x=1 is skipped, effectively 3 unique points
    expect(coeffs).toHaveLength(2);
  });

  it('single point repeated returns empty array', () => {
    const points = makePoints([
      [5, 10],
      [5, 10],
      [5, 10],
    ]);
    expect(computeMonotoneSpline(points)).toEqual([]);
  });
});

describe('evaluateSpline', () => {
  const coeffs: SplineCoefficients = {
    x0: 0,
    x1: 10,
    a: 1,
    b: -2,
    c: 3,
    d: 5,
  };

  it('at t=0 returns d (segment start y value)', () => {
    expect(evaluateSpline(coeffs, 0)).toBeCloseTo(5, 10);
  });

  it('at t=1 returns a+b+c+d (segment end y value)', () => {
    expect(evaluateSpline(coeffs, 10)).toBeCloseTo(1 - 2 + 3 + 5, 10);
  });

  it('at midpoint returns reasonable interpolated value', () => {
    const val = evaluateSpline(coeffs, 5);
    // t=0.5: ((1*0.5 - 2)*0.5 + 3)*0.5 + 5 = ((-1.5)*0.5 + 3)*0.5 + 5 = (2.25)*0.5 + 5 = 6.125
    expect(val).toBeCloseTo(6.125, 10);
  });
});

describe('findSegmentIndex', () => {
  const coeffs: SplineCoefficients[] = [
    { x0: 0, x1: 10, a: 0, b: 0, c: 1, d: 0 },
    { x0: 10, x1: 20, a: 0, b: 0, c: 1, d: 10 },
    { x0: 20, x1: 30, a: 0, b: 0, c: 1, d: 20 },
  ];

  it('returns correct segment for x within range', () => {
    expect(findSegmentIndex(coeffs, 5)).toBe(0);
    expect(findSegmentIndex(coeffs, 15)).toBe(1);
    expect(findSegmentIndex(coeffs, 25)).toBe(2);
  });

  it('clamps to first segment for x below range', () => {
    expect(findSegmentIndex(coeffs, -5)).toBe(0);
  });

  it('clamps to last segment for x above range', () => {
    expect(findSegmentIndex(coeffs, 35)).toBe(2);
  });

  it('returns -1 for empty coefficients array', () => {
    expect(findSegmentIndex([], 5)).toBe(-1);
  });

  it('returns boundary segment for exact boundary x values', () => {
    expect(findSegmentIndex(coeffs, 0)).toBe(0);
    expect(findSegmentIndex(coeffs, 10)).toBe(1); // x=10 is at boundary, binary search finds segment 1
    expect(findSegmentIndex(coeffs, 30)).toBe(2);
  });
});
