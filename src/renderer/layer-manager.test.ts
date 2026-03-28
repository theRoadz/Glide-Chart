import { LayerManager } from './layer-manager';
import { LAYER_ORDER } from './types';

// --- Mocks ---

let resizeObserverCallback: ResizeObserverCallback;
const mockDisconnect = vi.fn();

vi.stubGlobal(
  'ResizeObserver',
  class {
    constructor(cb: ResizeObserverCallback) {
      resizeObserverCallback = cb;
    }
    observe() {}
    unobserve() {}
    disconnect() {
      mockDisconnect();
    }
  },
);

// matchMedia mock
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

function createContainer(width = 800, height = 600): HTMLElement {
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: height, configurable: true });
  document.body.appendChild(container);
  return container;
}

describe('LayerManager', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = createContainer();
    Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
    mockDisconnect.mockClear();
    mockAddEventListener.mockClear();
    mockRemoveEventListener.mockClear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('creates 4 canvas elements inside the container', () => {
      const lm = new LayerManager(container);
      const canvases = container.querySelectorAll('canvas');
      expect(canvases.length).toBe(4);
      lm.destroy();
    });

    it('throws on invalid container argument', () => {
      expect(() => new LayerManager(null as unknown as HTMLElement)).toThrow(
        'LayerManager: container must be an HTMLElement',
      );
      expect(() => new LayerManager('div' as unknown as HTMLElement)).toThrow(
        'LayerManager: container must be an HTMLElement',
      );
    });

    it('sets container position to relative if static', () => {
      const lm = new LayerManager(container);
      expect(container.style.position).toBe('relative');
      lm.destroy();
    });
  });

  describe('canvas stacking and attributes', () => {
    it('canvases are stacked with absolute positioning', () => {
      const lm = new LayerManager(container);
      const canvases = container.querySelectorAll('canvas');
      canvases.forEach((canvas) => {
        expect(canvas.style.position).toBe('absolute');
      });
      lm.destroy();
    });

    it('each canvas has data-layer-type attribute matching its layer type', () => {
      const lm = new LayerManager(container);
      const expectedTypes = ['background', 'axis', 'data', 'interaction'];
      const canvases = container.querySelectorAll('canvas');
      canvases.forEach((canvas, i) => {
        expect(canvas.getAttribute('data-layer-type')).toBe(expectedTypes[i]);
      });
      lm.destroy();
    });

    it('each canvas has display: block CSS', () => {
      const lm = new LayerManager(container);
      const canvases = container.querySelectorAll('canvas');
      canvases.forEach((canvas) => {
        expect(canvas.style.display).toBe('block');
      });
      lm.destroy();
    });

    it('interaction layer canvas has pointer events enabled (no pointer-events: none)', () => {
      const lm = new LayerManager(container);
      const interactionCanvas = container.querySelector(
        'canvas[data-layer-type="interaction"]',
      ) as HTMLCanvasElement;
      expect(interactionCanvas.style.pointerEvents).not.toBe('none');

      // Non-interaction canvases have pointer-events: none
      const bgCanvas = container.querySelector(
        'canvas[data-layer-type="background"]',
      ) as HTMLCanvasElement;
      expect(bgCanvas.style.pointerEvents).toBe('none');
      lm.destroy();
    });
  });

  describe('DPR and canvas dimensions', () => {
    it('canvases have correct backing store dimensions (clientWidth × dpr, clientHeight × dpr)', () => {
      Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
      const lm = new LayerManager(container);
      for (const layerType of LAYER_ORDER) {
        const canvas = lm.getCanvas(layerType);
        expect(canvas.width).toBe(800 * 2);
        expect(canvas.height).toBe(600 * 2);
      }
      lm.destroy();
    });

    it('canvas contexts have DPR scaling applied via setTransform', () => {
      Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
      const lm = new LayerManager(container);
      for (const layerType of LAYER_ORDER) {
        const ctx = lm.getContext(layerType);
        // vitest-canvas-mock tracks calls; verify setTransform was called
        const events = (ctx as unknown as { __getEvents: () => Array<{ type: string; props: Record<string, unknown> }> }).__getEvents();
        const setTransformCalls = events.filter(
          (e: { type: string }) => e.type === 'setTransform',
        );
        expect(setTransformCalls.length).toBeGreaterThanOrEqual(1);
        const lastCall = setTransformCalls[setTransformCalls.length - 1]!;
        expect(lastCall.props).toMatchObject({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 });
      }
      lm.destroy();
    });

    it('fractional DPR produces rounded backing store dimensions', () => {
      Object.defineProperty(window, 'devicePixelRatio', { value: 1.5, configurable: true });
      const lm = new LayerManager(container);
      for (const layerType of LAYER_ORDER) {
        const canvas = lm.getCanvas(layerType);
        expect(canvas.width).toBe(Math.round(800 * 1.5)); // 1200, not 1200.0
        expect(canvas.height).toBe(Math.round(600 * 1.5)); // 900, not 900.0
      }
      lm.destroy();
    });

    it('width, height, dpr getters reflect current container state', () => {
      Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
      const lm = new LayerManager(container);
      expect(lm.width).toBe(800);
      expect(lm.height).toBe(600);
      expect(lm.dpr).toBe(2);
      lm.destroy();
    });
  });

  describe('getCanvas and getContext', () => {
    it('getCanvas(LayerType) returns correct canvas for each type', () => {
      const lm = new LayerManager(container);
      for (const layerType of LAYER_ORDER) {
        const canvas = lm.getCanvas(layerType);
        expect(canvas).toBeInstanceOf(HTMLCanvasElement);
      }
      lm.destroy();
    });

    it('getContext(LayerType) returns correct context for each type', () => {
      const lm = new LayerManager(container);
      for (const layerType of LAYER_ORDER) {
        const ctx = lm.getContext(layerType);
        expect(ctx).toBeDefined();
        expect(typeof ctx.save).toBe('function');
      }
      lm.destroy();
    });
  });

  describe('ResizeObserver', () => {
    it('ResizeObserver is created on the container', () => {
      const lm = new LayerManager(container);
      expect(resizeObserverCallback).toBeDefined();
      lm.destroy();
    });

    it('resizeAll() updates canvas dimensions when container resizes', () => {
      const lm = new LayerManager(container);

      // Simulate container resize
      Object.defineProperty(container, 'clientWidth', { value: 1024, configurable: true });
      Object.defineProperty(container, 'clientHeight', { value: 768, configurable: true });
      Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });

      lm.resizeAll();

      expect(lm.width).toBe(1024);
      expect(lm.height).toBe(768);
      expect(lm.dpr).toBe(2);

      for (const layerType of LAYER_ORDER) {
        const canvas = lm.getCanvas(layerType);
        expect(canvas.width).toBe(1024 * 2);
        expect(canvas.height).toBe(768 * 2);
      }
      lm.destroy();
    });

    it('resizeAll() skips resize when container has zero dimensions', () => {
      const lm = new LayerManager(container);
      expect(lm.width).toBe(800);

      Object.defineProperty(container, 'clientWidth', { value: 0, configurable: true });
      Object.defineProperty(container, 'clientHeight', { value: 0, configurable: true });

      lm.resizeAll();

      // Should retain old values
      expect(lm.width).toBe(800);
      expect(lm.height).toBe(600);
      lm.destroy();
    });

    it('onResize callback fires with correct width, height, dpr after resize', () => {
      const onResize = vi.fn();
      const lm = new LayerManager(container, { onResize });

      // Called once during constructor
      expect(onResize).toHaveBeenCalledWith(800, 600, 1);

      Object.defineProperty(container, 'clientWidth', { value: 1024, configurable: true });
      Object.defineProperty(container, 'clientHeight', { value: 768, configurable: true });
      Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });

      lm.resizeAll();
      expect(onResize).toHaveBeenCalledWith(1024, 768, 2);
      lm.destroy();
    });
  });

  describe('destroy', () => {
    it('destroy() removes all canvases from the DOM', () => {
      const lm = new LayerManager(container);
      expect(container.querySelectorAll('canvas').length).toBe(4);
      lm.destroy();
      expect(container.querySelectorAll('canvas').length).toBe(0);
    });

    it('destroy() disconnects ResizeObserver', () => {
      const lm = new LayerManager(container);
      lm.destroy();
      expect(mockDisconnect).toHaveBeenCalled();
    });
  });
});
