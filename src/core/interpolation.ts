import { DataPoint } from './types';

export interface SplineCoefficients {
  x0: number;
  x1: number;
  a: number;
  b: number;
  c: number;
  d: number;
}

export function computeMonotoneSpline(
  points: DataPoint[],
): SplineCoefficients[] {
  const n = points.length;

  if (n < 2) return [];

  // Filter consecutive duplicate x values
  const first = points[0];
  if (!first) return [];
  const filtered: DataPoint[] = [first];
  for (let i = 1; i < n; i++) {
    const p = points[i];
    const last = filtered[filtered.length - 1];
    if (p && last && p.timestamp !== last.timestamp) {
      filtered.push(p);
    }
  }

  const fn = filtered.length;
  if (fn < 2) return [];

  const f0 = filtered[0]!;
  const f1 = filtered[1]!;

  // 2 points: linear segment
  if (fn === 2) {
    const dy = f1.value - f0.value;
    return [
      {
        x0: f0.timestamp,
        x1: f1.timestamp,
        a: 0,
        b: 0,
        c: dy,
        d: f0.value,
      },
    ];
  }

  // 3+ points: full Fritsch-Carlson monotone cubic Hermite interpolation
  const x = new Array<number>(fn);
  const y = new Array<number>(fn);
  for (let i = 0; i < fn; i++) {
    x[i] = filtered[i]!.timestamp;
    y[i] = filtered[i]!.value;
  }

  // Step 1: Compute interval widths
  const h = new Array<number>(fn - 1);
  for (let k = 0; k < fn - 1; k++) {
    h[k] = x[k + 1]! - x[k]!;
  }

  // Step 2: Compute secant slopes
  const delta = new Array<number>(fn - 1);
  for (let k = 0; k < fn - 1; k++) {
    delta[k] = (y[k + 1]! - y[k]!) / h[k]!;
  }

  // Step 3: Compute initial tangents
  const m = new Array<number>(fn);

  // Interior points: weighted harmonic mean
  for (let k = 1; k < fn - 1; k++) {
    const dkm1 = delta[k - 1]!;
    const dk = delta[k]!;
    if (dkm1 * dk <= 0 || dkm1 === 0 || dk === 0) {
      m[k] = 0;
    } else {
      const w1 = 2 * h[k]! + h[k - 1]!;
      const w2 = h[k]! + 2 * h[k - 1]!;
      m[k] = (w1 + w2) / (w1 / dkm1 + w2 / dk);
    }
  }

  // Step 4: Boundary tangents
  m[0] = delta[0]!;
  if (m[0]! * delta[0]! < 0) m[0] = 0;

  m[fn - 1] = delta[fn - 2]!;
  if (m[fn - 1]! * delta[fn - 2]! < 0) m[fn - 1] = 0;

  // Step 5: Monotonicity enforcement (alpha-beta check)
  for (let k = 0; k < fn - 1; k++) {
    const dk = delta[k]!;
    if (dk === 0) {
      m[k] = 0;
      m[k + 1] = 0;
      continue;
    }
    const alpha = m[k]! / dk;
    const beta = m[k + 1]! / dk;
    const sum = alpha * alpha + beta * beta;
    if (sum > 9) {
      const tau = 3 / Math.sqrt(sum);
      m[k] = tau * alpha * dk;
      m[k + 1] = tau * beta * dk;
    }
  }

  // Step 6: Convert to normalized polynomial coefficients
  const coefficients = new Array<SplineCoefficients>(fn - 1);
  for (let k = 0; k < fn - 1; k++) {
    const hk = h[k]!;
    const yk = y[k]!;
    const yk1 = y[k + 1]!;
    const mk = m[k]!;
    const mk1 = m[k + 1]!;
    const dy = yk1 - yk;
    const d = yk;
    const c = mk * hk;
    const b = 3 * dy - 2 * mk * hk - mk1 * hk;
    const a = 2 * (yk - yk1) + mk * hk + mk1 * hk;

    coefficients[k] = {
      x0: x[k]!,
      x1: x[k + 1]!,
      a,
      b,
      c,
      d,
    };
  }

  return coefficients;
}

export function evaluateSpline(coeffs: SplineCoefficients, x: number): number {
  const dx = coeffs.x1 - coeffs.x0;
  if (dx === 0) return coeffs.d;
  const t = (x - coeffs.x0) / dx;
  return ((coeffs.a * t + coeffs.b) * t + coeffs.c) * t + coeffs.d;
}

export function findSegmentIndex(
  coefficients: ReadonlyArray<SplineCoefficients>,
  x: number,
): number {
  const n = coefficients.length;
  if (n === 0) return -1;

  const first = coefficients[0]!;
  const last = coefficients[n - 1]!;

  // Clamp to bounds
  if (x < first.x0) return 0;
  if (x > last.x1) return n - 1;

  // Binary search
  let lo = 0;
  let hi = n - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const seg = coefficients[mid]!;
    if (x < seg.x0) {
      hi = mid - 1;
    } else if (x > seg.x1) {
      lo = mid + 1;
    } else {
      return mid;
    }
  }

  return lo < n ? lo : n - 1;
}
