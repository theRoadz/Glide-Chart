import { DataPoint } from './types';
import { RingBuffer } from './ring-buffer';
import { computeMonotoneSpline, SplineCoefficients } from './interpolation';

export class SplineCache {
  private coefficients: SplineCoefficients[] = [];
  private tangents: number[] = [];
  private valid = false;
  private lastBufferSize = 0;

  constructor(private buffer: RingBuffer<DataPoint>) {}

  get isValid(): boolean {
    return this.valid;
  }

  get segmentCount(): number {
    return this.coefficients.length;
  }

  computeFull(): void {
    const points = this.buffer.toArray();
    this.coefficients = computeMonotoneSpline(points);
    this.tangents = SplineCache.computeTangents(points);
    this.lastBufferSize = this.buffer.size;
    this.valid = true;
  }

  appendPoint(): void {
    if (!this.valid) {
      this.computeFull();
      return;
    }

    const size = this.buffer.size;
    const evicted = size <= this.lastBufferSize && this.lastBufferSize > 0;
    this.lastBufferSize = size;

    if (size < 2) {
      this.coefficients = [];
      this.tangents = [];
      this.valid = false;
      return;
    }

    if (evicted) {
      // Head eviction + tail append: recompute full for correctness.
      // The first segment's boundary tangent changes and the last 2-3
      // segments change — the interaction between head and tail enforcement
      // makes partial updates fragile. Full recompute is O(n) with a small
      // constant; optimize to O(1) only if profiling shows this is a bottleneck.
      this.computeFull();
      return;
    }

    // No eviction: only tail segments affected — incremental update
    this.recomputeTail();
  }

  getCoefficients(): ReadonlyArray<SplineCoefficients> {
    return this.coefficients;
  }

  invalidate(): void {
    this.coefficients = [];
    this.tangents = [];
    this.valid = false;
    this.lastBufferSize = 0;
  }

  private recomputeTail(): void {
    const size = this.buffer.size;
    if (size < 2) return;

    const n = size;
    const expectedSegs = n - 1;

    // Get the last 4 points (at most) for computing tangents
    const tailCount = Math.min(n, 4);
    const tailStart = n - tailCount;

    const pts: DataPoint[] = [];
    for (let i = tailStart; i < n; i++) {
      const p = this.buffer.get(i);
      if (p) pts.push(p);
    }

    if (pts.length < 2) return;

    // Compute h and delta for the tail region
    const h: number[] = [];
    const delta: number[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i]!;
      const p1 = pts[i + 1]!;
      const hi = p1.timestamp - p0.timestamp;
      if (hi === 0) {
        // Duplicate timestamps in buffer — fall back to full recompute
        this.computeFull();
        return;
      }
      h.push(hi);
      delta.push((p1.value - p0.value) / hi);
    }

    // Recompute tangents for the affected points
    const newTangents = new Array<number>(pts.length);

    for (let i = 0; i < pts.length; i++) {
      const globalIdx = tailStart + i;
      if (globalIdx === 0) {
        // Left boundary of entire dataset
        newTangents[i] = delta[0]!;
        if (newTangents[i]! * delta[0]! < 0) newTangents[i] = 0;
      } else if (globalIdx === n - 1) {
        // Right boundary of entire dataset (new point)
        const lastDelta = delta[delta.length - 1]!;
        newTangents[i] = lastDelta;
        if (newTangents[i]! * lastDelta < 0) newTangents[i] = 0;
      } else {
        // Interior point
        const leftDeltaIdx = i - 1;

        if (leftDeltaIdx < 0) {
          // Left neighbor outside tail window — tangent unchanged
          newTangents[i] = this.tangents[globalIdx] ?? 0;
          continue;
        }

        const dL = delta[leftDeltaIdx]!;
        const dR = delta[leftDeltaIdx + 1]!;
        const hL = h[leftDeltaIdx]!;
        const hR = h[leftDeltaIdx + 1]!;

        if (dL * dR <= 0 || dL === 0 || dR === 0) {
          newTangents[i] = 0;
        } else {
          const w1 = 2 * hR + hL;
          const w2 = hR + 2 * hL;
          newTangents[i] = (w1 + w2) / (w1 / dL + w2 / dR);
        }
      }
    }

    // Monotonicity enforcement for the tail segments
    for (let i = 0; i < pts.length - 1; i++) {
      const di = delta[i]!;
      if (di === 0) {
        newTangents[i] = 0;
        newTangents[i + 1] = 0;
        continue;
      }
      const alpha = newTangents[i]! / di;
      const beta = newTangents[i + 1]! / di;
      const sum = alpha * alpha + beta * beta;
      if (sum > 9) {
        const tau = 3 / Math.sqrt(sum);
        newTangents[i] = tau * alpha * di;
        newTangents[i + 1] = tau * beta * di;
      }
    }

    // Update tangents array
    while (this.tangents.length < n) {
      this.tangents.push(0);
    }
    // Only update tangents that may have changed (last 2-3 points)
    const unchangedBefore = pts.length >= 4 ? 1 : 0;
    for (let i = unchangedBefore; i < pts.length; i++) {
      this.tangents[tailStart + i] = newTangents[i]!;
    }

    // Rebuild only the affected segments (last 2-3)
    const affectedSegStart = Math.max(0, expectedSegs - (tailCount - 1));
    for (let segIdx = affectedSegStart; segIdx < expectedSegs; segIdx++) {
      const p0 = this.buffer.get(segIdx);
      const p1 = this.buffer.get(segIdx + 1);
      if (!p0 || !p1) continue;

      const m0 = this.tangents[segIdx] ?? 0;
      const m1 = this.tangents[segIdx + 1] ?? 0;
      const seg = SplineCache.buildSegment(p0, p1, m0, m1);

      if (segIdx < this.coefficients.length) {
        this.coefficients[segIdx] = seg;
      } else {
        this.coefficients.push(seg);
      }
    }

    this.coefficients.length = expectedSegs;
    this.tangents.length = n;
  }

  private static computeTangents(points: DataPoint[]): number[] {
    const n = points.length;
    if (n < 2) return new Array<number>(n).fill(0);

    const h = new Array<number>(n - 1);
    const delta = new Array<number>(n - 1);
    for (let k = 0; k < n - 1; k++) {
      h[k] = points[k + 1]!.timestamp - points[k]!.timestamp;
      delta[k] = (points[k + 1]!.value - points[k]!.value) / h[k]!;
    }

    const m = new Array<number>(n);
    for (let k = 1; k < n - 1; k++) {
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

    m[0] = delta[0]!;
    if (m[0]! * delta[0]! < 0) m[0] = 0;
    m[n - 1] = delta[n - 2]!;
    if (m[n - 1]! * delta[n - 2]! < 0) m[n - 1] = 0;

    for (let k = 0; k < n - 1; k++) {
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

    return m;
  }

  private static buildSegment(
    p0: DataPoint,
    p1: DataPoint,
    m0: number,
    m1: number,
  ): SplineCoefficients {
    const hk = p1.timestamp - p0.timestamp;
    const dy = p1.value - p0.value;
    const d = p0.value;
    const c = m0 * hk;
    const b = 3 * dy - 2 * m0 * hk - m1 * hk;
    const a = 2 * (p0.value - p1.value) + m0 * hk + m1 * hk;
    return { x0: p0.timestamp, x1: p1.timestamp, a, b, c, d };
  }
}
