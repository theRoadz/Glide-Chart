import type { Scale } from '../core/scale';
import type { WheelState, PinchState } from './types';
import type { ResolvedConfig } from '../config/types';
import { LayerType } from '../renderer/types';

export const ZOOM_FACTOR = 1.1;
export const MIN_ZOOM_WIDTH = 1;
export const MAX_ZOOM_WIDTH = 1e15;

export class ZoomHandler {
  private scale: Scale;
  private markDirty: (layer: LayerType) => void;
  private getVisibleValues: () => number[];
  private preventWheelFn: () => void;
  private _isZoomed = false;

  constructor(
    scale: Scale,
    markDirty: (layer: LayerType) => void,
    getVisibleValues: () => number[],
    preventWheel: () => void,
  ) {
    if (!scale) {
      throw new Error('ZoomHandler: scale instance is required');
    }
    if (typeof markDirty !== 'function') {
      throw new Error('ZoomHandler: markDirty callback is required');
    }
    if (typeof getVisibleValues !== 'function') {
      throw new Error('ZoomHandler: getVisibleValues callback is required');
    }
    if (typeof preventWheel !== 'function') {
      throw new Error('ZoomHandler: preventWheel callback is required');
    }

    this.scale = scale;
    this.markDirty = markDirty;
    this.getVisibleValues = getVisibleValues;
    this.preventWheelFn = preventWheel;
  }

  get isZoomed(): boolean {
    return this._isZoomed;
  }

  applyZoom(cursorX: number, factor: number, config: ResolvedConfig): void {
    if (config.zoom === false) return;

    const { min, max } = this.scale.domainX;
    if (max === min) return;

    const domainWidth = max - min;
    const leftRatio = (cursorX - min) / domainWidth;

    let newWidth = domainWidth * factor;
    newWidth = Math.max(MIN_ZOOM_WIDTH, Math.min(MAX_ZOOM_WIDTH, newWidth));

    const newMin = cursorX - newWidth * leftRatio;
    const newMax = cursorX + newWidth * (1 - leftRatio);

    this.scale.setDomainX(newMin, newMax);

    const values = this.getVisibleValues();
    this.scale.autoFitY(values);

    this._isZoomed = true;

    this.markDirty(LayerType.Data);
    this.markDirty(LayerType.Axis);
    this.markDirty(LayerType.Background);
  }

  handleWheel(wheelState: WheelState, config: ResolvedConfig): void {
    if (config.zoom === false) return;
    if (wheelState.deltaY === 0) return;

    const viewport = this.scale.viewport;
    if (
      wheelState.x < viewport.x ||
      wheelState.x > viewport.x + viewport.width ||
      wheelState.y < viewport.y ||
      wheelState.y > viewport.y + viewport.height
    ) {
      return;
    }

    const factor = Math.sign(wheelState.deltaY) > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    const cursorX = this.scale.pixelToX(wheelState.x);

    this.applyZoom(cursorX, factor, config);

    this.preventWheelFn();
  }

  handlePinch(pinchState: PinchState, config: ResolvedConfig): void {
    if (config.zoom === false) return;
    if (pinchState.scale === 1) return;
    if (pinchState.scale <= 0) return;

    const viewport = this.scale.viewport;
    if (
      pinchState.centerX < viewport.x ||
      pinchState.centerX > viewport.x + viewport.width ||
      pinchState.centerY < viewport.y ||
      pinchState.centerY > viewport.y + viewport.height
    ) {
      return;
    }

    const cursorX = this.scale.pixelToX(pinchState.centerX);
    const factor = 1 / pinchState.scale;

    this.applyZoom(cursorX, factor, config);
  }

  resetZoom(): void {
    this._isZoomed = false;
  }

  destroy(): void {
    // No-op — consistent lifecycle pattern
  }
}
