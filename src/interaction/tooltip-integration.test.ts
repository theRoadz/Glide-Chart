import { GlideChart } from '../api/glide-chart';
import type { DataPoint } from '../core/types';

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

const mockMatchMediaRemove = vi.fn();
const mockMatchMediaAdd = vi.fn();
vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
  media: query,
  addEventListener: mockMatchMediaAdd,
  removeEventListener: mockMatchMediaRemove,
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

function dispatchPointer(
  el: HTMLElement,
  type: string,
  options: Partial<PointerEventInit & { offsetX: number; offsetY: number }> = {},
): void {
  const event = new PointerEvent(type, {
    bubbles: true,
    pointerType: options.pointerType ?? 'mouse',
    ...options,
  });
  Object.defineProperty(event, 'offsetX', { value: options.offsetX ?? 0 });
  Object.defineProperty(event, 'offsetY', { value: options.offsetY ?? 0 });
  el.dispatchEvent(event);
}

function makePoints(count: number, startTimestamp = 1000): DataPoint[] {
  const points: DataPoint[] = [];
  for (let i = 0; i < count; i++) {
    points.push({ timestamp: startTimestamp + i * 1000, value: 10 + i * 5 });
  }
  return points;
}

describe('Tooltip Integration', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = createContainer();
    rafCallback = null;
    rafId = 0;
  });

  afterEach(() => {
    container.remove();
  });

  it('pointer events on container trigger tooltip display', () => {
    const chart = new GlideChart(container, {
      series: [{ id: 's1' }],
    });
    chart.addData('s1', makePoints(5));
    tickFrame();

    // Dispatch pointer event within the plot area
    dispatchPointer(container, 'pointermove', { offsetX: 200, offsetY: 200 });
    tickFrame();

    const tooltipEl = container.querySelector('.glide-chart-tooltip') as HTMLElement;
    expect(tooltipEl).not.toBeNull();
    expect(tooltipEl.style.display).not.toBe('none');

    chart.destroy();
  });

  it('tooltip hidden after pointerleave', () => {
    const chart = new GlideChart(container, {
      series: [{ id: 's1' }],
    });
    chart.addData('s1', makePoints(5));
    tickFrame();

    dispatchPointer(container, 'pointermove', { offsetX: 200, offsetY: 200 });
    tickFrame();

    dispatchPointer(container, 'pointerleave', { offsetX: 200, offsetY: 200 });
    tickFrame();

    const tooltipEl = container.querySelector('.glide-chart-tooltip') as HTMLElement;
    expect(tooltipEl.style.display).toBe('none');

    chart.destroy();
  });

  it('destroy cleans up tooltip DOM elements', () => {
    const chart = new GlideChart(container, {
      series: [{ id: 's1' }],
    });
    chart.addData('s1', makePoints(5));
    tickFrame();

    chart.destroy();

    expect(container.querySelector('.glide-chart-tooltip')).toBeNull();
    expect(container.querySelector('[aria-live="polite"]')).toBeNull();
  });

  it('multi-series chart shows all series in tooltip', () => {
    const chart = new GlideChart(container, {
      series: [{ id: 'price' }, { id: 'volume' }],
    });
    chart.addData('price', makePoints(5, 1000));
    chart.addData('volume', makePoints(5, 1000));
    tickFrame();

    dispatchPointer(container, 'pointermove', { offsetX: 200, offsetY: 200 });
    tickFrame();

    const rows = container.querySelectorAll('.glide-chart-tooltip-row');
    expect(rows.length).toBe(2);

    const labels = container.querySelectorAll('.glide-chart-tooltip-label');
    expect(labels[0]!.textContent).toBe('price');
    expect(labels[1]!.textContent).toBe('volume');

    chart.destroy();
  });
});
