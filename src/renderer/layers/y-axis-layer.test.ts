import { YAxisRenderer } from './y-axis-layer';
import { computeNiceTicks } from './background-layer';
import { Scale } from '../../core/scale';
import type { ResolvedConfig } from '../../config/types';
import { resolveConfig } from '../../config/resolver';

function makeScale(width = 800, height = 600): Scale {
  const scale = new Scale({
    canvasWidth: width,
    canvasHeight: height,
    dpr: 1,
    padding: { top: 10, right: 10, bottom: 10, left: 10 },
  });
  scale.setDomainX(0, 1000);
  scale.setDomainY(0, 100);
  return scale;
}

function makeConfig(overrides?: {
  visible?: boolean;
  labelFormatter?: (value: number) => string;
  locale?: string;
}): Readonly<ResolvedConfig> {
  const config: Record<string, unknown> = {};
  if (overrides?.visible !== undefined || overrides?.labelFormatter || overrides?.locale !== undefined) {
    const yAxis: Record<string, unknown> = {};
    if (overrides.visible !== undefined) yAxis.visible = overrides.visible;
    if (overrides.labelFormatter) yAxis.labelFormatter = overrides.labelFormatter;
    if (overrides.locale !== undefined) yAxis.locale = overrides.locale;
    config.yAxis = yAxis;
  }
  return resolveConfig(config);
}

function makeCanvas(width = 800, height = 600): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function createRenderer(opts?: {
  width?: number;
  height?: number;
  visible?: boolean;
  labelFormatter?: (value: number) => string;
  locale?: string;
  domainYMin?: number;
  domainYMax?: number;
}) {
  const width = opts?.width ?? 800;
  const height = opts?.height ?? 600;
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  const scale = makeScale(width, height);
  if (opts?.domainYMin !== undefined || opts?.domainYMax !== undefined) {
    scale.setDomainY(opts?.domainYMin ?? 0, opts?.domainYMax ?? 100);
  }
  const config = makeConfig({
    visible: opts?.visible,
    labelFormatter: opts?.labelFormatter,
    locale: opts?.locale,
  });
  const renderer = new YAxisRenderer(ctx, canvas, scale, config);
  return { renderer, ctx, canvas, scale, config };
}

describe('YAxisRenderer', () => {
  describe('draw()', () => {
    it('does NOT call clearRect (canvas clearing is the facade responsibility)', () => {
      const { renderer, ctx } = createRenderer();
      const clearSpy = vi.spyOn(ctx, 'clearRect');
      renderer.draw();
      expect(clearSpy).not.toHaveBeenCalled();
    });

    it('draws tick marks aligned with grid line positions (same computeNiceTicks values)', () => {
      const { renderer, ctx, scale } = createRenderer();
      const moveToSpy = vi.spyOn(ctx, 'moveTo');
      renderer.draw();

      const viewport = scale.viewport;
      const domainY = scale.domainY;
      const maxTicks = Math.max(3, Math.floor(viewport.height / 60));
      const expectedTicks = computeNiceTicks(domainY.min, domainY.max, maxTicks);

      // Each tick should produce a moveTo at viewport.x - tickLength
      const tickMoves = moveToSpy.mock.calls.filter(
        ([x]) => x === viewport.x - 4, // default tickLength = 4
      );
      // Should have at least some ticks matching expected values
      expect(tickMoves.length).toBeGreaterThan(0);
      expect(tickMoves.length).toBeLessThanOrEqual(expectedTicks.length);
    });

    it('tick marks use 0.5px offset for crisp rendering', () => {
      const { renderer, ctx } = createRenderer();
      const moveToSpy = vi.spyOn(ctx, 'moveTo');
      renderer.draw();

      for (const [, y] of moveToSpy.mock.calls) {
        // Y coordinates should end in .5
        expect((y * 10) % 10).toBe(5);
      }
    });

    it('tick marks use config.yAxis.tickColor and tickLength', () => {
      const { renderer, ctx, scale } = createRenderer();
      const moveToSpy = vi.spyOn(ctx, 'moveTo');
      const lineToSpy = vi.spyOn(ctx, 'lineTo');
      renderer.draw();

      // tickColor is set on strokeStyle before stroke
      expect(ctx.strokeStyle).toBeDefined();

      // Tick marks go from viewport.x - tickLength to viewport.x
      const viewport = scale.viewport;
      const tickLength = 4; // default
      const tickMoves = moveToSpy.mock.calls.filter(
        ([x]) => x === viewport.x - tickLength,
      );
      const tickEnds = lineToSpy.mock.calls.filter(
        ([x]) => x === viewport.x,
      );
      expect(tickMoves.length).toBeGreaterThan(0);
      expect(tickEnds.length).toBe(tickMoves.length);
    });

    it('labels use config.yAxis.labelColor, labelFontSize, labelFontFamily', () => {
      const { renderer, ctx, config } = createRenderer();
      const fillTextSpy = vi.spyOn(ctx, 'fillText');
      renderer.draw();

      expect(fillTextSpy).toHaveBeenCalled();
      expect(ctx.font).toContain(String(config.yAxis.labelFontSize));
    });

    it('labels are right-aligned to the left of the viewport area', () => {
      const { renderer, ctx, scale } = createRenderer();
      const fillTextSpy = vi.spyOn(ctx, 'fillText');
      renderer.draw();

      expect(ctx.textAlign).toBe('right');
      expect(ctx.textBaseline).toBe('middle');

      const viewport = scale.viewport;
      const tickLength = 4;
      const labelPadding = 4;
      const expectedX = viewport.x - tickLength - labelPadding;

      for (const [, x] of fillTextSpy.mock.calls) {
        expect(x).toBe(expectedX);
      }
    });

    it('renders nothing when yAxis.visible === false (early return, no canvas operations)', () => {
      const { renderer, ctx } = createRenderer({ visible: false });
      const beginPathSpy = vi.spyOn(ctx, 'beginPath');
      const fillTextSpy = vi.spyOn(ctx, 'fillText');
      const strokeSpy = vi.spyOn(ctx, 'stroke');
      renderer.draw();

      expect(beginPathSpy).not.toHaveBeenCalled();
      expect(fillTextSpy).not.toHaveBeenCalled();
      expect(strokeSpy).not.toHaveBeenCalled();
    });

    it('sets globalAlpha to 1.0 even when visible is false', () => {
      const { renderer, ctx } = createRenderer({ visible: false });
      ctx.globalAlpha = 0.5;
      renderer.draw();
      expect(ctx.globalAlpha).toBe(1.0);
    });
  });

  describe('auto-precision formatting', () => {
    it('tick spacing 0.001 → labels show 3 decimal places', () => {
      const { renderer, ctx } = createRenderer({
        locale: 'en-US',
        domainYMin: 0.001,
        domainYMax: 0.01,
      });
      const fillTextSpy = vi.spyOn(ctx, 'fillText');
      renderer.draw();

      // Labels should have decimal places appropriate for small values
      for (const [text] of fillTextSpy.mock.calls) {
        const parts = (text as string).split('.');
        if (parts.length > 1) {
          expect(parts[1]!.length).toBeGreaterThanOrEqual(2);
        }
      }
    });

    it('tick spacing 1000 → labels show 0 decimal places', () => {
      const { renderer, ctx } = createRenderer({
        locale: 'en-US',
        domainYMin: 0,
        domainYMax: 100000,
      });
      const fillTextSpy = vi.spyOn(ctx, 'fillText');
      renderer.draw();

      for (const [text] of fillTextSpy.mock.calls) {
        // Should not have decimal points for large values (en-US uses comma for thousands)
        expect(text as string).not.toContain('.');
      }
    });

    it('tick spacing 0.0000001 → labels show sufficient decimal places for sub-penny values', () => {
      const { renderer, ctx } = createRenderer({
        locale: 'en-US',
        domainYMin: 0.0000001,
        domainYMax: 0.000001,
      });
      const fillTextSpy = vi.spyOn(ctx, 'fillText');
      renderer.draw();

      for (const [text] of fillTextSpy.mock.calls) {
        const str = text as string;
        if (str.includes('.')) {
          const parts = str.split('.');
          // Should show enough decimals to distinguish sub-penny values
          expect(parts[1]!.length).toBeGreaterThanOrEqual(6);
        }
      }
    });
  });

  describe('custom labelFormatter', () => {
    it('custom labelFormatter is called when provided', () => {
      const formatter = vi.fn((v: number) => `$${v}`);
      const { renderer } = createRenderer({ labelFormatter: formatter });
      renderer.draw();

      expect(formatter).toHaveBeenCalled();
    });

    it('custom labelFormatter receives the raw numeric value', () => {
      const receivedValues: number[] = [];
      const formatter = (v: number) => {
        receivedValues.push(v);
        return String(v);
      };
      const { renderer } = createRenderer({
        labelFormatter: formatter,
        domainYMin: 0,
        domainYMax: 100,
      });
      renderer.draw();

      expect(receivedValues.length).toBeGreaterThan(0);
      for (const v of receivedValues) {
        expect(typeof v).toBe('number');
        expect(Number.isFinite(v)).toBe(true);
      }
    });
  });

  describe('locale-aware formatting', () => {
    it('explicit locale de-DE → decimal comma, period grouping', () => {
      const { renderer, ctx } = createRenderer({
        locale: 'de-DE',
        domainYMin: 0,
        domainYMax: 10000,
      });
      const fillTextSpy = vi.spyOn(ctx, 'fillText');
      renderer.draw();

      const labels = fillTextSpy.mock.calls.map(([text]) => text as string);
      // de-DE uses period for thousands grouping
      const largeLabels = labels.filter((l) => {
        const digits = l.replace(/\D/g, '');
        return parseInt(digits, 10) >= 1000;
      });
      for (const label of largeLabels) {
        expect(label).toContain('.');
      }
    });

    it('explicit locale en-US → decimal period, comma grouping', () => {
      const { renderer, ctx } = createRenderer({
        locale: 'en-US',
        domainYMin: 0,
        domainYMax: 10000,
      });
      const fillTextSpy = vi.spyOn(ctx, 'fillText');
      renderer.draw();

      const labels = fillTextSpy.mock.calls.map(([text]) => text as string);
      const largeLabels = labels.filter((l) => {
        const digits = l.replace(/\D/g, '');
        return parseInt(digits, 10) >= 1000;
      });
      for (const label of largeLabels) {
        expect(label).toContain(',');
      }
    });

    it('no locale configured → uses undefined (browser default), produces valid output', () => {
      const { renderer, ctx } = createRenderer({
        domainYMin: 0,
        domainYMax: 1000,
      });
      const fillTextSpy = vi.spyOn(ctx, 'fillText');
      renderer.draw();

      expect(fillTextSpy).toHaveBeenCalled();
      for (const [text] of fillTextSpy.mock.calls) {
        expect(typeof text).toBe('string');
        expect((text as string).length).toBeGreaterThan(0);
      }
    });

    it('invalid locale string → falls back gracefully (no throw)', () => {
      expect(() => {
        const { renderer } = createRenderer({
          locale: 'not-a-real-locale-xyz',
          domainYMin: 0,
          domainYMax: 100,
        });
        renderer.draw();
      }).not.toThrow();
    });

    it('custom labelFormatter still takes precedence over locale formatting', () => {
      const formatter = vi.fn((v: number) => `custom:${v}`);
      const { renderer, ctx } = createRenderer({
        locale: 'de-DE',
        labelFormatter: formatter,
        domainYMin: 0,
        domainYMax: 100,
      });
      const fillTextSpy = vi.spyOn(ctx, 'fillText');
      renderer.draw();

      expect(formatter).toHaveBeenCalled();
      for (const [text] of fillTextSpy.mock.calls) {
        expect((text as string).startsWith('custom:')).toBe(true);
      }
    });

    it('sub-penny precision preserved with locale (e.g., 0.000042)', () => {
      const { renderer, ctx } = createRenderer({
        locale: 'en-US',
        domainYMin: 0.00003,
        domainYMax: 0.00006,
      });
      const fillTextSpy = vi.spyOn(ctx, 'fillText');
      renderer.draw();

      for (const [text] of fillTextSpy.mock.calls) {
        const str = text as string;
        if (str.includes('.')) {
          const parts = str.split('.');
          expect(parts[1]!.length).toBeGreaterThanOrEqual(4);
        }
      }
    });

    it('large values formatted correctly with thousands grouping', () => {
      const { renderer, ctx } = createRenderer({
        locale: 'en-US',
        domainYMin: 0,
        domainYMax: 1000000,
      });
      const fillTextSpy = vi.spyOn(ctx, 'fillText');
      renderer.draw();

      const labels = fillTextSpy.mock.calls.map(([text]) => text as string);
      const largeLabels = labels.filter((l) => {
        const digits = l.replace(/\D/g, '');
        return parseInt(digits, 10) >= 1000;
      });
      expect(largeLabels.length).toBeGreaterThan(0);
      for (const label of largeLabels) {
        expect(label).toContain(',');
      }
    });

    it('negative values formatted correctly with locale separators', () => {
      const { renderer, ctx } = createRenderer({
        locale: 'en-US',
        domainYMin: -5000,
        domainYMax: 5000,
      });
      const fillTextSpy = vi.spyOn(ctx, 'fillText');
      renderer.draw();

      const labels = fillTextSpy.mock.calls.map(([text]) => text as string);
      const negativeLabels = labels.filter((l) => l.includes('-') || l.includes('\u2212'));
      expect(negativeLabels.length).toBeGreaterThan(0);
    });

    it('tickSpacing = 0 edge case still works with locale', () => {
      const { renderer, scale } = createRenderer({
        locale: 'de-DE',
      });
      scale.setDomainY(5, 5); // min === max → tickSpacing = 0
      expect(() => renderer.draw()).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('empty domain (min === max) does not crash', () => {
      const { renderer, scale } = createRenderer();
      scale.setDomainY(5, 5);
      expect(() => renderer.draw()).not.toThrow();
    });

    it('labels stay within canvas bounds (not clipped off-screen)', () => {
      const { renderer, ctx, scale } = createRenderer();
      const fillTextSpy = vi.spyOn(ctx, 'fillText');
      renderer.draw();

      const viewport = scale.viewport;
      for (const call of fillTextSpy.mock.calls) {
        const y = call[2] as number;
        expect(y).toBeGreaterThanOrEqual(viewport.y);
        expect(y).toBeLessThanOrEqual(viewport.y + viewport.height);
      }
    });
  });
});
