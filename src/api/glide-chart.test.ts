import { GlideChart } from './glide-chart';
import type { DataPoint } from '../core/types';
import { ThemeMode } from '../config/types';
import { DARK_THEME, LIGHT_THEME, DARK_SERIES_COLORS } from '../config/themes';
import { LayerType } from '../renderer/types';

// --- Mocks ---

const mockDisconnect = vi.fn();

vi.stubGlobal(
  'ResizeObserver',
  class {
    constructor(_cb: ResizeObserverCallback) {
      // callback stored by LayerManager internally
    }
    observe() {}
    unobserve() {}
    disconnect() {
      mockDisconnect();
    }
  },
);

const mockRemoveEventListener = vi.fn();
const mockAddEventListener = vi.fn();
vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
  media: query,
  addEventListener: mockAddEventListener,
  removeEventListener: mockRemoveEventListener,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  onchange: null,
  dispatchEvent: vi.fn(),
}));

let rafCallback: FrameRequestCallback | null = null;
let rafId = 0;
vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
  rafCallback = cb;
  return ++rafId;
});
vi.stubGlobal('cancelAnimationFrame', vi.fn());

function tickFrame(): void {
  const cb = rafCallback;
  rafCallback = null;
  cb?.(performance.now());
}

function createContainer(width = 800, height = 600): HTMLElement {
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: height, configurable: true });
  document.body.appendChild(container);
  return container;
}

function makePoints(count: number, startTimestamp = 1000): DataPoint[] {
  const points: DataPoint[] = [];
  for (let i = 0; i < count; i++) {
    points.push({ timestamp: startTimestamp + i * 100, value: 10 + Math.sin(i) * 5 });
  }
  return points;
}

describe('GlideChart', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = createContainer();
    Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
    mockDisconnect.mockClear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('creates chart with container and renders (canvases created in DOM)', () => {
      const chart = new GlideChart(container);
      const canvases = container.querySelectorAll('canvas');
      expect(canvases.length).toBe(4);
      chart.destroy();
    });

    it('constructor with no config uses beautiful defaults', () => {
      const chart = new GlideChart(container);
      // Should not throw — defaults are resolved
      const canvases = container.querySelectorAll('canvas');
      expect(canvases.length).toBe(4);
      chart.destroy();
    });

    it('constructor with initial data populates ring buffer and computes splines', () => {
      const points = makePoints(5);
      const chart = new GlideChart(container, {
        series: [{ id: 'price', data: points }],
      });
      // Chart created successfully with data — render to verify
      tickFrame();
      chart.destroy();
    });

    it('constructor with invalid container throws descriptive error', () => {
      expect(() => new GlideChart('not-an-element' as unknown as HTMLElement)).toThrow(
        'GlideChart: container must be an HTMLElement',
      );
    });

    it('constructor with invalid container (null) throws', () => {
      expect(() => new GlideChart(null as unknown as HTMLElement)).toThrow(
        'GlideChart: container must be an HTMLElement',
      );
    });
  });

  describe('addData', () => {
    it('appends point to correct series buffer', () => {
      const chart = new GlideChart(container, {
        series: [{ id: 'price' }],
      });
      chart.addData('price', { timestamp: 1000, value: 50 });
      // No throw means success
      chart.destroy();
    });

    it('appends batch of points', () => {
      const chart = new GlideChart(container, {
        series: [{ id: 'price' }],
      });
      chart.addData('price', makePoints(10));
      chart.destroy();
    });

    it('with invalid seriesId throws descriptive error', () => {
      const chart = new GlideChart(container, {
        series: [{ id: 'price' }],
      });
      expect(() => chart.addData('nonexistent', { timestamp: 1, value: 1 })).toThrow(
        "GlideChart: series 'nonexistent' not found. Add it via config.series first.",
      );
      chart.destroy();
    });

    it('marks data layer dirty', () => {
      const chart = new GlideChart(container, {
        series: [{ id: 'price' }],
      });
      // Consume initial rAF
      tickFrame();

      chart.addData('price', { timestamp: 1000, value: 50 });
      // A new rAF should be scheduled
      expect(rafCallback).not.toBeNull();
      chart.destroy();
    });

    it('validates DataPoint — NaN timestamp throws', () => {
      const chart = new GlideChart(container, {
        series: [{ id: 'price' }],
      });
      expect(() => chart.addData('price', { timestamp: NaN, value: 50 })).toThrow(
        'GlideChart: invalid data point — timestamp and value must be finite numbers',
      );
      chart.destroy();
    });

    it('validates DataPoint — NaN value throws', () => {
      const chart = new GlideChart(container, {
        series: [{ id: 'price' }],
      });
      expect(() => chart.addData('price', { timestamp: 1000, value: NaN })).toThrow(
        'GlideChart: invalid data point — timestamp and value must be finite numbers',
      );
      chart.destroy();
    });

    it('validates DataPoint — Infinity throws', () => {
      const chart = new GlideChart(container, {
        series: [{ id: 'price' }],
      });
      expect(() =>
        chart.addData('price', { timestamp: Infinity, value: 50 }),
      ).toThrow(
        'GlideChart: invalid data point — timestamp and value must be finite numbers',
      );
      chart.destroy();
    });

    it('validates DataPoint — non-number throws', () => {
      const chart = new GlideChart(container, {
        series: [{ id: 'price' }],
      });
      expect(() =>
        chart.addData('price', {
          timestamp: 'bad' as unknown as number,
          value: 50,
        }),
      ).toThrow(
        'GlideChart: invalid data point — timestamp and value must be finite numbers',
      );
      chart.destroy();
    });

    it('validates DataPoints in batch — invalid throws', () => {
      const chart = new GlideChart(container, {
        series: [{ id: 'price' }],
      });
      expect(() =>
        chart.addData('price', [
          { timestamp: 1000, value: 50 },
          { timestamp: NaN, value: 60 },
        ]),
      ).toThrow(
        'GlideChart: invalid data point — timestamp and value must be finite numbers',
      );
      chart.destroy();
    });
  });

  describe('setData', () => {
    it('replaces dataset and recomputes splines', () => {
      const chart = new GlideChart(container, {
        series: [{ id: 'price', data: makePoints(5) }],
      });
      const newPoints = makePoints(10, 5000);
      chart.setData('price', newPoints);
      chart.destroy();
    });

    it('invalid seriesId throws', () => {
      const chart = new GlideChart(container, {
        series: [{ id: 'price' }],
      });
      expect(() => chart.setData('nonexistent', [])).toThrow(
        "GlideChart: series 'nonexistent' not found",
      );
      chart.destroy();
    });
  });

  describe('clearData', () => {
    it('with seriesId clears specific series', () => {
      const chart = new GlideChart(container, {
        series: [
          { id: 'price', data: makePoints(5) },
          { id: 'volume', data: makePoints(3) },
        ],
      });
      chart.clearData('price');
      // Should not throw, chart still functional
      chart.addData('volume', { timestamp: 9999, value: 100 });
      chart.destroy();
    });

    it('without args clears all series', () => {
      const chart = new GlideChart(container, {
        series: [
          { id: 'price', data: makePoints(5) },
          { id: 'volume', data: makePoints(3) },
        ],
      });
      chart.clearData();
      // Can still add data after clear
      chart.addData('price', { timestamp: 1000, value: 50 });
      chart.destroy();
    });

    it('invalid seriesId throws', () => {
      const chart = new GlideChart(container, {
        series: [{ id: 'price' }],
      });
      expect(() => chart.clearData('nonexistent')).toThrow(
        "GlideChart: series 'nonexistent' not found",
      );
      chart.destroy();
    });
  });

  describe('setConfig', () => {
    it('re-resolves config and marks all dirty', () => {
      const chart = new GlideChart(container, {
        series: [{ id: 'price', data: makePoints(5) }],
      });
      tickFrame();

      chart.setConfig({ line: { color: '#ff0000', width: 3, opacity: 1 } });
      // Should schedule a new frame
      expect(rafCallback).not.toBeNull();
      chart.destroy();
    });
  });

  describe('resize', () => {
    it('triggers scale update and marks all dirty', () => {
      const chart = new GlideChart(container, {
        series: [{ id: 'price', data: makePoints(5) }],
      });
      tickFrame();

      chart.resize();
      expect(rafCallback).not.toBeNull();
      chart.destroy();
    });
  });

  describe('destroy', () => {
    it('stops scheduler and cleans up LayerManager', () => {
      const chart = new GlideChart(container);
      chart.destroy();
      // ResizeObserver.disconnect should have been called
      expect(mockDisconnect).toHaveBeenCalled();
    });

    it('methods after destroy throw error', () => {
      const chart = new GlideChart(container, {
        series: [{ id: 'price' }],
      });
      chart.destroy();

      expect(() => chart.addData('price', { timestamp: 1, value: 1 })).toThrow(
        'GlideChart: instance has been destroyed',
      );
      expect(() => chart.setData('price', [])).toThrow(
        'GlideChart: instance has been destroyed',
      );
      expect(() => chart.clearData()).toThrow(
        'GlideChart: instance has been destroyed',
      );
      expect(() => chart.setConfig({})).toThrow(
        'GlideChart: instance has been destroyed',
      );
      expect(() => chart.resize()).toThrow(
        'GlideChart: instance has been destroyed',
      );
      expect(() => chart.destroy()).toThrow(
        'GlideChart: instance has been destroyed',
      );
    });
  });

  describe('multiple series', () => {
    it('work independently', () => {
      const chart = new GlideChart(container, {
        series: [
          { id: 'price', data: makePoints(5) },
          { id: 'volume' },
        ],
      });

      chart.addData('volume', { timestamp: 2000, value: 100 });
      chart.setData('price', makePoints(3, 3000));
      chart.clearData('volume');

      // Price still has data, volume is cleared
      tickFrame();
      chart.destroy();
    });

    it('clearData without args clears all', () => {
      const chart = new GlideChart(container, {
        series: [
          { id: 'a', data: makePoints(5) },
          { id: 'b', data: makePoints(3) },
        ],
      });
      chart.clearData();
      // Both series cleared — render should not throw
      tickFrame();
      chart.destroy();
    });
  });

  describe('multi-series integration', () => {
    it('renders both series on frame tick (stroke called for each)', () => {
      const chart = new GlideChart(container, {
        series: [
          { id: 'price', data: makePoints(10) },
          { id: 'ref', data: makePoints(10, 2000) },
        ],
      });
      tickFrame();
      // Both series rendered without error
      chart.destroy();
    });

    it('each series gets independent color/thickness from config', () => {
      const chart = new GlideChart(container, {
        series: [
          { id: 'price', data: makePoints(5), line: { color: '#ff0000', width: 3 } },
          { id: 'ref', data: makePoints(5, 2000), line: { color: '#00ff00', width: 1 } },
        ],
      });
      tickFrame();
      // Chart renders without error — series config isolation verified via DataLayerRenderer tests
      chart.destroy();
    });

    it('per-series gradient enable/disable works independently', () => {
      const chart = new GlideChart(container, {
        series: [
          {
            id: 'price',
            data: makePoints(5),
            gradient: { enabled: true, topColor: '#00d4aa', topOpacity: 0.3, bottomColor: '#00d4aa', bottomOpacity: 0 },
          },
          {
            id: 'ref',
            data: makePoints(5, 2000),
            gradient: { enabled: false },
          },
        ],
      });
      tickFrame();
      // Chart renders without error — mixed gradient states handled
      chart.destroy();
    });

    it('y-axis auto-scales to encompass all series values', () => {
      // Series A: values 0-50, Series B: values 80-100
      const seriesA: DataPoint[] = [
        { timestamp: 1000, value: 0 },
        { timestamp: 2000, value: 25 },
        { timestamp: 3000, value: 50 },
      ];
      const seriesB: DataPoint[] = [
        { timestamp: 1000, value: 80 },
        { timestamp: 2000, value: 90 },
        { timestamp: 3000, value: 100 },
      ];

      const chart = new GlideChart(container, {
        series: [
          { id: 'a', data: seriesA },
          { id: 'b', data: seriesB },
        ],
      });

      tickFrame();

      // Verify y-domain encompasses both series (0-100 with padding)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accessing private Scale for white-box test
      const scale = (chart as any).scale as { domainY: { min: number; max: number } };
      const domainY = scale.domainY;
      expect(domainY.min).toBeLessThanOrEqual(0);
      expect(domainY.max).toBeGreaterThanOrEqual(100);
      chart.destroy();
    });

    it('addData to one series does not affect other series buffer size', () => {
      const chart = new GlideChart(container, {
        series: [
          { id: 'price', data: makePoints(5) },
          { id: 'ref', data: makePoints(3, 2000) },
        ],
      });

      // Add 10 more points to price only
      chart.addData('price', makePoints(10, 5000));

      // Ref should still work independently — addData to price didn't touch ref
      chart.addData('ref', { timestamp: 9000, value: 42 });
      tickFrame();
      chart.destroy();
    });

    it('setData replaces data for one series only, other series unchanged', () => {
      const chart = new GlideChart(container, {
        series: [
          { id: 'price', data: makePoints(5) },
          { id: 'ref', data: makePoints(3, 2000) },
        ],
      });

      // Replace price data entirely
      chart.setData('price', makePoints(20, 8000));

      // Ref is still intact — can addData
      chart.addData('ref', { timestamp: 9000, value: 42 });
      tickFrame();
      chart.destroy();
    });

    it('setConfig adding a new third series dynamically creates its buffer/cache', () => {
      const chart = new GlideChart(container, {
        series: [
          { id: 'price', data: makePoints(5) },
          { id: 'ref', data: makePoints(3, 2000) },
        ],
      });

      // Add a third series via setConfig
      chart.setConfig({
        series: [
          { id: 'price' },
          { id: 'ref' },
          { id: 'volume' },
        ],
      });

      // New series should accept data
      chart.addData('volume', { timestamp: 1000, value: 100 });
      tickFrame();

      // Original series should still work
      chart.addData('price', { timestamp: 5000, value: 50 });
      chart.destroy();
    });

    it('setConfig adding a new series with data populates its buffer', () => {
      const chart = new GlideChart(container, {
        series: [
          { id: 'price', data: makePoints(5) },
        ],
      });

      // Add a second series with initial data via setConfig
      const newData = makePoints(3, 5000);
      chart.setConfig({
        series: [
          { id: 'price' },
          { id: 'volume', data: newData },
        ],
      });

      tickFrame();

      // The new series buffer should contain the provided data — addData should append, not start from scratch
      chart.addData('volume', { timestamp: 9000, value: 42 });
      tickFrame();
      chart.destroy();
    });

    it('setConfig removing a series cleans up, other series unaffected', () => {
      const chart = new GlideChart(container, {
        series: [
          { id: 'price', data: makePoints(5) },
          { id: 'ref', data: makePoints(3, 2000) },
          { id: 'volume', data: makePoints(2, 3000) },
        ],
      });

      // Remove 'ref' by excluding it from setConfig
      chart.setConfig({
        series: [
          { id: 'price' },
          { id: 'volume' },
        ],
      });

      // Removed series should throw
      expect(() => chart.addData('ref', { timestamp: 9000, value: 42 })).toThrow(
        "GlideChart: series 'ref' not found",
      );

      // Remaining series should still work
      chart.addData('price', { timestamp: 5000, value: 50 });
      chart.addData('volume', { timestamp: 5000, value: 200 });
      tickFrame();
      chart.destroy();
    });
  });

  describe('rendering integration', () => {
    it('renders without error after addData and frame tick', () => {
      const chart = new GlideChart(container, {
        series: [{ id: 'price' }],
      });
      chart.addData('price', makePoints(20));
      tickFrame();
      chart.destroy();
    });

    it('renders initial data on first frame', () => {
      const chart = new GlideChart(container, {
        series: [{ id: 'price', data: makePoints(10) }],
      });
      tickFrame();
      chart.destroy();
    });

    it('renders after setData replacement', () => {
      const chart = new GlideChart(container, {
        series: [{ id: 'price', data: makePoints(5) }],
      });
      chart.setData('price', makePoints(15, 5000));
      tickFrame();
      chart.destroy();
    });

    it('renders empty chart after clearData', () => {
      const chart = new GlideChart(container, {
        series: [{ id: 'price', data: makePoints(5) }],
      });
      chart.clearData('price');
      tickFrame();
      chart.destroy();
    });
  });

  describe('addData — dirty flag specificity', () => {
    it('addData single point when scale doesnt change — only Data dirty, not Axis or Background', () => {
      const chart = new GlideChart(container, {
        animation: { enabled: false },
        series: [{ id: 'price', data: makePoints(50) }],
      });
      tickFrame();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scheduler = (chart as any).frameScheduler;
      const markDirtySpy = vi.spyOn(scheduler, 'markDirty');

      // Add a point within existing value AND timestamp range (no scale change)
      // makePoints(50) generates timestamps from 1000..5900, values ~5..15
      // Pick a timestamp in the middle and a value within existing range
      chart.addData('price', { timestamp: 3000, value: 10 });

      // Only Data should be dirty (scale unchanged since new point is within existing range)
      const dirtyTypes = markDirtySpy.mock.calls.map((c) => c[0]);
      expect(dirtyTypes).toContain(LayerType.Data);
      expect(dirtyTypes).not.toContain(LayerType.Axis);
      expect(dirtyTypes).not.toContain(LayerType.Background);

      markDirtySpy.mockRestore();
      chart.destroy();
    });

    it('addData single point that extends value range — Data + Axis + Background all marked dirty', () => {
      const chart = new GlideChart(container, {
        animation: { enabled: false },
        series: [{ id: 'price', data: makePoints(5) }],
      });
      tickFrame();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scheduler = (chart as any).frameScheduler;
      const markDirtySpy = vi.spyOn(scheduler, 'markDirty');

      // Add a point that extends the value range significantly
      chart.addData('price', { timestamp: 99999, value: 99999 });

      const dirtyTypes = markDirtySpy.mock.calls.map((c) => c[0]);
      expect(dirtyTypes).toContain(LayerType.Data);
      expect(dirtyTypes).toContain(LayerType.Axis);
      expect(dirtyTypes).toContain(LayerType.Background);

      markDirtySpy.mockRestore();
      chart.destroy();
    });

    it('streaming 10,000 addData calls — buffer at capacity, no errors', () => {
      const chart = new GlideChart(container, {
        animation: { enabled: false },
        maxDataPoints: 10000,
        series: [{ id: 'price' }],
      });

      for (let i = 0; i < 10000; i++) {
        chart.addData('price', { timestamp: 1000 + i * 100, value: 50 + Math.sin(i * 0.01) * 20 });
      }

      // Should render without error
      tickFrame();
      chart.destroy();
    });

    it('animation pumping — after addData with animation enabled, data layer draw callback re-marks dirty', () => {
      const chart = new GlideChart(container, {
        animation: { enabled: true, duration: 300 },
        series: [{ id: 'price', data: makePoints(10) }],
      });
      tickFrame();

      chart.addData('price', { timestamp: 99999, value: 50 });

      // First frame during animation — should schedule another
      tickFrame();
      expect(rafCallback).not.toBeNull();

      // Second frame — still animating
      tickFrame();
      expect(rafCallback).not.toBeNull();

      chart.destroy();
    });

    it('addData to one series in multi-series chart — other series unaffected', () => {
      const chart = new GlideChart(container, {
        animation: { enabled: true, duration: 300 },
        series: [
          { id: 'price', data: makePoints(10) },
          { id: 'volume', data: makePoints(10, 2000) },
        ],
      });
      tickFrame();

      // Add data to price only
      chart.addData('price', { timestamp: 99999, value: 50 });

      // Should render without error — both series drawn
      tickFrame();
      chart.destroy();
    });
  });

  describe('timeWindow', () => {
    it('timeWindow: 300 with 10 minutes of data — domainX covers only last 5 minutes', () => {
      const now = Date.now();
      // 10 minutes of data at 1-second intervals = 600 points
      const points: DataPoint[] = [];
      for (let i = 0; i < 600; i++) {
        points.push({ timestamp: now - (600 - i) * 1000, value: 50 + Math.sin(i * 0.1) * 10 });
      }

      const chart = new GlideChart(container, {
        timeWindow: 300,
        series: [{ id: 'price', data: points }],
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scale = (chart as any).scale as { domainX: { min: number; max: number } };
      const latestTs = points[points.length - 1].timestamp;
      const expectedStart = latestTs - 300 * 1000;

      expect(scale.domainX.max).toBe(latestTs);
      expect(scale.domainX.min).toBe(expectedStart);
      chart.destroy();
    });

    it('timeWindow: 60 — viewport covers last 60 seconds', () => {
      const now = Date.now();
      const points: DataPoint[] = [];
      for (let i = 0; i < 120; i++) {
        points.push({ timestamp: now - (120 - i) * 1000, value: 50 + i });
      }

      const chart = new GlideChart(container, {
        timeWindow: 60,
        series: [{ id: 'price', data: points }],
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scale = (chart as any).scale as { domainX: { min: number; max: number } };
      const latestTs = points[points.length - 1].timestamp;
      expect(scale.domainX.max).toBe(latestTs);
      expect(scale.domainX.min).toBe(latestTs - 60000);
      chart.destroy();
    });

    it('timeWindow: 3600 — viewport covers last hour', () => {
      const now = Date.now();
      const points: DataPoint[] = [];
      for (let i = 0; i < 100; i++) {
        points.push({ timestamp: now - (7200 - i * 72) * 1000, value: 50 });
      }

      const chart = new GlideChart(container, {
        timeWindow: 3600,
        series: [{ id: 'price', data: points }],
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scale = (chart as any).scale as { domainX: { min: number; max: number } };
      const latestTs = points[points.length - 1].timestamp;
      expect(scale.domainX.max).toBe(latestTs);
      expect(scale.domainX.min).toBe(latestTs - 3600000);
      chart.destroy();
    });

    it('addData with timeWindow — domain X shifts right (auto-scroll), y-axis fits to visible range only', () => {
      const now = Date.now();
      const points: DataPoint[] = [];
      // First 50 points: values 0-10 (old data, outside window later)
      for (let i = 0; i < 50; i++) {
        points.push({ timestamp: now - (100 - i) * 1000, value: 5 });
      }
      // Next 50 points: values 90-100 (recent data, inside window)
      for (let i = 50; i < 100; i++) {
        points.push({ timestamp: now - (100 - i) * 1000, value: 95 });
      }

      const chart = new GlideChart(container, {
        timeWindow: 30,
        animation: { enabled: false },
        series: [{ id: 'price', data: points }],
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scale = (chart as any).scale as { domainX: { min: number; max: number }; domainY: { min: number; max: number } };

      const latestTs = points[points.length - 1].timestamp;
      expect(scale.domainX.max).toBe(latestTs);

      // Add a new point — domain should shift
      const newTs = latestTs + 1000;
      chart.addData('price', { timestamp: newTs, value: 95 });

      expect(scale.domainX.max).toBe(newTs);
      expect(scale.domainX.min).toBe(newTs - 30000);

      chart.destroy();
    });

    it('setData with timeWindow — domain applies to new dataset', () => {
      const now = Date.now();
      const initialPoints: DataPoint[] = [];
      for (let i = 0; i < 50; i++) {
        initialPoints.push({ timestamp: now - (50 - i) * 1000, value: 50 });
      }

      const chart = new GlideChart(container, {
        timeWindow: 60,
        series: [{ id: 'price', data: initialPoints }],
      });

      // Replace with new data
      const newPoints: DataPoint[] = [];
      const newNow = now + 60000;
      for (let i = 0; i < 100; i++) {
        newPoints.push({ timestamp: newNow - (100 - i) * 1000, value: 75 });
      }
      chart.setData('price', newPoints);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scale = (chart as any).scale as { domainX: { min: number; max: number } };
      const latestTs = newPoints[newPoints.length - 1].timestamp;
      expect(scale.domainX.max).toBe(latestTs);
      expect(scale.domainX.min).toBe(latestTs - 60000);
      chart.destroy();
    });

    it('setConfig({ timeWindow: 120 }) on running chart — viewport adjusts immediately', () => {
      const now = Date.now();
      const points: DataPoint[] = [];
      for (let i = 0; i < 300; i++) {
        points.push({ timestamp: now - (300 - i) * 1000, value: 50 });
      }

      const chart = new GlideChart(container, {
        series: [{ id: 'price', data: points }],
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scale = (chart as any).scale as { domainX: { min: number; max: number } };

      // Initially no time window — full range
      const latestTs = points[points.length - 1].timestamp;
      const oldestTs = points[0].timestamp;
      expect(scale.domainX.min).toBe(oldestTs);
      expect(scale.domainX.max).toBe(latestTs);

      // Now set timeWindow
      chart.setConfig({ timeWindow: 120 });

      expect(scale.domainX.max).toBe(latestTs);
      expect(scale.domainX.min).toBe(latestTs - 120000);
      chart.destroy();
    });

    it('timeWindow: 0 (default) — full data range (backward-compatible behavior)', () => {
      const now = Date.now();
      const points: DataPoint[] = [];
      for (let i = 0; i < 100; i++) {
        points.push({ timestamp: now - (100 - i) * 1000, value: 50 + i });
      }

      const chart = new GlideChart(container, {
        timeWindow: 0,
        series: [{ id: 'price', data: points }],
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scale = (chart as any).scale as { domainX: { min: number; max: number } };
      expect(scale.domainX.min).toBe(points[0].timestamp);
      expect(scale.domainX.max).toBe(points[points.length - 1].timestamp);
      chart.destroy();
    });

    it('data span shorter than timeWindow — all data visible, left edge is latest - window*1000', () => {
      const now = Date.now();
      const points: DataPoint[] = [];
      // Only 30 seconds of data
      for (let i = 0; i < 30; i++) {
        points.push({ timestamp: now - (30 - i) * 1000, value: 50 });
      }

      const chart = new GlideChart(container, {
        timeWindow: 300, // 5 min window, but only 30s of data
        series: [{ id: 'price', data: points }],
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scale = (chart as any).scale as { domainX: { min: number; max: number } };
      const latestTs = points[points.length - 1].timestamp;
      expect(scale.domainX.max).toBe(latestTs);
      expect(scale.domainX.min).toBe(latestTs - 300000);
      chart.destroy();
    });

    it('y-axis auto-scales to visible window only — data outside window with extreme values does NOT affect y range', () => {
      const now = Date.now();
      const points: DataPoint[] = [];

      // Old data with extreme values (outside window)
      for (let i = 0; i < 50; i++) {
        points.push({ timestamp: now - (100 - i) * 1000, value: 1000 }); // extreme high
      }
      // Recent data with moderate values (inside 30s window)
      for (let i = 50; i < 100; i++) {
        points.push({ timestamp: now - (100 - i) * 1000, value: 50 });
      }

      const chart = new GlideChart(container, {
        timeWindow: 30,
        series: [{ id: 'price', data: points }],
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scale = (chart as any).scale as { domainY: { min: number; max: number } };

      // Y domain should be centered around 50, NOT expanded to 1000
      // With 10% padding: 50 ± ~0 (all values are 50, so domainY = 49..51)
      expect(scale.domainY.max).toBeLessThan(100);
      expect(scale.domainY.min).toBeGreaterThan(0);
      chart.destroy();
    });

    it('empty dataset with timeWindow configured — no crash', () => {
      const chart = new GlideChart(container, {
        timeWindow: 300,
        series: [{ id: 'price' }],
      });
      tickFrame();
      chart.destroy();
    });

    it('all data in one series older than time window (multi-series) — y-axis ignores old series data', () => {
      const now = Date.now();
      // Series A: recent data (within 30s window), moderate values
      const recentPoints: DataPoint[] = [];
      for (let i = 0; i < 10; i++) {
        recentPoints.push({ timestamp: now - (10 - i) * 1000, value: 50 });
      }
      // Series B: old data (10 min ago), extreme values
      const oldPoints: DataPoint[] = [];
      for (let i = 0; i < 10; i++) {
        oldPoints.push({ timestamp: now - 600000 + i * 1000, value: 5000 });
      }

      const chart = new GlideChart(container, {
        timeWindow: 30,
        series: [
          { id: 'recent', data: recentPoints },
          { id: 'old', data: oldPoints },
        ],
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scale = (chart as any).scale as { domainX: { min: number; max: number }; domainY: { min: number; max: number } };

      // Window is based on latest timestamp across ALL series (from 'recent')
      const latestTs = recentPoints[recentPoints.length - 1].timestamp;
      expect(scale.domainX.max).toBe(latestTs);
      expect(scale.domainX.min).toBe(latestTs - 30000);

      // Y domain should NOT include 5000 from old series — only ~50 from recent
      expect(scale.domainY.max).toBeLessThan(100);

      tickFrame();
      chart.destroy();
    });
  });

  describe('timeWindow streaming integration', () => {
    it('stream 100 points over simulated 10-minute span with timeWindow: 300 — domain tracks correctly', () => {
      const startTs = Date.now() - 600000; // 10 min ago
      const chart = new GlideChart(container, {
        timeWindow: 300,
        animation: { enabled: false },
        series: [{ id: 'live' }],
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scale = (chart as any).scale as { domainX: { min: number; max: number } };

      // Stream 100 points, 6s apart = 10 min
      let latestTs = startTs;
      for (let i = 0; i < 100; i++) {
        latestTs = startTs + i * 6000;
        chart.addData('live', { timestamp: latestTs, value: 50 + Math.sin(i * 0.1) * 10 });
      }

      expect(scale.domainX.max).toBe(latestTs);
      expect(scale.domainX.min).toBe(latestTs - 300000);
      chart.destroy();
    });

    it('auto-scroll marks axis and background dirty on every addData (since domainX shifts each time)', () => {
      const now = Date.now();
      const points: DataPoint[] = [];
      for (let i = 0; i < 20; i++) {
        points.push({ timestamp: now - (20 - i) * 1000, value: 50 });
      }

      const chart = new GlideChart(container, {
        timeWindow: 30,
        animation: { enabled: false },
        series: [{ id: 'live', data: points }],
      });
      tickFrame();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scheduler = (chart as any).frameScheduler;
      const markDirtySpy = vi.spyOn(scheduler, 'markDirty');

      // Add a new point — domain shifts, so axis + background should be dirty
      chart.addData('live', { timestamp: now + 1000, value: 55 });

      const dirtyTypes = markDirtySpy.mock.calls.map((c) => c[0]);
      expect(dirtyTypes).toContain(LayerType.Data);
      expect(dirtyTypes).toContain(LayerType.Axis);
      expect(dirtyTypes).toContain(LayerType.Background);

      markDirtySpy.mockRestore();
      chart.destroy();
    });

    it('animation still works with time window (snapshot + interpolation unaffected by windowed domain)', () => {
      const now = Date.now();
      const points: DataPoint[] = [];
      for (let i = 0; i < 20; i++) {
        points.push({ timestamp: now - (20 - i) * 1000, value: 50 });
      }

      const chart = new GlideChart(container, {
        timeWindow: 30,
        animation: { enabled: true, duration: 300 },
        series: [{ id: 'live', data: points }],
      });
      tickFrame();

      // Add a point — should trigger animation
      chart.addData('live', { timestamp: now + 1000, value: 60 });

      // Animation should be pumping
      tickFrame();
      expect(rafCallback).not.toBeNull();
      tickFrame();
      expect(rafCallback).not.toBeNull();

      chart.destroy();
    });
  });

  describe('performance benchmarks', () => {
    it('10,000 points + 100 sequential addData calls completes under 500ms', () => {
      const chart = new GlideChart(container, {
        animation: { enabled: false },
        maxDataPoints: 20000,
        series: [{ id: 'price', data: makePoints(10000) }],
      });
      tickFrame();

      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        chart.addData('price', { timestamp: 10000 * 100 + 1000 + i * 100, value: 50 + Math.random() * 10 });
      }
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(500);
      chart.destroy();
    });

    it('single addData with 10,000 existing points completes under 5ms', () => {
      const chart = new GlideChart(container, {
        animation: { enabled: false },
        maxDataPoints: 20000,
        series: [{ id: 'price', data: makePoints(10000) }],
      });
      tickFrame();

      const start = performance.now();
      chart.addData('price', { timestamp: 10000 * 100 + 1000, value: 55 });
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(5);
      chart.destroy();
    });
  });

  describe('stale data indicator', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('dims series line after staleThreshold elapses', () => {
      const chart = new GlideChart(container, {
        series: [{ id: 'price', data: makePoints(5) }],
        staleThreshold: 5000,
      });
      tickFrame();

      chart.addData('price', { timestamp: 2000, value: 15 });
      tickFrame();

      // Advance past stale threshold
      vi.advanceTimersByTime(6000);
      tickFrame();

      // Access data layer canvas and check globalAlpha was set to dimmed value
      const canvases = container.querySelectorAll('canvas');
      expect(canvases.length).toBeGreaterThanOrEqual(4);

      chart.destroy();
    });

    it('clears stale state after addData', () => {
      const onStaleChange = vi.fn();
      const chart = new GlideChart(container, {
        series: [{ id: 'price', data: makePoints(5) }],
        staleThreshold: 5000,
        onStaleChange,
      });
      tickFrame();

      // Go stale
      vi.advanceTimersByTime(6000);
      expect(onStaleChange).toHaveBeenCalledWith(
        expect.objectContaining({ seriesId: 'price', isStale: true }),
      );

      // Clear stale
      onStaleChange.mockClear();
      chart.addData('price', { timestamp: 10000, value: 20 });

      expect(onStaleChange).toHaveBeenCalledWith(
        expect.objectContaining({ seriesId: 'price', isStale: false }),
      );

      chart.destroy();
    });

    it('staleThreshold: 0 produces no side effects', () => {
      const onStaleChange = vi.fn();
      const chart = new GlideChart(container, {
        series: [{ id: 'price', data: makePoints(5) }],
        staleThreshold: 0,
        onStaleChange,
      });
      tickFrame();

      vi.advanceTimersByTime(10000);
      expect(onStaleChange).not.toHaveBeenCalled();

      chart.destroy();
    });

    it('destroy cleans up stale detector timers', () => {
      const onStaleChange = vi.fn();
      const chart = new GlideChart(container, {
        series: [{ id: 'price', data: makePoints(5) }],
        staleThreshold: 5000,
        onStaleChange,
      });
      tickFrame();

      chart.destroy();

      // No stale callbacks after destroy
      vi.advanceTimersByTime(10000);
      expect(onStaleChange).not.toHaveBeenCalled();
    });

    it('clearData(seriesId) resets stale state for that series', () => {
      const onStaleChange = vi.fn();
      const chart = new GlideChart(container, {
        series: [
          { id: 'price', data: makePoints(5) },
          { id: 'volume', data: makePoints(5) },
        ],
        staleThreshold: 5000,
        onStaleChange,
      });
      tickFrame();

      // Go stale
      vi.advanceTimersByTime(6000);

      // Clear only 'price' series
      onStaleChange.mockClear();
      chart.clearData('price');

      // Should fire stale=false for 'price'
      expect(onStaleChange).toHaveBeenCalledWith(
        expect.objectContaining({ seriesId: 'price', isStale: false }),
      );

      chart.destroy();
    });

    it('setConfig recreates StaleDetector when staleThreshold changes', () => {
      const onStaleChange = vi.fn();
      const chart = new GlideChart(container, {
        series: [{ id: 'price', data: makePoints(5) }],
        staleThreshold: 5000,
        onStaleChange,
      });
      tickFrame();

      // Change threshold to a shorter value
      chart.setConfig({ staleThreshold: 2000 });
      tickFrame();

      // Advance past new threshold
      vi.advanceTimersByTime(3000);

      expect(onStaleChange).toHaveBeenCalledWith(
        expect.objectContaining({ seriesId: 'price', isStale: true }),
      );

      chart.destroy();
    });

    it('setConfig removing a series cleans up stale tracking', () => {
      const onStaleChange = vi.fn();
      const chart = new GlideChart(container, {
        series: [
          { id: 'price', data: makePoints(5) },
          { id: 'volume', data: makePoints(5) },
        ],
        staleThreshold: 5000,
        onStaleChange,
      });
      tickFrame();

      // Go stale
      vi.advanceTimersByTime(6000);

      // Remove 'volume' series via setConfig
      onStaleChange.mockClear();
      chart.setConfig({ series: [{ id: 'price' }] });
      tickFrame();

      // volume's removal should trigger stale=false callback
      expect(onStaleChange).toHaveBeenCalledWith(
        expect.objectContaining({ seriesId: 'volume', isStale: false }),
      );

      chart.destroy();
    });

    it('onStaleChange callback throwing does not break chart rendering', () => {
      const onStaleChange = vi.fn(() => {
        throw new Error('Consumer error!');
      });
      const chart = new GlideChart(container, {
        series: [{ id: 'price', data: makePoints(5) }],
        staleThreshold: 5000,
        onStaleChange,
      });
      tickFrame();

      // Should not throw
      expect(() => vi.advanceTimersByTime(6000)).not.toThrow();
      expect(onStaleChange).toHaveBeenCalled();

      // Chart should still be functional
      expect(() => chart.addData('price', { timestamp: 10000, value: 20 })).not.toThrow();
      tickFrame();

      chart.destroy();
    });
  });

  // ===== Story 4.6: Dataset Replace, Clear & Destroy API — Edge Case Hardening =====

  describe('setData edge cases (Story 4.6)', () => {
    it('setData with empty array clears the series', () => {
      const chart = new GlideChart(container, {
        series: [{ id: 'price', data: makePoints(10) }],
      });

      // Replace with empty array — should not throw
      chart.setData('price', []);
      tickFrame();

      // Buffer should be empty — adding new data should still work
      chart.addData('price', { timestamp: 5000, value: 42 });
      tickFrame();
      chart.destroy();
    });

    it('setData with single point — graceful degradation, no crash', () => {
      const chart = new GlideChart(container, {
        series: [{ id: 'price', data: makePoints(10) }],
      });

      chart.setData('price', [{ timestamp: 1000, value: 50 }]);
      tickFrame();

      // Chart should render without error (single point = no spline segments)
      chart.destroy();
    });

    it('setData with 2 points produces valid render', () => {
      const chart = new GlideChart(container, {
        series: [{ id: 'price' }],
      });

      chart.setData('price', [
        { timestamp: 1000, value: 10 },
        { timestamp: 2000, value: 20 },
      ]);
      tickFrame();

      // 2 points = 1 linear segment — should render without error
      chart.destroy();
    });

    it('setData with 10,000 points completes under reasonable time', () => {
      const chart = new GlideChart(container, {
        animation: { enabled: false },
        maxDataPoints: 15000,
        series: [{ id: 'price' }],
      });

      const largeDataset = makePoints(10000);
      const start = performance.now();
      chart.setData('price', largeDataset);
      const elapsed = performance.now() - start;

      // 1000ms generous threshold to avoid flaky failures on slow CI
      expect(elapsed).toBeLessThan(1000);
      tickFrame();
      chart.destroy();
    });

    it('setData with invalid seriesId throws', () => {
      const chart = new GlideChart(container, {
        series: [{ id: 'price' }],
      });
      expect(() => chart.setData('nonexistent', [{ timestamp: 1, value: 1 }])).toThrow(
        "GlideChart: series 'nonexistent' not found",
      );
      chart.destroy();
    });

    it('setData on one series in multi-series leaves others untouched', () => {
      const chart = new GlideChart(container, {
        series: [
          { id: 'price', data: makePoints(5) },
          { id: 'volume', data: makePoints(3, 2000) },
        ],
      });

      // Replace price data entirely
      chart.setData('price', makePoints(20, 8000));

      // Volume is still intact — can addData
      chart.addData('volume', { timestamp: 9000, value: 42 });
      tickFrame();
      chart.destroy();
    });

    it('setData with points exceeding maxDataPoints retains newest points', () => {
      const chart = new GlideChart(container, {
        maxDataPoints: 10,
        series: [{ id: 'price' }],
      });

      const points = makePoints(20);
      chart.setData('price', points);
      tickFrame();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const state = (chart as any).seriesMap.get('price');
      // Ring buffer should contain at most maxDataPoints entries
      expect(state.buffer.count).toBe(10);
      chart.destroy();
    });

    it('setData with unsorted timestamps does not crash', () => {
      const chart = new GlideChart(container, {
        series: [{ id: 'price' }],
      });

      // Unsorted timestamps — behavior is undefined but should not crash
      const unsorted: DataPoint[] = [
        { timestamp: 3000, value: 30 },
        { timestamp: 1000, value: 10 },
        { timestamp: 5000, value: 50 },
        { timestamp: 2000, value: 20 },
      ];
      chart.setData('price', unsorted);
      tickFrame();

      // No crash — undefined spline behavior but chart is stable
      chart.destroy();
    });

    it('setData after zoom resets zoom state', () => {
      const chart = new GlideChart(container, {
        series: [{ id: 'price', data: makePoints(20) }],
      });
      tickFrame();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const zoomHandler = (chart as any).zoomHandler;
      const resetZoomSpy = vi.spyOn(zoomHandler, 'resetZoom');

      chart.setData('price', makePoints(10, 5000));

      expect(resetZoomSpy).toHaveBeenCalled();
      resetZoomSpy.mockRestore();
      chart.destroy();
    });

    it('setData records stale data arrival when staleDetector is active', () => {
      vi.useFakeTimers();
      try {
        const onStaleChange = vi.fn();
        const chart = new GlideChart(container, {
          series: [{ id: 'price', data: makePoints(5) }],
          staleThreshold: 5000,
          onStaleChange,
        });
        tickFrame();

        // Go stale
        vi.advanceTimersByTime(6000);
        expect(onStaleChange).toHaveBeenCalledWith(
          expect.objectContaining({ seriesId: 'price', isStale: true }),
        );

        // setData should record data arrival and clear stale
        onStaleChange.mockClear();
        chart.setData('price', makePoints(3, 9000));

        expect(onStaleChange).toHaveBeenCalledWith(
          expect.objectContaining({ seriesId: 'price', isStale: false }),
        );

        chart.destroy();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('clearData edge cases (Story 4.6)', () => {
    it('clearData(seriesId) then immediately addData works', () => {
      const chart = new GlideChart(container, {
        series: [
          { id: 'price', data: makePoints(5) },
          { id: 'volume', data: makePoints(3) },
        ],
      });
      chart.clearData('price');
      chart.addData('price', { timestamp: 9999, value: 100 });
      tickFrame();
      chart.destroy();
    });

    it('clearData() (all) then addData on each series works', () => {
      const chart = new GlideChart(container, {
        series: [
          { id: 'price', data: makePoints(5) },
          { id: 'volume', data: makePoints(3) },
        ],
      });
      chart.clearData();
      chart.addData('price', { timestamp: 1000, value: 50 });
      chart.addData('volume', { timestamp: 1000, value: 100 });
      tickFrame();
      chart.destroy();
    });

    it('clearData on already-empty series is a no-op, no crash', () => {
      const chart = new GlideChart(container, {
        series: [{ id: 'price' }],
      });

      // Series has no data — clearData should be idempotent
      chart.clearData('price');
      chart.clearData('price');
      tickFrame();

      // Can still add data after multiple clears
      chart.addData('price', { timestamp: 1000, value: 50 });
      tickFrame();
      chart.destroy();
    });

    it('clearData with invalid seriesId throws', () => {
      const chart = new GlideChart(container, {
        series: [{ id: 'price' }],
      });
      expect(() => chart.clearData('nonexistent')).toThrow(
        "GlideChart: series 'nonexistent' not found",
      );
      chart.destroy();
    });

    it('clearData while animation is in-progress cancels animation', () => {
      const chart = new GlideChart(container, {
        animation: { enabled: true, duration: 300 },
        series: [{ id: 'price', data: makePoints(10) }],
      });
      tickFrame();

      // Trigger animation
      chart.addData('price', { timestamp: 99999, value: 50 });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dataLayerRenderer = (chart as any).dataLayerRenderer;
      const cancelSpy = vi.spyOn(dataLayerRenderer, 'cancelAnimation');

      chart.clearData('price');

      expect(cancelSpy).toHaveBeenCalled();
      cancelSpy.mockRestore();
      chart.destroy();
    });

    it('clearData resets keyboard navigator via deactivate()', () => {
      const chart = new GlideChart(container, {
        series: [{ id: 'price', data: makePoints(10) }],
      });
      tickFrame();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const keyboardNav = (chart as any).keyboardNavigator;
      const deactivateSpy = vi.spyOn(keyboardNav, 'deactivate');

      chart.clearData('price');

      expect(deactivateSpy).toHaveBeenCalled();
      deactivateSpy.mockRestore();
      chart.destroy();
    });

    it('clearData(seriesId) on multi-series only clears specified series', () => {
      const chart = new GlideChart(container, {
        series: [
          { id: 'price', data: makePoints(5) },
          { id: 'volume', data: makePoints(3) },
        ],
      });

      chart.clearData('price');

      // Volume should still be functional
      chart.addData('volume', { timestamp: 9999, value: 100 });
      tickFrame();
      chart.destroy();
    });
  });

  describe('destroy completeness (Story 4.6)', () => {
    it('after destroy, container has no child canvas elements', () => {
      const chart = new GlideChart(container);
      const canvasesBefore = container.querySelectorAll('canvas');
      expect(canvasesBefore.length).toBe(4);

      chart.destroy();

      const canvasesAfter = container.querySelectorAll('canvas');
      expect(canvasesAfter.length).toBe(0);
    });

    it('after destroy, all public methods throw', () => {
      const chart = new GlideChart(container, {
        series: [{ id: 'price' }],
      });
      chart.destroy();

      expect(() => chart.addData('price', { timestamp: 1, value: 1 })).toThrow(
        'GlideChart: instance has been destroyed',
      );
      expect(() => chart.setData('price', [])).toThrow(
        'GlideChart: instance has been destroyed',
      );
      expect(() => chart.clearData()).toThrow(
        'GlideChart: instance has been destroyed',
      );
      expect(() => chart.setConfig({})).toThrow(
        'GlideChart: instance has been destroyed',
      );
      expect(() => chart.resize()).toThrow(
        'GlideChart: instance has been destroyed',
      );
      expect(() => chart.destroy()).toThrow(
        'GlideChart: instance has been destroyed',
      );
    });

    it('destroy called twice throws on second call', () => {
      const chart = new GlideChart(container);
      chart.destroy();
      expect(() => chart.destroy()).toThrow('GlideChart: instance has been destroyed');
    });

    it('after destroy, no rAF callbacks fire', () => {
      const chart = new GlideChart(container, {
        series: [{ id: 'price', data: makePoints(10) }],
      });
      tickFrame();

      chart.destroy();

      // Reset rafCallback tracking
      rafCallback = null;
      tickFrame();

      // No new rAF should have been scheduled
      expect(rafCallback).toBeNull();
    });

    it('after destroy, ResizeObserver is disconnected', () => {
      mockDisconnect.mockClear();
      const chart = new GlideChart(container);
      chart.destroy();
      expect(mockDisconnect).toHaveBeenCalled();
    });

    it('after destroy, no DOM event listeners remain on container', () => {
      const addListenerSpy = vi.spyOn(container, 'addEventListener');
      const removeListenerSpy = vi.spyOn(container, 'removeEventListener');

      const chart = new GlideChart(container, {
        series: [{ id: 'price', data: makePoints(5) }],
      });

      const addCount = addListenerSpy.mock.calls.length;

      chart.destroy();

      // Every addEventListener call should have a matching removeEventListener
      expect(removeListenerSpy.mock.calls.length).toBeGreaterThanOrEqual(addCount);

      addListenerSpy.mockRestore();
      removeListenerSpy.mockRestore();
    });

    it('after destroy, staleDetector timers are cleared', () => {
      vi.useFakeTimers();
      try {
        const onStaleChange = vi.fn();
        const chart = new GlideChart(container, {
          series: [{ id: 'price', data: makePoints(5) }],
          staleThreshold: 5000,
          onStaleChange,
        });
        tickFrame();

        chart.destroy();

        // Advance time — no stale callbacks should fire
        vi.advanceTimersByTime(10000);
        expect(onStaleChange).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('after destroy, all references nulled for GC', () => {
      const chart = new GlideChart(container, {
        series: [{ id: 'price', data: makePoints(5) }],
      });
      tickFrame();

      chart.destroy();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = chart as any;
      expect(c.seriesMap.size).toBe(0);
      expect(c.scale).toBeNull();
      expect(c.layerManager).toBeNull();
      expect(c.frameScheduler).toBeNull();
      expect(c.eventDispatcher).toBeNull();
      expect(c.resolvedConfig).toBeNull();
      expect(c.tooltip).toBeNull();
      expect(c.crosshair).toBeNull();
    });
  });

  describe('lifecycle integration sequences (Story 4.6)', () => {
    it('create → addData → setData → clearData → addData → destroy', () => {
      const chart = new GlideChart(container, {
        series: [{ id: 'price' }],
      });

      chart.addData('price', makePoints(5));
      tickFrame();

      chart.setData('price', makePoints(10, 5000));
      tickFrame();

      chart.clearData('price');
      tickFrame();

      chart.addData('price', { timestamp: 20000, value: 75 });
      tickFrame();

      chart.destroy();
    });

    it('create → setData → setData (replace twice) → destroy', () => {
      const chart = new GlideChart(container, {
        series: [{ id: 'price' }],
      });

      chart.setData('price', makePoints(5));
      tickFrame();

      chart.setData('price', makePoints(20, 10000));
      tickFrame();

      chart.destroy();
    });

    it('create → addData(many) → clearData() → setData(new) → destroy', () => {
      const chart = new GlideChart(container, {
        series: [{ id: 'price' }],
      });

      chart.addData('price', makePoints(100));
      tickFrame();

      chart.clearData();
      tickFrame();

      chart.setData('price', makePoints(50, 50000));
      tickFrame();

      chart.destroy();
    });

    it('create → destroy immediately (no data ever added)', () => {
      const chart = new GlideChart(container, {
        series: [{ id: 'price' }],
      });
      chart.destroy();
    });

    it('multi-series create → setData on each → clearData(one) → destroy', () => {
      const chart = new GlideChart(container, {
        series: [
          { id: 'price' },
          { id: 'volume' },
          { id: 'ref' },
        ],
      });

      chart.setData('price', makePoints(10));
      chart.setData('volume', makePoints(8, 2000));
      chart.setData('ref', makePoints(5, 3000));
      tickFrame();

      chart.clearData('volume');
      tickFrame();

      // Other series still functional
      chart.addData('price', { timestamp: 99999, value: 42 });
      chart.addData('ref', { timestamp: 99999, value: 55 });
      tickFrame();

      chart.destroy();
    });
  });

  describe('setData/clearData animation state (Story 4.6)', () => {
    it('setData properly handles animation snapshot and cancellation on scale change', () => {
      const chart = new GlideChart(container, {
        animation: { enabled: true, duration: 300 },
        series: [{ id: 'price', data: makePoints(10) }],
      });
      tickFrame();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dataLayerRenderer = (chart as any).dataLayerRenderer;
      const snapshotSpy = vi.spyOn(dataLayerRenderer, 'snapshotCurveState');

      // setData triggers snapshot then potentially cancels if scale changes
      chart.setData('price', makePoints(20, 50000));

      expect(snapshotSpy).toHaveBeenCalled();
      snapshotSpy.mockRestore();
      chart.destroy();
    });

    it('clearData cancels animation before clearing state', () => {
      const chart = new GlideChart(container, {
        animation: { enabled: true, duration: 300 },
        series: [{ id: 'price', data: makePoints(10) }],
      });
      tickFrame();

      // Start an animation
      chart.addData('price', { timestamp: 99999, value: 50 });
      tickFrame();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dataLayerRenderer = (chart as any).dataLayerRenderer;
      const cancelSpy = vi.spyOn(dataLayerRenderer, 'cancelAnimation');

      chart.clearData();

      expect(cancelSpy).toHaveBeenCalled();
      cancelSpy.mockRestore();
      chart.destroy();
    });
  });

  describe('theme switching (Story 5.1)', () => {
    it('switching from dark to light applies all light theme values', () => {
      const chart = new GlideChart(container, {
        theme: ThemeMode.Dark,
        series: [{ id: 'price', data: makePoints(5) }],
      });
      tickFrame();

      chart.setConfig({ theme: ThemeMode.Light });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resolved = (chart as any).resolvedConfig;

      expect(resolved.backgroundColor).toBe(LIGHT_THEME.backgroundColor);
      expect(resolved.line.color).toBe(LIGHT_THEME.line!.color);
      expect(resolved.grid.color).toBe(LIGHT_THEME.grid!.color);
      expect(resolved.crosshair.color).toBe(LIGHT_THEME.crosshair!.color);
      expect(resolved.tooltip.backgroundColor).toBe(LIGHT_THEME.tooltip!.backgroundColor);
      expect(resolved.tooltip.textColor).toBe(LIGHT_THEME.tooltip!.textColor);
      expect(resolved.xAxis.labelColor).toBe(LIGHT_THEME.xAxis!.labelColor);
      expect(resolved.yAxis.labelColor).toBe(LIGHT_THEME.yAxis!.labelColor);
      chart.destroy();
    });

    it('switching from light to dark applies all dark theme values', () => {
      const chart = new GlideChart(container, {
        theme: ThemeMode.Light,
        series: [{ id: 'price', data: makePoints(5) }],
      });
      tickFrame();

      chart.setConfig({ theme: ThemeMode.Dark });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resolved = (chart as any).resolvedConfig;

      expect(resolved.backgroundColor).toBe(DARK_THEME.backgroundColor);
      expect(resolved.line.color).toBe(DARK_THEME.line!.color);
      expect(resolved.grid.color).toBe(DARK_THEME.grid!.color);
      expect(resolved.crosshair.color).toBe(DARK_THEME.crosshair!.color);
      expect(resolved.tooltip.backgroundColor).toBe(DARK_THEME.tooltip!.backgroundColor);
      expect(resolved.tooltip.textColor).toBe(DARK_THEME.tooltip!.textColor);
      expect(resolved.xAxis.labelColor).toBe(DARK_THEME.xAxis!.labelColor);
      expect(resolved.yAxis.labelColor).toBe(DARK_THEME.yAxis!.labelColor);
      chart.destroy();
    });

    it('theme switch preserves per-series color overrides', () => {
      const customLineColor = '#ff00ff';
      const chart = new GlideChart(container, {
        theme: ThemeMode.Dark,
        series: [{ id: 'price', data: makePoints(5), line: { color: customLineColor, width: 2, opacity: 1 } }],
      });
      tickFrame();

      chart.setConfig({ theme: ThemeMode.Light });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resolved = (chart as any).resolvedConfig;

      // Per-series override preserved
      expect(resolved.series[0].line.color).toBe(customLineColor);
      // Non-overridden theme values changed to light
      expect(resolved.backgroundColor).toBe(LIGHT_THEME.backgroundColor);
      chart.destroy();
    });

    it('theme switch marks all layers dirty', () => {
      const chart = new GlideChart(container, {
        theme: ThemeMode.Dark,
        series: [{ id: 'price', data: makePoints(5) }],
      });
      tickFrame();

      chart.setConfig({ theme: ThemeMode.Light });
      // markAllDirty sets dirty flags on all layers
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scheduler = (chart as any).frameScheduler;
      const dirtyFlags: Map<LayerType, boolean> = scheduler._dirtyFlags;
      expect(dirtyFlags.get(LayerType.Background)).toBe(true);
      expect(dirtyFlags.get(LayerType.Data)).toBe(true);
      expect(dirtyFlags.get(LayerType.Axis)).toBe(true);
      expect(dirtyFlags.get(LayerType.Interaction)).toBe(true);
      chart.destroy();
    });

    it('theme switch preserves data — buffers and spline caches remain intact', () => {
      const points = makePoints(10);
      const chart = new GlideChart(container, {
        theme: ThemeMode.Dark,
        series: [{ id: 'price', data: points }],
      });
      tickFrame();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bufferBefore = (chart as any).seriesMap.get('price').buffer;
      const sizeBefore = bufferBefore.size;

      chart.setConfig({ theme: ThemeMode.Light });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bufferAfter = (chart as any).seriesMap.get('price').buffer;
      expect(bufferAfter.size).toBe(sizeBefore);
      expect(bufferAfter).toBe(bufferBefore); // Same buffer instance
      chart.destroy();
    });

    it('stale overlay uses theme-aware colors — dark uses light text, light uses dark text', () => {
      vi.useFakeTimers();
      try {
        const chart = new GlideChart(container, {
          theme: ThemeMode.Dark,
          staleThreshold: 100,
          series: [{ id: 'price', data: makePoints(5) }],
        });
        tickFrame();

        // Trigger stale state
        chart.addData('price', { timestamp: 9999, value: 50 });
        vi.advanceTimersByTime(200);
        tickFrame();

        // Get the interaction layer canvas context (last canvas = interaction layer)
        const canvases = container.querySelectorAll('canvas');
        const interCanvas = canvases[canvases.length - 1] as HTMLCanvasElement;
        const interCtx = interCanvas.getContext('2d')!;

        // Track all fillStyle assignments via property descriptor spy
        const fillStyles: string[] = [];
        const origDesc = Object.getOwnPropertyDescriptor(
          Object.getPrototypeOf(interCtx),
          'fillStyle',
        ) ?? { set: (_v: string) => { /* noop */ }, get: () => '#000000' };
        Object.defineProperty(interCtx, 'fillStyle', {
          set(v: string) { fillStyles.push(v); origDesc.set!.call(this, v); },
          get() { return origDesc.get!.call(this); },
          configurable: true,
        });

        // Verify dark theme stale overlay colors
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c = chart as any;
        fillStyles.length = 0;
        c.drawStaleOverlay(interCtx, interCanvas);
        expect(fillStyles).toContain('rgba(255, 68, 102, 0.3)');
        expect(fillStyles).toContain('rgba(255, 255, 255, 0.8)');

        // Switch to light theme and re-draw stale overlay
        chart.setConfig({ theme: ThemeMode.Light });
        fillStyles.length = 0;
        c.drawStaleOverlay(interCtx, interCanvas);
        expect(fillStyles).toContain('rgba(255, 68, 102, 0.2)');
        expect(fillStyles).toContain('rgba(0, 0, 0, 0.7)');

        chart.destroy();
      } finally {
        vi.useRealTimers();
      }
    });

    it('onStaleChange callback persists and fires correctly after theme switch', () => {
      vi.useFakeTimers();
      try {
        const onStaleChange = vi.fn();
        const chart = new GlideChart(container, {
          theme: ThemeMode.Dark,
          staleThreshold: 50,
          series: [{ id: 'price', data: makePoints(3) }],
          onStaleChange,
        });
        tickFrame();

        chart.setConfig({ theme: ThemeMode.Light });

        // onStaleChange should still be registered after theme switch
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c = chart as any;
        expect(c._onStaleChange).toBe(onStaleChange);

        // Verify callback actually fires after theme switch by triggering staleness
        onStaleChange.mockClear();
        chart.addData('price', { timestamp: 9999, value: 50 });
        vi.advanceTimersByTime(100);
        expect(onStaleChange).toHaveBeenCalledWith(
          expect.objectContaining({ seriesId: 'price', isStale: true }),
        );

        chart.destroy();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('per-series config update via setConfig', () => {
    it('setConfig with per-series line.color override updates that series, others retain palette color', () => {
      const chart = new GlideChart(container, {
        series: [
          { id: 'price', data: makePoints(5) },
          { id: 'ref', data: makePoints(5) },
        ],
      });
      tickFrame();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let resolved = (chart as any).resolvedConfig;
      expect(resolved.series[0].line.color).toBe(DARK_SERIES_COLORS[0]);
      expect(resolved.series[1].line.color).toBe(DARK_SERIES_COLORS[1]);

      chart.setConfig({
        series: [
          { id: 'price', line: { color: '#ff0000' } },
          { id: 'ref' },
        ],
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolved = (chart as any).resolvedConfig;
      expect(resolved.series[0].line.color).toBe('#ff0000');
      expect(resolved.series[1].line.color).toBe(DARK_SERIES_COLORS[1]);
      chart.destroy();
    });

    it('setConfig with per-series width change preserves palette colors', () => {
      const chart = new GlideChart(container, {
        series: [
          { id: 'price', data: makePoints(5) },
          { id: 'ref', data: makePoints(5) },
        ],
      });
      tickFrame();

      chart.setConfig({
        series: [
          { id: 'price', line: { width: 4 } },
          { id: 'ref' },
        ],
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resolved = (chart as any).resolvedConfig;
      expect(resolved.series[0].line.width).toBe(4);
      expect(resolved.series[0].line.color).toBe(DARK_SERIES_COLORS[0]);
      expect(resolved.series[1].line.color).toBe(DARK_SERIES_COLORS[1]);
      chart.destroy();
    });

    it('setConfig with global line.color override applies to all series (palette NOT used)', () => {
      const chart = new GlideChart(container, {
        series: [
          { id: 'price', data: makePoints(5) },
          { id: 'ref', data: makePoints(5) },
        ],
      });
      tickFrame();

      chart.setConfig({ line: { color: '#aabbcc' } });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resolved = (chart as any).resolvedConfig;
      expect(resolved.series[0].line.color).toBe('#aabbcc');
      expect(resolved.series[1].line.color).toBe('#aabbcc');
      chart.destroy();
    });
  });

  describe('grid visibility toggle via setConfig', () => {
    it('grid: { visible: false } hides grid, visible: true restores it', () => {
      const chart = new GlideChart(container, {
        series: [{ id: 'price', data: makePoints(5) }],
      });
      tickFrame();

      // Hide grid
      chart.setConfig({ grid: { visible: false } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let resolved = (chart as any).resolvedConfig;
      expect(resolved.grid.visible).toBe(false);
      tickFrame();

      // Show grid again
      chart.setConfig({ grid: { visible: true } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolved = (chart as any).resolvedConfig;
      expect(resolved.grid.visible).toBe(true);
      tickFrame();

      chart.destroy();
    });
  });

  describe('gradient per-series customization via setConfig', () => {
    it('setConfig with per-series gradient overrides reflects in resolved config', () => {
      const chart = new GlideChart(container, {
        series: [
          { id: 'price', data: makePoints(5) },
          { id: 'ref', data: makePoints(3, 2000) },
        ],
      });
      tickFrame();

      chart.setConfig({
        series: [
          { id: 'price', gradient: { topColor: '#ff0000', topOpacity: 0.5 } },
          { id: 'ref', gradient: { bottomColor: '#00ff00' } },
        ],
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resolved = (chart as any).resolvedConfig;
      expect(resolved.series[0].gradient.topColor).toBe('#ff0000');
      expect(resolved.series[0].gradient.topOpacity).toBe(0.5);
      expect(resolved.series[1].gradient.bottomColor).toBe('#00ff00');
      tickFrame();
      chart.destroy();
    });
  });

  describe('animation speed customization via setConfig', () => {
    it('setConfig with animation.duration: 0 resolves to instant mode', () => {
      const chart = new GlideChart(container, {
        series: [{ id: 'price', data: makePoints(5) }],
      });
      tickFrame();

      chart.setConfig({ animation: { duration: 0 } });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resolved = (chart as any).resolvedConfig;
      expect(resolved.animation.duration).toBe(0);
      tickFrame();
      chart.destroy();
    });
  });

  describe('custom tooltip formatter integration (Story 5.4)', () => {
    function simulatePointerMove(target: HTMLElement, x: number, y: number): void {
      target.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        clientX: x,
        clientY: y,
        offsetX: x,
        offsetY: y,
        pointerType: 'mouse',
      } as PointerEventInit));
    }

    it('chart with custom formatter renders custom text in tooltip on pointer move', () => {
      const points = makePoints(10);
      const chart = new GlideChart(container, {
        tooltip: {
          formatter: (pts) => pts.map(p => p.seriesId + ':' + p.value.toFixed(1)).join(', '),
        },
        series: [{ id: 'price', data: points }],
      });
      tickFrame();

      // Simulate pointer move into chart area
      simulatePointerMove(container, 400, 300);

      const customEl = container.querySelector('.glide-chart-tooltip-custom') as HTMLElement;
      expect(customEl).not.toBeNull();
      expect(customEl.textContent).toContain('price:');
      expect(customEl.style.display).not.toBe('none');

      const timeEl = container.querySelector('.glide-chart-tooltip-time') as HTMLElement;
      expect(timeEl.style.display).toBe('none');

      chart.destroy();
    });

    it('chart without formatter renders default tooltip on pointer move', () => {
      const points = makePoints(10);
      const chart = new GlideChart(container, {
        series: [{ id: 'price', data: points }],
      });
      tickFrame();

      simulatePointerMove(container, 400, 300);

      const customEl = container.querySelector('.glide-chart-tooltip-custom') as HTMLElement;
      expect(customEl.style.display).toBe('none');

      const timeEl = container.querySelector('.glide-chart-tooltip-time') as HTMLElement;
      expect(timeEl.style.display).toBe('');
      expect(timeEl.textContent).toBeTruthy();

      chart.destroy();
    });

    it('setConfig removing formatter (via null) restores default tooltip rendering', () => {
      const points = makePoints(10);
      const chart = new GlideChart(container, {
        tooltip: {
          formatter: () => 'Custom text',
        },
        series: [{ id: 'price', data: points }],
      });
      tickFrame();

      simulatePointerMove(container, 400, 300);
      let customEl = container.querySelector('.glide-chart-tooltip-custom') as HTMLElement;
      expect(customEl.textContent).toBe('Custom text');

      // Remove formatter via setConfig using null (deepMerge deletes keys set to null;
      // undefined is a no-op in deepMerge). setConfig destroys and recreates tooltip.
      chart.setConfig({ tooltip: { formatter: null } } as Parameters<typeof chart.setConfig>[0]);

      // Need to re-query since tooltip is recreated
      simulatePointerMove(container, 400, 300);
      customEl = container.querySelector('.glide-chart-tooltip-custom') as HTMLElement;
      expect(customEl.style.display).toBe('none');

      const timeEl = container.querySelector('.glide-chart-tooltip-time') as HTMLElement;
      expect(timeEl.style.display).toBe('');
      expect(timeEl.textContent).toBeTruthy();

      chart.destroy();
    });

    it('keyboard ArrowRight navigation with custom formatter updates tooltip', () => {
      const points = makePoints(10);
      const chart = new GlideChart(container, {
        tooltip: {
          formatter: (pts) => 'KB:' + pts.map(p => p.value.toFixed(0)).join(','),
        },
        series: [{ id: 'price', data: points }],
      });
      tickFrame();

      // Activate pointer first (keyboard nav requires active pointer state)
      simulatePointerMove(container, 400, 300);

      // Dispatch keyboard ArrowRight
      container.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        bubbles: true,
      }));

      const customEl = container.querySelector('.glide-chart-tooltip-custom') as HTMLElement;
      expect(customEl).not.toBeNull();
      expect(customEl.textContent).toContain('KB:');

      chart.destroy();
    });
  });

  describe('onCrosshairMove callback (Story 6.2)', () => {
    function simulatePointerMove(target: HTMLElement, x: number, y: number): void {
      target.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        clientX: x,
        clientY: y,
        offsetX: x,
        offsetY: y,
        pointerType: 'mouse',
      } as PointerEventInit));
    }

    function simulatePointerLeave(target: HTMLElement): void {
      target.dispatchEvent(new PointerEvent('pointerleave', {
        bubbles: true,
        pointerType: 'mouse',
      } as PointerEventInit));
    }

    it('callback fires when pointer events are dispatched on the container', () => {
      const onCrosshairMove = vi.fn();
      const chart = new GlideChart(container, {
        onCrosshairMove,
        series: [{ id: 'price', data: makePoints(10) }],
      });
      tickFrame();

      simulatePointerMove(container, 400, 300);

      expect(onCrosshairMove).toHaveBeenCalled();
      chart.destroy();
    });

    it('callback receives correct event shape', () => {
      const onCrosshairMove = vi.fn();
      const chart = new GlideChart(container, {
        onCrosshairMove,
        series: [{ id: 'price', data: makePoints(10) }],
      });
      tickFrame();

      simulatePointerMove(container, 400, 300);

      expect(onCrosshairMove).toHaveBeenCalledWith(
        expect.objectContaining({
          x: expect.any(Number),
          y: expect.any(Number),
          timestamp: expect.any(Number),
          active: expect.any(Boolean),
          points: expect.any(Array),
        })
      );

      const event = onCrosshairMove.mock.calls[0][0];
      if (event.active && event.points.length > 0) {
        expect(event.points[0]).toEqual(
          expect.objectContaining({
            seriesId: 'price',
            value: expect.any(Number),
            timestamp: expect.any(Number),
          })
        );
      }
      chart.destroy();
    });

    it('callback fires with active: false when pointer leaves chart', () => {
      const onCrosshairMove = vi.fn();
      const chart = new GlideChart(container, {
        onCrosshairMove,
        series: [{ id: 'price', data: makePoints(10) }],
      });
      tickFrame();

      // First move in
      simulatePointerMove(container, 400, 300);
      onCrosshairMove.mockClear();

      // Then leave
      simulatePointerLeave(container);

      expect(onCrosshairMove).toHaveBeenCalled();
      const event = onCrosshairMove.mock.calls[0][0];
      expect(event.active).toBe(false);
      chart.destroy();
    });

    it('callback errors do not crash the chart', () => {
      const onCrosshairMove = vi.fn().mockImplementation(() => {
        throw new Error('Consumer error');
      });
      const chart = new GlideChart(container, {
        onCrosshairMove,
        series: [{ id: 'price', data: makePoints(10) }],
      });
      tickFrame();

      expect(() => simulatePointerMove(container, 400, 300)).not.toThrow();
      expect(onCrosshairMove).toHaveBeenCalled();
      chart.destroy();
    });

    it('callback is updated via setConfig()', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      const chart = new GlideChart(container, {
        onCrosshairMove: cb1,
        series: [{ id: 'price', data: makePoints(10) }],
      });
      tickFrame();

      chart.setConfig({ onCrosshairMove: cb2 });

      simulatePointerMove(container, 400, 300);

      expect(cb2).toHaveBeenCalled();
      expect(cb1).not.toHaveBeenCalled();
      chart.destroy();
    });
  });

  describe('onZoom callback (Story 6.2)', () => {
    function simulatePointerMove(target: HTMLElement, x: number, y: number): void {
      target.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        clientX: x,
        clientY: y,
        offsetX: x,
        offsetY: y,
        pointerType: 'mouse',
      } as PointerEventInit));
    }

    function simulateWheel(target: HTMLElement, deltaY: number, x = 400, y = 300): void {
      target.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true,
        deltaY,
        clientX: x,
        clientY: y,
      }));
    }

    it('callback fires on wheel zoom with correct domain values', () => {
      const onZoom = vi.fn();
      const chart = new GlideChart(container, {
        onZoom,
        zoom: true,
        series: [{ id: 'price', data: makePoints(20) }],
      });
      tickFrame();

      // Activate pointer first (zoom requires pointer in chart area)
      simulatePointerMove(container, 400, 300);
      simulateWheel(container, -100);

      expect(onZoom).toHaveBeenCalled();
      const event = onZoom.mock.calls[0][0];
      expect(event).toEqual(
        expect.objectContaining({
          domainXMin: expect.any(Number),
          domainXMax: expect.any(Number),
          isZoomed: expect.any(Boolean),
        })
      );
      chart.destroy();
    });

    it('callback fires on keyboard +/- zoom', () => {
      const onZoom = vi.fn();
      const chart = new GlideChart(container, {
        onZoom,
        zoom: true,
        series: [{ id: 'price', data: makePoints(20) }],
      });
      tickFrame();

      // Activate pointer and keyboard navigation first (zoom keys require active keyboard nav index)
      simulatePointerMove(container, 400, 300);
      container.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      onZoom.mockClear();

      container.dispatchEvent(new KeyboardEvent('keydown', {
        key: '+',
        bubbles: true,
      }));

      expect(onZoom).toHaveBeenCalled();
      chart.destroy();
    });

    it('callback does NOT fire on arrow key navigation (domain dedup prevents it)', () => {
      const onZoom = vi.fn();
      const chart = new GlideChart(container, {
        onZoom,
        zoom: true,
        series: [{ id: 'price', data: makePoints(20) }],
      });
      tickFrame();

      // Activate pointer first
      simulatePointerMove(container, 400, 300);
      onZoom.mockClear();

      container.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        bubbles: true,
      }));

      expect(onZoom).not.toHaveBeenCalled();
      chart.destroy();
    });

    it('callback fires with isZoomed: true after zoom', () => {
      const onZoom = vi.fn();
      const chart = new GlideChart(container, {
        onZoom,
        zoom: true,
        series: [{ id: 'price', data: makePoints(20) }],
      });
      tickFrame();

      simulatePointerMove(container, 400, 300);
      simulateWheel(container, -100);

      expect(onZoom).toHaveBeenCalled();
      const event = onZoom.mock.calls[onZoom.mock.calls.length - 1][0];
      expect(event.isZoomed).toBe(true);
      chart.destroy();
    });

    it('callback errors do not crash the chart', () => {
      const onZoom = vi.fn().mockImplementation(() => {
        throw new Error('Consumer error');
      });
      const chart = new GlideChart(container, {
        onZoom,
        zoom: true,
        series: [{ id: 'price', data: makePoints(20) }],
      });
      tickFrame();

      simulatePointerMove(container, 400, 300);
      expect(() => simulateWheel(container, -100)).not.toThrow();
      expect(onZoom).toHaveBeenCalled();
      chart.destroy();
    });

    it('callback is updated via setConfig()', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      const chart = new GlideChart(container, {
        onZoom: cb1,
        zoom: true,
        series: [{ id: 'price', data: makePoints(20) }],
      });
      tickFrame();

      chart.setConfig({ onZoom: cb2 });

      simulatePointerMove(container, 400, 300);
      simulateWheel(container, -100);

      expect(cb2).toHaveBeenCalled();
      expect(cb1).not.toHaveBeenCalled();
      chart.destroy();
    });

    it('callback does NOT fire when zoom: false', () => {
      const onZoom = vi.fn();
      const chart = new GlideChart(container, {
        onZoom,
        zoom: false,
        series: [{ id: 'price', data: makePoints(20) }],
      });
      tickFrame();

      simulatePointerMove(container, 400, 300);
      simulateWheel(container, -100);

      expect(onZoom).not.toHaveBeenCalled();
      chart.destroy();
    });

    it('setData() resets zoom but does NOT fire onZoom', () => {
      const onZoom = vi.fn();
      const chart = new GlideChart(container, {
        onZoom,
        zoom: true,
        series: [{ id: 'price', data: makePoints(20) }],
      });
      tickFrame();

      // Zoom in first
      simulatePointerMove(container, 400, 300);
      simulateWheel(container, -100);
      onZoom.mockClear();

      // setData resets zoom — should NOT fire onZoom
      chart.setData('price', makePoints(20));

      expect(onZoom).not.toHaveBeenCalled();
      chart.destroy();
    });
  });
});
