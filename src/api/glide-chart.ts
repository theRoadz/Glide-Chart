import type { DataPoint } from '../core/types';
import { RingBuffer, getVisibleWindow } from '../core/ring-buffer';
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
import { StaleDetector } from '../core/stale-detector';
import type { StaleChangeEvent } from '../core/stale-detector';
import { EventDispatcher } from '../interaction/event-dispatcher';
import { Crosshair } from '../interaction/crosshair';
import { Tooltip } from '../interaction/tooltip';
import type { PointerState, CrosshairDataSource, CrosshairSeriesData } from '../interaction/types';
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
  private container: HTMLElement;
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
  private staleDetector: StaleDetector | null = null;
  private _onStaleChange: ((event: StaleChangeEvent) => void) | undefined;
  private eventDispatcher: EventDispatcher;
  private crosshair: Crosshair;
  private tooltip: Tooltip;
  private crosshairDataSource: CrosshairDataSource;
  private pointerState: PointerState = { x: 0, y: 0, active: false, pointerType: '' };

  constructor(container: HTMLElement, config?: GlideChartConfig) {
    if (!(container instanceof HTMLElement)) {
      throw new Error('GlideChart: container must be an HTMLElement');
    }

    this.container = container;

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
      this.resolvedConfig.animation,
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
        if (this.dataLayerRenderer.needsNextFrame) {
          this.frameScheduler.markDirty(LayerType.Data);
        }
      }),
      createLayer(LayerType.Interaction, interCanvas, interCtx, () => {
        interCtx.clearRect(0, 0, interCanvas.width, interCanvas.height);
        this.crosshair.draw(interCtx, this.pointerState, this.resolvedConfig);
        this.drawStaleOverlay(interCtx, interCanvas);
      }),
    ];

    // 10. Create EventDispatcher, Crosshair, and Tooltip
    const seriesDataList: CrosshairSeriesData[] = Array.from(
      this.seriesMap.entries(),
      ([id, s]) => ({ id, buffer: s.buffer }),
    );
    this.crosshairDataSource = {
      getSeries() {
        return seriesDataList;
      },
    };
    this.crosshair = new Crosshair(this.scale, this.crosshairDataSource);
    this.tooltip = new Tooltip(container, this.scale, this.crosshairDataSource, this.resolvedConfig);
    this.eventDispatcher = new EventDispatcher(container);
    this.eventDispatcher.subscribe((state) => {
      this.pointerState.x = state.x;
      this.pointerState.y = state.y;
      this.pointerState.active = state.active;
      this.pointerState.pointerType = state.pointerType;
      this.frameScheduler.markDirty(LayerType.Interaction);
      this.tooltip.update(this.pointerState, this.resolvedConfig);
    });

    // 11. Create StaleDetector if threshold > 0
    this._onStaleChange = config?.onStaleChange;
    if (this.resolvedConfig.staleThreshold > 0) {
      this.staleDetector = new StaleDetector({
        staleThreshold: this.resolvedConfig.staleThreshold,
        onStaleChange: (event) => this.handleStaleChange(event),
      });
      // Record initial data arrival for any series with data
      for (const [seriesId, state] of this.seriesMap) {
        if (state.buffer.size > 0) {
          this.staleDetector.recordDataArrival(seriesId);
        }
      }
      this.staleDetector.startChecking();
    }

    // 11. Create FrameScheduler, register layers, start
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

    if (this.staleDetector) {
      this.staleDetector.recordDataArrival(seriesId);
    }

    if (this.resolvedConfig.animation.enabled) {
      this.dataLayerRenderer.snapshotCurveState();
    }

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

    if (this.staleDetector && points.length > 0) {
      this.staleDetector.recordDataArrival(seriesId);
    }

    if (this.resolvedConfig.animation.enabled) {
      this.dataLayerRenderer.snapshotCurveState();
    }

    state.buffer.clear();
    for (const p of points) {
      validateDataPoint(p);
      state.buffer.push(p);
    }
    state.splineCache.computeFull();

    const scaleChanged = this.autoFitScale();
    if (scaleChanged && this.resolvedConfig.animation.enabled) {
      this.dataLayerRenderer.cancelAnimation();
    }
    this.frameScheduler.markDirty(LayerType.Data);
    this.frameScheduler.markDirty(LayerType.Axis);
    this.frameScheduler.markDirty(LayerType.Background);
  }

  clearData(seriesId?: string): void {
    this.assertNotDestroyed();
    this.dataLayerRenderer.cancelAnimation();

    if (seriesId !== undefined) {
      const state = this.getSeriesOrThrow(seriesId);
      state.buffer.clear();
      state.splineCache.invalidate();
      if (this.staleDetector) {
        this.staleDetector.removeSeries(seriesId);
      }
    } else {
      if (this.staleDetector) {
        for (const id of this.seriesMap.keys()) {
          this.staleDetector.removeSeries(id);
        }
      }
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
        // Populate initial data if provided in the merged user config
        const userSeries = this.userConfig.series?.find((s) => s.id === seriesConfig.id);
        if (userSeries?.data && userSeries.data.length > 0) {
          for (const point of userSeries.data) {
            validateDataPoint(point);
            buffer.push(point);
          }
          splineCache.computeFull();
        }
        this.seriesMap.set(seriesConfig.id, { buffer, splineCache, config: seriesConfig });
      }
    }

    // Remove series no longer in config
    for (const id of this.seriesMap.keys()) {
      if (!resolvedIds.has(id)) {
        const state = this.seriesMap.get(id)!;
        state.buffer.clear();
        state.splineCache.invalidate();
        if (this.staleDetector) {
          this.staleDetector.removeSeries(id);
        }
        this.seriesMap.delete(id);
      }
    }

    // Re-extract onStaleChange from merged user config
    this._onStaleChange = this.userConfig.onStaleChange;

    // Recreate StaleDetector — preserve previous timestamps and stale state
    let prevTimestamps: ReadonlyMap<string, number> | null = null;
    let prevStaleIds: ReadonlySet<string> | null = null;
    if (this.staleDetector) {
      const prev = this.staleDetector.getState();
      prevTimestamps = new Map(prev.timestamps);
      prevStaleIds = new Set(prev.staleIds);
      this.staleDetector.destroy();
      this.staleDetector = null;
    }
    if (this.resolvedConfig.staleThreshold > 0) {
      this.staleDetector = new StaleDetector({
        staleThreshold: this.resolvedConfig.staleThreshold,
        onStaleChange: (event) => this.handleStaleChange(event),
      });
      if (prevTimestamps && prevStaleIds) {
        // Restore state for series that still exist
        const filteredTimestamps = new Map<string, number>();
        const filteredStaleIds = new Set<string>();
        for (const [id, ts] of prevTimestamps) {
          if (this.seriesMap.has(id)) filteredTimestamps.set(id, ts);
        }
        for (const id of prevStaleIds) {
          if (this.seriesMap.has(id)) filteredStaleIds.add(id);
        }
        this.staleDetector.restoreState(filteredTimestamps, filteredStaleIds);
      } else {
        // Fresh detector — record current data arrival for series with data
        for (const [seriesId, state] of this.seriesMap) {
          if (state.buffer.size > 0) {
            this.staleDetector.recordDataArrival(seriesId);
          }
        }
      }
      this.staleDetector.startChecking();
      // Sync renderer with restored stale state
      this.dataLayerRenderer.setStaleSeriesIds(this.staleDetector.getStaleSeriesIds());
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
      this.resolvedConfig.animation,
    );

    // Update data layer draw callback
    const dataLayer = this.layers.find((l) => l.type === LayerType.Data);
    if (dataLayer) {
      dataLayer.draw = () => {
        this.dataLayerRenderer.draw();
        if (this.dataLayerRenderer.needsNextFrame) {
          this.frameScheduler.markDirty(LayerType.Data);
        }
      };
    }

    // Recreate CrosshairDataSource with updated series
    const updatedSeriesDataList: CrosshairSeriesData[] = Array.from(
      this.seriesMap.entries(),
      ([id, s]) => ({ id, buffer: s.buffer }),
    );
    this.crosshairDataSource = {
      getSeries() {
        return updatedSeriesDataList;
      },
    };
    this.crosshair = new Crosshair(this.scale, this.crosshairDataSource);

    // Update interaction layer draw callback
    const interLayer = this.layers.find((l) => l.type === LayerType.Interaction);
    if (interLayer) {
      const interCanvas = this.layerManager.getCanvas(LayerType.Interaction);
      const interCtx = this.layerManager.getContext(LayerType.Interaction);
      interLayer.draw = () => {
        interCtx.clearRect(0, 0, interCanvas.width, interCanvas.height);
        this.crosshair.draw(interCtx, this.pointerState, this.resolvedConfig);
        this.drawStaleOverlay(interCtx, interCanvas);
      };
    }

    // Recreate Tooltip with new config (locale/timezone/formatters may have changed)
    this.tooltip.destroy();
    this.tooltip = new Tooltip(this.container, this.scale, this.crosshairDataSource, this.resolvedConfig);

    this.autoFitScale();
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
    this.tooltip.destroy();
    this.eventDispatcher.destroy();
    if (this.staleDetector) {
      this.staleDetector.destroy();
      this.staleDetector = null;
    }
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
    this.eventDispatcher = null!;
    this.crosshair = null!;
    this.tooltip = null!;
    this.crosshairDataSource = null!;
  }

  private drawStaleOverlay(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
    if (!this.staleDetector) return;
    const staleIds = this.staleDetector.getStaleSeriesIds();
    if (staleIds.size === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const fontSize = 12 * dpr;
    const padding = 8 * dpr;
    const margin = 10 * dpr;

    ctx.save();

    // Determine label text
    const totalSeries = this.seriesMap.size;
    let label: string;
    if (staleIds.size === totalSeries || totalSeries === 1) {
      label = 'STALE';
    } else {
      const staleNames = Array.from(staleIds).join(', ');
      label = `STALE: ${staleNames}`;
    }

    // Theme-appropriate colors
    const isDark = this.resolvedConfig.theme === 'dark';
    const textColor = isDark ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.7)';
    const bgColor = isDark ? 'rgba(255, 68, 102, 0.3)' : 'rgba(255, 68, 102, 0.2)';

    ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;

    // Truncate label if it would overflow the canvas
    const maxLabelWidth = canvas.width - margin * 2 - padding * 2;
    if (ctx.measureText(label).width > maxLabelWidth && label.length > 10) {
      while (ctx.measureText(label + '…').width > maxLabelWidth && label.length > 10) {
        label = label.slice(0, -1);
      }
      label += '…';
    }

    const textWidth = ctx.measureText(label).width;
    const textHeight = fontSize;

    // Position in upper-right corner — all coordinates in physical pixels
    const boxWidth = textWidth + padding * 2;
    const boxHeight = textHeight + padding * 2;
    const bx = canvas.width - margin - boxWidth;
    const by = margin;
    const radius = 4 * dpr;

    // Draw background pill
    ctx.globalAlpha = 1;
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.roundRect(bx, by, boxWidth, boxHeight, radius);
    ctx.fill();

    // Draw text
    ctx.fillStyle = textColor;
    ctx.textBaseline = 'middle';
    ctx.fillText(label, bx + padding, by + boxHeight / 2);

    ctx.restore();
  }

  private handleStaleChange(event: StaleChangeEvent): void {
    if (this.destroyed) return;

    // Update renderer stale state
    if (this.staleDetector) {
      this.dataLayerRenderer.setStaleSeriesIds(this.staleDetector.getStaleSeriesIds());
    }
    this.frameScheduler.markDirty(LayerType.Data);
    this.frameScheduler.markDirty(LayerType.Interaction);

    // Notify consumer callback
    if (this._onStaleChange) {
      try {
        this._onStaleChange(event);
      } catch {
        // Consumer callback errors must not crash the chart
      }
    }
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
    const timeWindow = this.resolvedConfig.timeWindow;

    if (timeWindow > 0) {
      return this.autoFitScaleWindowed(timeWindow);
    }

    // Default behavior: auto-fit to full data range
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

  private autoFitScaleWindowed(timeWindowSeconds: number): boolean {
    // Find latest timestamp across all series using peek() — O(1) per series
    let latestTimestamp = -Infinity;
    for (const state of this.seriesMap.values()) {
      const newest = state.buffer.peek() as DataPoint | undefined;
      if (newest && newest.timestamp > latestTimestamp) {
        latestTimestamp = newest.timestamp;
      }
    }

    if (!Number.isFinite(latestTimestamp)) {
      return false;
    }

    let windowStart = latestTimestamp - timeWindowSeconds * 1000;
    if (!Number.isFinite(windowStart)) {
      windowStart = latestTimestamp;
    }

    const oldDomainX = this.scale.domainX;
    const oldDomainY = this.scale.domainY;

    // Set X domain to the time window
    this.scale.setDomainX(windowStart, latestTimestamp);

    // Auto-fit Y to only visible data within the window
    const visibleValues: number[] = [];
    for (const state of this.seriesMap.values()) {
      const visiblePoints = getVisibleWindow(state.buffer, {
        start: windowStart,
        end: latestTimestamp,
      });
      for (const point of visiblePoints) {
        visibleValues.push(point.value);
      }
    }

    if (visibleValues.length > 0) {
      this.scale.autoFitY(visibleValues);
    }

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
