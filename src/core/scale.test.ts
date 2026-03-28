import { Scale } from './scale';
import type { ScaleOptions } from './types';

function makeOptions(overrides: Partial<ScaleOptions> = {}): ScaleOptions {
  return {
    canvasWidth: 800,
    canvasHeight: 600,
    dpr: 2,
    padding: { top: 50, right: 50, bottom: 50, left: 50 },
    ...overrides,
  };
}

describe('Scale', () => {
  describe('constructor and viewport', () => {
    it('creates correct viewport from canvas size and padding', () => {
      const scale = new Scale(makeOptions());
      expect(scale.viewport).toEqual({ x: 50, y: 50, width: 700, height: 500 });
    });

    it('padding reduces viewport correctly (800x600, padding 50 all sides → 700x500 at 50,50)', () => {
      const scale = new Scale(makeOptions());
      expect(scale.viewport.x).toBe(50);
      expect(scale.viewport.y).toBe(50);
      expect(scale.viewport.width).toBe(700);
      expect(scale.viewport.height).toBe(500);
    });

    it('asymmetric padding computes viewport correctly', () => {
      const scale = new Scale(makeOptions({
        padding: { top: 10, right: 20, bottom: 30, left: 40 },
      }));
      expect(scale.viewport).toEqual({ x: 40, y: 10, width: 740, height: 560 });
    });

    it('DPR is stored and accessible via getter', () => {
      const scale = new Scale(makeOptions({ dpr: 2.5 }));
      expect(scale.dpr).toBe(2.5);
    });
  });

  describe('input validation', () => {
    it('throws on non-positive canvasWidth', () => {
      expect(() => new Scale(makeOptions({ canvasWidth: 0 }))).toThrow('Scale: canvasWidth must be positive');
      expect(() => new Scale(makeOptions({ canvasWidth: -1 }))).toThrow('Scale: canvasWidth must be positive');
    });

    it('throws on non-positive canvasHeight', () => {
      expect(() => new Scale(makeOptions({ canvasHeight: 0 }))).toThrow('Scale: canvasHeight must be positive');
      expect(() => new Scale(makeOptions({ canvasHeight: -5 }))).toThrow('Scale: canvasHeight must be positive');
    });

    it('throws on non-positive dpr', () => {
      expect(() => new Scale(makeOptions({ dpr: 0 }))).toThrow('Scale: dpr must be positive');
      expect(() => new Scale(makeOptions({ dpr: -1 }))).toThrow('Scale: dpr must be positive');
    });

    it('throws on negative padding values', () => {
      expect(() => new Scale(makeOptions({
        padding: { top: -1, right: 0, bottom: 0, left: 0 },
      }))).toThrow('Scale: padding values must be non-negative');
    });

    it('throws when padding exceeds canvas dimensions', () => {
      expect(() => new Scale(makeOptions({
        canvasWidth: 100,
        padding: { top: 0, right: 60, bottom: 0, left: 60 },
      }))).toThrow('Scale: padding exceeds canvas dimensions');
    });
  });

  describe('xToPixel', () => {
    it('maps domain min to viewport left edge, domain max to viewport right edge', () => {
      const scale = new Scale(makeOptions());
      scale.setDomainX(0, 100);
      expect(scale.xToPixel(0)).toBe(50);    // viewport.x
      expect(scale.xToPixel(100)).toBe(750);  // viewport.x + viewport.width
    });

    it('maps domain midpoint to viewport horizontal center', () => {
      const scale = new Scale(makeOptions());
      scale.setDomainX(0, 100);
      expect(scale.xToPixel(50)).toBe(400); // 50 + 700/2
    });

    it('with value outside domain extrapolates (returns pixel outside viewport)', () => {
      const scale = new Scale(makeOptions());
      scale.setDomainX(0, 100);
      // -50 should be 50 pixels to the left of viewport start
      expect(scale.xToPixel(-50)).toBe(50 - 350); // -300
      // 150 should be 50% beyond viewport right
      expect(scale.xToPixel(150)).toBe(750 + 350); // 1100
    });
  });

  describe('yToPixel', () => {
    it('maps domain min to viewport BOTTOM edge, domain max to viewport TOP edge (inverted y)', () => {
      const scale = new Scale(makeOptions());
      scale.setDomainY(0, 100);
      expect(scale.yToPixel(0)).toBe(550);   // viewport.y + viewport.height (bottom)
      expect(scale.yToPixel(100)).toBe(50);   // viewport.y (top)
    });

    it('maps domain midpoint to viewport vertical center', () => {
      const scale = new Scale(makeOptions());
      scale.setDomainY(0, 100);
      expect(scale.yToPixel(50)).toBe(300); // 50 + 500/2
    });

    it('with value outside domain extrapolates (returns pixel outside viewport)', () => {
      const scale = new Scale(makeOptions());
      scale.setDomainY(0, 100);
      expect(scale.yToPixel(-50)).toBe(550 + 250); // 800, below viewport
      expect(scale.yToPixel(150)).toBe(50 - 250);  // -200, above viewport
    });
  });

  describe('inverse mapping round-trips', () => {
    it('pixelToX is exact inverse of xToPixel', () => {
      const scale = new Scale(makeOptions());
      scale.setDomainX(1000, 2000);
      const values = [1000, 1250, 1500, 1750, 2000];
      for (const v of values) {
        expect(scale.pixelToX(scale.xToPixel(v))).toBeCloseTo(v, 10);
      }
    });

    it('pixelToY is exact inverse of yToPixel', () => {
      const scale = new Scale(makeOptions());
      scale.setDomainY(-50, 50);
      const values = [-50, -25, 0, 25, 50];
      for (const v of values) {
        expect(scale.pixelToY(scale.yToPixel(v))).toBeCloseTo(v, 10);
      }
    });
  });

  describe('update()', () => {
    it('recalculates viewport correctly with new canvas size', () => {
      const scale = new Scale(makeOptions());
      scale.update(1000, 800, 2);
      expect(scale.viewport).toEqual({ x: 50, y: 50, width: 900, height: 700 });
    });

    it('with new DPR value updates the stored dpr', () => {
      const scale = new Scale(makeOptions({ dpr: 1 }));
      expect(scale.dpr).toBe(1);
      scale.update(800, 600, 3);
      expect(scale.dpr).toBe(3);
    });

    it('with new canvas size recalculates viewport and mapping', () => {
      const scale = new Scale(makeOptions());
      scale.setDomainX(0, 100);
      const pixelBefore = scale.xToPixel(50);
      scale.update(1000, 800, 2);
      const pixelAfter = scale.xToPixel(50);
      // Viewport center shifted, so pixel value changes
      expect(pixelAfter).not.toBe(pixelBefore);
      // Should be at center of new viewport: 50 + 900/2 = 500
      expect(pixelAfter).toBe(500);
    });
  });

  describe('autoFitY', () => {
    it('with normal dataset computes min/max with 10% padding', () => {
      const scale = new Scale(makeOptions());
      scale.autoFitY([10, 20, 30, 40, 50]);
      // range = 40, padding = 4 each side
      expect(scale.domainY.min).toBeCloseTo(6, 10);
      expect(scale.domainY.max).toBeCloseTo(54, 10);
    });

    it('with empty values defaults to domain 0-1', () => {
      const scale = new Scale(makeOptions());
      scale.autoFitY([]);
      expect(scale.domainY).toEqual({ min: 0, max: 1 });
    });

    it('with single value pads ±1', () => {
      const scale = new Scale(makeOptions());
      scale.autoFitY([42]);
      expect(scale.domainY).toEqual({ min: 41, max: 43 });
    });

    it('with all identical values pads ±1', () => {
      const scale = new Scale(makeOptions());
      scale.autoFitY([7, 7, 7, 7]);
      expect(scale.domainY).toEqual({ min: 6, max: 8 });
    });
  });

  describe('autoFitX', () => {
    it('with normal timestamps computes exact domain (0% default padding)', () => {
      const scale = new Scale(makeOptions());
      scale.autoFitX([100, 200, 300]);
      expect(scale.domainX).toEqual({ min: 100, max: 300 });
    });

    it('with empty timestamps defaults to domain 0-1', () => {
      const scale = new Scale(makeOptions());
      scale.autoFitX([]);
      expect(scale.domainX).toEqual({ min: 0, max: 1 });
    });

    it('with single timestamp pads ±1', () => {
      const scale = new Scale(makeOptions());
      scale.autoFitX([500]);
      expect(scale.domainX).toEqual({ min: 499, max: 501 });
    });

    it('with all identical timestamps pads ±1', () => {
      const scale = new Scale(makeOptions());
      scale.autoFitX([1000, 1000, 1000]);
      expect(scale.domainX).toEqual({ min: 999, max: 1001 });
    });
  });

  describe('zero-width domain', () => {
    it('maps to viewport center and does not throw or produce NaN/Infinity', () => {
      const scale = new Scale(makeOptions());
      scale.setDomainX(50, 50);
      scale.setDomainY(100, 100);

      const px = scale.xToPixel(50);
      const py = scale.yToPixel(100);

      expect(px).toBe(50 + 700 / 2); // viewport center x = 400
      expect(py).toBe(50 + 500 / 2); // viewport center y = 300
      expect(Number.isFinite(px)).toBe(true);
      expect(Number.isFinite(py)).toBe(true);
      expect(Number.isNaN(px)).toBe(false);
      expect(Number.isNaN(py)).toBe(false);
    });
  });

  describe('setDomainX / setDomainY', () => {
    it('update the domain and affect subsequent pixel calculations', () => {
      const scale = new Scale(makeOptions());
      scale.setDomainX(0, 100);
      const px1 = scale.xToPixel(50);
      scale.setDomainX(0, 200);
      const px2 = scale.xToPixel(50);
      expect(px2).not.toBe(px1);
      // 50/200 = 0.25 of viewport width: 50 + 700*0.25 = 225
      expect(px2).toBe(225);
    });

    it('setDomainX with min > max silently swaps values', () => {
      const scale = new Scale(makeOptions());
      scale.setDomainX(100, 0);
      expect(scale.domainX).toEqual({ min: 0, max: 100 });
    });

    it('setDomainY with min > max silently swaps values', () => {
      const scale = new Scale(makeOptions());
      scale.setDomainY(50, -50);
      expect(scale.domainY).toEqual({ min: -50, max: 50 });
    });
  });

  describe('negative and large domains', () => {
    it('negative values in domain map correctly', () => {
      const scale = new Scale(makeOptions());
      scale.setDomainX(-100, 100);
      scale.setDomainY(-100, 100);

      // 0 should be at midpoint
      expect(scale.xToPixel(0)).toBe(400);  // 50 + 700/2
      expect(scale.yToPixel(0)).toBe(300);  // 50 + 500/2
    });

    it('very large domains (timestamps in milliseconds) do not lose precision', () => {
      const scale = new Scale(makeOptions());
      const t1 = 1711900000000;
      const t2 = 1711900001000; // 1 second later
      scale.setDomainX(t1, t2);

      // Midpoint should map to viewport center
      const mid = (t1 + t2) / 2;
      expect(scale.xToPixel(mid)).toBeCloseTo(400, 5);

      // Round-trip should preserve precision
      const px = scale.xToPixel(t1 + 500);
      expect(scale.pixelToX(px)).toBeCloseTo(t1 + 500, 3);
    });
  });
});
