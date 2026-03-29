import type { DataPoint } from '../../core/types';
import type { RingBuffer } from '../../core/ring-buffer';
import type { SplineCache } from '../../core/spline-cache';
import type { SplineCoefficients } from '../../core/interpolation';
import { evaluateSpline } from '../../core/interpolation';
import type { Scale } from '../../core/scale';
import type { ResolvedSeriesConfig, AnimationConfig } from '../../config/types';

export interface SeriesRenderData {
  buffer: RingBuffer<DataPoint>;
  splineCache: SplineCache;
  config: Readonly<ResolvedSeriesConfig>;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class DataLayerRenderer {
  private readonly gradientColors: ReadonlyArray<{ top: string; bottom: string }>;
  // Pre-allocated points buffer to avoid per-frame allocations.
  // Stores interleaved [x0, y0, x1, y1, ...] pixel coordinates.
  private pathBuf: Float64Array;
  private pathLen = 0;

  // Animation state — per-series previous path buffers
  private readonly animationConfig: Readonly<AnimationConfig>;
  private animationStartTime = 0;
  private _isAnimating = false;
  private prevPathBufs: Float64Array[];
  private prevPathLens: number[];
  private seriesSnapshotted: boolean[];
  // Scratch buffer for interpolated rendering
  private interpBuf: Float64Array;

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly canvas: HTMLCanvasElement,
    private readonly scale: Scale,
    private readonly seriesData: ReadonlyArray<SeriesRenderData>,
    animationConfig: Readonly<AnimationConfig>,
  ) {
    this.animationConfig = animationConfig;
    const colors: Array<{ top: string; bottom: string }> = [];
    for (let i = 0; i < seriesData.length; i++) {
      const cfg = seriesData[i]!.config.gradient;
      colors.push({
        top: hexToRgba(cfg.topColor, cfg.topOpacity),
        bottom: hexToRgba(cfg.bottomColor, cfg.bottomOpacity),
      });
    }
    this.gradientColors = colors;
    // Initial capacity — grows if needed
    this.pathBuf = new Float64Array(2048);

    if (animationConfig.enabled && animationConfig.duration > 0) {
      this.interpBuf = new Float64Array(2048);
      this.prevPathBufs = [];
      this.prevPathLens = [];
      this.seriesSnapshotted = [];
      for (let i = 0; i < seriesData.length; i++) {
        this.prevPathBufs.push(new Float64Array(2048));
        this.prevPathLens.push(0);
        this.seriesSnapshotted.push(false);
      }
    } else {
      this.interpBuf = new Float64Array(0);
      this.prevPathBufs = [];
      this.prevPathLens = [];
      this.seriesSnapshotted = [];
    }
  }

  get needsNextFrame(): boolean {
    return this._isAnimating;
  }

  get isAnimating(): boolean {
    return this._isAnimating;
  }

  cancelAnimation(): void {
    this._isAnimating = false;
    for (let i = 0; i < this.seriesSnapshotted.length; i++) {
      this.seriesSnapshotted[i] = false;
    }
  }

  snapshotCurveState(): void {
    if (!this.animationConfig.enabled) return;
    if (this.animationConfig.duration <= 0) return;

    const now = performance.now();
    let anySnapshotted = false;

    for (let i = 0; i < this.seriesData.length; i++) {
      const series = this.seriesData[i]!;
      const coefficients = series.splineCache.getCoefficients();

      if (coefficients.length === 0) {
        this.prevPathLens[i] = 0;
        continue;
      }

      if (this._isAnimating && this.seriesSnapshotted[i]) {
        // Capture the current interpolated position as the new prev
        const t = Math.min(1, (now - this.animationStartTime) / this.animationConfig.duration);
        const eased = 1 - (1 - t) * (1 - t);

        // Compute target path into pathBuf
        this.computeCurvePoints(coefficients);
        const targetLen = this.pathLen;

        // Interpolate prev→target and store result as the new prev
        const prevLen = this.prevPathLens[i]!;
        const prev = this.prevPathBufs[i]!;
        const overlapLen = Math.min(prevLen, targetLen);

        // Ensure prev buffer is large enough for target
        if (targetLen > prev.length) {
          this.prevPathBufs[i] = new Float64Array(targetLen * 2);
        }
        const newPrev = this.prevPathBufs[i]!;

        // Lerp overlapping region
        for (let j = 0; j < overlapLen; j++) {
          newPrev[j] = lerp(prev[j]!, this.pathBuf[j]!, eased);
        }
        // Extra target points beyond prev: lerp from last prev point
        if (targetLen > prevLen && prevLen >= 2) {
          const lastPrevX = prev[prevLen - 2]!;
          const lastPrevY = prev[prevLen - 1]!;
          for (let j = prevLen; j < targetLen; j += 2) {
            newPrev[j] = lerp(lastPrevX, this.pathBuf[j]!, eased);
            newPrev[j + 1] = lerp(lastPrevY, this.pathBuf[j + 1]!, eased);
          }
        }

        this.prevPathLens[i] = targetLen;
      } else {
        // Fresh snapshot: copy current pathBuf
        this.computeCurvePoints(coefficients);
        const len = this.pathLen;
        if (len > this.prevPathBufs[i]!.length) {
          this.prevPathBufs[i] = new Float64Array(len * 2);
        }
        this.prevPathBufs[i]!.set(this.pathBuf.subarray(0, len));
        this.prevPathLens[i] = len;
      }

      this.seriesSnapshotted[i] = true;
      anySnapshotted = true;
    }

    if (anySnapshotted) {
      this.animationStartTime = now;
      this._isAnimating = true;
    }
  }

  draw(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Compute animation progress if animating
    let eased = 1;
    if (this._isAnimating && this.animationConfig.enabled) {
      const elapsed = performance.now() - this.animationStartTime;
      const t = Math.min(1, elapsed / this.animationConfig.duration);
      eased = 1 - (1 - t) * (1 - t); // ease-out quadratic

      if (t >= 1) {
        this._isAnimating = false;
        // Reset snapshot flags
        for (let i = 0; i < this.seriesSnapshotted.length; i++) {
          this.seriesSnapshotted[i] = false;
        }
      }
    }

    for (let i = 0; i < this.seriesData.length; i++) {
      const series = this.seriesData[i]!;
      const coefficients = series.splineCache.getCoefficients();

      if (coefficients.length === 0 && series.buffer.size === 0) {
        continue;
      }

      if (coefficients.length === 0 && series.buffer.size === 1) {
        const point = series.buffer.get(0);
        if (point) {
          this.drawDot(point, series.config);
        }
        continue;
      }

      // Compute curve points once into the shared buffer
      this.computeCurvePoints(coefficients);
      if (this.pathLen === 0) continue;

      // If animating this series, lerp between prev and target
      const savedPathBuf = this.pathBuf;
      const savedPathLen = this.pathLen;
      if (this._isAnimating && this.seriesSnapshotted[i]) {
        this.interpolatePath(i, eased);
      }

      // Render gradient fill first (behind curve), then curve on top
      this.drawGradient(series, i);
      this.drawCurve(series);

      // Restore original pathBuf/pathLen so next series uses the real buffer
      this.pathBuf = savedPathBuf;
      this.pathLen = savedPathLen;
    }
  }

  private interpolatePath(seriesIndex: number, eased: number): void {
    const prevLen = this.prevPathLens[seriesIndex]!;

    // No previous state to interpolate from — render target directly
    if (prevLen === 0) return;

    const prev = this.prevPathBufs[seriesIndex]!;
    const targetLen = this.pathLen;

    // Ensure interp buffer is large enough
    if (targetLen > this.interpBuf.length) {
      this.interpBuf = new Float64Array(targetLen * 2);
    }

    const overlapLen = Math.min(prevLen, targetLen);

    // Lerp overlapping region
    for (let j = 0; j < overlapLen; j++) {
      this.interpBuf[j] = lerp(prev[j]!, this.pathBuf[j]!, eased);
    }

    // Extra target points beyond prev: lerp from last prev point toward target
    if (targetLen > prevLen && prevLen >= 2) {
      const lastPrevX = prev[prevLen - 2]!;
      const lastPrevY = prev[prevLen - 1]!;
      for (let j = prevLen; j < targetLen; j += 2) {
        this.interpBuf[j] = lerp(lastPrevX, this.pathBuf[j]!, eased);
        this.interpBuf[j + 1] = lerp(lastPrevY, this.pathBuf[j + 1]!, eased);
      }
    }

    // Point pathBuf/pathLen to the interpolated result for rendering
    // Caller restores original pathBuf/pathLen after drawing
    this.pathBuf = this.interpBuf;
    this.pathLen = targetLen;
  }

  private drawCurve(series: SeriesRenderData): void {
    this.ctx.globalAlpha = series.config.line.opacity;
    this.ctx.strokeStyle = series.config.line.color;
    this.ctx.lineWidth = series.config.line.width;
    this.ctx.lineJoin = 'round';
    this.ctx.lineCap = 'round';

    this.ctx.beginPath();
    this.replayCurvePath();
    this.ctx.stroke();

    this.ctx.globalAlpha = 1;
  }

  private drawGradient(series: SeriesRenderData, seriesIndex: number): void {
    if (!series.config.gradient.enabled) return;

    const viewport = this.scale.viewport;
    const gradient = this.ctx.createLinearGradient(
      0,
      viewport.y,
      0,
      viewport.y + viewport.height,
    );
    gradient.addColorStop(0, this.gradientColors[seriesIndex]!.top);
    gradient.addColorStop(1, this.gradientColors[seriesIndex]!.bottom);

    this.ctx.beginPath();
    const { firstX, lastX } = this.replayCurvePath();

    // Close the area: line down to bottom, across, and back up
    this.ctx.lineTo(lastX, viewport.y + viewport.height);
    this.ctx.lineTo(firstX, viewport.y + viewport.height);
    this.ctx.closePath();

    this.ctx.fillStyle = gradient;
    this.ctx.fill();
  }

  private drawDot(point: DataPoint, config: Readonly<ResolvedSeriesConfig>): void {
    const px = this.scale.xToPixel(point.timestamp);
    const py = this.scale.yToPixel(point.value);

    this.ctx.beginPath();
    this.ctx.arc(px, py, config.line.width * 2, 0, Math.PI * 2);
    this.ctx.fillStyle = config.line.color;
    this.ctx.fill();
  }

  /**
   * Evaluate spline coefficients and store pixel coordinates in pathBuf.
   * Called once per series per frame — results are replayed by replayCurvePath.
   */
  private computeCurvePoints(
    coefficients: ReadonlyArray<SplineCoefficients>,
  ): void {
    this.pathLen = 0;

    for (let i = 0; i < coefficients.length; i++) {
      const coeff = coefficients[i]!;
      const px0 = this.scale.xToPixel(coeff.x0);
      const px1 = this.scale.xToPixel(coeff.x1);
      const pixelWidth = Math.abs(px1 - px0);
      const steps = Math.max(2, Math.ceil(pixelWidth / 2));

      for (let s = 0; s <= steps; s++) {
        // Skip s=0 for segments after the first to avoid duplicate points
        if (i > 0 && s === 0) continue;

        const t = s / steps;
        const x = coeff.x0 + t * (coeff.x1 - coeff.x0);
        const y = evaluateSpline(coeff, x);
        const px = this.scale.xToPixel(x);
        const py = this.scale.yToPixel(y);

        // Grow buffer if needed
        if (this.pathLen + 2 > this.pathBuf.length) {
          const next = new Float64Array(this.pathBuf.length * 2);
          next.set(this.pathBuf);
          this.pathBuf = next;
        }

        this.pathBuf[this.pathLen++] = px;
        this.pathBuf[this.pathLen++] = py;
      }
    }
  }

  /**
   * Replay cached pixel coordinates onto the current canvas path.
   * Returns first/last X for gradient area closure.
   */
  private replayCurvePath(): { firstX: number; lastX: number } {
    const buf = this.pathBuf;
    const len = this.pathLen;

    if (len < 2) return { firstX: 0, lastX: 0 };

    this.ctx.moveTo(buf[0]!, buf[1]!);
    for (let i = 2; i < len; i += 2) {
      this.ctx.lineTo(buf[i]!, buf[i + 1]!);
    }

    return { firstX: buf[0]!, lastX: buf[len - 2]! };
  }
}

export function hexToRgba(hex: string, alpha: number): string {
  let r: number;
  let g: number;
  let b: number;

  if (hex.length === 4) {
    // #RGB shorthand
    r = parseInt(hex[1]! + hex[1]!, 16);
    g = parseInt(hex[2]! + hex[2]!, 16);
    b = parseInt(hex[3]! + hex[3]!, 16);
  } else {
    // #RRGGBB
    r = parseInt(hex.slice(1, 3), 16);
    g = parseInt(hex.slice(3, 5), 16);
    b = parseInt(hex.slice(5, 7), 16);
  }

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
