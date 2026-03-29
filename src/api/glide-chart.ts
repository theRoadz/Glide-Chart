import type { DataPoint } from '../core/types';
import { RingBuffer } from '../core/ring-buffer';
import { SplineCache } from '../core/spline-cache';
import { Scale } from '../core/scale';
import type { ChartConfig, ResolvedConfig, ResolvedSeriesConfig } from '../config/types';
import { deepMerge, resolveConfig } from '../config/resolver';
import type { Layer } from '../renderer/types';
import { LayerType } from '../renderer/types';
import { LayerManager } from '../renderer/layer-manager';
import { FrameScheduler } from '../renderer/frame-scheduler';
import { DataLayerRenderer } from '../renderer/layers/data-layer';
import { BackgroundLayerRenderer } from '../renderer/layers/background-layer';
import { YAxisRenderer } from '../renderer/layers/y-axis-layer';
import { XAxisRenderer } from '../renderer/layers/x-axis-layer';
import type { SeriesRenderData } from '../renderer/layers/data-layer';
import type { GlideChartConfig } from './types';

const DEFAULT_PADDING = { top: 10, right: 10, bottom: 30, left: 60 };

interface SeriesState {
  buffer: RingBuffer<DataPoint>;
  splineCache: SplineCache;
  config: ResolvedSeriesConfig;
}

function createLayer(
  type: LayerType,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  drawFn: () => void,
): Layer {
  return {
    type,
    canvas,
    ctx,
    isDirty: false,
    draw: drawFn,
  };
}

function validateDataPoint(point: DataPoint): void {
  if (
    typeof point.timestamp !== 'number' ||
    typeof point.value !== 'number' ||
    !Number.isFinite(point.timestamp) ||
    !Number.isFinite(point.value)
  ) {
    throw new Error(
      'GlideChart: invalid data point — timestamp and value must be finite numbers',
    );
  }
}

export class GlideChart {
  private destroyed = false;
  private initialized = false;
  private resolvedConfig: ResolvedConfig;
  private userConfig: GlideChartConfig;
  private seriesMap: Map<string, SeriesState>;
  private scale: Scale;
  private layerManager: LayerManager;
  private frameScheduler: FrameScheduler;
  private dataLayerRenderer: DataLayerRenderer;
  private backgroundLayerRenderer: BackgroundLayerRenderer;
  private yAxisRenderer: YAxisRenderer;
  private xAxisRenderer: XAxisRenderer;
  private layers: Layer[];

  constructor(container: HTMLElement, config?: GlideChartConfig) {
    if (!(container instanceof HTMLElement)) {
      throw new Error('GlideChart: container must be an HTMLElement');
    }

    // 1. Resolve config
    this.userConfig = config ?? {};
    this.resolvedConfig = resolveConfig(this.userConfig);

    // 2. Create series buffers and spline caches (before LayerManager which triggers onResize)
    this.seriesMap = new Map();
    for (const seriesConfig of this.resolvedConfig.series) {
      const buffer = new RingBuffer<DataPoint>(this.resolvedConfig.maxDataPoints);
      const splineCache = new SplineCache(buffer);
      this.seriesMap.set(seriesConfig.id, { buffer, splineCache, config: seriesConfig });
    }

    // 3. Create Scale (before LayerManager which triggers onResize synchronously)
    const minWidth = DEFAULT_PADDING.left + DEFAULT_PADDING.right + 1;
    const minHeight = DEFAULT_PADDING.top + DEFAULT_PADDING.bottom + 1;
    const containerWidth = Math.max(minWidth, container.clientWidth || 300);
    const containerHeight = Math.max(minHeight, container.clientHeight || 150);
    const dpr = window.devicePixelRatio || 1;
    this.scale = new Scale({
      canvasWidth: containerWidth,
      canvasHeight: containerHeight,
      dpr,
      padding: DEFAULT_PADDING,
    });

    // 4. Create LayerManager (triggers resizeAll → onResize in constructor)
    this.layerManager = new LayerManager(container, {
      onResize: (width, height, dprVal) => this.handleResize(width, height, dprVal),
    });

    // 5. Populate initial data if provided
    if (config?.series) {
      for (const seriesInput of config.series) {
        if (seriesInput.data && seriesInput.data.length > 0) {
          const state = this.seriesMap.get(seriesInput.id);
          if (state) {
            for (const point of seriesInput.data) {
              validateDataPoint(point);
              state.buffer.push(point);
            }
            state.splineCache.computeFull();
          }
        }
      }
    }

    // 6. Auto-fit scale to initial data
    this.autoFitScale();

    // 7. Create DataLayerRenderer
    const dataCtx = this.layerManager.getContext(LayerType.Data);
    const dataCanvas = this.layerManager.getCanvas(LayerType.Data);
    this.dataLayerRenderer = new DataLayerRenderer(
      dataCtx,
      dataCanvas,
      this.scale,
      this.buildSeriesRenderData(),
    );

    // 8. Create BackgroundLayerRenderer
    const bgCanvas = this.layerManager.getCanvas(LayerType.Background);
    const bgCtx = this.layerManager.getContext(LayerType.Background);
    this.backgroundLayerRenderer = new BackgroundLayerRenderer(bgCtx, bgCanvas, this.scale, this.resolvedConfig);

    // 9. Create YAxisRenderer
    const axisCanvas = this.layerManager.getCanvas(LayerType.Axis);
    const axisCtx = this.layerManager.getContext(LayerType.Axis);
    this.yAxisRenderer = new YAxisRenderer(axisCtx, axisCanvas, this.scale, this.resolvedConfig);
    this.xAxisRenderer = new XAxisRenderer(axisCtx, axisCanvas, this.scale, this.resolvedConfig);

    // 10. Create Layer adapters
    const interCanvas = this.layerManager.getCanvas(LayerType.Interaction);
    const interCtx = this.layerManager.getContext(LayerType.Interaction);

    this.layers = [
      createLayer(LayerType.Background, bgCanvas, bgCtx, () => {
        this.backgroundLayerRenderer.draw();
      }),
      createLayer(LayerType.Axis, axisCanvas, axisCtx, () => {
        axisCtx.clearRect(0, 0, axisCanvas.width, axisCanvas.height);
        this.yAxisRenderer.draw();
        this.xAxisRenderer.draw();
      }),
      createLayer(LayerType.Data, dataCanvas, dataCtx, () => {
        this.dataLayerRenderer.draw();
      }),
      createLayer(LayerType.Interaction, interCanvas, interCtx, () => {
        interCtx.clearRect(0, 0, interCanvas.width, interCanvas.height);
      }),
    ];

    // 9. Create FrameScheduler, register layers, start
    this.frameScheduler = new FrameScheduler();
    for (const layer of this.layers) {
      this.frameScheduler.registerLayer(layer);
    }
    this.frameScheduler.start();
    this.frameScheduler.markDirty(LayerType.Data);
    this.frameScheduler.markDirty(LayerType.Background);
    this.initialized = true;
  }

  addData(seriesId: string, point: DataPoint | DataPoint[]): void {
    this.assertNotDestroyed();
    const state = this.getSeriesOrThrow(seriesId);

    if (Array.isArray(point)) {
      // Validate all points before mutating buffer (atomic batch)
      for (const p of point) {
        validateDataPoint(p);
      }
      for (const p of point) {
        state.buffer.push(p);
      }
      state.splineCache.computeFull();
    } else {
      // Single point
      validateDataPoint(point);
      state.buffer.push(point);
      state.splineCache.appendPoint();
    }

    const scaleChanged = this.autoFitScale();
    this.frameScheduler.markDirty(LayerType.Data);
    if (scaleChanged) {
      this.frameScheduler.markDirty(LayerType.Axis);
      this.frameScheduler.markDirty(LayerType.Background);
    }
  }

  setData(seriesId: string, points: DataPoint[]): void {
    this.assertNotDestroyed();
    const state = this.getSeriesOrThrow(seriesId);

    state.buffer.clear();
    for (const p of points) {
      validateDataPoint(p);
      state.buffer.push(p);
    }
    state.splineCache.computeFull();

    this.autoFitScale();
    this.frameScheduler.markDirty(LayerType.Data);
    this.frameScheduler.markDirty(LayerType.Axis);
    this.frameScheduler.markDirty(LayerType.Background);
  }

  clearData(seriesId?: string): void {
    this.assertNotDestroyed();

    if (seriesId !== undefined) {
      const state = this.getSeriesOrThrow(seriesId);
      state.buffer.clear();
      state.splineCache.invalidate();
    } else {
      for (const state of this.seriesMap.values()) {
        state.buffer.clear();
        state.splineCache.invalidate();
      }
    }

    this.autoFitScale();
    this.frameScheduler.markDirty(LayerType.Data);
    this.frameScheduler.markDirty(LayerType.Axis);
    this.frameScheduler.markDirty(LayerType.Background);
  }

  setConfig(partialConfig: ChartConfig): void {
    this.assertNotDestroyed();

    // Deep-merge user config to preserve nested fields
    const mergedUserConfig: GlideChartConfig = deepMerge(this.userConfig, partialConfig);
    this.userConfig = mergedUserConfig;
    this.resolvedConfig = resolveConfig(mergedUserConfig);

    // Reconcile seriesMap with resolved series
    const resolvedIds = new Set<string>();
    for (const seriesConfig of this.resolvedConfig.series) {
      resolvedIds.add(seriesConfig.id);
      const existing = this.seriesMap.get(seriesConfig.id);
      if (existing) {
        existing.config = seriesConfig;
      } else {
        // New series — create buffer and spline cache
        const buffer = new RingBuffer<DataPoint>(this.resolvedConfig.maxDataPoints);
        const splineCache = new SplineCache(buffer);
        this.seriesMap.set(seriesConfig.id, { buffer, splineCache, config: seriesConfig });
      }
    }

    // Remove series no longer in config
    for (const id of this.seriesMap.keys()) {
      if (!resolvedIds.has(id)) {
        const state = this.seriesMap.get(id)!;
        state.buffer.clear();
        state.splineCache.invalidate();
        this.seriesMap.delete(id);
      }
    }

    // Recreate BackgroundLayerRenderer with new config
    const bgCtxNew = this.layerManager.getContext(LayerType.Background);
    const bgCanvasNew = this.layerManager.getCanvas(LayerType.Background);
    this.backgroundLayerRenderer = new BackgroundLayerRenderer(bgCtxNew, bgCanvasNew, this.scale, this.resolvedConfig);

    // Update background layer draw callback
    const bgLayer = this.layers.find((l) => l.type === LayerType.Background);
    if (bgLayer) {
      bgLayer.draw = () => {
        this.backgroundLayerRenderer.draw();
      };
    }

    // Recreate YAxisRenderer and XAxisRenderer with new config
    const axisCtxNew = this.layerManager.getContext(LayerType.Axis);
    const axisCanvasNew = this.layerManager.getCanvas(LayerType.Axis);
    this.yAxisRenderer = new YAxisRenderer(axisCtxNew, axisCanvasNew, this.scale, this.resolvedConfig);
    this.xAxisRenderer = new XAxisRenderer(axisCtxNew, axisCanvasNew, this.scale, this.resolvedConfig);

    // Update axis layer draw callback
    const axisLayer = this.layers.find((l) => l.type === LayerType.Axis);
    if (axisLayer) {
      axisLayer.draw = () => {
        axisCtxNew.clearRect(0, 0, axisCanvasNew.width, axisCanvasNew.height);
        this.yAxisRenderer.draw();
        this.xAxisRenderer.draw();
      };
    }

    // Recreate DataLayerRenderer with new configs
    const dataCtx = this.layerManager.getContext(LayerType.Data);
    const dataCanvas = this.layerManager.getCanvas(LayerType.Data);
    this.dataLayerRenderer = new DataLayerRenderer(
      dataCtx,
      dataCanvas,
      this.scale,
      this.buildSeriesRenderData(),
    );

    // Update data layer draw callback
    const dataLayer = this.layers.find((l) => l.type === LayerType.Data);
    if (dataLayer) {
      dataLayer.draw = () => {
        this.dataLayerRenderer.draw();
      };
    }

    this.frameScheduler.markAllDirty();
  }

  resize(): void {
    this.assertNotDestroyed();

    this.layerManager.resizeAll();
    const width = this.layerManager.width;
    const height = this.layerManager.height;

    // Skip scale update when container is hidden (zero dimensions)
    if (width === 0 || height === 0) return;

    this.scale.update(width, height, this.layerManager.dpr);
    this.autoFitScale();
    this.frameScheduler.markAllDirty();
  }

  destroy(): void {
    this.assertNotDestroyed();

    this.destroyed = true;
    this.frameScheduler.destroy();
    this.layerManager.destroy();

    // Clear all buffers and caches
    for (const state of this.seriesMap.values()) {
      state.buffer.clear();
      state.splineCache.invalidate();
    }
    this.seriesMap.clear();

    // Null out references for GC
    this.layers = [];
    this.scale = null!;
    this.dataLayerRenderer = null!;
    this.backgroundLayerRenderer = null!;
    this.yAxisRenderer = null!;
    this.xAxisRenderer = null!;
    this.resolvedConfig = null!;
    this.userConfig = null!;
    this.layerManager = null!;
    this.frameScheduler = null!;
  }

  private assertNotDestroyed(): void {
    if (this.destroyed) {
      throw new Error('GlideChart: instance has been destroyed');
    }
  }

  private getSeriesOrThrow(seriesId: string): SeriesState {
    const state = this.seriesMap.get(seriesId);
    if (!state) {
      throw new Error(
        `GlideChart: series '${seriesId}' not found. Add it via config.series first.`,
      );
    }
    return state;
  }

  private buildSeriesRenderData(): SeriesRenderData[] {
    const result: SeriesRenderData[] = [];
    for (const state of this.seriesMap.values()) {
      result.push({
        buffer: state.buffer,
        splineCache: state.splineCache,
        config: state.config,
      });
    }
    return result;
  }

  private autoFitScale(): boolean {
    const allTimestamps: number[] = [];
    const allValues: number[] = [];

    for (const state of this.seriesMap.values()) {
      for (const point of state.buffer) {
        allTimestamps.push(point.timestamp);
        allValues.push(point.value);
      }
    }

    if (allTimestamps.length === 0) {
      return false;
    }

    const oldDomainX = this.scale.domainX;
    const oldDomainY = this.scale.domainY;

    this.scale.autoFitX(allTimestamps);
    this.scale.autoFitY(allValues);

    const newDomainX = this.scale.domainX;
    const newDomainY = this.scale.domainY;

    return (
      oldDomainX.min !== newDomainX.min ||
      oldDomainX.max !== newDomainX.max ||
      oldDomainY.min !== newDomainY.min ||
      oldDomainY.max !== newDomainY.max
    );
  }

  private handleResize(width: number, height: number, dpr: number): void {
    if (this.destroyed || !this.initialized) return;
    const minWidth = DEFAULT_PADDING.left + DEFAULT_PADDING.right + 1;
    const minHeight = DEFAULT_PADDING.top + DEFAULT_PADDING.bottom + 1;
    this.scale.update(Math.max(minWidth, width), Math.max(minHeight, height), dpr);
    this.autoFitScale();
    this.frameScheduler.markAllDirty();
  }
}
