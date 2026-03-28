import { FrameScheduler } from './frame-scheduler';
import { LayerType, LAYER_ORDER } from './types';
import type { Layer } from './types';

// --- rAF mock ---
let rafCallback: FrameRequestCallback | null = null;
let rafId = 0;
const mockCancelAnimationFrame = vi.fn();

vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
  rafCallback = cb;
  return ++rafId;
});
vi.stubGlobal('cancelAnimationFrame', mockCancelAnimationFrame);

function createMockLayer(type: LayerType): Layer & { draw: ReturnType<typeof vi.fn>; ctx: { save: ReturnType<typeof vi.fn>; restore: ReturnType<typeof vi.fn> } } {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const saveSpy = vi.spyOn(ctx, 'save');
  const restoreSpy = vi.spyOn(ctx, 'restore');

  return {
    type,
    canvas,
    ctx: ctx as unknown as { save: ReturnType<typeof vi.fn>; restore: ReturnType<typeof vi.fn> } & CanvasRenderingContext2D,
    isDirty: false,
    draw: vi.fn(),
    get save() { return saveSpy; },
    get restore() { return restoreSpy; },
  } as unknown as Layer & { draw: ReturnType<typeof vi.fn>; ctx: { save: ReturnType<typeof vi.fn>; restore: ReturnType<typeof vi.fn> } };
}

function tickFrame(): void {
  const cb = rafCallback;
  rafCallback = null;
  cb?.(performance.now());
}

describe('FrameScheduler', () => {
  beforeEach(() => {
    rafCallback = null;
    rafId = 0;
    mockCancelAnimationFrame.mockClear();
  });

  describe('initial state', () => {
    it('initial state has no dirty layers and is sleeping', () => {
      const scheduler = new FrameScheduler();
      expect(scheduler.isRunning).toBe(false);
      scheduler.destroy();
    });
  });

  describe('registerLayer', () => {
    it('registerLayer() stores the layer reference', () => {
      const scheduler = new FrameScheduler();
      const layer = createMockLayer(LayerType.Data);
      scheduler.registerLayer(layer);

      // Verify by marking dirty and ticking — layer.draw should be called
      scheduler.markDirty(LayerType.Data);
      tickFrame();
      expect(layer.draw).toHaveBeenCalled();
      scheduler.destroy();
    });
  });

  describe('markDirty', () => {
    it('markDirty() sets dirty flag for specified layer type', () => {
      const scheduler = new FrameScheduler();
      const dataLayer = createMockLayer(LayerType.Data);
      const bgLayer = createMockLayer(LayerType.Background);
      scheduler.registerLayer(dataLayer);
      scheduler.registerLayer(bgLayer);

      scheduler.markDirty(LayerType.Data);
      tickFrame();

      expect(dataLayer.draw).toHaveBeenCalledTimes(1);
      expect(bgLayer.draw).not.toHaveBeenCalled();
      scheduler.destroy();
    });

    it('markDirty() wakes sleeping scheduler (requests rAF)', () => {
      const scheduler = new FrameScheduler();
      const layer = createMockLayer(LayerType.Data);
      scheduler.registerLayer(layer);

      expect(scheduler.isRunning).toBe(false);
      scheduler.markDirty(LayerType.Data);
      expect(scheduler.isRunning).toBe(true);
      expect(rafCallback).not.toBeNull();
      scheduler.destroy();
    });
  });

  describe('tick behavior', () => {
    it('tick() calls ctx.save(), layer.draw(), ctx.restore() for dirty layers', () => {
      const scheduler = new FrameScheduler();
      const layer = createMockLayer(LayerType.Data);
      scheduler.registerLayer(layer);

      scheduler.markDirty(LayerType.Data);

      const callOrder: string[] = [];
      vi.spyOn(layer.ctx, 'save').mockImplementation(() => { callOrder.push('save'); });
      layer.draw.mockImplementation(() => { callOrder.push('draw'); });
      vi.spyOn(layer.ctx, 'restore').mockImplementation(() => { callOrder.push('restore'); });

      tickFrame();

      expect(callOrder).toEqual(['save', 'draw', 'restore']);
      scheduler.destroy();
    });

    it('tick() does NOT call draw for clean (non-dirty) layers', () => {
      const scheduler = new FrameScheduler();
      const dirtyLayer = createMockLayer(LayerType.Data);
      const cleanLayer = createMockLayer(LayerType.Background);
      scheduler.registerLayer(dirtyLayer);
      scheduler.registerLayer(cleanLayer);

      scheduler.markDirty(LayerType.Data);
      tickFrame();

      expect(dirtyLayer.draw).toHaveBeenCalled();
      expect(cleanLayer.draw).not.toHaveBeenCalled();
      scheduler.destroy();
    });

    it('tick() clears dirty flag after drawing', () => {
      const scheduler = new FrameScheduler();
      const layer = createMockLayer(LayerType.Data);
      scheduler.registerLayer(layer);

      scheduler.markDirty(LayerType.Data);
      tickFrame();

      // Tick again — should not draw since dirty flag was cleared
      tickFrame();
      expect(layer.draw).toHaveBeenCalledTimes(1);
      scheduler.destroy();
    });

    it('tick() processes layers in order: Background → Axis → Data → Interaction', () => {
      const scheduler = new FrameScheduler();
      const drawOrder: LayerType[] = [];

      for (const layerType of LAYER_ORDER) {
        const layer = createMockLayer(layerType);
        layer.draw.mockImplementation(() => {
          drawOrder.push(layerType);
        });
        scheduler.registerLayer(layer);
      }

      scheduler.markAllDirty();
      tickFrame();

      expect(drawOrder).toEqual([
        LayerType.Background,
        LayerType.Axis,
        LayerType.Data,
        LayerType.Interaction,
      ]);
      scheduler.destroy();
    });
  });

  describe('sleep behavior', () => {
    it('scheduler sleeps after N consecutive idle frames (default 3)', () => {
      const scheduler = new FrameScheduler();
      const layer = createMockLayer(LayerType.Data);
      scheduler.registerLayer(layer);

      scheduler.start();
      expect(scheduler.isRunning).toBe(true);

      // 3 idle frames
      tickFrame(); // idle 1
      expect(scheduler.isRunning).toBe(true);
      tickFrame(); // idle 2
      expect(scheduler.isRunning).toBe(true);
      tickFrame(); // idle 3 — should sleep
      expect(scheduler.isRunning).toBe(false);
      scheduler.destroy();
    });
  });

  describe('markAllDirty', () => {
    it('markAllDirty() sets all layer flags to true', () => {
      const scheduler = new FrameScheduler();
      const layers = LAYER_ORDER.map((type) => {
        const layer = createMockLayer(type);
        scheduler.registerLayer(layer);
        return layer;
      });

      scheduler.markAllDirty();
      tickFrame();

      for (const layer of layers) {
        expect(layer.draw).toHaveBeenCalledTimes(1);
      }
      scheduler.destroy();
    });
  });

  describe('stop and destroy', () => {
    it('stop() cancels pending rAF', () => {
      const scheduler = new FrameScheduler();
      const layer = createMockLayer(LayerType.Data);
      scheduler.registerLayer(layer);
      scheduler.markDirty(LayerType.Data);
      expect(scheduler.isRunning).toBe(true);

      scheduler.stop();
      expect(scheduler.isRunning).toBe(false);
      expect(mockCancelAnimationFrame).toHaveBeenCalled();
    });

    it('destroy() stops the loop and clears layer references', () => {
      const scheduler = new FrameScheduler();
      const layer = createMockLayer(LayerType.Data);
      scheduler.registerLayer(layer);
      scheduler.markDirty(LayerType.Data);

      scheduler.destroy();
      expect(scheduler.isRunning).toBe(false);

      // After destroy, marking dirty should not call draw
      rafCallback = null;
      scheduler.markDirty(LayerType.Data);
      tickFrame();
      expect(layer.draw).not.toHaveBeenCalled();
    });
  });

  describe('isRunning', () => {
    it('isRunning getter reflects loop state accurately', () => {
      const scheduler = new FrameScheduler();
      expect(scheduler.isRunning).toBe(false);

      const layer = createMockLayer(LayerType.Data);
      scheduler.registerLayer(layer);

      scheduler.start();
      expect(scheduler.isRunning).toBe(true);

      scheduler.stop();
      expect(scheduler.isRunning).toBe(false);
      scheduler.destroy();
    });
  });
});
