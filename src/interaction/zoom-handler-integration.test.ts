import { GlideChart } from '../api/glide-chart';
import type { DataPoint } from '../core/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ChartInternals = any;

// --- Mocks ---

const mockDisconnect = vi.fn();

vi.stubGlobal(
  'ResizeObserver',
  class {
    constructor(_cb: ResizeObserverCallback) {}
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

function createContainer(): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 400, configurable: true });
  document.body.appendChild(el);
  return el;
}

function dispatchWheel(
  el: HTMLElement,
  options: { offsetX?: number; offsetY?: number; deltaY?: number } = {},
): void {
  const event = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaY: options.deltaY ?? 0,
  });
  Object.defineProperty(event, 'offsetX', { value: options.offsetX ?? 0 });
  Object.defineProperty(event, 'offsetY', { value: options.offsetY ?? 0 });
  el.dispatchEvent(event);
}

function makeSampleData(count = 10): DataPoint[] {
  const points: DataPoint[] = [];
  for (let i = 0; i < count; i++) {
    points.push({ timestamp: 1000 + i * 100, value: 50 + Math.sin(i) * 20 });
  }
  return points;
}

describe('ZoomHandler Integration', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = createContainer();
  });

  afterEach(() => {
    container.remove();
  });

  it('wheel event zooms in — scale domain changes', () => {
    const chart = new GlideChart(container, {
      series: [{ id: 's1' }],
      zoom: true,
    });
    chart.setData('s1', makeSampleData());

    // Access scale via private — use type assertion for test
    const chartAny = chart as ChartInternals;
    const domainBefore = { ...chartAny.scale.domainX };
    const viewport = chartAny.scale.viewport;

    // Wheel in center of viewport (zoom in)
    dispatchWheel(container, {
      offsetX: viewport.x + viewport.width / 2,
      offsetY: viewport.y + viewport.height / 2,
      deltaY: -120,
    });

    const domainAfter = chartAny.scale.domainX;
    const widthBefore = domainBefore.max - domainBefore.min;
    const widthAfter = domainAfter.max - domainAfter.min;
    expect(widthAfter).toBeLessThan(widthBefore);

    chart.destroy();
  });

  it('wheel event on chart with zoom: false does not change domain', () => {
    const chart = new GlideChart(container, {
      series: [{ id: 's1' }],
      zoom: false,
    });
    chart.setData('s1', makeSampleData());

    const chartAny = chart as ChartInternals;
    const domainBefore = { ...chartAny.scale.domainX };
    const viewport = chartAny.scale.viewport;

    dispatchWheel(container, {
      offsetX: viewport.x + viewport.width / 2,
      offsetY: viewport.y + viewport.height / 2,
      deltaY: -120,
    });

    const domainAfter = chartAny.scale.domainX;
    expect(domainAfter.min).toBe(domainBefore.min);
    expect(domainAfter.max).toBe(domainBefore.max);

    chart.destroy();
  });

  it('streaming data via addData() after zoom preserves zoom viewport', () => {
    const chart = new GlideChart(container, {
      series: [{ id: 's1' }],
      zoom: true,
    });
    chart.setData('s1', makeSampleData());

    const chartAny = chart as ChartInternals;
    const viewport = chartAny.scale.viewport;

    // Zoom in
    dispatchWheel(container, {
      offsetX: viewport.x + viewport.width / 2,
      offsetY: viewport.y + viewport.height / 2,
      deltaY: -120,
    });

    const domainAfterZoom = { ...chartAny.scale.domainX };

    // Add streaming data
    chart.addData('s1', { timestamp: 2000, value: 75 });

    // X domain should be preserved (zoom not reset)
    const domainAfterAdd = chartAny.scale.domainX;
    expect(domainAfterAdd.min).toBe(domainAfterZoom.min);
    expect(domainAfterAdd.max).toBe(domainAfterZoom.max);

    chart.destroy();
  });

  it('setData() after zoom resets zoom and auto-fits', () => {
    const chart = new GlideChart(container, {
      series: [{ id: 's1' }],
      zoom: true,
    });
    chart.setData('s1', makeSampleData());

    const chartAny = chart as ChartInternals;
    const viewport = chartAny.scale.viewport;

    // Zoom in
    dispatchWheel(container, {
      offsetX: viewport.x + viewport.width / 2,
      offsetY: viewport.y + viewport.height / 2,
      deltaY: -120,
    });

    expect(chartAny.zoomHandler.isZoomed).toBe(true);

    // setData resets zoom
    chart.setData('s1', makeSampleData(5));

    expect(chartAny.zoomHandler.isZoomed).toBe(false);

    chart.destroy();
  });

  it('clearData() after zoom resets zoom and auto-fits', () => {
    const chart = new GlideChart(container, {
      series: [{ id: 's1' }],
      zoom: true,
    });
    chart.setData('s1', makeSampleData());

    const chartAny = chart as ChartInternals;
    const viewport = chartAny.scale.viewport;

    // Zoom in
    dispatchWheel(container, {
      offsetX: viewport.x + viewport.width / 2,
      offsetY: viewport.y + viewport.height / 2,
      deltaY: -120,
    });

    expect(chartAny.zoomHandler.isZoomed).toBe(true);

    // clearData resets zoom
    chart.clearData('s1');

    expect(chartAny.zoomHandler.isZoomed).toBe(false);

    chart.destroy();
  });

  it('wheel on empty chart (no data) does not crash or change domain (AC 6)', () => {
    const chart = new GlideChart(container, {
      series: [{ id: 's1' }],
      zoom: true,
    });

    const chartAny = chart as ChartInternals;
    const domainBefore = { ...chartAny.scale.domainX };

    // Dispatch wheel event with no data loaded
    expect(() => {
      dispatchWheel(container, {
        offsetX: 400,
        offsetY: 200,
        deltaY: -120,
      });
    }).not.toThrow();

    // Domain should not change (degenerate domain guard: min === max)
    const domainAfter = chartAny.scale.domainX;
    expect(domainAfter.min).toBe(domainBefore.min);
    expect(domainAfter.max).toBe(domainBefore.max);

    chart.destroy();
  });

  it('destroy cleans up ZoomHandler', () => {
    const chart = new GlideChart(container, {
      series: [{ id: 's1' }],
      zoom: true,
    });

    const chartAny = chart as ChartInternals;
    expect(chartAny.zoomHandler).toBeTruthy();

    chart.destroy();

    expect(chartAny.zoomHandler).toBeNull();
  });
});
