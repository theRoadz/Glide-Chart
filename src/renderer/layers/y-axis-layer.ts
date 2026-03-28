import type { Scale } from '../../core/scale';
import type { ResolvedConfig } from '../../config/types';
import { computeNiceTicks } from './background-layer';

const LABEL_PADDING = 4;
const MIN_TICK_SPACING = 60;
const MIN_TICKS = 3;
const MAX_DECIMALS = 10;

export class YAxisRenderer {
  private readonly fontString: string;

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    _canvas: HTMLCanvasElement,
    private readonly scale: Scale,
    private readonly config: Readonly<ResolvedConfig>,
  ) {
    this.fontString = `${config.yAxis.labelFontSize}px ${config.yAxis.labelFontFamily}`;
  }

  draw(): void {
    this.ctx.globalAlpha = 1.0;

    if (!this.config.yAxis.visible) {
      return;
    }

    const viewport = this.scale.viewport;
    const domainY = this.scale.domainY;

    const maxTicks = Math.max(MIN_TICKS, Math.floor(viewport.height / MIN_TICK_SPACING));
    const ticks = computeNiceTicks(domainY.min, domainY.max, maxTicks);
    const tickSpacing = ticks.length >= 2 ? ticks[1]! - ticks[0]! : 0;

    // Batch all tick marks into ONE beginPath()/stroke() call
    this.ctx.beginPath();
    this.ctx.strokeStyle = this.config.yAxis.tickColor;
    this.ctx.lineWidth = 1;

    const labelPositions: Array<{ y: number; label: string }> = [];

    for (const tick of ticks) {
      const y = Math.round(this.scale.yToPixel(tick)) + 0.5;
      if (y < viewport.y || y > viewport.y + viewport.height) continue;

      // Tick mark (accumulated into single path)
      this.ctx.moveTo(viewport.x - this.config.yAxis.tickLength, y);
      this.ctx.lineTo(viewport.x, y);

      labelPositions.push({ y, label: this.formatLabel(tick, tickSpacing) });
    }

    this.ctx.stroke();

    // Draw labels
    this.ctx.fillStyle = this.config.yAxis.labelColor;
    this.ctx.font = this.fontString;
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'middle';

    const maxLabelWidth = viewport.x - this.config.yAxis.tickLength - LABEL_PADDING;
    for (const { y, label } of labelPositions) {
      this.ctx.fillText(label, viewport.x - this.config.yAxis.tickLength - LABEL_PADDING, y, maxLabelWidth);
    }
  }

  private formatLabel(value: number, tickSpacing: number): string {
    if (this.config.yAxis.labelFormatter) {
      try {
        return String(this.config.yAxis.labelFormatter(value));
      } catch {
        // Fall through to auto-precision on formatter error
      }
    }

    if (tickSpacing === 0) {
      return String(value);
    }

    const decimals = Math.min(
      MAX_DECIMALS,
      Math.max(0, Math.round(-Math.log10(tickSpacing))),
    );
    return value.toFixed(decimals);
  }
}
