import { XAxisRenderer } from './x-axis-layer';
import { computeNiceTicks } from './background-layer';
import { Scale } from '../../core/scale';
import type { ResolvedConfig } from '../../config/types';
import { resolveConfig } from '../../config/resolver';

function makeScale(width = 800, height = 600): Scale {
  const scale = new Scale({
    canvasWidth: width,
    canvasHeight: height,
    dpr: 1,
    padding: { top: 10, right: 10, bottom: 30, left: 60 },
  });
  // Use realistic Unix ms timestamps (e.g., 2024-01-01 00:00:00 UTC to +1 hour)
  scale.setDomainX(1704067200000, 1704070800000);
  scale.setDomainY(0, 100);
  return scale;
}

function makeConfig(overrides?: {
  visible?: boolean;
  labelFormatter?: (value: number) => string;
  timezone?: string;
}): Readonly<ResolvedConfig> {
  const config: Record<string, unknown> = {};
  if (overrides?.visible !== undefined || overrides?.labelFormatter || overrides?.timezone) {
    const xAxis: Record<string, unknown> = {};
    if (overrides.visible !== undefined) xAxis.visible = overrides.visible;
    if (overrides.labelFormatter) xAxis.labelFormatter = overrides.labelFormatter;
    if (overrides.timezone) xAxis.timezone = overrides.timezone;
    config.xAxis = xAxis;
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
  timezone?: string;
  domainXMin?: number;
  domainXMax?: number;
}) {
  const width = opts?.width ?? 800;
  const height = opts?.height ?? 600;
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  const scale = makeScale(width, height);
  if (opts?.domainXMin !== undefined || opts?.domainXMax !== undefined) {
    scale.setDomainX(opts?.domainXMin ?? 1704067200000, opts?.domainXMax ?? 1704070800000);
  }
  const config = makeConfig({
    visible: opts?.visible,
    labelFormatter: opts?.labelFormatter,
    timezone: opts?.timezone,
  });
  const renderer = new XAxisRenderer(ctx, canvas, scale, config);
  return { renderer, ctx, canvas, scale, config };
}

describe('XAxisRenderer', () => {
  describe('draw()', () => {
    it('does NOT call clearRect (facade responsibility)', () => {
      const { renderer, ctx } = createRenderer();
      const clearSpy = vi.spyOn(ctx, 'clearRect');
      renderer.draw();
      expect(clearSpy).not.toHaveBeenCalled();
    });

    it('draws tick marks at vertical grid line positions (same computeNiceTicks values with domainX)', () => {
      const { renderer, ctx, scale } = createRenderer();
      const moveToSpy = vi.spyOn(ctx, 'moveTo');
      renderer.draw();

      const viewport = scale.viewport;
      const domainX = scale.domainX;
      const maxTicks = Math.max(3, Math.floor(viewport.width / 100));
      const expectedTicks = computeNiceTicks(domainX.min, domainX.max, maxTicks);

      const bottomY = viewport.y + viewport.height;
      // Tick marks start at bottomY
      const tickMoves = moveToSpy.mock.calls.filter(
        ([, y]) => y === bottomY,
      );
      expect(tickMoves.length).toBeGreaterThan(0);
      expect(tickMoves.length).toBeLessThanOrEqual(expectedTicks.length);
    });

    it('tick marks use 0.5px offset for crisp rendering', () => {
      const { renderer, ctx, scale } = createRenderer();
      const moveToSpy = vi.spyOn(ctx, 'moveTo');
      renderer.draw();

      const bottomY = scale.viewport.y + scale.viewport.height;
      const tickMoves = moveToSpy.mock.calls.filter(([, y]) => y === bottomY);

      for (const [x] of tickMoves) {
        // X coordinates should end in .5
        expect((x * 10) % 10).toBe(5);
      }
    });

    it('tick marks use config.xAxis.tickColor and config.xAxis.tickLength', () => {
      const { renderer, ctx, scale, config } = createRenderer();
      const moveToSpy = vi.spyOn(ctx, 'moveTo');
      const lineToSpy = vi.spyOn(ctx, 'lineTo');
      renderer.draw();

      const viewport = scale.viewport;
      const bottomY = viewport.y + viewport.height;
      const tickLength = config.xAxis.tickLength;

      // Tick marks go from bottomY to bottomY + tickLength
      const tickStarts = moveToSpy.mock.calls.filter(([, y]) => y === bottomY);
      const tickEnds = lineToSpy.mock.calls.filter(([, y]) => y === bottomY + tickLength);
      expect(tickStarts.length).toBeGreaterThan(0);
      expect(tickEnds.length).toBe(tickStarts.length);
    });

    it('labels use config.xAxis.labelColor, labelFontSize, labelFontFamily', () => {
      const { renderer, ctx, config } = createRenderer();
      const fillTextSpy = vi.spyOn(ctx, 'fillText');
      renderer.draw();

      expect(fillTextSpy).toHaveBeenCalled();
      expect(ctx.font).toContain(String(config.xAxis.labelFontSize));
    });

    it('labels are centered below the viewport area', () => {
      const { renderer, ctx, scale, config } = createRenderer();
      const fillTextSpy = vi.spyOn(ctx, 'fillText');
      renderer.draw();

      expect(ctx.textAlign).toBe('center');
      expect(ctx.textBaseline).toBe('top');

      const viewport = scale.viewport;
      const tickLength = config.xAxis.tickLength;
      const labelPadding = 4;
      const expectedY = viewport.y + viewport.height + tickLength + labelPadding;

      for (const call of fillTextSpy.mock.calls) {
        const y = call[2] as number;
        expect(y).toBe(expectedY);
      }
    });

    it('renders nothing when xAxis.visible === false', () => {
      const { renderer, ctx } = createRenderer({ visible: false });
      const beginPathSpy = vi.spyOn(ctx, 'beginPath');
      const fillTextSpy = vi.spyOn(ctx, 'fillText');
      const strokeSpy = vi.spyOn(ctx, 'stroke');
      renderer.draw();

      expect(beginPathSpy).not.toHaveBeenCalled();
      expect(fillTextSpy).not.toHaveBeenCalled();
      expect(strokeSpy).not.toHaveBeenCalled();
    });
  });

  describe('auto-format time levels', () => {
    it('seconds-level — tickSpacing < 60s shows time with seconds', () => {
      // 10-second range → tick spacing will be < 60s
      const { renderer, ctx } = createRenderer({
        domainXMin: 1704067200000,
        domainXMax: 1704067210000, // 10 seconds
        timezone: 'UTC',
      });
      const fillTextSpy = vi.spyOn(ctx, 'fillText');
      renderer.draw();

      // Seconds-level labels should contain two colons (HH:MM:SS)
      const labels = fillTextSpy.mock.calls.map(([text]) => text as string);
      expect(labels.length).toBeGreaterThan(0);
      for (const label of labels) {
        // Should match HH:MM:SS pattern (has two colons)
        expect(label.split(':').length).toBe(3);
      }
    });

    it('minutes-level — tickSpacing 1-59 min shows HH:MM', () => {
      // 1-hour range → tick spacing will be minutes-level
      const { renderer, ctx } = createRenderer({
        domainXMin: 1704067200000,
        domainXMax: 1704070800000, // 1 hour
        timezone: 'UTC',
      });
      const fillTextSpy = vi.spyOn(ctx, 'fillText');
      renderer.draw();

      const labels = fillTextSpy.mock.calls.map(([text]) => text as string);
      expect(labels.length).toBeGreaterThan(0);
      for (const label of labels) {
        // Should contain digits and colon
        expect(label).toMatch(/\d+:\d+/);
      }
    });

    it('hours-level — tickSpacing 1-23 hours shows HH:MM', () => {
      // 12-hour range → tick spacing will be hours-level
      const { renderer, ctx } = createRenderer({
        domainXMin: 1704067200000,
        domainXMax: 1704110400000, // 12 hours
        timezone: 'UTC',
      });
      const fillTextSpy = vi.spyOn(ctx, 'fillText');
      renderer.draw();

      const labels = fillTextSpy.mock.calls.map(([text]) => text as string);
      expect(labels.length).toBeGreaterThan(0);
      for (const label of labels) {
        expect(label).toMatch(/\d+:\d+/);
      }
    });

    it('days-level — tickSpacing >= 1 day shows month and day', () => {
      // 7-day range → tick spacing >= 1 day
      const { renderer, ctx } = createRenderer({
        domainXMin: 1704067200000,
        domainXMax: 1704672000000, // ~7 days
        timezone: 'UTC',
      });
      const fillTextSpy = vi.spyOn(ctx, 'fillText');
      renderer.draw();

      const labels = fillTextSpy.mock.calls.map(([text]) => text as string);
      expect(labels.length).toBeGreaterThan(0);
      for (const label of labels) {
        // Days-level should NOT have colons, should have month text
        expect(label).not.toMatch(/\d+:\d+/);
        // Should contain some alphabetic chars (month abbreviation)
        expect(label).toMatch(/[A-Za-z]/);
      }
    });
  });

  describe('custom labelFormatter', () => {
    it('custom labelFormatter is called when provided', () => {
      const formatter = vi.fn((v: number) => `T:${v}`);
      const { renderer } = createRenderer({ labelFormatter: formatter });
      renderer.draw();

      expect(formatter).toHaveBeenCalled();
    });

    it('custom labelFormatter receives the raw timestamp value (number, not Date)', () => {
      const receivedValues: number[] = [];
      const formatter = (v: number) => {
        receivedValues.push(v);
        return String(v);
      };
      const { renderer } = createRenderer({ labelFormatter: formatter });
      renderer.draw();

      expect(receivedValues.length).toBeGreaterThan(0);
      for (const v of receivedValues) {
        expect(typeof v).toBe('number');
        expect(Number.isFinite(v)).toBe(true);
      }
    });

    it('custom labelFormatter error falls back to auto-format (try/catch)', () => {
      const formatter = () => {
        throw new Error('formatter broke');
      };
      const { renderer, ctx } = createRenderer({
        labelFormatter: formatter,
        timezone: 'UTC',
      });
      const fillTextSpy = vi.spyOn(ctx, 'fillText');

      expect(() => renderer.draw()).not.toThrow();
      // Should still render labels using auto-format
      expect(fillTextSpy).toHaveBeenCalled();
    });
  });

  describe('timezone support', () => {
    it('timezone config affects label output', () => {
      // Use a timestamp where UTC and NYC differ (not midnight)
      // 2024-01-01 15:00:00 UTC = 2024-01-01 10:00:00 EST
      const ts = 1704121200000;
      const range = 3600000; // 1 hour range for minutes-level formatting

      const { renderer: utcRenderer, ctx: utcCtx } = createRenderer({
        domainXMin: ts,
        domainXMax: ts + range,
        timezone: 'UTC',
      });
      const utcFillText = vi.spyOn(utcCtx, 'fillText');
      utcRenderer.draw();
      const utcLabels = utcFillText.mock.calls.map(([text]) => text as string);

      const { renderer: nyRenderer, ctx: nyCtx } = createRenderer({
        domainXMin: ts,
        domainXMax: ts + range,
        timezone: 'America/New_York',
      });
      const nyFillText = vi.spyOn(nyCtx, 'fillText');
      nyRenderer.draw();
      const nyLabels = nyFillText.mock.calls.map(([text]) => text as string);

      // Both should have labels
      expect(utcLabels.length).toBeGreaterThan(0);
      expect(nyLabels.length).toBeGreaterThan(0);

      // Labels should differ because of timezone offset (5 hours)
      // At least the first label should be different
      expect(utcLabels[0]).not.toBe(nyLabels[0]);
    });

    it('invalid timezone string does not crash — falls back to browser default', () => {
      expect(() => {
        const { renderer } = createRenderer({ timezone: 'Invalid/Timezone' });
        renderer.draw();
      }).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('empty domain (min === max) does not crash', () => {
      const { renderer, scale } = createRenderer();
      scale.setDomainX(5000, 5000);
      expect(() => renderer.draw()).not.toThrow();
    });

    it('labels stay within canvas bounds (not clipped off-screen)', () => {
      const { renderer, ctx, scale } = createRenderer();
      const fillTextSpy = vi.spyOn(ctx, 'fillText');
      renderer.draw();

      const viewport = scale.viewport;
      for (const call of fillTextSpy.mock.calls) {
        // fillText(text, x, y, maxWidth?)
        const xPos = call[1] as number;
        // Label center x should be within viewport bounds (approximately)
        expect(xPos).toBeGreaterThanOrEqual(viewport.x - 50); // Allow some margin for centered text
        expect(xPos).toBeLessThanOrEqual(viewport.x + viewport.width + 50);
      }
    });

    it('overlapping labels are skipped', () => {
      // Very narrow chart → many ticks should be skipped
      const { renderer, ctx } = createRenderer({ width: 200 });
      const fillTextSpy = vi.spyOn(ctx, 'fillText');
      renderer.draw();

      // With a narrow chart, we should have fewer labels than a wide chart
      const narrowLabels = fillTextSpy.mock.calls.length;

      const { renderer: wideRenderer, ctx: wideCtx } = createRenderer({ width: 1600 });
      const wideFillText = vi.spyOn(wideCtx, 'fillText');
      wideRenderer.draw();
      const wideLabels = wideFillText.mock.calls.length;

      // Wide chart should have more or equal labels
      expect(wideLabels).toBeGreaterThanOrEqual(narrowLabels);
    });

    it('fillText is called with maxWidth parameter', () => {
      const { renderer, ctx } = createRenderer();
      const fillTextSpy = vi.spyOn(ctx, 'fillText');
      renderer.draw();

      expect(fillTextSpy).toHaveBeenCalled();
      for (const call of fillTextSpy.mock.calls) {
        // fillText(text, x, y, maxWidth) — 4th argument should exist
        expect(call.length).toBe(4);
        expect(typeof call[3]).toBe('number');
      }
    });
  });
});
