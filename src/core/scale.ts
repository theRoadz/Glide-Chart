import type { Padding, ScaleDomain, ScaleOptions, Viewport } from './types';

export class Scale {
  private _viewport: Viewport;
  private _domainX: ScaleDomain;
  private _domainY: ScaleDomain;
  private _dpr: number;
  private _padding: Padding;
  private _inverseDomainXWidth: number;
  private _inverseDomainYWidth: number;

  constructor(options: ScaleOptions) {
    Scale.validateDimensions(options.canvasWidth, options.canvasHeight, options.dpr, options.padding);
    this._padding = { ...options.padding };
    this._dpr = options.dpr;
    this._viewport = Scale.computeViewport(options.canvasWidth, options.canvasHeight, options.padding);
    this._domainX = { min: 0, max: 1 };
    this._domainY = { min: 0, max: 1 };
    this._inverseDomainXWidth = 1;
    this._inverseDomainYWidth = 1;
  }

  get viewport(): Readonly<Viewport> {
    return this._viewport;
  }

  get domainX(): Readonly<ScaleDomain> {
    return this._domainX;
  }

  get domainY(): Readonly<ScaleDomain> {
    return this._domainY;
  }

  get dpr(): number {
    return this._dpr;
  }

  update(canvasWidth: number, canvasHeight: number, dpr: number): void {
    Scale.validateDimensions(canvasWidth, canvasHeight, dpr, this._padding);
    this._dpr = dpr;
    this._viewport = Scale.computeViewport(canvasWidth, canvasHeight, this._padding);
  }

  setDomainX(min: number, max: number): void {
    if (min > max) {
      const tmp = min;
      min = max;
      max = tmp;
    }
    this._domainX = { min, max };
    this._inverseDomainXWidth = max === min ? 0 : 1 / (max - min);
  }

  setDomainY(min: number, max: number): void {
    if (min > max) {
      const tmp = min;
      min = max;
      max = tmp;
    }
    this._domainY = { min, max };
    this._inverseDomainYWidth = max === min ? 0 : 1 / (max - min);
  }

  autoFitX(timestamps: Iterable<number>, paddingPercent: number = 0): void {
    let min = Infinity;
    let max = -Infinity;
    let hasValues = false;

    for (const t of timestamps) {
      hasValues = true;
      if (t < min) min = t;
      if (t > max) max = t;
    }

    if (!hasValues) {
      this.setDomainX(0, 1);
      return;
    }

    if (min === max) {
      this.setDomainX(min - 1, max + 1);
      return;
    }

    const range = max - min;
    this.setDomainX(min - range * paddingPercent, max + range * paddingPercent);
  }

  autoFitY(values: Iterable<number>, paddingPercent: number = 0.1): void {
    let min = Infinity;
    let max = -Infinity;
    let hasValues = false;

    for (const v of values) {
      hasValues = true;
      if (v < min) min = v;
      if (v > max) max = v;
    }

    if (!hasValues) {
      this.setDomainY(0, 1);
      return;
    }

    if (min === max) {
      this.setDomainY(min - 1, max + 1);
      return;
    }

    const range = max - min;
    this.setDomainY(min - range * paddingPercent, max + range * paddingPercent);
  }

  xToPixel(timestamp: number): number {
    if (this._inverseDomainXWidth === 0) {
      return this._viewport.x + this._viewport.width * 0.5;
    }
    return this._viewport.x + (timestamp - this._domainX.min) * this._inverseDomainXWidth * this._viewport.width;
  }

  yToPixel(value: number): number {
    if (this._inverseDomainYWidth === 0) {
      return this._viewport.y + this._viewport.height * 0.5;
    }
    return this._viewport.y + this._viewport.height - (value - this._domainY.min) * this._inverseDomainYWidth * this._viewport.height;
  }

  pixelToX(px: number): number {
    if (this._inverseDomainXWidth === 0) {
      return this._domainX.min;
    }
    return this._domainX.min + ((px - this._viewport.x) / this._viewport.width) * (this._domainX.max - this._domainX.min);
  }

  pixelToY(py: number): number {
    if (this._inverseDomainYWidth === 0) {
      return this._domainY.min;
    }
    return this._domainY.min + ((this._viewport.y + this._viewport.height - py) / this._viewport.height) * (this._domainY.max - this._domainY.min);
  }

  private static validateDimensions(canvasWidth: number, canvasHeight: number, dpr: number, padding: Padding): void {
    if (canvasWidth <= 0) throw new Error('Scale: canvasWidth must be positive');
    if (canvasHeight <= 0) throw new Error('Scale: canvasHeight must be positive');
    if (dpr <= 0) throw new Error('Scale: dpr must be positive');
    if (padding.top < 0 || padding.right < 0 || padding.bottom < 0 || padding.left < 0) {
      throw new Error('Scale: padding values must be non-negative');
    }
    const viewportWidth = canvasWidth - padding.left - padding.right;
    const viewportHeight = canvasHeight - padding.top - padding.bottom;
    if (viewportWidth <= 0 || viewportHeight <= 0) {
      throw new Error('Scale: padding exceeds canvas dimensions');
    }
  }

  private static computeViewport(canvasWidth: number, canvasHeight: number, padding: Padding): Viewport {
    return {
      x: padding.left,
      y: padding.top,
      width: canvasWidth - padding.left - padding.right,
      height: canvasHeight - padding.top - padding.bottom,
    };
  }
}
