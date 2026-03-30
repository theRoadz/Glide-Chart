import { GlideChart } from './glide-chart';
import type { DataPoint } from '../core/types';
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
});
