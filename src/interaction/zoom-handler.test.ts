import { ZoomHandler, MIN_ZOOM_WIDTH, MAX_ZOOM_WIDTH } from './zoom-handler';
import type { WheelState, PinchState } from './types';
import type { ResolvedConfig } from '../config/types';
import { Scale } from '../core/scale';
import { LayerType } from '../renderer/types';

function createScale(): Scale {
  return new Scale({
    canvasWidth: 800,
    canvasHeight: 400,
    dpr: 1,
    padding: { top: 10, right: 10, bottom: 30, left: 60 },
  });
}

function createConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    zoom: true,
    ...overrides,
  } as ResolvedConfig;
}

function createZoomHandler(overrides: {
  scale?: Scale;
  markDirty?: (layer: LayerType) => void;
  getVisibleValues?: () => number[];
  preventWheel?: () => void;
} = {}) {
  const scale = overrides.scale ?? createScale();
  const markDirty = overrides.markDirty ?? vi.fn();
  const getVisibleValues = overrides.getVisibleValues ?? (() => [10, 20, 30]);
  const preventWheel = overrides.preventWheel ?? vi.fn();

  const handler = new ZoomHandler(scale, markDirty, getVisibleValues, preventWheel);
  return { handler, scale, markDirty, getVisibleValues, preventWheel };
}

describe('ZoomHandler', () => {
  describe('constructor validation', () => {
    it('throws if scale is missing', () => {
      expect(
        () => new ZoomHandler(null as unknown as never, vi.fn(), vi.fn(), vi.fn()),
      ).toThrow('ZoomHandler: scale instance is required');
    });

    it('throws if markDirty is not a function', () => {
      expect(
        () => new ZoomHandler(createScale(), null as unknown as never, vi.fn(), vi.fn()),
      ).toThrow('ZoomHandler: markDirty callback is required');
    });

    it('throws if getVisibleValues is not a function', () => {
      expect(
        () => new ZoomHandler(createScale(), vi.fn(), null as unknown as never, vi.fn()),
      ).toThrow('ZoomHandler: getVisibleValues callback is required');
    });

    it('throws if preventWheel is not a function', () => {
      expect(
        () => new ZoomHandler(createScale(), vi.fn(), vi.fn(), null as unknown as never),
      ).toThrow('ZoomHandler: preventWheel callback is required');
    });
  });

  describe('handleWheel zoom in', () => {
    it('narrows X domain when deltaY < 0 (scroll up)', () => {
      const { handler, scale } = createZoomHandler();
      scale.setDomainX(0, 1000);
      scale.setDomainY(0, 100);
      const config = createConfig();

      const oldWidth = scale.domainX.max - scale.domainX.min;

      // Cursor at center of viewport
      const viewport = scale.viewport;
      const wheelState: WheelState = {
        x: viewport.x + viewport.width / 2,
        y: viewport.y + viewport.height / 2,
        deltaY: -120,
      };

      handler.handleWheel(wheelState, config);

      const newWidth = scale.domainX.max - scale.domainX.min;
      expect(newWidth).toBeLessThan(oldWidth);
    });
  });

  describe('handleWheel zoom out', () => {
    it('widens X domain when deltaY > 0 (scroll down)', () => {
      const { handler, scale } = createZoomHandler();
      scale.setDomainX(0, 1000);
      scale.setDomainY(0, 100);
      const config = createConfig();

      const oldWidth = scale.domainX.max - scale.domainX.min;

      const viewport = scale.viewport;
      const wheelState: WheelState = {
        x: viewport.x + viewport.width / 2,
        y: viewport.y + viewport.height / 2,
        deltaY: 100,
      };

      handler.handleWheel(wheelState, config);

      const newWidth = scale.domainX.max - scale.domainX.min;
      expect(newWidth).toBeGreaterThan(oldWidth);
    });
  });

  describe('cursor-centered zoom', () => {
    it('cursor data value stays at same position before/after zoom', () => {
      const { handler, scale } = createZoomHandler();
      scale.setDomainX(0, 1000);
      scale.setDomainY(0, 100);
      const config = createConfig();

      const viewport = scale.viewport;
      // Cursor at 1/4 of the viewport
      const cursorPixel = viewport.x + viewport.width * 0.25;
      const cursorDataBefore = scale.pixelToX(cursorPixel);

      const wheelState: WheelState = {
        x: cursorPixel,
        y: viewport.y + viewport.height / 2,
        deltaY: -120,
      };

      handler.handleWheel(wheelState, config);

      // After zoom, the same pixel should map to the same data value
      const cursorDataAfter = scale.pixelToX(cursorPixel);
      expect(cursorDataAfter).toBeCloseTo(cursorDataBefore, 5);
    });
  });

  describe('config.zoom === false', () => {
    it('does not change domain', () => {
      const { handler, scale } = createZoomHandler();
      scale.setDomainX(0, 1000);
      scale.setDomainY(0, 100);
      const config = createConfig({ zoom: false });

      const viewport = scale.viewport;
      const wheelState: WheelState = {
        x: viewport.x + viewport.width / 2,
        y: viewport.y + viewport.height / 2,
        deltaY: -120,
      };

      handler.handleWheel(wheelState, config);

      expect(scale.domainX.min).toBe(0);
      expect(scale.domainX.max).toBe(1000);
    });
  });

  describe('pointer outside viewport', () => {
    it('does not change domain when pointer is outside viewport', () => {
      const { handler, scale } = createZoomHandler();
      scale.setDomainX(0, 1000);
      scale.setDomainY(0, 100);
      const config = createConfig();

      // Pointer outside viewport (in left padding area)
      const wheelState: WheelState = { x: 0, y: 50, deltaY: -120 };

      handler.handleWheel(wheelState, config);

      expect(scale.domainX.min).toBe(0);
      expect(scale.domainX.max).toBe(1000);
    });
  });

  describe('isZoomed state', () => {
    it('is false initially, true after handleWheel, resets on resetZoom()', () => {
      const { handler, scale } = createZoomHandler();
      scale.setDomainX(0, 1000);
      scale.setDomainY(0, 100);
      const config = createConfig();

      expect(handler.isZoomed).toBe(false);

      const viewport = scale.viewport;
      const wheelState: WheelState = {
        x: viewport.x + viewport.width / 2,
        y: viewport.y + viewport.height / 2,
        deltaY: -120,
      };

      handler.handleWheel(wheelState, config);
      expect(handler.isZoomed).toBe(true);

      handler.resetZoom();
      expect(handler.isZoomed).toBe(false);
    });
  });

  describe('MIN_ZOOM_WIDTH', () => {
    it('does not zoom below MIN_ZOOM_WIDTH', () => {
      const { handler, scale } = createZoomHandler();
      // Very tiny domain
      scale.setDomainX(500, 500 + MIN_ZOOM_WIDTH);
      scale.setDomainY(0, 100);
      const config = createConfig();

      const viewport = scale.viewport;
      const wheelState: WheelState = {
        x: viewport.x + viewport.width / 2,
        y: viewport.y + viewport.height / 2,
        deltaY: -120, // zoom in
      };

      handler.handleWheel(wheelState, config);

      const newWidth = scale.domainX.max - scale.domainX.min;
      expect(newWidth).toBeGreaterThanOrEqual(MIN_ZOOM_WIDTH);
    });
  });

  describe('MAX_ZOOM_WIDTH', () => {
    it('does not zoom beyond MAX_ZOOM_WIDTH', () => {
      const { handler, scale } = createZoomHandler();
      // Very large domain near max
      scale.setDomainX(0, MAX_ZOOM_WIDTH * 0.99);
      scale.setDomainY(0, 100);
      const config = createConfig();

      const viewport = scale.viewport;
      const wheelState: WheelState = {
        x: viewport.x + viewport.width / 2,
        y: viewport.y + viewport.height / 2,
        deltaY: 100, // zoom out
      };

      handler.handleWheel(wheelState, config);

      const newWidth = scale.domainX.max - scale.domainX.min;
      expect(newWidth).toBeLessThanOrEqual(MAX_ZOOM_WIDTH);
    });
  });

  describe('markDirty callback', () => {
    it('calls markDirty for Data, Axis, and Background layers on zoom', () => {
      const markDirty = vi.fn();
      const { handler, scale } = createZoomHandler({ markDirty });
      scale.setDomainX(0, 1000);
      scale.setDomainY(0, 100);
      const config = createConfig();

      const viewport = scale.viewport;
      const wheelState: WheelState = {
        x: viewport.x + viewport.width / 2,
        y: viewport.y + viewport.height / 2,
        deltaY: -120,
      };

      handler.handleWheel(wheelState, config);

      expect(markDirty).toHaveBeenCalledWith(LayerType.Data);
      expect(markDirty).toHaveBeenCalledWith(LayerType.Axis);
      expect(markDirty).toHaveBeenCalledWith(LayerType.Background);
      expect(markDirty).toHaveBeenCalledTimes(3);
    });
  });

  describe('Y domain auto-fit', () => {
    it('auto-fits Y to visible data after zoom', () => {
      const getVisibleValues = vi.fn().mockReturnValue([50, 60, 70]);
      const { handler, scale } = createZoomHandler({ getVisibleValues });
      scale.setDomainX(0, 1000);
      scale.setDomainY(0, 100);
      const config = createConfig();

      const viewport = scale.viewport;
      const wheelState: WheelState = {
        x: viewport.x + viewport.width / 2,
        y: viewport.y + viewport.height / 2,
        deltaY: -120,
      };

      handler.handleWheel(wheelState, config);

      expect(getVisibleValues).toHaveBeenCalled();
      // Y domain should be fitted to [50, 70] with padding
      expect(scale.domainY.min).toBeLessThan(50);
      expect(scale.domainY.max).toBeGreaterThan(70);
    });
  });

  describe('deltaY === 0', () => {
    it('does nothing when deltaY is 0', () => {
      const markDirty = vi.fn();
      const { handler, scale } = createZoomHandler({ markDirty });
      scale.setDomainX(0, 1000);
      scale.setDomainY(0, 100);
      const config = createConfig();

      const viewport = scale.viewport;
      const wheelState: WheelState = {
        x: viewport.x + viewport.width / 2,
        y: viewport.y + viewport.height / 2,
        deltaY: 0,
      };

      handler.handleWheel(wheelState, config);

      expect(markDirty).not.toHaveBeenCalled();
      expect(scale.domainX.min).toBe(0);
      expect(scale.domainX.max).toBe(1000);
    });
  });

  describe('degenerate domain', () => {
    it('does nothing when domainX.min === domainX.max', () => {
      const markDirty = vi.fn();
      const { handler, scale } = createZoomHandler({ markDirty });
      scale.setDomainX(500, 500);
      scale.setDomainY(0, 100);
      const config = createConfig();

      const viewport = scale.viewport;
      const wheelState: WheelState = {
        x: viewport.x + viewport.width / 2,
        y: viewport.y + viewport.height / 2,
        deltaY: -120,
      };

      handler.handleWheel(wheelState, config);

      expect(markDirty).not.toHaveBeenCalled();
    });
  });

  describe('empty data', () => {
    it('does not crash when getVisibleValues returns empty array', () => {
      const getVisibleValues = vi.fn().mockReturnValue([]);
      const { handler, scale } = createZoomHandler({ getVisibleValues });
      scale.setDomainX(0, 1000);
      scale.setDomainY(0, 100);
      const config = createConfig();

      const viewport = scale.viewport;
      const wheelState: WheelState = {
        x: viewport.x + viewport.width / 2,
        y: viewport.y + viewport.height / 2,
        deltaY: -120,
      };

      expect(() => handler.handleWheel(wheelState, config)).not.toThrow();
      // Y domain resets to default (0,1) with padding when no visible values
      expect(scale.domainY.min).toBe(0);
      expect(scale.domainY.max).toBe(1);
    });
  });

  describe('applyZoom', () => {
    it('narrows X domain with factor < 1 (zoom in)', () => {
      const { handler, scale } = createZoomHandler();
      scale.setDomainX(0, 1000);
      scale.setDomainY(0, 100);
      const config = createConfig();
      const oldWidth = scale.domainX.max - scale.domainX.min;

      handler.applyZoom(500, 0.5, config);

      const newWidth = scale.domainX.max - scale.domainX.min;
      expect(newWidth).toBeLessThan(oldWidth);
    });

    it('widens X domain with factor > 1 (zoom out)', () => {
      const { handler, scale } = createZoomHandler();
      scale.setDomainX(0, 1000);
      scale.setDomainY(0, 100);
      const config = createConfig();
      const oldWidth = scale.domainX.max - scale.domainX.min;

      handler.applyZoom(500, 2, config);

      const newWidth = scale.domainX.max - scale.domainX.min;
      expect(newWidth).toBeGreaterThan(oldWidth);
    });

    it('centers on provided cursorX — cursor data value preserved', () => {
      const { handler, scale } = createZoomHandler();
      scale.setDomainX(0, 1000);
      scale.setDomainY(0, 100);
      const config = createConfig();

      const cursorX = 250;
      handler.applyZoom(cursorX, 0.5, config);

      // After zoom, cursorX should still be within the domain at the expected ratio
      const { min, max } = scale.domainX;
      const ratio = (cursorX - min) / (max - min);
      expect(ratio).toBeCloseTo(0.25, 1);
    });

    it('sets isZoomed = true', () => {
      const { handler, scale } = createZoomHandler();
      scale.setDomainX(0, 1000);
      scale.setDomainY(0, 100);
      const config = createConfig();

      expect(handler.isZoomed).toBe(false);
      handler.applyZoom(500, 0.5, config);
      expect(handler.isZoomed).toBe(true);
    });

    it('marks Data, Axis, Background layers dirty', () => {
      const markDirty = vi.fn();
      const { handler, scale } = createZoomHandler({ markDirty });
      scale.setDomainX(0, 1000);
      scale.setDomainY(0, 100);
      const config = createConfig();

      handler.applyZoom(500, 0.5, config);

      expect(markDirty).toHaveBeenCalledWith(LayerType.Data);
      expect(markDirty).toHaveBeenCalledWith(LayerType.Axis);
      expect(markDirty).toHaveBeenCalledWith(LayerType.Background);
      expect(markDirty).toHaveBeenCalledTimes(3);
    });

    it('clamps to MIN_ZOOM_WIDTH', () => {
      const { handler, scale } = createZoomHandler();
      scale.setDomainX(500, 500 + MIN_ZOOM_WIDTH);
      scale.setDomainY(0, 100);
      const config = createConfig();

      handler.applyZoom(500, 0.1, config);

      const newWidth = scale.domainX.max - scale.domainX.min;
      expect(newWidth).toBeGreaterThanOrEqual(MIN_ZOOM_WIDTH);
    });

    it('clamps to MAX_ZOOM_WIDTH', () => {
      const { handler, scale } = createZoomHandler();
      scale.setDomainX(0, MAX_ZOOM_WIDTH * 0.99);
      scale.setDomainY(0, 100);
      const config = createConfig();

      handler.applyZoom(0, 10, config);

      const newWidth = scale.domainX.max - scale.domainX.min;
      expect(newWidth).toBeLessThanOrEqual(MAX_ZOOM_WIDTH);
    });

    it('does nothing with degenerate domain (min === max)', () => {
      const markDirty = vi.fn();
      const { handler, scale } = createZoomHandler({ markDirty });
      scale.setDomainX(500, 500);
      scale.setDomainY(0, 100);
      const config = createConfig();

      handler.applyZoom(500, 0.5, config);

      expect(markDirty).not.toHaveBeenCalled();
    });

    it('does nothing with config.zoom === false', () => {
      const markDirty = vi.fn();
      const { handler, scale } = createZoomHandler({ markDirty });
      scale.setDomainX(0, 1000);
      scale.setDomainY(0, 100);
      const config = createConfig({ zoom: false });

      handler.applyZoom(500, 0.5, config);

      expect(markDirty).not.toHaveBeenCalled();
    });
  });

  describe('handlePinch', () => {
    it('zooms in when scale > 1 (fingers spread) — X domain narrows', () => {
      const { handler, scale } = createZoomHandler();
      scale.setDomainX(0, 1000);
      scale.setDomainY(0, 100);
      const config = createConfig();
      const oldWidth = scale.domainX.max - scale.domainX.min;

      const viewport = scale.viewport;
      const pinchState: PinchState = { centerX: viewport.x + viewport.width / 2, centerY: viewport.y + viewport.height / 2, scale: 1.5 };

      handler.handlePinch(pinchState, config);

      const newWidth = scale.domainX.max - scale.domainX.min;
      expect(newWidth).toBeLessThan(oldWidth);
    });

    it('zooms out when scale < 1 (fingers pinch) — X domain widens', () => {
      const { handler, scale } = createZoomHandler();
      scale.setDomainX(0, 1000);
      scale.setDomainY(0, 100);
      const config = createConfig();
      const oldWidth = scale.domainX.max - scale.domainX.min;

      const viewport = scale.viewport;
      const pinchState: PinchState = { centerX: viewport.x + viewport.width / 2, centerY: viewport.y + viewport.height / 2, scale: 0.5 };

      handler.handlePinch(pinchState, config);

      const newWidth = scale.domainX.max - scale.domainX.min;
      expect(newWidth).toBeGreaterThan(oldWidth);
    });

    it('centers on pinch midpoint (centerX in data space)', () => {
      const { handler, scale } = createZoomHandler();
      scale.setDomainX(0, 1000);
      scale.setDomainY(0, 100);
      const config = createConfig();

      const viewport = scale.viewport;
      const centerPixel = viewport.x + viewport.width * 0.25;
      const cursorDataBefore = scale.pixelToX(centerPixel);
      const pinchState: PinchState = { centerX: centerPixel, centerY: viewport.y + viewport.height / 2, scale: 1.5 };

      handler.handlePinch(pinchState, config);

      const cursorDataAfter = scale.pixelToX(centerPixel);
      expect(cursorDataAfter).toBeCloseTo(cursorDataBefore, 3);
    });

    it('does nothing with config.zoom === false', () => {
      const markDirty = vi.fn();
      const { handler, scale } = createZoomHandler({ markDirty });
      scale.setDomainX(0, 1000);
      scale.setDomainY(0, 100);
      const config = createConfig({ zoom: false });

      const viewport = scale.viewport;
      const pinchState: PinchState = { centerX: viewport.x + viewport.width / 2, centerY: viewport.y + viewport.height / 2, scale: 1.5 };

      handler.handlePinch(pinchState, config);

      expect(markDirty).not.toHaveBeenCalled();
      expect(scale.domainX.min).toBe(0);
      expect(scale.domainX.max).toBe(1000);
    });

    it('does nothing when scale === 1', () => {
      const markDirty = vi.fn();
      const { handler, scale } = createZoomHandler({ markDirty });
      scale.setDomainX(0, 1000);
      scale.setDomainY(0, 100);
      const config = createConfig();

      const viewport = scale.viewport;
      const pinchState: PinchState = { centerX: viewport.x + viewport.width / 2, centerY: viewport.y + viewport.height / 2, scale: 1 };

      handler.handlePinch(pinchState, config);

      expect(markDirty).not.toHaveBeenCalled();
    });

    it('does nothing when scale <= 0 (invalid)', () => {
      const markDirty = vi.fn();
      const { handler, scale } = createZoomHandler({ markDirty });
      scale.setDomainX(0, 1000);
      scale.setDomainY(0, 100);
      const config = createConfig();

      const viewport = scale.viewport;
      handler.handlePinch({ centerX: viewport.x + viewport.width / 2, centerY: viewport.y + viewport.height / 2, scale: 0 }, config);
      handler.handlePinch({ centerX: viewport.x + viewport.width / 2, centerY: viewport.y + viewport.height / 2, scale: -1 }, config);

      expect(markDirty).not.toHaveBeenCalled();
    });

    it('sets isZoomed = true', () => {
      const { handler, scale } = createZoomHandler();
      scale.setDomainX(0, 1000);
      scale.setDomainY(0, 100);
      const config = createConfig();

      expect(handler.isZoomed).toBe(false);

      const viewport = scale.viewport;
      handler.handlePinch({ centerX: viewport.x + viewport.width / 2, centerY: viewport.y + viewport.height / 2, scale: 1.5 }, config);

      expect(handler.isZoomed).toBe(true);
    });

    it('Y auto-fits to visible data', () => {
      const getVisibleValues = vi.fn().mockReturnValue([50, 60, 70]);
      const { handler, scale } = createZoomHandler({ getVisibleValues });
      scale.setDomainX(0, 1000);
      scale.setDomainY(0, 100);
      const config = createConfig();

      const viewport = scale.viewport;
      handler.handlePinch({ centerX: viewport.x + viewport.width / 2, centerY: viewport.y + viewport.height / 2, scale: 1.5 }, config);

      expect(getVisibleValues).toHaveBeenCalled();
      expect(scale.domainY.min).toBeLessThan(50);
      expect(scale.domainY.max).toBeGreaterThan(70);
    });
  });

  describe('preventWheel', () => {
    it('calls preventWheel callback when zoom is performed', () => {
      const preventWheel = vi.fn();
      const { handler, scale } = createZoomHandler({ preventWheel });
      scale.setDomainX(0, 1000);
      scale.setDomainY(0, 100);
      const config = createConfig();

      const viewport = scale.viewport;
      const wheelState: WheelState = {
        x: viewport.x + viewport.width / 2,
        y: viewport.y + viewport.height / 2,
        deltaY: -120,
      };

      handler.handleWheel(wheelState, config);

      expect(preventWheel).toHaveBeenCalledTimes(1);
    });

    it('does not call preventWheel when zoom is disabled', () => {
      const preventWheel = vi.fn();
      const { handler, scale } = createZoomHandler({ preventWheel });
      scale.setDomainX(0, 1000);
      scale.setDomainY(0, 100);
      const config = createConfig({ zoom: false });

      const viewport = scale.viewport;
      const wheelState: WheelState = {
        x: viewport.x + viewport.width / 2,
        y: viewport.y + viewport.height / 2,
        deltaY: -120,
      };

      handler.handleWheel(wheelState, config);

      expect(preventWheel).not.toHaveBeenCalled();
    });
  });
});
