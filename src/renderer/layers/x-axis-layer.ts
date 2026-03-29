import type { Scale } from '../../core/scale';
import type { ResolvedConfig } from '../../config/types';
import { computeNiceTicks } from './background-layer';

const LABEL_PADDING = 4;
const MIN_V_SPACING = 100;
const MIN_TICKS = 3;
const MIN_LABEL_GAP = 8;

export class XAxisRenderer {
  private readonly fontString: string;
  private readonly fmtSeconds: Intl.DateTimeFormat;
  private readonly fmtMinutes: Intl.DateTimeFormat;
  private readonly fmtDays: Intl.DateTimeFormat;

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    _canvas: HTMLCanvasElement,
    private readonly scale: Scale,
    private readonly config: Readonly<ResolvedConfig>,
  ) {
    this.fontString = `${config.xAxis.labelFontSize}px ${config.xAxis.labelFontFamily}`;

    const tz = config.xAxis.timezone;
    const baseOpts: Intl.DateTimeFormatOptions | undefined = tz ? { timeZone: tz } : undefined;

    try {
      this.fmtSeconds = new Intl.DateTimeFormat(undefined, {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hourCycle: 'h23', ...baseOpts,
      });
      this.fmtMinutes = new Intl.DateTimeFormat(undefined, {
        hour: '2-digit', minute: '2-digit',
        hourCycle: 'h23', ...baseOpts,
      });
      this.fmtDays = new Intl.DateTimeFormat(undefined, {
        month: 'short', day: 'numeric',
        ...baseOpts,
      });
    } catch {
      this.fmtSeconds = new Intl.DateTimeFormat(undefined, {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hourCycle: 'h23',
      });
      this.fmtMinutes = new Intl.DateTimeFormat(undefined, {
        hour: '2-digit', minute: '2-digit',
        hourCycle: 'h23',
      });
      this.fmtDays = new Intl.DateTimeFormat(undefined, {
        month: 'short', day: 'numeric',
      });
    }
  }

  draw(): void {
    this.ctx.globalAlpha = 1.0;

    if (!this.config.xAxis.visible) {
      return;
    }

    const viewport = this.scale.viewport;
    const domainX = this.scale.domainX;

    const maxTicks = Math.max(MIN_TICKS, Math.floor(viewport.width / MIN_V_SPACING));
    const ticks = computeNiceTicks(domainX.min, domainX.max, maxTicks);
    const tickSpacing = ticks.length >= 2 ? ticks[1]! - ticks[0]! : 0;

    const tickLength = this.config.xAxis.tickLength;
    const bottomY = viewport.y + viewport.height;

    // Batch all tick marks into ONE beginPath()/stroke() call
    this.ctx.beginPath();
    this.ctx.strokeStyle = this.config.xAxis.tickColor;
    this.ctx.lineWidth = 1;

    const labelPositions: Array<{ x: number; label: string }> = [];

    for (const tick of ticks) {
      const x = Math.round(this.scale.xToPixel(tick)) + 0.5;
      if (x < viewport.x || x > viewport.x + viewport.width) continue;

      // Tick mark (accumulated into single path)
      this.ctx.moveTo(x, bottomY);
      this.ctx.lineTo(x, bottomY + tickLength);

      labelPositions.push({ x, label: this.formatLabel(tick, tickSpacing) });
    }

    this.ctx.stroke();

    // Draw labels
    this.ctx.fillStyle = this.config.xAxis.labelColor;
    this.ctx.font = this.fontString;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'top';

    const labelY = bottomY + tickLength + LABEL_PADDING;
    const maxLabelWidth = MIN_V_SPACING - MIN_LABEL_GAP;
    let previousRightEdge = -Infinity;

    for (const { x, label } of labelPositions) {
      const textWidth = this.ctx.measureText(label).width;
      const leftEdge = x - textWidth / 2;

      if (leftEdge < previousRightEdge + MIN_LABEL_GAP) continue;

      this.ctx.fillText(label, x, labelY, maxLabelWidth);
      previousRightEdge = x + textWidth / 2;
    }
  }

  private formatLabel(timestamp: number, tickSpacing: number): string {
    if (this.config.xAxis.labelFormatter) {
      try {
        return String(this.config.xAxis.labelFormatter(timestamp));
      } catch {
        // Fall through to auto-format on formatter error
      }
    }

    if (tickSpacing === 0 || tickSpacing < 60_000) {
      return this.fmtSeconds.format(timestamp);
    }
    if (tickSpacing < 86_400_000) {
      return this.fmtMinutes.format(timestamp);
    }
    return this.fmtDays.format(timestamp);
  }
}
