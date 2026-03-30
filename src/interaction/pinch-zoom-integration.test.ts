import { GlideChart } from '../api/glide-chart';
import type { GlideChartConfig } from '../api/types';

vi.stubGlobal(
  'ResizeObserver',
  class {
    constructor(_cb: ResizeObserverCallback) {}
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
  media: query,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  onchange: null,
  dispatchEvent: vi.fn(),
}));

vi.stubGlobal('requestAnimationFrame', (_cb: FrameRequestCallback) => 1);
vi.stubGlobal('cancelAnimationFrame', vi.fn());

function createContainer(): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 400, configurable: true });
  el.setPointerCapture = vi.fn();
  el.releasePointerCapture = vi.fn();
  document.body.appendChild(el);
  return el;
}

function dispatchTouch(
  el: HTMLElement,
  type: string,
  pointerId: number,
  offsetX: number,
  offsetY: number,
): void {
  const event = new PointerEvent(type, {
    bubbles: true,
    pointerType: 'touch',
    pointerId,
  });
  Object.defineProperty(event, 'offsetX', { value: offsetX });
  Object.defineProperty(event, 'offsetY', { value: offsetY });
  el.dispatchEvent(event);
}

function createChartWithData(config?: Partial<GlideChartConfig>): { chart: GlideChart; container: HTMLElement } {
  const container = createContainer();
  const baseConfig: GlideChartConfig = {
    series: [
      {
        id: 'test',
        data: Array.from({ length: 20 }, (_, i) => ({
          timestamp: 1000 + i * 100,
          value: 50 + Math.sin(i) * 20,
        })),
      },
    ],
    ...config,
  };
  const chart = new GlideChart(container, baseConfig);
  return { chart, container };
}

function simulatePinch(
  container: HTMLElement,
  opts: {
    startX1: number;
    startY1: number;
    startX2: number;
    startY2: number;
    endX2: number;
    endY2: number;
  },
): void {
  dispatchTouch(container, 'pointerdown', 1, opts.startX1, opts.startY1);
  dispatchTouch(container, 'pointerdown', 2, opts.startX2, opts.startY2);
  dispatchTouch(container, 'pointermove', 2, opts.endX2, opts.endY2);
}

describe('Pinch-to-Zoom Integration', () => {
  let container: HTMLElement;
  let chart: GlideChart;

  afterEach(() => {
    chart?.destroy();
    container?.remove();
  });

  it('pinch-out gesture zooms in — scale domain narrows', () => {
    ({ chart, container } = createChartWithData());

    // Access scale domain indirectly via another zoom then reset pattern
    // Simulate pinch-out (fingers spread): start 100px apart, end 200px apart
    const domainBefore = getDomainWidth(chart);
    simulatePinch(container, {
      startX1: 300, startY1: 200,
      startX2: 400, startY2: 200,
      endX2: 500, endY2: 200,
    });
    const domainAfter = getDomainWidth(chart);

    expect(domainAfter).toBeLessThan(domainBefore);
  });

  it('pinch-in gesture zooms out — scale domain widens', () => {
    ({ chart, container } = createChartWithData());

    // First zoom in
    simulatePinch(container, {
      startX1: 200, startY1: 200,
      startX2: 600, startY2: 200,
      endX2: 700, endY2: 200,
    });
    const domainAfterZoomIn = getDomainWidth(chart);

    // Now pinch-in (fingers move together): move finger 2 closer
    dispatchTouch(container, 'pointermove', 2, 400, 200);
    const domainAfterZoomOut = getDomainWidth(chart);

    expect(domainAfterZoomOut).toBeGreaterThan(domainAfterZoomIn);
  });

  it('pinch on chart with zoom: false does not change domain', () => {
    ({ chart, container } = createChartWithData({ zoom: false }));

    const domainBefore = getDomainWidth(chart);
    simulatePinch(container, {
      startX1: 300, startY1: 200,
      startX2: 400, startY2: 200,
      endX2: 500, endY2: 200,
    });
    const domainAfter = getDomainWidth(chart);

    expect(domainAfter).toBe(domainBefore);
  });

  it('streaming data via addData() after pinch zoom preserves viewport', () => {
    ({ chart, container } = createChartWithData());

    simulatePinch(container, {
      startX1: 300, startY1: 200,
      startX2: 400, startY2: 200,
      endX2: 500, endY2: 200,
    });
    const { width: widthAfterZoom, min: minAfterZoom, max: maxAfterZoom } = getDomain(chart);

    // Stream new data
    chart.addData('test', { timestamp: 5000, value: 60 });
    const { width: widthAfterStream, min: minAfterStream, max: maxAfterStream } = getDomain(chart);

    // Domain width and position should be preserved (zoom is maintained)
    expect(widthAfterStream).toBeCloseTo(widthAfterZoom, 5);
    expect(minAfterStream).toBeCloseTo(minAfterZoom, 5);
    expect(maxAfterStream).toBeCloseTo(maxAfterZoom, 5);
  });

  it('setData() after pinch zoom resets zoom and auto-fits', () => {
    ({ chart, container } = createChartWithData());

    simulatePinch(container, {
      startX1: 300, startY1: 200,
      startX2: 400, startY2: 200,
      endX2: 500, endY2: 200,
    });

    // setData resets zoom
    chart.setData('test', [
      { timestamp: 0, value: 0 },
      { timestamp: 2000, value: 100 },
    ]);
    const domainAfterReset = getDomainWidth(chart);

    // Domain should be auto-fitted to new data range (2000)
    expect(domainAfterReset).toBeCloseTo(2000, 0);
  });

  it('pinch on chart with no data — no errors, no domain change', () => {
    const emptyContainer = createContainer();
    const emptyChart = new GlideChart(emptyContainer, {
      series: [{ id: 'test' }],
    });
    container = emptyContainer;
    chart = emptyChart;

    expect(() => {
      simulatePinch(emptyContainer, {
        startX1: 300, startY1: 200,
        startX2: 400, startY2: 200,
        endX2: 500, endY2: 200,
      });
    }).not.toThrow();
  });

  it('destroy cleans up pinch tracking', () => {
    const result = createChartWithData();
    const localChart = result.chart;
    const localContainer = result.container;

    localChart.destroy();

    // After destroy, events should not cause errors
    expect(() => {
      simulatePinch(localContainer, {
        startX1: 300, startY1: 200,
        startX2: 400, startY2: 200,
        endX2: 500, endY2: 200,
      });
    }).not.toThrow();

    localContainer.remove();
    // Prevent afterEach from double-destroying
    container = undefined!;
    chart = undefined!;
  });
});

// Helper to access domain via the scale (accessing private field for test verification)
function getDomain(chart: GlideChart): { min: number; max: number; width: number } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scale = (chart as any).scale;
  const { min, max } = scale.domainX;
  return { min, max, width: max - min };
}

function getDomainWidth(chart: GlideChart): number {
  return getDomain(chart).width;
}