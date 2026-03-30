import { Tooltip } from './tooltip';
import type { PointerState, CrosshairDataSource, CrosshairSeriesData } from './types';
import type { ResolvedConfig, TooltipConfig, AxisConfig } from '../config/types';
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
  scale.setDomainX(1000, 5000);
  scale.setDomainY(0, 100);
  return scale;
}

function createConfig(overrides?: {
  tooltip?: Partial<TooltipConfig>;
  xAxis?: Partial<AxisConfig>;
  yAxis?: Partial<AxisConfig>;
  seriesCount?: number;
}): Readonly<ResolvedConfig> {
  const count = overrides?.seriesCount ?? 1;
  const series = Array.from({ length: count }, (_, i) => ({
    id: `s${i}`,
    line: { color: '#fff', width: 2, opacity: 1 },
    gradient: { enabled: false, topColor: '#000', bottomColor: '#000', topOpacity: 0, bottomOpacity: 0 },
  }));

  return {
    tooltip: {
      enabled: true,
      backgroundColor: '#1a1a2e',
      textColor: '#e0e0e0',
      fontSize: 12,
      fontFamily: 'sans-serif',
      padding: 8,
      borderRadius: 4,
      ...overrides?.tooltip,
    },
    crosshair: { enabled: true, color: '#fff', lineWidth: 1, dashPattern: [4, 4] },
    xAxis: {
      visible: true,
      labelColor: '#aaa',
      labelFontSize: 11,
      labelFontFamily: 'sans-serif',
      tickColor: '#555',
      tickLength: 5,
      ...overrides?.xAxis,
    },
    yAxis: {
      visible: true,
      labelColor: '#aaa',
      labelFontSize: 11,
      labelFontFamily: 'sans-serif',
      tickColor: '#555',
      tickLength: 5,
      ...overrides?.yAxis,
    },
    series,
  } as unknown as ResolvedConfig;
}

function createBufferWithData(points: DataPoint[]): RingBuffer<DataPoint> {
  const buffer = new RingBuffer<DataPoint>(1000);
  for (const p of points) {
    buffer.push(p);
  }
  return buffer;
}

function createDataSource(
  entries: { id: string; buffer: RingBuffer<DataPoint> }[],
): CrosshairDataSource {
  const seriesData: CrosshairSeriesData[] = entries;
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

describe('Tooltip', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true });
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('creates tooltip div in container on construction', () => {
    const scale = createScale();
    const ds = createDataSource([]);
    const config = createConfig();

    new Tooltip(container, scale, ds, config);

    const tooltipEl = container.querySelector('.glide-chart-tooltip');
    expect(tooltipEl).not.toBeNull();
    expect((tooltipEl as HTMLElement).style.pointerEvents).toBe('none');
    expect((tooltipEl as HTMLElement).style.display).toBe('none');
  });

  it('update() shows tooltip with formatted timestamp and value when pointer active and within viewport', () => {
    const scale = createScale();
    const buffer = createBufferWithData([
      { timestamp: 2000, value: 50 },
      { timestamp: 3000, value: 75 },
    ]);
    const ds = createDataSource([{ id: 's0', buffer }]);
    const config = createConfig();

    const tooltip = new Tooltip(container, scale, ds, config);
    const px = scale.xToPixel(3000);
    const state = createPointerState({ x: px, y: 200 });

    tooltip.update(state, config);

    const tooltipEl = container.querySelector('.glide-chart-tooltip') as HTMLElement;
    expect(tooltipEl.style.display).not.toBe('none');

    const timeEl = container.querySelector('.glide-chart-tooltip-time') as HTMLElement;
    expect(timeEl.textContent).toBeTruthy();

    const valueEl = container.querySelector('.glide-chart-tooltip-value') as HTMLElement;
    expect(valueEl.textContent).toBeTruthy();
  });

  it('multi-series — all series values displayed', () => {
    const scale = createScale();
    const buf1 = createBufferWithData([{ timestamp: 2000, value: 50 }]);
    const buf2 = createBufferWithData([{ timestamp: 2000, value: 75 }]);
    const ds = createDataSource([
      { id: 'price', buffer: buf1 },
      { id: 'volume', buffer: buf2 },
    ]);
    const config = createConfig({ seriesCount: 2 });

    const tooltip = new Tooltip(container, scale, ds, config);
    const px = scale.xToPixel(2000);
    const state = createPointerState({ x: px, y: 200 });

    tooltip.update(state, config);

    const rows = container.querySelectorAll('.glide-chart-tooltip-row');
    expect(rows.length).toBe(2);

    const labels = container.querySelectorAll('.glide-chart-tooltip-label');
    expect(labels[0]!.textContent).toBe('price');
    expect(labels[1]!.textContent).toBe('volume');

    const values = container.querySelectorAll('.glide-chart-tooltip-value');
    expect(values[0]!.textContent).toBeTruthy();
    expect(values[1]!.textContent).toBeTruthy();
  });

  it('tooltip hidden when enabled=false', () => {
    const scale = createScale();
    const buffer = createBufferWithData([{ timestamp: 2000, value: 50 }]);
    const ds = createDataSource([{ id: 's0', buffer }]);
    const config = createConfig({ tooltip: { enabled: false } });

    const tooltip = new Tooltip(container, scale, ds, config);
    const state = createPointerState();

    tooltip.update(state, config);

    const tooltipEl = container.querySelector('.glide-chart-tooltip') as HTMLElement;
    expect(tooltipEl.style.display).toBe('none');
  });

  it('tooltip hidden when pointer inactive', () => {
    const scale = createScale();
    const buffer = createBufferWithData([{ timestamp: 2000, value: 50 }]);
    const ds = createDataSource([{ id: 's0', buffer }]);
    const config = createConfig();

    const tooltip = new Tooltip(container, scale, ds, config);
    const state = createPointerState({ active: false });

    tooltip.update(state, config);

    const tooltipEl = container.querySelector('.glide-chart-tooltip') as HTMLElement;
    expect(tooltipEl.style.display).toBe('none');
  });

  it('tooltip hidden when pointer is outside viewport bounds', () => {
    const scale = createScale();
    const buffer = createBufferWithData([{ timestamp: 2000, value: 50 }]);
    const ds = createDataSource([{ id: 's0', buffer }]);
    const config = createConfig();

    const tooltip = new Tooltip(container, scale, ds, config);
    // Position outside viewport (over axis padding)
    const state = createPointerState({ x: 5, y: 200 });

    tooltip.update(state, config);

    const tooltipEl = container.querySelector('.glide-chart-tooltip') as HTMLElement;
    expect(tooltipEl.style.display).toBe('none');
  });

  it('tooltip repositions to avoid overflow (boundary detection)', () => {
    const scale = createScale();
    const buffer = createBufferWithData([{ timestamp: 4500, value: 90 }]);
    const ds = createDataSource([{ id: 's0', buffer }]);
    const config = createConfig();

    const tooltip = new Tooltip(container, scale, ds, config);

    // Position pointer near the right edge of viewport
    const px = scale.xToPixel(4500);
    const state = createPointerState({ x: px, y: 15 });

    tooltip.update(state, config);

    const tooltipEl = container.querySelector('.glide-chart-tooltip') as HTMLElement;
    // Should have a transform applied (positioning)
    expect(tooltipEl.style.transform).toContain('translate');
  });

  it('ARIA live region exists with aria-live="polite"', () => {
    const scale = createScale();
    const ds = createDataSource([]);
    const config = createConfig();

    new Tooltip(container, scale, ds, config);

    const ariaEl = container.querySelector('[aria-live="polite"]');
    expect(ariaEl).not.toBeNull();
    expect(ariaEl!.getAttribute('aria-atomic')).toBe('true');
  });

  it('ARIA content updates are debounced (~300ms)', () => {
    vi.useFakeTimers();

    const scale = createScale();
    const buffer = createBufferWithData([{ timestamp: 2000, value: 50 }]);
    const ds = createDataSource([{ id: 's0', buffer }]);
    const config = createConfig();

    const tooltip = new Tooltip(container, scale, ds, config);
    const px = scale.xToPixel(2000);
    const state = createPointerState({ x: px, y: 200 });

    tooltip.update(state, config);

    const ariaEl = container.querySelector('[aria-live="polite"]') as HTMLElement;
    // Should NOT have content immediately
    expect(ariaEl.textContent).toBe('');

    // Advance timer past debounce
    vi.advanceTimersByTime(300);
    expect(ariaEl.textContent).toBeTruthy();

    vi.useRealTimers();
  });

  it('destroy removes tooltip and ARIA divs from DOM and clears timer', () => {
    vi.useFakeTimers();

    const scale = createScale();
    const buffer = createBufferWithData([{ timestamp: 2000, value: 50 }]);
    const ds = createDataSource([{ id: 's0', buffer }]);
    const config = createConfig();

    const tooltip = new Tooltip(container, scale, ds, config);
    const px = scale.xToPixel(2000);
    tooltip.update(createPointerState({ x: px, y: 200 }), config);

    tooltip.destroy();

    expect(container.querySelector('.glide-chart-tooltip')).toBeNull();
    expect(container.querySelector('[aria-live="polite"]')).toBeNull();

    // Advancing timers should not throw after destroy
    vi.advanceTimersByTime(500);

    vi.useRealTimers();
  });

  it('custom formatter functions applied to values and timestamps', () => {
    const scale = createScale();
    const buffer = createBufferWithData([{ timestamp: 2000, value: 42.5 }]);
    const ds = createDataSource([{ id: 's0', buffer }]);
    const config = createConfig({
      xAxis: { labelFormatter: () => 'CUSTOM_TIME' },
      yAxis: { labelFormatter: (v: number) => `$${v.toFixed(2)}` },
    });

    const tooltip = new Tooltip(container, scale, ds, config);
    const px = scale.xToPixel(2000);
    tooltip.update(createPointerState({ x: px, y: 200 }), config);

    const timeEl = container.querySelector('.glide-chart-tooltip-time') as HTMLElement;
    expect(timeEl.textContent).toBe('CUSTOM_TIME');

    const valueEl = container.querySelector('.glide-chart-tooltip-value') as HTMLElement;
    expect(valueEl.textContent).toBe('$42.50');
  });

  it('falls back to auto-format when custom formatter throws', () => {
    const scale = createScale();
    const buffer = createBufferWithData([{ timestamp: 2000, value: 42.5 }]);
    const ds = createDataSource([{ id: 's0', buffer }]);
    const config = createConfig({
      xAxis: {
        labelFormatter: () => {
          throw new Error('formatter broke');
        },
      },
      yAxis: {
        labelFormatter: () => {
          throw new Error('formatter broke');
        },
      },
    });

    const tooltip = new Tooltip(container, scale, ds, config);
    const px = scale.xToPixel(2000);
    tooltip.update(createPointerState({ x: px, y: 200 }), config);

    const timeEl = container.querySelector('.glide-chart-tooltip-time') as HTMLElement;
    // Should have auto-formatted content (not empty, not thrown)
    expect(timeEl.textContent).toBeTruthy();

    const valueEl = container.querySelector('.glide-chart-tooltip-value') as HTMLElement;
    expect(valueEl.textContent).toBeTruthy();
  });

  it('constructor validates all required inputs', () => {
    const scale = createScale();
    const ds = createDataSource([]);
    const config = createConfig();

    expect(() => new Tooltip(null as unknown as HTMLElement, scale, ds, config)).toThrow(
      'Tooltip: container element is required',
    );
    expect(
      () => new Tooltip(container, null as unknown as Scale, ds, config),
    ).toThrow('Tooltip: scale instance is required');
    expect(
      () => new Tooltip(container, scale, null as unknown as CrosshairDataSource, config),
    ).toThrow('Tooltip: dataSource is required');
    expect(
      () => new Tooltip(container, scale, ds, null as unknown as ResolvedConfig),
    ).toThrow('Tooltip: config is required');
  });
});
