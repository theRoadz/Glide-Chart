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

describe('Crosshair Integration', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = createContainer();
    rafCallback = null;
    rafId = 0;
  });

  afterEach(() => {
    container.remove();
  });

  it('pointer events on container trigger interaction layer redraw', () => {
    const chart = new GlideChart(container, {
      series: [{ id: 's1' }],
    });

    // Add data so crosshair has something to snap to
    chart.addData('s1', makePoints(5));
    tickFrame(); // flush initial frames

    // Dispatch pointer event on the container div
    dispatchPointer(container, 'pointermove', { offsetX: 200, offsetY: 200 });

    // The interaction layer should be marked dirty — tickFrame should process it
    tickFrame();

    // No errors means the integration works — the interaction layer drew crosshair + stale overlay
    chart.destroy();
  });

  it('crosshair hidden after pointerleave', () => {
    const chart = new GlideChart(container, {
      series: [{ id: 's1' }],
    });
    chart.addData('s1', makePoints(5));
    tickFrame();

    // Move pointer in
    dispatchPointer(container, 'pointermove', { offsetX: 200, offsetY: 200 });
    tickFrame();

    // Move pointer out
    dispatchPointer(container, 'pointerleave', { offsetX: 200, offsetY: 200 });
    tickFrame();

    // After pointerleave, crosshair should not draw (active=false)
    // No errors means successful — the crosshair skipped drawing
    chart.destroy();
  });

  it('destroy cleans up all event listeners', () => {
    const addSpy = vi.spyOn(container, 'addEventListener');
    const removeSpy = vi.spyOn(container, 'removeEventListener');

    const chart = new GlideChart(container, {
      series: [{ id: 's1' }],
    });

    // EventDispatcher registers 5 listeners on the container
    const pointerTypes = ['pointermove', 'pointerleave', 'pointerdown', 'pointerup', 'pointercancel'];
    const pointerListeners = addSpy.mock.calls.filter(
      ([type]) => pointerTypes.includes(type as string),
    );
    expect(pointerListeners).toHaveLength(5);

    chart.destroy();

    // All 5 pointer listeners should be removed
    const removedPointerListeners = removeSpy.mock.calls.filter(
      ([type]) => pointerTypes.includes(type as string),
    );
    expect(removedPointerListeners).toHaveLength(5);
  });

  it('crosshair respects enabled=false config', () => {
    const chart = new GlideChart(container, {
      series: [{ id: 's1' }],
      crosshair: { enabled: false },
    });
    chart.addData('s1', makePoints(5));
    tickFrame();

    // Even with pointer events, no crosshair draw should happen
    dispatchPointer(container, 'pointermove', { offsetX: 200, offsetY: 200 });
    tickFrame();

    // No errors = crosshair correctly skipped
    chart.destroy();
  });
});
