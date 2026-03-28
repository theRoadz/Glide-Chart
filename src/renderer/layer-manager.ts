import { LayerType, LAYER_ORDER } from './types';

const LAYER_TYPE_NAMES: Record<LayerType, string> = {
  [LayerType.Background]: 'background',
  [LayerType.Axis]: 'axis',
  [LayerType.Data]: 'data',
  [LayerType.Interaction]: 'interaction',
};

const CANVAS_BASE_STYLE =
  'position:absolute;top:0;left:0;width:100%;height:100%;display:block;pointer-events:none';
const CANVAS_INTERACTION_STYLE =
  'position:absolute;top:0;left:0;width:100%;height:100%;display:block';

export interface LayerManagerOptions {
  onResize?: (width: number, height: number, dpr: number) => void;
}

export class LayerManager {
  private _canvases: Map<LayerType, HTMLCanvasElement>;
  private _contexts: Map<LayerType, CanvasRenderingContext2D>;
  private _container: HTMLElement;
  private _resizeObserver: ResizeObserver;
  private _mediaQuery: MediaQueryList | null;
  private _mediaQueryHandler: (() => void) | null;
  private _onResize: ((width: number, height: number, dpr: number) => void) | null;
  private _width: number;
  private _height: number;
  private _dpr: number;
  private _destroyed: boolean;

  constructor(container: HTMLElement, options?: LayerManagerOptions) {
    if (!(container instanceof HTMLElement)) {
      throw new Error('LayerManager: container must be an HTMLElement');
    }

    this._container = container;
    this._canvases = new Map();
    this._contexts = new Map();
    this._onResize = options?.onResize ?? null;
    this._width = 0;
    this._height = 0;
    this._dpr = 1;
    this._destroyed = false;

    // Ensure container is positioned for absolute canvas children
    const position = getComputedStyle(container).position;
    if (position === 'static' || position === '') {
      container.style.position = 'relative';
    }

    // Create canvases in stacking order
    for (const layerType of LAYER_ORDER) {
      const canvas = document.createElement('canvas');
      canvas.style.cssText =
        layerType === LayerType.Interaction ? CANVAS_INTERACTION_STYLE : CANVAS_BASE_STYLE;
      canvas.setAttribute('data-layer-type', LAYER_TYPE_NAMES[layerType]);
      container.appendChild(canvas);

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('LayerManager: failed to get 2d context');
      }

      this._canvases.set(layerType, canvas);
      this._contexts.set(layerType, ctx);
    }

    // Initial sizing
    this.resizeAll();

    // Observe container resize
    this._resizeObserver = new ResizeObserver(() => {
      this.resizeAll();
    });
    this._resizeObserver.observe(container);

    // Listen for DPR changes
    this._mediaQueryHandler = null;
    this._mediaQuery = null;
    this._setupDprListener();
  }

  private _setupDprListener(): void {
    // Clean up previous listener before re-registering
    if (this._mediaQuery && this._mediaQueryHandler) {
      this._mediaQuery.removeEventListener('change', this._mediaQueryHandler);
    }

    const dpr = window.devicePixelRatio || 1;
    const mql = window.matchMedia(`(resolution: ${dpr}dppx)`);
    this._mediaQuery = mql;
    this._mediaQueryHandler = () => {
      this._setupDprListener(); // Re-register with new DPR value
      this.resizeAll();
    };
    mql.addEventListener('change', this._mediaQueryHandler, { once: true });
  }

  resizeAll(): void {
    if (this._destroyed) {
      return;
    }

    const clientWidth = this._container.clientWidth;
    const clientHeight = this._container.clientHeight;

    if (clientWidth === 0 || clientHeight === 0) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    this._width = clientWidth;
    this._height = clientHeight;
    this._dpr = dpr;

    for (const layerType of LAYER_ORDER) {
      const canvas = this._canvases.get(layerType)!;
      const ctx = this._contexts.get(layerType)!;
      canvas.width = Math.round(clientWidth * dpr);
      canvas.height = Math.round(clientHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    if (this._onResize) {
      this._onResize(clientWidth, clientHeight, dpr);
    }
  }

  getCanvas(type: LayerType): HTMLCanvasElement {
    return this._canvases.get(type)!;
  }

  getContext(type: LayerType): CanvasRenderingContext2D {
    return this._contexts.get(type)!;
  }

  get width(): number {
    return this._width;
  }

  get height(): number {
    return this._height;
  }

  get dpr(): number {
    return this._dpr;
  }

  destroy(): void {
    if (this._destroyed) {
      return;
    }
    this._destroyed = true;

    this._resizeObserver.disconnect();

    if (this._mediaQuery && this._mediaQueryHandler) {
      this._mediaQuery.removeEventListener('change', this._mediaQueryHandler);
    }

    for (const layerType of LAYER_ORDER) {
      const canvas = this._canvases.get(layerType);
      if (canvas && canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
      }
    }

    this._canvases.clear();
    this._contexts.clear();
    this._container = null!;
    this._mediaQuery = null;
    this._mediaQueryHandler = null;
    this._onResize = null;
  }
}
