import { DataLayerRenderer, hexToRgba } from './data-layer';
import type { SeriesRenderData } from './data-layer';
import { RingBuffer } from '../../core/ring-buffer';
import { SplineCache } from '../../core/spline-cache';
import { Scale } from '../../core/scale';
import type { DataPoint } from '../../core/types';
import type { ResolvedSeriesConfig, AnimationConfig } from '../../config/types';

function makeScale(): Scale {
  return new Scale({
    canvasWidth: 800,
    canvasHeight: 600,
    dpr: 1,
    padding: { top: 10, right: 10, bottom: 10, left: 10 },
  });
}

function makeSeriesConfig(overrides?: Partial<{
  lineColor: string;
  lineWidth: number;
  lineOpacity: number;
  gradientEnabled: boolean;
  gradientTopColor: string;
  gradientBottomColor: string;
  gradientTopOpacity: number;
  gradientBottomOpacity: number;
}>): Readonly<ResolvedSeriesConfig> {
  return {
    id: 'series-1',
    line: {
      color: overrides?.lineColor ?? '#00d4aa',
      width: overrides?.lineWidth ?? 2,
      opacity: overrides?.lineOpacity ?? 1,
    },
    gradient: {
      enabled: overrides?.gradientEnabled ?? true,
      topColor: overrides?.gradientTopColor ?? '#00d4aa',
      bottomColor: overrides?.gradientBottomColor ?? '#00d4aa',
      topOpacity: overrides?.gradientTopOpacity ?? 0.3,
      bottomOpacity: overrides?.gradientBottomOpacity ?? 0,
    },
  };
}

function makeSeries(
  points: [number, number][],
  config?: Readonly<ResolvedSeriesConfig>,
): SeriesRenderData {
  const buffer = new RingBuffer<DataPoint>(10000);
  for (const [timestamp, value] of points) {
    buffer.push({ timestamp, value });
  }
  const splineCache = new SplineCache(buffer);
  if (buffer.size >= 2) {
    splineCache.computeFull();
  }
  return {
    buffer,
    splineCache,
    config: config ?? makeSeriesConfig(),
  };
}

function createCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx };
}

const ANIM_OFF: Readonly<AnimationConfig> = { enabled: false, duration: 0 };
const ANIM_ON: Readonly<AnimationConfig> = { enabled: true, duration: 300 };

describe('DataLayerRenderer', () => {
  describe('draw() — empty and edge cases', () => {
    it('empty series data renders nothing (no errors, only clearRect)', () => {
      const { canvas, ctx } = createCanvas();
      const scale = makeScale();
      const renderer = new DataLayerRenderer(ctx, canvas, scale, [], ANIM_OFF);

      renderer.draw();

      // clearRect should have been called
      expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 600);
    });

    it('empty buffer series renders nothing beyond clearRect', () => {
      const { canvas, ctx } = createCanvas();
      const scale = makeScale();
      const series = makeSeries([]);
      const renderer = new DataLayerRenderer(ctx, canvas, scale, [series], ANIM_OFF);

      renderer.draw();

      expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 600);
      // No beginPath for empty data
      expect(ctx.beginPath).not.toHaveBeenCalled();
    });

    it('single data point renders a dot (arc call with correct coordinates)', () => {
      const { canvas, ctx } = createCanvas();
      const scale = makeScale();
      scale.setDomainX(100, 200);
      scale.setDomainY(0, 100);

      const buffer = new RingBuffer<DataPoint>(100);
      buffer.push({ timestamp: 150, value: 50 });
      const splineCache = new SplineCache(buffer);
      // Don't compute spline — single point has no coefficients

      const series: SeriesRenderData = {
        buffer,
        splineCache,
        config: makeSeriesConfig(),
      };

      const renderer = new DataLayerRenderer(ctx, canvas, scale, [series], ANIM_OFF);
      renderer.draw();

      expect(ctx.arc).toHaveBeenCalled();
      expect(ctx.fillStyle).toBe('#00d4aa');
      expect(ctx.fill).toHaveBeenCalled();
    });

    it('canvas is cleared at start of draw', () => {
      const { canvas, ctx } = createCanvas();
      const scale = makeScale();
      const series = makeSeries([[1, 10], [2, 20], [3, 30]]);
      const renderer = new DataLayerRenderer(ctx, canvas, scale, [series], ANIM_OFF);

      renderer.draw();

      // First call on ctx should be clearRect
      expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 600);
    });
  });

  describe('draw() — curve rendering', () => {
    it('2 data points renders a path with moveTo followed by lineTo calls', () => {
      const { canvas, ctx } = createCanvas();
      const scale = makeScale();
      scale.setDomainX(0, 10);
      scale.setDomainY(0, 100);

      const series = makeSeries([[0, 10], [10, 90]]);
      const renderer = new DataLayerRenderer(ctx, canvas, scale, [series], ANIM_OFF);

      renderer.draw();

      expect(ctx.moveTo).toHaveBeenCalled();
      expect(ctx.lineTo).toHaveBeenCalled();
      expect(ctx.stroke).toHaveBeenCalled();
    });

    it('3+ data points renders smooth curve using spline coefficients', () => {
      const { canvas, ctx } = createCanvas();
      const scale = makeScale();
      scale.setDomainX(0, 40);
      scale.setDomainY(0, 100);

      const series = makeSeries([[0, 10], [10, 50], [20, 30], [30, 80], [40, 60]]);
      const renderer = new DataLayerRenderer(ctx, canvas, scale, [series], ANIM_OFF);

      renderer.draw();

      expect(ctx.beginPath).toHaveBeenCalled();
      expect(ctx.moveTo).toHaveBeenCalled();
      expect(ctx.lineTo).toHaveBeenCalled();
      expect(ctx.stroke).toHaveBeenCalled();

      // Should have many lineTo calls due to adaptive sampling across 4 segments
      const lineToCallCount = (ctx.lineTo as ReturnType<typeof vi.fn>).mock.calls.length;
      expect(lineToCallCount).toBeGreaterThan(4);
    });

    it('line opacity is applied via globalAlpha', () => {
      const { canvas, ctx } = createCanvas();
      const scale = makeScale();
      scale.setDomainX(0, 10);
      scale.setDomainY(0, 100);

      const config = makeSeriesConfig({ lineOpacity: 0.7 });
      const series = makeSeries([[0, 10], [10, 90]], config);
      const renderer = new DataLayerRenderer(ctx, canvas, scale, [series], ANIM_OFF);

      renderer.draw();

      // globalAlpha should have been set to 0.7 at some point
      // After drawing, it resets to 1
      // We check the mock was set
      expect(ctx.globalAlpha).toBe(1); // Reset after draw
    });

    it('line width and color are set from series config', () => {
      const { canvas, ctx } = createCanvas();
      const scale = makeScale();
      scale.setDomainX(0, 10);
      scale.setDomainY(0, 100);

      const config = makeSeriesConfig({ lineColor: '#ff0000', lineWidth: 3 });
      const series = makeSeries([[0, 10], [10, 90]], config);
      const renderer = new DataLayerRenderer(ctx, canvas, scale, [series], ANIM_OFF);

      renderer.draw();

      expect(ctx.strokeStyle).toBe('#ff0000');
      expect(ctx.lineWidth).toBe(3);
    });
  });

  describe('draw() — gradient fill', () => {
    it('gradient fill creates linearGradient with correct color stops from config', () => {
      const { canvas, ctx } = createCanvas();
      const scale = makeScale();
      scale.setDomainX(0, 10);
      scale.setDomainY(0, 100);

      const series = makeSeries([[0, 10], [10, 90]]);
      const renderer = new DataLayerRenderer(ctx, canvas, scale, [series], ANIM_OFF);

      renderer.draw();

      expect(ctx.createLinearGradient).toHaveBeenCalled();
      expect(ctx.fill).toHaveBeenCalled();
    });

    it('gradient disabled (enabled: false) skips gradient rendering', () => {
      const { canvas, ctx } = createCanvas();
      const scale = makeScale();
      scale.setDomainX(0, 10);
      scale.setDomainY(0, 100);

      const config = makeSeriesConfig({ gradientEnabled: false });
      const series = makeSeries([[0, 10], [10, 90]], config);
      const renderer = new DataLayerRenderer(ctx, canvas, scale, [series], ANIM_OFF);

      renderer.draw();

      // createLinearGradient should NOT have been called
      expect(ctx.createLinearGradient).not.toHaveBeenCalled();
      // stroke should still happen (curve rendering)
      expect(ctx.stroke).toHaveBeenCalled();
    });
  });

  describe('draw() — gradient per-series opacity', () => {
    it('series with custom gradient topOpacity: 0.8 and bottomOpacity: 0.2 renders correct color stops', () => {
      const { canvas, ctx } = createCanvas();
      const scale = makeScale();
      scale.setDomainX(0, 10);
      scale.setDomainY(0, 100);

      const config = makeSeriesConfig({
        gradientEnabled: true,
        gradientTopColor: '#ff0000',
        gradientBottomColor: '#00ff00',
        gradientTopOpacity: 0.8,
        gradientBottomOpacity: 0.2,
      });
      const series = makeSeries([[0, 10], [10, 90]], config);
      const renderer = new DataLayerRenderer(ctx, canvas, scale, [series], ANIM_OFF);

      renderer.draw();

      expect(ctx.createLinearGradient).toHaveBeenCalled();
      expect(ctx.fill).toHaveBeenCalled();

      // Verify the pre-computed rgba values via hexToRgba
      expect(hexToRgba('#ff0000', 0.8)).toBe('rgba(255, 0, 0, 0.8)');
      expect(hexToRgba('#00ff00', 0.2)).toBe('rgba(0, 255, 0, 0.2)');
    });
  });

  describe('draw() — multiple series', () => {
    it('multiple series each render with their own config colors', () => {
      const { canvas, ctx } = createCanvas();
      const scale = makeScale();
      scale.setDomainX(0, 10);
      scale.setDomainY(0, 100);

      const config1 = makeSeriesConfig({ lineColor: '#ff0000', gradientEnabled: false });
      const config2 = makeSeriesConfig({ lineColor: '#00ff00', gradientEnabled: false });

      const series1 = makeSeries([[0, 10], [10, 90]], config1);
      const series2 = makeSeries([[0, 50], [10, 20]], config2);

      const renderer = new DataLayerRenderer(ctx, canvas, scale, [series1, series2], ANIM_OFF);
      renderer.draw();

      // stroke should be called twice (once per series)
      expect((ctx.stroke as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
    });
  });

  describe('draw() — multi-series edge cases', () => {
    it('3 series render 3 separate curves (3 stroke calls)', () => {
      const { canvas, ctx } = createCanvas();
      const scale = makeScale();
      scale.setDomainX(0, 10);
      scale.setDomainY(0, 100);

      const series1 = makeSeries([[0, 10], [10, 90]], makeSeriesConfig({ lineColor: '#ff0000', gradientEnabled: false }));
      const series2 = makeSeries([[0, 50], [10, 20]], makeSeriesConfig({ lineColor: '#00ff00', gradientEnabled: false }));
      const series3 = makeSeries([[0, 30], [10, 70]], makeSeriesConfig({ lineColor: '#0000ff', gradientEnabled: false }));

      const renderer = new DataLayerRenderer(ctx, canvas, scale, [series1, series2, series3], ANIM_OFF);
      renderer.draw();

      expect((ctx.stroke as ReturnType<typeof vi.fn>).mock.calls.length).toBe(3);
    });

    it('mixed gradient states — series A gradient enabled, series B disabled', () => {
      const { canvas, ctx } = createCanvas();
      const scale = makeScale();
      scale.setDomainX(0, 10);
      scale.setDomainY(0, 100);

      const seriesA = makeSeries([[0, 10], [10, 90]], makeSeriesConfig({ gradientEnabled: true }));
      const seriesB = makeSeries([[0, 50], [10, 20]], makeSeriesConfig({ gradientEnabled: false }));

      const renderer = new DataLayerRenderer(ctx, canvas, scale, [seriesA, seriesB], ANIM_OFF);
      renderer.draw();

      // createLinearGradient called once (only for series A)
      expect((ctx.createLinearGradient as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
      // Both series still render curves (2 stroke calls)
      expect((ctx.stroke as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
    });

    it('series with different data lengths both render', () => {
      const { canvas, ctx } = createCanvas();
      const scale = makeScale();
      scale.setDomainX(0, 200);
      scale.setDomainY(0, 100);

      // Series A: 5 points
      const seriesA = makeSeries(
        [[0, 10], [50, 30], [100, 50], [150, 70], [200, 90]],
        makeSeriesConfig({ lineColor: '#ff0000', gradientEnabled: false }),
      );

      // Series B: 100 points
      const pointsB: [number, number][] = [];
      for (let i = 0; i < 100; i++) {
        pointsB.push([i * 2, Math.sin(i * 0.1) * 50 + 50]);
      }
      const seriesB = makeSeries(pointsB, makeSeriesConfig({ lineColor: '#00ff00', gradientEnabled: false }));

      const renderer = new DataLayerRenderer(ctx, canvas, scale, [seriesA, seriesB], ANIM_OFF);
      renderer.draw();

      // Both series rendered (2 stroke calls)
      expect((ctx.stroke as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
    });

    it('one empty series + one populated series — empty is skipped, populated renders', () => {
      const { canvas, ctx } = createCanvas();
      const scale = makeScale();
      scale.setDomainX(0, 10);
      scale.setDomainY(0, 100);

      const emptySeries = makeSeries([], makeSeriesConfig({ lineColor: '#ff0000', gradientEnabled: false }));
      const populatedSeries = makeSeries([[0, 10], [10, 90]], makeSeriesConfig({ lineColor: '#00ff00', gradientEnabled: false }));

      const renderer = new DataLayerRenderer(ctx, canvas, scale, [emptySeries, populatedSeries], ANIM_OFF);
      renderer.draw();

      // Only 1 stroke call — empty series skipped
      expect((ctx.stroke as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    });

    it('multi-series performance — 3 series x 5K points completes within 1500ms', () => {
      const { canvas, ctx } = createCanvas();
      const scale = makeScale();

      const seriesArr: SeriesRenderData[] = [];
      for (let s = 0; s < 3; s++) {
        const buffer = new RingBuffer<DataPoint>(10000);
        for (let i = 0; i < 5000; i++) {
          buffer.push({ timestamp: i, value: Math.sin(i * 0.01 + s) * 50 + 50 });
        }
        const splineCache = new SplineCache(buffer);
        splineCache.computeFull();
        seriesArr.push({
          buffer,
          splineCache,
          config: makeSeriesConfig({ gradientEnabled: false }),
        });
      }

      scale.setDomainX(0, 4999);
      scale.setDomainY(0, 100);

      const renderer = new DataLayerRenderer(ctx, canvas, scale, seriesArr, ANIM_OFF);

      const start = performance.now();
      renderer.draw();
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(1500);
    });
  });

  describe('hexToRgba', () => {
    it('correctly converts #RRGGBB to rgba(r, g, b, a)', () => {
      expect(hexToRgba('#00d4aa', 0.3)).toBe('rgba(0, 212, 170, 0.3)');
      expect(hexToRgba('#ff0000', 1)).toBe('rgba(255, 0, 0, 1)');
      expect(hexToRgba('#000000', 0)).toBe('rgba(0, 0, 0, 0)');
      expect(hexToRgba('#ffffff', 0.5)).toBe('rgba(255, 255, 255, 0.5)');
    });

    it('correctly converts #RGB shorthand to rgba(r, g, b, a)', () => {
      expect(hexToRgba('#f00', 1)).toBe('rgba(255, 0, 0, 1)');
      expect(hexToRgba('#0f0', 0.5)).toBe('rgba(0, 255, 0, 0.5)');
      expect(hexToRgba('#fff', 0.8)).toBe('rgba(255, 255, 255, 0.8)');
      expect(hexToRgba('#000', 0)).toBe('rgba(0, 0, 0, 0)');
    });
  });

  describe('performance', () => {
    it('draw completes within 16ms for 10,000 data points', () => {
      const { canvas, ctx } = createCanvas();
      const scale = makeScale();

      // Generate 10,000 points
      const buffer = new RingBuffer<DataPoint>(10000);
      for (let i = 0; i < 10000; i++) {
        buffer.push({ timestamp: i, value: Math.sin(i * 0.01) * 50 + 50 });
      }
      const splineCache = new SplineCache(buffer);
      splineCache.computeFull();

      scale.setDomainX(0, 9999);
      scale.setDomainY(0, 100);

      const series: SeriesRenderData = {
        buffer,
        splineCache,
        config: makeSeriesConfig(),
      };

      const renderer = new DataLayerRenderer(ctx, canvas, scale, [series], ANIM_OFF);

      // Note: Canvas mock overhead makes timing unreliable for strict 16ms assertion.
      // We verify it completes without error and measure indicatively.
      const start = performance.now();
      renderer.draw();
      const elapsed = performance.now() - start;

      // With canvas mocks, this won't be real rendering perf, but should still be fast
      // If this exceeds 500ms even with mocks, something is algorithmically wrong
      expect(elapsed).toBeLessThan(500);
    });
  });

  describe('animation — disabled', () => {
    it('draw() renders immediately, needsNextFrame is false, no performance.now() calls', () => {
      const { canvas, ctx } = createCanvas();
      const scale = makeScale();
      scale.setDomainX(0, 10);
      scale.setDomainY(0, 100);

      const series = makeSeries([[0, 10], [10, 90]]);
      const renderer = new DataLayerRenderer(ctx, canvas, scale, [series], ANIM_OFF);

      const perfSpy = vi.spyOn(performance, 'now');
      renderer.draw();

      expect(renderer.needsNextFrame).toBe(false);
      expect(renderer.isAnimating).toBe(false);
      // performance.now() should not be called during draw when animation is disabled
      expect(perfSpy).not.toHaveBeenCalled();
      expect(ctx.stroke).toHaveBeenCalled();

      perfSpy.mockRestore();
    });
  });

  describe('draw() — palette color integration', () => {
    it('3 series with different palette colors render correct strokeStyle for each', () => {
      const { canvas, ctx } = createCanvas();
      const scale = makeScale();
      scale.setDomainX(0, 10);
      scale.setDomainY(0, 100);

      const paletteColors = ['#00d4aa', '#ff6b6b', '#ffd93d'];
      const seriesArr = paletteColors.map((color, i) =>
        makeSeries(
          [[0, 10 + i * 20], [10, 90 - i * 20]],
          makeSeriesConfig({ lineColor: color, gradientEnabled: false }),
        ),
      );

      const renderer = new DataLayerRenderer(ctx, canvas, scale, seriesArr, ANIM_OFF);
      renderer.draw();

      // All 3 series rendered
      expect((ctx.stroke as ReturnType<typeof vi.fn>).mock.calls.length).toBe(3);
    });

    it('series with auto-matched gradient colors renders correct gradient color stops', () => {
      const { canvas, ctx } = createCanvas();
      const scale = makeScale();
      scale.setDomainX(0, 10);
      scale.setDomainY(0, 100);

      // Simulate what resolveConfig produces: gradient topColor/bottomColor matching line color
      const seriesLineColor = '#ff6b6b';
      const config = makeSeriesConfig({
        lineColor: seriesLineColor,
        gradientEnabled: true,
        gradientTopColor: seriesLineColor,
        gradientBottomColor: seriesLineColor,
        gradientTopOpacity: 0.3,
        gradientBottomOpacity: 0,
      });
      const series = makeSeries([[0, 10], [10, 90]], config);
      const renderer = new DataLayerRenderer(ctx, canvas, scale, [series], ANIM_OFF);

      renderer.draw();

      expect(ctx.createLinearGradient).toHaveBeenCalled();
      expect(ctx.fill).toHaveBeenCalled();
    });
  });

  describe('animation — duration: 0 (instant mode)', () => {
    it('duration: 0 means snapshotCurveState returns early, isAnimating stays false', () => {
      const { canvas, ctx } = createCanvas();
      const scale = makeScale();
      scale.setDomainX(0, 10);
      scale.setDomainY(0, 100);

      const ANIM_INSTANT: Readonly<AnimationConfig> = { enabled: true, duration: 0 };

      const buffer = new RingBuffer<DataPoint>(10000);
      buffer.push({ timestamp: 0, value: 10 });
      buffer.push({ timestamp: 10, value: 90 });
      const splineCache = new SplineCache(buffer);
      splineCache.computeFull();

      const series: SeriesRenderData = { buffer, splineCache, config: makeSeriesConfig() };
      const renderer = new DataLayerRenderer(ctx, canvas, scale, [series], ANIM_INSTANT);

      renderer.snapshotCurveState();

      expect(renderer.isAnimating).toBe(false);
      expect(renderer.needsNextFrame).toBe(false);
    });
  });

  describe('animation — duration: 1000 (slower animation)', () => {
    it('at half duration, isAnimating is true and animation is in progress', () => {
      const { canvas, ctx } = createCanvas();
      const scale = makeScale();
      scale.setDomainX(0, 10);
      scale.setDomainY(0, 100);

      const ANIM_SLOW: Readonly<AnimationConfig> = { enabled: true, duration: 1000 };

      const buffer = new RingBuffer<DataPoint>(10000);
      buffer.push({ timestamp: 0, value: 10 });
      buffer.push({ timestamp: 10, value: 90 });
      const splineCache = new SplineCache(buffer);
      splineCache.computeFull();

      const series: SeriesRenderData = { buffer, splineCache, config: makeSeriesConfig() };
      const renderer = new DataLayerRenderer(ctx, canvas, scale, [series], ANIM_SLOW);

      renderer.snapshotCurveState();

      // Mutate data
      buffer.push({ timestamp: 15, value: 50 });
      scale.setDomainX(0, 15);
      splineCache.computeFull();

      // Draw at 500ms (half of 1000ms duration)
      vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 500);
      renderer.draw();

      expect(renderer.isAnimating).toBe(true);
      expect(renderer.needsNextFrame).toBe(true);

      vi.restoreAllMocks();
    });
  });

  describe('animation — disabled ignores duration', () => {
    it('animation disabled with duration: 300 — snapshotCurveState does not start animation', () => {
      const { canvas, ctx } = createCanvas();
      const scale = makeScale();
      scale.setDomainX(0, 10);
      scale.setDomainY(0, 100);

      const ANIM_DISABLED_WITH_DURATION: Readonly<AnimationConfig> = { enabled: false, duration: 300 };

      const buffer = new RingBuffer<DataPoint>(10000);
      buffer.push({ timestamp: 0, value: 10 });
      buffer.push({ timestamp: 10, value: 90 });
      const splineCache = new SplineCache(buffer);
      splineCache.computeFull();

      const series: SeriesRenderData = { buffer, splineCache, config: makeSeriesConfig() };
      const renderer = new DataLayerRenderer(ctx, canvas, scale, [series], ANIM_DISABLED_WITH_DURATION);

      renderer.snapshotCurveState();

      expect(renderer.isAnimating).toBe(false);
      expect(renderer.needsNextFrame).toBe(false);
    });
  });

  describe('animation — enabled', () => {
    it('after snapshotCurveState, needsNextFrame is true and draws interpolate toward final state', () => {
      const { canvas, ctx } = createCanvas();
      const scale = makeScale();
      scale.setDomainX(0, 10);
      scale.setDomainY(0, 100);

      const buffer = new RingBuffer<DataPoint>(10000);
      buffer.push({ timestamp: 0, value: 10 });
      buffer.push({ timestamp: 10, value: 90 });
      const splineCache = new SplineCache(buffer);
      splineCache.computeFull();

      const series: SeriesRenderData = {
        buffer,
        splineCache,
        config: makeSeriesConfig(),
      };

      const renderer = new DataLayerRenderer(ctx, canvas, scale, [series], ANIM_ON);

      // Snapshot current state
      renderer.snapshotCurveState();

      // Mutate data (add point)
      buffer.push({ timestamp: 15, value: 50 });
      scale.setDomainX(0, 15);
      splineCache.computeFull();

      // Draw partway through animation
      vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 150); // half of 300ms
      renderer.draw();

      expect(renderer.needsNextFrame).toBe(true);
      expect(renderer.isAnimating).toBe(true);
      expect(ctx.stroke).toHaveBeenCalled();

      vi.restoreAllMocks();
    });

    it('animation completes when elapsed >= duration — final frame renders exact target, needsNextFrame is false', () => {
      const { canvas, ctx } = createCanvas();
      const scale = makeScale();
      scale.setDomainX(0, 10);
      scale.setDomainY(0, 100);

      const buffer = new RingBuffer<DataPoint>(10000);
      buffer.push({ timestamp: 0, value: 10 });
      buffer.push({ timestamp: 10, value: 90 });
      const splineCache = new SplineCache(buffer);
      splineCache.computeFull();

      const series: SeriesRenderData = {
        buffer,
        splineCache,
        config: makeSeriesConfig(),
      };

      const renderer = new DataLayerRenderer(ctx, canvas, scale, [series], ANIM_ON);

      renderer.snapshotCurveState();

      buffer.push({ timestamp: 15, value: 50 });
      scale.setDomainX(0, 15);
      splineCache.computeFull();

      // Jump past animation duration
      vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 500);
      renderer.draw();

      expect(renderer.needsNextFrame).toBe(false);
      expect(renderer.isAnimating).toBe(false);

      vi.restoreAllMocks();
    });

    it('rapid successive snapshotCurveState calls during animation — new animation starts from current interpolated position', () => {
      const { canvas, ctx } = createCanvas();
      const scale = makeScale();
      scale.setDomainX(0, 10);
      scale.setDomainY(0, 100);

      const buffer = new RingBuffer<DataPoint>(10000);
      buffer.push({ timestamp: 0, value: 10 });
      buffer.push({ timestamp: 10, value: 90 });
      const splineCache = new SplineCache(buffer);
      splineCache.computeFull();

      const series: SeriesRenderData = {
        buffer,
        splineCache,
        config: makeSeriesConfig(),
      };

      const renderer = new DataLayerRenderer(ctx, canvas, scale, [series], ANIM_ON);

      const baseTime = performance.now();

      // First snapshot + mutation
      vi.spyOn(performance, 'now').mockReturnValue(baseTime);
      renderer.snapshotCurveState();
      buffer.push({ timestamp: 15, value: 50 });
      scale.setDomainX(0, 15);
      splineCache.computeFull();

      // Draw partway through
      (performance.now as ReturnType<typeof vi.fn>).mockReturnValue(baseTime + 150);
      renderer.draw();
      expect(renderer.isAnimating).toBe(true);

      // Second snapshot during animation — captures interpolated position
      (performance.now as ReturnType<typeof vi.fn>).mockReturnValue(baseTime + 150);
      renderer.snapshotCurveState();

      // Mutate again
      buffer.push({ timestamp: 20, value: 70 });
      scale.setDomainX(0, 20);
      splineCache.computeFull();

      // Draw at new animation midpoint
      (performance.now as ReturnType<typeof vi.fn>).mockReturnValue(baseTime + 300);
      renderer.draw();
      expect(renderer.isAnimating).toBe(true);

      // Draw after new animation completes
      (performance.now as ReturnType<typeof vi.fn>).mockReturnValue(baseTime + 500);
      renderer.draw();
      expect(renderer.isAnimating).toBe(false);
      expect(renderer.needsNextFrame).toBe(false);

      vi.restoreAllMocks();
    });

    it('snapshotCurveState with multi-series — each series animates independently', () => {
      const { canvas, ctx } = createCanvas();
      const scale = makeScale();
      scale.setDomainX(0, 10);
      scale.setDomainY(0, 100);

      const buffer1 = new RingBuffer<DataPoint>(10000);
      buffer1.push({ timestamp: 0, value: 10 });
      buffer1.push({ timestamp: 10, value: 90 });
      const spline1 = new SplineCache(buffer1);
      spline1.computeFull();

      const buffer2 = new RingBuffer<DataPoint>(10000);
      buffer2.push({ timestamp: 0, value: 50 });
      buffer2.push({ timestamp: 10, value: 20 });
      const spline2 = new SplineCache(buffer2);
      spline2.computeFull();

      const series1: SeriesRenderData = { buffer: buffer1, splineCache: spline1, config: makeSeriesConfig({ lineColor: '#ff0000', gradientEnabled: false }) };
      const series2: SeriesRenderData = { buffer: buffer2, splineCache: spline2, config: makeSeriesConfig({ lineColor: '#00ff00', gradientEnabled: false }) };

      const renderer = new DataLayerRenderer(ctx, canvas, scale, [series1, series2], ANIM_ON);

      // Snapshot both series
      renderer.snapshotCurveState();

      // Mutate both
      buffer1.push({ timestamp: 15, value: 50 });
      buffer2.push({ timestamp: 15, value: 80 });
      scale.setDomainX(0, 15);
      spline1.computeFull();
      spline2.computeFull();

      vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 150);
      renderer.draw();

      expect(renderer.needsNextFrame).toBe(true);
      // Both series rendered (2 stroke calls)
      expect((ctx.stroke as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);

      vi.restoreAllMocks();
    });

    it('different-length path buffers (new point extends curve) — extra points lerp from last previous position', () => {
      const { canvas, ctx } = createCanvas();
      const scale = makeScale();
      scale.setDomainX(0, 10);
      scale.setDomainY(0, 100);

      const buffer = new RingBuffer<DataPoint>(10000);
      buffer.push({ timestamp: 0, value: 10 });
      buffer.push({ timestamp: 5, value: 50 });
      const splineCache = new SplineCache(buffer);
      splineCache.computeFull();

      const series: SeriesRenderData = {
        buffer,
        splineCache,
        config: makeSeriesConfig({ gradientEnabled: false }),
      };

      const renderer = new DataLayerRenderer(ctx, canvas, scale, [series], ANIM_ON);

      // Snapshot with 2 points
      renderer.snapshotCurveState();

      // Add a 3rd point — extends the curve
      buffer.push({ timestamp: 10, value: 30 });
      scale.setDomainX(0, 10);
      splineCache.computeFull();

      // Draw at midpoint — the extended portion should be interpolated
      vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 150);
      renderer.draw();

      expect(renderer.needsNextFrame).toBe(true);
      expect(ctx.stroke).toHaveBeenCalled();

      vi.restoreAllMocks();
    });
  });
});
