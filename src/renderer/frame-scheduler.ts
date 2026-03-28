import type { FrameSchedulerOptions, Layer } from './types';
import { LayerType, LAYER_ORDER } from './types';

const DEFAULT_IDLE_FRAMES_BEFORE_SLEEP = 3;

export class FrameScheduler {
  private _layers: Map<LayerType, Layer>;
  private _dirtyFlags: Map<LayerType, boolean>;
  private _idleFramesBeforeSleep: number;
  private _idleFrameCount: number;
  private _rafId: number;
  private _running: boolean;
  private _destroyed: boolean;
  private _boundTick: (timestamp: number) => void;

  constructor(options?: FrameSchedulerOptions) {
    this._idleFramesBeforeSleep = options?.idleFramesBeforeSleep ?? DEFAULT_IDLE_FRAMES_BEFORE_SLEEP;
    this._layers = new Map();
    this._dirtyFlags = new Map();
    this._idleFrameCount = 0;
    this._rafId = 0;
    this._running = false;
    this._destroyed = false;
    this._boundTick = (timestamp: number) => this._tick(timestamp);
  }

  registerLayer(layer: Layer): void {
    this._layers.set(layer.type, layer);
    this._dirtyFlags.set(layer.type, false);
  }

  markDirty(type: LayerType): void {
    if (this._destroyed || !this._layers.has(type)) {
      return;
    }
    this._dirtyFlags.set(type, true);
    if (!this._running) {
      this._wake();
    }
  }

  markAllDirty(): void {
    if (this._destroyed) {
      return;
    }
    for (const layerType of LAYER_ORDER) {
      if (this._layers.has(layerType)) {
        this._dirtyFlags.set(layerType, true);
      }
    }
    if (!this._running) {
      this._wake();
    }
  }

  start(): void {
    if (this._destroyed) {
      return;
    }
    if (!this._running) {
      this._wake();
    }
  }

  stop(): void {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    }
    this._running = false;
  }

  destroy(): void {
    this._destroyed = true;
    this.stop();
    this._layers.clear();
    this._dirtyFlags.clear();
  }

  get isRunning(): boolean {
    return this._running;
  }

  private _wake(): void {
    this._running = true;
    this._idleFrameCount = 0;
    this._rafId = requestAnimationFrame(this._boundTick);
  }

  private _tick(_timestamp: number): void {
    let hadDirtyLayer = false;

    for (const layerType of LAYER_ORDER) {
      const layer = this._layers.get(layerType);
      if (layer && this._dirtyFlags.get(layerType)) {
        layer.ctx.save();
        try {
          layer.draw();
        } finally {
          layer.ctx.restore();
        }
        layer.isDirty = false;
        this._dirtyFlags.set(layerType, false);
        hadDirtyLayer = true;
      }
    }

    if (hadDirtyLayer) {
      this._idleFrameCount = 0;
    } else {
      this._idleFrameCount++;
    }

    if (this._idleFrameCount >= this._idleFramesBeforeSleep) {
      this._running = false;
      this._rafId = 0;
    } else {
      this._rafId = requestAnimationFrame(this._boundTick);
    }
  }
}
