import type { Scale } from '../core/scale';
import type { CrosshairDataSource, KeyboardState, PointerState } from './types';
import type { ZoomHandler } from './zoom-handler';
import type { ResolvedConfig } from '../config/types';
import { ZOOM_FACTOR } from './zoom-handler';

export class KeyboardNavigator {
  private scale: Scale;
  private dataSource: CrosshairDataSource;
  private markDirty: () => void;
  private zoomHandler: ZoomHandler;
  private updateTooltip: () => void;
  private currentIndex: number = -1;

  constructor(
    scale: Scale,
    dataSource: CrosshairDataSource,
    markDirty: () => void,
    zoomHandler: ZoomHandler,
    updateTooltip: () => void,
  ) {
    if (!scale) {
      throw new Error('KeyboardNavigator: scale instance is required');
    }
    if (!dataSource) {
      throw new Error('KeyboardNavigator: dataSource is required');
    }
    if (typeof markDirty !== 'function') {
      throw new Error('KeyboardNavigator: markDirty callback is required');
    }
    if (!zoomHandler) {
      throw new Error('KeyboardNavigator: zoomHandler instance is required');
    }
    if (typeof updateTooltip !== 'function') {
      throw new Error('KeyboardNavigator: updateTooltip callback is required');
    }

    this.scale = scale;
    this.dataSource = dataSource;
    this.markDirty = markDirty;
    this.zoomHandler = zoomHandler;
    this.updateTooltip = updateTooltip;
  }

  handleKeyboard(keyboardState: Readonly<KeyboardState>, config: Readonly<ResolvedConfig>, pointerState: PointerState): void {
    const key = keyboardState.key;

    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      this.handleArrowKey(key, pointerState);
      return;
    }

    if (key === '+' || key === '=' || key === '-') {
      this.handleZoomKey(key, config);
      return;
    }
  }

  updateDataSource(dataSource: CrosshairDataSource): void {
    this.dataSource = dataSource;
    this.currentIndex = -1;
  }

  deactivate(): void {
    this.currentIndex = -1;
  }

  destroy(): void {
    this.currentIndex = -1;
  }

  private handleArrowKey(key: string, pointerState: PointerState): void {
    const series = this.getFirstSeries();
    if (!series) return;

    const bufferSize = series.buffer.size;
    if (bufferSize === 0) return;

    // Initialize index from current pointer position if not yet navigating
    if (this.currentIndex < 0) {
      this.currentIndex = 0;
    }

    // Clamp currentIndex to valid range (buffer may have shrunk due to ring buffer eviction)
    if (this.currentIndex >= bufferSize) {
      this.currentIndex = bufferSize - 1;
    }

    if (key === 'ArrowLeft') {
      if (this.currentIndex <= 0) return;
      this.currentIndex--;
    } else {
      if (this.currentIndex >= bufferSize - 1) return;
      this.currentIndex++;
    }

    const point = series.buffer.get(this.currentIndex);
    if (!point) return;

    const px = this.scale.xToPixel(point.timestamp);
    const py = this.scale.yToPixel(point.value);

    pointerState.x = px;
    pointerState.y = py;
    pointerState.active = true;
    pointerState.pointerType = 'keyboard';

    this.markDirty();
    this.updateTooltip();
  }

  private handleZoomKey(key: string, config: Readonly<ResolvedConfig>): void {
    if (this.currentIndex < 0) return;

    const series = this.getFirstSeries();
    if (!series) return;

    const point = series.buffer.get(this.currentIndex);
    if (!point) return;

    const factor = key === '-' ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    this.zoomHandler.applyZoom(point.timestamp, factor, config);
  }

  private getFirstSeries() {
    for (const series of this.dataSource.getSeries()) {
      return series;
    }
    return null;
  }
}
