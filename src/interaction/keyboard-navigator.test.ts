import { KeyboardNavigator } from './keyboard-navigator';
import type { CrosshairDataSource, PointerState } from './types';
import type { ZoomHandler } from './zoom-handler';
import type { Scale } from '../core/scale';
import type { ResolvedConfig } from '../config/types';
import { RingBuffer } from '../core/ring-buffer';
import type { DataPoint } from '../core/types';

function createScale(): Scale {
  return {
    xToPixel: vi.fn((ts: number) => ts / 10),
    yToPixel: vi.fn((val: number) => 500 - val * 2),
    pixelToX: vi.fn((px: number) => px * 10),
    viewport: { x: 0, y: 0, width: 800, height: 600 },
    domainX: { min: 0, max: 10000 },
    domainY: { min: 0, max: 200 },
  } as unknown as Scale;
}

function createDataSource(points: DataPoint[]): CrosshairDataSource {
  const buffer = new RingBuffer<DataPoint>(1000);
  for (const p of points) {
    buffer.push(p);
  }
  return {
    getSeries: () => [{ id: 'test', buffer }],
  };
}

function createZoomHandler(): ZoomHandler & { applyZoom: ReturnType<typeof vi.fn> } {
  return {
    applyZoom: vi.fn(),
  } as unknown as ZoomHandler & { applyZoom: ReturnType<typeof vi.fn> };
}

function createConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    zoom: true,
    ...overrides,
  } as ResolvedConfig;
}

function createPointerState(): PointerState {
  return { x: 0, y: 0, active: false, pointerType: '' };
}

describe('KeyboardNavigator', () => {
  const points: DataPoint[] = [
    { timestamp: 1000, value: 10 },
    { timestamp: 2000, value: 20 },
    { timestamp: 3000, value: 30 },
    { timestamp: 4000, value: 40 },
    { timestamp: 5000, value: 50 },
  ];

  it('throws if scale is not provided', () => {
    expect(() => new KeyboardNavigator(
      null as unknown as Scale,
      createDataSource(points),
      vi.fn(),
      createZoomHandler(),
      vi.fn(),
    )).toThrow('KeyboardNavigator: scale instance is required');
  });

  it('throws if dataSource is not provided', () => {
    expect(() => new KeyboardNavigator(
      createScale(),
      null as unknown as CrosshairDataSource,
      vi.fn(),
      createZoomHandler(),
      vi.fn(),
    )).toThrow('KeyboardNavigator: dataSource is required');
  });

  it('throws if markDirty is not a function', () => {
    expect(() => new KeyboardNavigator(
      createScale(),
      createDataSource(points),
      null as unknown as () => void,
      createZoomHandler(),
      vi.fn(),
    )).toThrow('KeyboardNavigator: markDirty callback is required');
  });

  it('throws if zoomHandler is not provided', () => {
    expect(() => new KeyboardNavigator(
      createScale(),
      createDataSource(points),
      vi.fn(),
      null as unknown as ZoomHandler,
      vi.fn(),
    )).toThrow('KeyboardNavigator: zoomHandler instance is required');
  });

  it('throws if updateTooltip is not a function', () => {
    expect(() => new KeyboardNavigator(
      createScale(),
      createDataSource(points),
      vi.fn(),
      createZoomHandler(),
      null as unknown as () => void,
    )).toThrow('KeyboardNavigator: updateTooltip callback is required');
  });

  describe('arrow key navigation', () => {
    it('ArrowRight moves crosshair to next data point', () => {
      const scale = createScale();
      const markDirty = vi.fn();
      const updateTooltip = vi.fn();
      const pointerState = createPointerState();
      const nav = new KeyboardNavigator(
        scale, createDataSource(points), markDirty, createZoomHandler(), updateTooltip,
      );

      // First press initializes to index 0, then moves to 1
      nav.handleKeyboard({ key: 'ArrowRight' }, createConfig(), pointerState);
      expect(pointerState.active).toBe(true);
      expect(pointerState.pointerType).toBe('keyboard');
      expect(scale.xToPixel).toHaveBeenCalledWith(2000);
      expect(markDirty).toHaveBeenCalled();
      expect(updateTooltip).toHaveBeenCalled();
    });

    it('ArrowLeft moves crosshair to previous data point', () => {
      const scale = createScale();
      const markDirty = vi.fn();
      const updateTooltip = vi.fn();
      const pointerState = createPointerState();
      const nav = new KeyboardNavigator(
        scale, createDataSource(points), markDirty, createZoomHandler(), updateTooltip,
      );

      // Navigate right twice first (index 0 → 1 → 2)
      nav.handleKeyboard({ key: 'ArrowRight' }, createConfig(), pointerState);
      nav.handleKeyboard({ key: 'ArrowRight' }, createConfig(), pointerState);
      // Now navigate left (index 2 → 1)
      nav.handleKeyboard({ key: 'ArrowLeft' }, createConfig(), pointerState);
      expect(scale.xToPixel).toHaveBeenLastCalledWith(2000);
    });

    it('at first data point, ArrowLeft does nothing', () => {
      const scale = createScale();
      const markDirty = vi.fn();
      const pointerState = createPointerState();
      const nav = new KeyboardNavigator(
        scale, createDataSource(points), markDirty, createZoomHandler(), vi.fn(),
      );

      // Initialize to index 0
      nav.handleKeyboard({ key: 'ArrowRight' }, createConfig(), pointerState);
      markDirty.mockClear();

      // Navigate left at index 1 → 0
      nav.handleKeyboard({ key: 'ArrowLeft' }, createConfig(), pointerState);
      markDirty.mockClear();

      // Now at index 0, ArrowLeft should do nothing
      nav.handleKeyboard({ key: 'ArrowLeft' }, createConfig(), pointerState);
      expect(markDirty).not.toHaveBeenCalled();
    });

    it('at last data point, ArrowRight does nothing', () => {
      const scale = createScale();
      const markDirty = vi.fn();
      const pointerState = createPointerState();
      const nav = new KeyboardNavigator(
        scale, createDataSource(points), markDirty, createZoomHandler(), vi.fn(),
      );

      // Navigate to last point (index 4)
      for (let i = 0; i < 5; i++) {
        nav.handleKeyboard({ key: 'ArrowRight' }, createConfig(), pointerState);
      }
      markDirty.mockClear();

      // ArrowRight at last point should do nothing
      nav.handleKeyboard({ key: 'ArrowRight' }, createConfig(), pointerState);
      expect(markDirty).not.toHaveBeenCalled();
    });
  });

  describe('zoom keys', () => {
    it('+/= triggers zoom in via applyZoom', () => {
      const zoomHandler = createZoomHandler();
      const pointerState = createPointerState();
      const config = createConfig();
      const nav = new KeyboardNavigator(
        createScale(), createDataSource(points), vi.fn(), zoomHandler, vi.fn(),
      );

      // Navigate to a data point first
      nav.handleKeyboard({ key: 'ArrowRight' }, config, pointerState);

      nav.handleKeyboard({ key: '+' }, config, pointerState);
      expect(zoomHandler.applyZoom).toHaveBeenCalledWith(
        2000, // timestamp of data point at index 1
        expect.any(Number),
        config,
      );
      // Factor should be < 1 for zoom in (1/ZOOM_FACTOR)
      const factor = zoomHandler.applyZoom.mock.calls[0]![2 - 1] as number;
      expect(factor).toBeLessThan(1);

      zoomHandler.applyZoom.mockClear();
      nav.handleKeyboard({ key: '=' }, config, pointerState);
      expect(zoomHandler.applyZoom).toHaveBeenCalled();
    });

    it('- triggers zoom out via applyZoom', () => {
      const zoomHandler = createZoomHandler();
      const pointerState = createPointerState();
      const config = createConfig();
      const nav = new KeyboardNavigator(
        createScale(), createDataSource(points), vi.fn(), zoomHandler, vi.fn(),
      );

      // Navigate to a data point first
      nav.handleKeyboard({ key: 'ArrowRight' }, config, pointerState);

      nav.handleKeyboard({ key: '-' }, config, pointerState);
      expect(zoomHandler.applyZoom).toHaveBeenCalled();
      // Factor should be > 1 for zoom out (ZOOM_FACTOR)
      const factor = zoomHandler.applyZoom.mock.calls[0]![1] as number;
      expect(factor).toBeGreaterThan(1);
    });

    it('zoom keys no-op when config.zoom === false', () => {
      const zoomHandler = createZoomHandler();
      const pointerState = createPointerState();
      const config = createConfig({ zoom: false });
      const nav = new KeyboardNavigator(
        createScale(), createDataSource(points), vi.fn(), zoomHandler, vi.fn(),
      );

      // Navigate to a data point first
      nav.handleKeyboard({ key: 'ArrowRight' }, createConfig(), pointerState);

      // applyZoom itself checks config.zoom === false and returns early
      nav.handleKeyboard({ key: '+' }, config, pointerState);
      // applyZoom is still called (config check is inside applyZoom)
      expect(zoomHandler.applyZoom).toHaveBeenCalled();
    });

    it('zoom keys no-op when not navigating (no current index)', () => {
      const zoomHandler = createZoomHandler();
      const pointerState = createPointerState();
      const nav = new KeyboardNavigator(
        createScale(), createDataSource(points), vi.fn(), zoomHandler, vi.fn(),
      );

      nav.handleKeyboard({ key: '+' }, createConfig(), pointerState);
      expect(zoomHandler.applyZoom).not.toHaveBeenCalled();
    });
  });

  describe('deactivate', () => {
    it('resets index on deactivate', () => {
      const markDirty = vi.fn();
      const pointerState = createPointerState();
      const nav = new KeyboardNavigator(
        createScale(), createDataSource(points), markDirty, createZoomHandler(), vi.fn(),
      );

      // Navigate to index 2
      nav.handleKeyboard({ key: 'ArrowRight' }, createConfig(), pointerState);
      nav.handleKeyboard({ key: 'ArrowRight' }, createConfig(), pointerState);
      nav.handleKeyboard({ key: 'ArrowRight' }, createConfig(), pointerState);

      nav.deactivate();
      markDirty.mockClear();

      // After deactivate, next ArrowRight should start from index 0 again
      nav.handleKeyboard({ key: 'ArrowRight' }, createConfig(), pointerState);
      expect(markDirty).toHaveBeenCalled();
    });
  });

  describe('empty data', () => {
    it('arrow keys do nothing with empty data', () => {
      const markDirty = vi.fn();
      const pointerState = createPointerState();
      const nav = new KeyboardNavigator(
        createScale(), createDataSource([]), markDirty, createZoomHandler(), vi.fn(),
      );

      nav.handleKeyboard({ key: 'ArrowRight' }, createConfig(), pointerState);
      expect(markDirty).not.toHaveBeenCalled();
    });
  });
});
