import type { PointerState, CrosshairDataSource } from './types';
import type { ResolvedConfig } from '../config/types';
import type { Scale } from '../core/scale';

const EMPTY_DASH: number[] = [];

export class Crosshair {
  private scale: Scale;
  private dataSource: CrosshairDataSource;

  constructor(scale: Scale, dataSource: CrosshairDataSource) {
    if (!scale) {
      throw new Error('Crosshair: scale instance is required');
    }
    if (!dataSource) {
      throw new Error('Crosshair: dataSource is required');
    }
    this.scale = scale;
    this.dataSource = dataSource;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    pointerState: Readonly<PointerState>,
    config: Readonly<ResolvedConfig>,
  ): void {
    if (!config.crosshair.enabled) return;
    if (!pointerState.active) return;

    const viewport = this.scale.viewport;
    const px = pointerState.x;
    const py = pointerState.y;

    // Only draw if pointer is within the plot area
    if (
      px < viewport.x ||
      px > viewport.x + viewport.width ||
      py < viewport.y ||
      py > viewport.y + viewport.height
    ) {
      return;
    }

    const { color, lineWidth, dashPattern } = config.crosshair;

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(dashPattern);

    // Vertical line at pointer X, spanning plot area height, with 0.5px offset for crisp rendering
    const vx = Math.round(px) + 0.5;
    ctx.beginPath();
    ctx.moveTo(vx, viewport.y);
    ctx.lineTo(vx, viewport.y + viewport.height);
    ctx.stroke();

    // Horizontal line: snap to nearest data point value
    const timestamp = this.scale.pixelToX(px);
    const nearestValue = this.findNearestValue(timestamp);

    if (nearestValue !== null) {
      const hy = Math.round(this.scale.yToPixel(nearestValue)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(viewport.x, hy);
      ctx.lineTo(viewport.x + viewport.width, hy);
      ctx.stroke();
    }

    // Reset dash pattern
    ctx.setLineDash(EMPTY_DASH);
  }

  private findNearestValue(timestamp: number): number | null {
    let closestDistance = Infinity;
    let closestValue: number | null = null;

    for (const buffer of this.dataSource.getBuffers()) {
      for (let i = 0; i < buffer.size; i++) {
        const point = buffer.get(i);
        if (!point) continue;
        const distance = Math.abs(point.timestamp - timestamp);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestValue = point.value;
        } else if (point.timestamp > timestamp) {
          // Data is time-sorted; distance is increasing past target — stop early
          break;
        }
      }
    }

    return closestValue;
  }
}
