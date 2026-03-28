import type { DataPoint } from '../../core/types';
import type { RingBuffer } from '../../core/ring-buffer';
import type { SplineCache } from '../../core/spline-cache';
import type { SplineCoefficients } from '../../core/interpolation';
import { evaluateSpline } from '../../core/interpolation';
import type { Scale } from '../../core/scale';
import type { ResolvedSeriesConfig } from '../../config/types';

export interface SeriesRenderData {
  buffer: RingBuffer<DataPoint>;
  splineCache: SplineCache;
  config: Readonly<ResolvedSeriesConfig>;
}

export class DataLayerRenderer {
  private readonly gradientColors: ReadonlyArray<{ top: string; bottom: string }>;
  // Pre-allocated points buffer to avoid per-frame allocations.
  // Stores interleaved [x0, y0, x1, y1, ...] pixel coordinates.
  private pathBuf: Float64Array;
  private pathLen = 0;

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly canvas: HTMLCanvasElement,
    private readonly scale: Scale,
    private readonly seriesData: ReadonlyArray<SeriesRenderData>,
  ) {
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
  }

  draw(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

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

      // Render gradient fill first (behind curve), then curve on top
      this.drawGradient(series, i);
      this.drawCurve(series);
    }
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
