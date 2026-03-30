import { Crosshair } from './crosshair';
import type { PointerState, CrosshairDataSource } from './types';
import type { ResolvedConfig, CrosshairConfig } from '../config/types';
import { Scale } from '../core/scale';
import { RingBuffer } from '../core/ring-buffer';
import type { DataPoint } from '../core/types';

function createScale(): Scale {
  const scale = new Scale({
    canvasWidth: 800,
    canvasHeight: 600,
    dpr: 1,
    padding: { top: 10, right: 10, bottom: 30, left: 60 },
  });
  // Set domains so conversions work
  scale.setDomainX(1000, 5000);
  scale.setDomainY(0, 100);
  return scale;
}

function createConfig(
  overrides: Partial<CrosshairConfig> = {},
): Readonly<ResolvedConfig> {
  return {
    crosshair: {
      enabled: true,
      color: '#ffffff',
      lineWidth: 1,
      dashPattern: [4, 4],
      ...overrides,
    },
  } as unknown as ResolvedConfig;
}

function createDataSource(buffers: RingBuffer<DataPoint>[] = [], ids?: string[]): CrosshairDataSource {
  const seriesData = buffers.map((buffer, i) => ({
    id: ids?.[i] ?? `s${i}`,
    buffer,
  }));
  return {
    getSeries() {
      return seriesData;
    },
  };
}

function createPointerState(overrides: Partial<PointerState> = {}): PointerState {
  return {
    x: 200,
    y: 200,
    active: true,
    pointerType: 'mouse',
    ...overrides,
  };
}

function createBufferWithData(points: DataPoint[]): RingBuffer<DataPoint> {
  const buffer = new RingBuffer<DataPoint>(1000);
  for (const p of points) {
    buffer.push(p);
  }
  return buffer;
}

describe('Crosshair', () => {
  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    ctx = canvas.getContext('2d')!;
  });

  it('throws if scale is not provided', () => {
    expect(() => new Crosshair(null as unknown as Scale, createDataSource())).toThrow(
      'Crosshair: scale instance is required',
    );
  });

  it('throws if dataSource is not provided', () => {
    expect(
      () => new Crosshair(createScale(), null as unknown as CrosshairDataSource),
    ).toThrow('Crosshair: dataSource is required');
  });

  it('draws vertical line at pointer X and horizontal line snapped to nearest data point', () => {
    const scale = createScale();
    const buffer = createBufferWithData([
      { timestamp: 2000, value: 50 },
      { timestamp: 3000, value: 75 },
      { timestamp: 4000, value: 25 },
    ]);
    const crosshair = new Crosshair(scale, createDataSource([buffer]));
    const viewport = scale.viewport;

    // Position pointer at a pixel that maps to ~3000 timestamp
    const px = scale.xToPixel(3000);
    const state = createPointerState({ x: px, y: 200 });

    const strokeSpy = vi.spyOn(ctx, 'stroke');
    const moveToSpy = vi.spyOn(ctx, 'moveTo');
    const lineToSpy = vi.spyOn(ctx, 'lineTo');

    crosshair.draw(ctx, state, createConfig());

    // Should have drawn 2 lines (vertical + horizontal)
    expect(strokeSpy).toHaveBeenCalledTimes(2);

    // Vertical line at pointer X
    const vx = Math.round(px) + 0.5;
    expect(moveToSpy).toHaveBeenCalledWith(vx, viewport.y);
    expect(lineToSpy).toHaveBeenCalledWith(vx, viewport.y + viewport.height);

    // Horizontal line at y-pixel for value 75 (nearest to timestamp 3000)
    const hy = Math.round(scale.yToPixel(75)) + 0.5;
    expect(moveToSpy).toHaveBeenCalledWith(viewport.x, hy);
    expect(lineToSpy).toHaveBeenCalledWith(viewport.x + viewport.width, hy);
  });

  it('applies config color, lineWidth, dashPattern', () => {
    const scale = createScale();
    const buffer = createBufferWithData([{ timestamp: 2000, value: 50 }]);
    const crosshair = new Crosshair(scale, createDataSource([buffer]));
    const px = scale.xToPixel(2000);
    const state = createPointerState({ x: px, y: 200 });

    const setLineDashSpy = vi.spyOn(ctx, 'setLineDash');

    crosshair.draw(
      ctx,
      state,
      createConfig({ color: '#ff0000', lineWidth: 2, dashPattern: [6, 3] }),
    );

    expect(ctx.strokeStyle).toBe('#ff0000');
    expect(ctx.lineWidth).toBe(2);
    expect(setLineDashSpy).toHaveBeenCalledWith([6, 3]);
  });

  it('does not draw when enabled=false', () => {
    const scale = createScale();
    const crosshair = new Crosshair(scale, createDataSource());
    const state = createPointerState();

    const strokeSpy = vi.spyOn(ctx, 'stroke');

    crosshair.draw(ctx, state, createConfig({ enabled: false }));

    expect(strokeSpy).not.toHaveBeenCalled();
  });

  it('does not draw when pointer is inactive', () => {
    const scale = createScale();
    const crosshair = new Crosshair(scale, createDataSource());
    const state = createPointerState({ active: false });

    const strokeSpy = vi.spyOn(ctx, 'stroke');

    crosshair.draw(ctx, state, createConfig());

    expect(strokeSpy).not.toHaveBeenCalled();
  });

  it('does not draw when pointer is outside the plot area', () => {
    const scale = createScale();
    const crosshair = new Crosshair(scale, createDataSource());
    // Outside viewport (left of padding)
    const state = createPointerState({ x: 5, y: 200 });

    const strokeSpy = vi.spyOn(ctx, 'stroke');

    crosshair.draw(ctx, state, createConfig());

    expect(strokeSpy).not.toHaveBeenCalled();
  });

  it('resets dash pattern after drawing', () => {
    const scale = createScale();
    const buffer = createBufferWithData([{ timestamp: 2000, value: 50 }]);
    const crosshair = new Crosshair(scale, createDataSource([buffer]));
    const px = scale.xToPixel(2000);
    const state = createPointerState({ x: px, y: 200 });

    const setLineDashSpy = vi.spyOn(ctx, 'setLineDash');

    crosshair.draw(ctx, state, createConfig());

    // Last call should reset to empty array
    const lastCall = setLineDashSpy.mock.calls[setLineDashSpy.mock.calls.length - 1]!;
    expect(lastCall[0]).toEqual([]);
  });

  it('draws only vertical line when no data is available', () => {
    const scale = createScale();
    const crosshair = new Crosshair(scale, createDataSource([]));
    const viewport = scale.viewport;
    const px = viewport.x + 100;
    const state = createPointerState({ x: px, y: 200 });

    const strokeSpy = vi.spyOn(ctx, 'stroke');

    crosshair.draw(ctx, state, createConfig());

    // Only vertical line (no horizontal since no data)
    expect(strokeSpy).toHaveBeenCalledTimes(1);
  });
});
