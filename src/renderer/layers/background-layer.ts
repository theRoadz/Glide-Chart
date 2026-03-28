import type { Scale } from '../../core/scale';
import type { ResolvedConfig } from '../../config/types';

const MIN_H_SPACING = 60;
const MIN_V_SPACING = 100;
const MIN_TICKS = 3;

function niceNum(range: number, round: boolean): number {
  const exp = Math.floor(Math.log10(range));
  const frac = range / Math.pow(10, exp);
  let nice: number;
  if (round) {
    if (frac < 1.5) nice = 1;
    else if (frac < 3) nice = 2;
    else if (frac < 7) nice = 5;
    else nice = 10;
  } else {
    if (frac <= 1) nice = 1;
    else if (frac <= 2) nice = 2;
    else if (frac <= 5) nice = 5;
    else nice = 10;
  }
  return nice * Math.pow(10, exp);
}

export function computeNiceTicks(min: number, max: number, maxTicks: number): number[] {
  const range = max - min;
  if (range <= 0) {
    if (min === max && Number.isFinite(min)) {
      return [min];
    }
    return [];
  }

  if (maxTicks < 1) {
    return [];
  }

  const tickSpacing = niceNum(range / maxTicks, true);
  const ticks: number[] = [];
  const start = Math.ceil(min / tickSpacing) * tickSpacing;

  for (let v = start; v <= max; v += tickSpacing) {
    ticks.push(v);
    // Safety: prevent infinite loops from floating point issues
    if (ticks.length > maxTicks * 2) break;
  }

  return ticks;
}

export class BackgroundLayerRenderer {
  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly canvas: HTMLCanvasElement,
    private readonly scale: Scale,
    private readonly config: Readonly<ResolvedConfig>,
  ) {}

  draw(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (!this.config.grid.visible) {
      return;
    }

    const viewport = this.scale.viewport;
    const domainY = this.scale.domainY;
    const domainX = this.scale.domainX;

    const maxHTicks = Math.max(MIN_TICKS, Math.floor(viewport.height / MIN_H_SPACING));
    const maxVTicks = Math.max(MIN_TICKS, Math.floor(viewport.width / MIN_V_SPACING));

    const hTicks = computeNiceTicks(domainY.min, domainY.max, maxHTicks);
    const vTicks = computeNiceTicks(domainX.min, domainX.max, maxVTicks);

    this.ctx.globalAlpha = this.config.grid.opacity;
    this.ctx.strokeStyle = this.config.grid.color;
    this.ctx.lineWidth = this.config.grid.lineWidth;

    this.ctx.beginPath();

    // Horizontal grid lines
    for (let i = 0; i < hTicks.length; i++) {
      const y = Math.round(this.scale.yToPixel(hTicks[i]!)) + 0.5;
      this.ctx.moveTo(viewport.x, y);
      this.ctx.lineTo(viewport.x + viewport.width, y);
    }

    // Vertical grid lines
    for (let i = 0; i < vTicks.length; i++) {
      const x = Math.round(this.scale.xToPixel(vTicks[i]!)) + 0.5;
      this.ctx.moveTo(x, viewport.y);
      this.ctx.lineTo(x, viewport.y + viewport.height);
    }

    this.ctx.stroke();
    this.ctx.globalAlpha = 1.0;
  }
}
