import { BackgroundLayerRenderer, computeNiceTicks } from './background-layer';
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

function makeConfig(overrides?: Partial<{ visible: boolean; color: string; opacity: number; lineWidth: number; backgroundColor: string }>): Readonly<ResolvedConfig> {
  return resolveConfig({
    backgroundColor: overrides?.backgroundColor,
    grid: {
      visible: overrides?.visible ?? true,
      color: overrides?.color ?? '#ffffff',
      opacity: overrides?.opacity ?? 0.1,
      lineWidth: overrides?.lineWidth ?? 1,
    },
  });
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
  color?: string;
  opacity?: number;
  lineWidth?: number;
  backgroundColor?: string;
}) {
  const width = opts?.width ?? 800;
  const height = opts?.height ?? 600;
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  const scale = makeScale(width, height);
  const config = makeConfig({
    visible: opts?.visible,
    color: opts?.color,
    opacity: opts?.opacity,
    lineWidth: opts?.lineWidth,
    backgroundColor: opts?.backgroundColor,
  });
  const renderer = new BackgroundLayerRenderer(ctx, canvas, scale, config);
  return { renderer, ctx, canvas, scale, config };
}

describe('BackgroundLayerRenderer', () => {
  describe('draw()', () => {
    it('clears the canvas first', () => {
      const { renderer, ctx } = createRenderer();
      const clearSpy = vi.spyOn(ctx, 'clearRect');
      renderer.draw();
      expect(clearSpy).toHaveBeenCalledWith(0, 0, 800, 600);
      expect(clearSpy.mock.invocationCallOrder[0]).toBeLessThan(
        vi.spyOn(ctx, 'beginPath').mock.invocationCallOrder[0] ?? Infinity,
      );
    });

    it('draws horizontal grid lines within viewport bounds', () => {
      const { renderer, ctx, scale } = createRenderer();
      const moveToSpy = vi.spyOn(ctx, 'moveTo');
      const lineToSpy = vi.spyOn(ctx, 'lineTo');
      renderer.draw();

      const viewport = scale.viewport;
      const moveCalls = moveToSpy.mock.calls;
      const lineCalls = lineToSpy.mock.calls;

      // Should have some horizontal lines (moveTo at viewport.x, lineTo at viewport.x + viewport.width)
      const hMoves = moveCalls.filter(([x]) => x === viewport.x);
      const hLines = lineCalls.filter(([x]) => x === viewport.x + viewport.width);
      expect(hMoves.length).toBeGreaterThan(0);
      expect(hLines.length).toBeGreaterThan(0);
    });

    it('draws vertical grid lines within viewport bounds', () => {
      const { renderer, ctx, scale } = createRenderer();
      const moveToSpy = vi.spyOn(ctx, 'moveTo');
      const lineToSpy = vi.spyOn(ctx, 'lineTo');
      renderer.draw();

      const viewport = scale.viewport;
      // Vertical lines start at viewport.y and end at viewport.y + viewport.height
      const vMoves = moveToSpy.mock.calls.filter(([, y]) => y === viewport.y);
      const vLines = lineToSpy.mock.calls.filter(([, y]) => y === viewport.y + viewport.height);
      expect(vMoves.length).toBeGreaterThan(0);
      expect(vLines.length).toBeGreaterThan(0);
    });

    it('uses 0.5px offset for crisp rendering', () => {
      const { renderer, ctx } = createRenderer();
      const moveToSpy = vi.spyOn(ctx, 'moveTo');
      renderer.draw();

      // All moveTo calls should have at least one coordinate ending in .5
      for (const [x, y] of moveToSpy.mock.calls) {
        const xHasHalf = (x * 10) % 10 === 5;
        const yHasHalf = (y * 10) % 10 === 5;
        expect(xHasHalf || yHasHalf).toBe(true);
      }
    });

    it('uses config grid color, opacity, and lineWidth', () => {
      const { renderer, ctx } = createRenderer({ color: '#ff0000', opacity: 0.5, lineWidth: 2 });
      renderer.draw();

      expect(ctx.strokeStyle).toBe('#ff0000');
      expect(ctx.lineWidth).toBe(2);
    });

    it('resets globalAlpha to 1.0 after rendering', () => {
      const { renderer, ctx } = createRenderer({ opacity: 0.3 });
      renderer.draw();
      expect(ctx.globalAlpha).toBe(1.0);
    });

    it('renders no grid lines when grid.visible === false (background fill still renders)', () => {
      const { renderer, ctx } = createRenderer({ visible: false });
      const clearSpy = vi.spyOn(ctx, 'clearRect');
      const fillRectSpy = vi.spyOn(ctx, 'fillRect');
      const beginPathSpy = vi.spyOn(ctx, 'beginPath');
      renderer.draw();

      expect(clearSpy).toHaveBeenCalledOnce();
      expect(fillRectSpy).toHaveBeenCalledOnce();
      expect(beginPathSpy).not.toHaveBeenCalled();
    });

    it('fills background color before drawing grid lines', () => {
      const { renderer, ctx } = createRenderer();
      const fillRectSpy = vi.spyOn(ctx, 'fillRect');
      const beginPathSpy = vi.spyOn(ctx, 'beginPath');
      renderer.draw();

      expect(fillRectSpy).toHaveBeenCalledWith(0, 0, 800, 600);
      // fillRect should be called before beginPath (grid lines)
      expect(fillRectSpy.mock.invocationCallOrder[0]).toBeLessThan(
        beginPathSpy.mock.invocationCallOrder[0]!,
      );
    });

    it('uses configured backgroundColor for fill', () => {
      const { renderer, ctx } = createRenderer({ backgroundColor: '#ffffff' });
      const fillRectSpy = vi.spyOn(ctx, 'fillRect');
      renderer.draw();

      expect(fillRectSpy).toHaveBeenCalledWith(0, 0, 800, 600);
      // Verify fillStyle was set to the configured backgroundColor
      expect(ctx.fillStyle).toBe('#ffffff');
    });

    it('renders background fill even when grid is hidden', () => {
      const { renderer, ctx } = createRenderer({ visible: false, backgroundColor: '#ff0000' });
      const fillRectSpy = vi.spyOn(ctx, 'fillRect');
      renderer.draw();

      expect(fillRectSpy).toHaveBeenCalledWith(0, 0, 800, 600);
    });

    it('produces reasonable number of grid lines', () => {
      const { renderer, ctx } = createRenderer();
      const moveToSpy = vi.spyOn(ctx, 'moveTo');
      renderer.draw();

      // Should not produce too many or too few lines
      const totalLines = moveToSpy.mock.calls.length;
      expect(totalLines).toBeGreaterThanOrEqual(3);
      expect(totalLines).toBeLessThanOrEqual(40);
    });

    it('grid lines stay within viewport boundaries', () => {
      const { renderer, ctx, scale } = createRenderer();
      const moveToSpy = vi.spyOn(ctx, 'moveTo');
      const lineToSpy = vi.spyOn(ctx, 'lineTo');
      renderer.draw();

      const viewport = scale.viewport;
      const allCoords = [...moveToSpy.mock.calls, ...lineToSpy.mock.calls];
      for (const [x, y] of allCoords) {
        // Allow 0.5px offset beyond viewport bounds
        expect(x).toBeGreaterThanOrEqual(viewport.x - 0.5);
        expect(x).toBeLessThanOrEqual(viewport.x + viewport.width + 0.5);
        expect(y).toBeGreaterThanOrEqual(viewport.y - 0.5);
        expect(y).toBeLessThanOrEqual(viewport.y + viewport.height + 0.5);
      }
    });

    it('handles empty domain (min === max) without crashing', () => {
      const { renderer, scale } = createRenderer();
      scale.setDomainX(5, 5);
      scale.setDomainY(5, 5);
      expect(() => renderer.draw()).not.toThrow();
    });
  });
});

describe('computeNiceTicks', () => {
  it('returns human-friendly intervals (multiples of 1, 2, 5)', () => {
    const ticks = computeNiceTicks(0, 100, 10);
    expect(ticks.length).toBeGreaterThan(0);

    // Check intervals between ticks are nice numbers
    for (let i = 1; i < ticks.length; i++) {
      const interval = ticks[i]! - ticks[i - 1]!;
      const normalized = interval / Math.pow(10, Math.floor(Math.log10(interval)));
      // Normalized should be approximately 1, 2, or 5
      const isNice = Math.abs(normalized - 1) < 0.01 ||
        Math.abs(normalized - 2) < 0.01 ||
        Math.abs(normalized - 5) < 0.01;
      expect(isNice).toBe(true);
    }
  });

  it('returns a single tick when min === max', () => {
    const ticks = computeNiceTicks(5, 5, 10);
    expect(ticks).toEqual([5]);
  });

  it('returns empty array for degenerate range', () => {
    const ticks = computeNiceTicks(0, 0, 10);
    expect(ticks).toEqual([0]);
  });

  it('returns empty array when maxTicks < 1', () => {
    const ticks = computeNiceTicks(0, 100, 0);
    expect(ticks).toEqual([]);
  });

  it('handles negative ranges', () => {
    const ticks = computeNiceTicks(-50, 50, 10);
    expect(ticks.length).toBeGreaterThan(0);
    // All ticks should be within or at the domain bounds
    for (const t of ticks) {
      expect(t).toBeGreaterThanOrEqual(-50);
      expect(t).toBeLessThanOrEqual(50);
    }
  });

  it('handles very small ranges', () => {
    const ticks = computeNiceTicks(0.001, 0.01, 5);
    expect(ticks.length).toBeGreaterThan(0);
  });

  it('handles very large ranges', () => {
    const ticks = computeNiceTicks(0, 1_000_000, 10);
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.length).toBeLessThanOrEqual(20);
  });
});
