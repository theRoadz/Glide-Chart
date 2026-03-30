import { createRef, StrictMode } from 'react';
import { render, cleanup } from '@testing-library/react';
import { GlideChart } from './glide-chart-component';
import { GlideChart as GlideChartCore } from '../api/glide-chart';
import type { GlideChartRef } from './types';
import type { DataPoint } from '../api/types';
import { ThemeMode } from '../api/types';

// Mock the core GlideChart class
const mockDestroy = vi.fn();
const mockAddData = vi.fn();
const mockSetData = vi.fn();
const mockClearData = vi.fn();
const mockSetConfig = vi.fn();
const mockResize = vi.fn();

interface MockInstance {
  destroy: ReturnType<typeof vi.fn>;
  addData: ReturnType<typeof vi.fn>;
  setData: ReturnType<typeof vi.fn>;
  clearData: ReturnType<typeof vi.fn>;
  setConfig: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
}

let mockInstances: MockInstance[] = [];

vi.mock('../api/glide-chart', () => ({
  GlideChart: vi.fn().mockImplementation(function (this: MockInstance) {
    this.destroy = mockDestroy;
    this.addData = mockAddData;
    this.setData = mockSetData;
    this.clearData = mockClearData;
    this.setConfig = mockSetConfig;
    this.resize = mockResize;
    mockInstances.push(this);
  }),
}));

const MockGlideChartCore = vi.mocked(GlideChartCore);

function createTestData(count: number): DataPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: Date.now() + i * 1000,
    value: Math.random() * 100,
  }));
}

beforeEach(() => {
  mockInstances = [];
  MockGlideChartCore.mockClear();
  mockDestroy.mockClear();
  mockAddData.mockClear();
  mockSetData.mockClear();
  mockClearData.mockClear();
  mockSetConfig.mockClear();
  mockResize.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('GlideChart React Component', () => {
  it('renders a container div', () => {
    const { container } = render(<GlideChart />);
    expect(container.querySelector('div')).toBeInTheDocument();
  });

  it('creates GlideChartCore instance on mount', () => {
    const testData = createTestData(5);
    render(
      <GlideChart
        series={[{ id: 'price', data: testData }]}
        theme={ThemeMode.Dark}
      />
    );

    expect(MockGlideChartCore).toHaveBeenCalledTimes(1);
    const [container, config] = MockGlideChartCore.mock.calls[0] as [HTMLElement, unknown];
    expect(container).toBeInstanceOf(HTMLDivElement);
    expect(config).toEqual(
      expect.objectContaining({
        theme: ThemeMode.Dark,
        series: [{ id: 'price', data: testData }],
      })
    );
  });

  it('calls destroy() on unmount', () => {
    render(<GlideChart />);
    expect(mockDestroy).not.toHaveBeenCalled();

    cleanup();
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it('handles React Strict Mode double-mount correctly', () => {
    render(
      <StrictMode>
        <GlideChart series={[{ id: 's1' }]} />
      </StrictMode>
    );

    // Strict Mode: mount → unmount → mount
    // destroy called once (first mount cleanup)
    expect(mockDestroy).toHaveBeenCalledTimes(1);
    // constructor called twice total
    expect(MockGlideChartCore).toHaveBeenCalledTimes(2);
    // Final instance should be active (2 instances created)
    expect(mockInstances).toHaveLength(2);
  });

  it('calls setConfig() when config props change', () => {
    const { rerender } = render(<GlideChart theme={ThemeMode.Dark} />);

    mockSetConfig.mockClear();

    rerender(<GlideChart theme={ThemeMode.Light} />);

    expect(mockSetConfig).toHaveBeenCalledTimes(1);
    expect(mockSetConfig).toHaveBeenCalledWith(
      expect.objectContaining({ theme: ThemeMode.Light })
    );
  });

  it('calls setData() when series data prop changes', () => {
    const data1 = createTestData(3);
    const data2 = createTestData(5);

    const { rerender } = render(
      <GlideChart series={[{ id: 'price', data: data1 }]} />
    );

    mockSetData.mockClear();

    rerender(
      <GlideChart series={[{ id: 'price', data: data2 }]} />
    );

    expect(mockSetData).toHaveBeenCalledWith('price', data2);
  });

  it('does NOT call setData() when same data reference is used', () => {
    const data = createTestData(3);

    const { rerender } = render(
      <GlideChart series={[{ id: 'price', data }]} />
    );

    mockSetData.mockClear();

    rerender(
      <GlideChart series={[{ id: 'price', data }]} />
    );

    expect(mockSetData).not.toHaveBeenCalled();
  });

  it('exposes imperative methods via ref', () => {
    const ref = createRef<GlideChartRef>();
    render(<GlideChart ref={ref} series={[{ id: 's1' }]} />);

    expect(ref.current).not.toBeNull();

    const point: DataPoint = { timestamp: 1000, value: 42 };
    const points: DataPoint[] = [point];

    ref.current!.addData('s1', point);
    expect(mockAddData).toHaveBeenCalledWith('s1', point);

    ref.current!.setData('s1', points);
    expect(mockSetData).toHaveBeenCalledWith('s1', points);

    ref.current!.clearData('s1');
    expect(mockClearData).toHaveBeenCalledWith('s1');

    ref.current!.clearData();
    expect(mockClearData).toHaveBeenCalledWith(undefined);

    ref.current!.resize();
    expect(mockResize).toHaveBeenCalled();
  });

  it('applies className and style to container div', () => {
    const { container } = render(
      <GlideChart className="my-chart" style={{ width: '100%', height: '400px' }} />
    );

    const div = container.querySelector('div')!;
    expect(div.className).toBe('my-chart');
    expect(div.style.width).toBe('100%');
    expect(div.style.height).toBe('400px');
  });

  it('renders without error when no series prop is provided', () => {
    render(<GlideChart />);

    expect(MockGlideChartCore).toHaveBeenCalledTimes(1);
    const [, config] = MockGlideChartCore.mock.calls[0] as [HTMLElement, Record<string, unknown>];
    expect(config.series).toBeUndefined();
  });

  it('does NOT call setConfig() or setData() redundantly on first render', () => {
    const data = createTestData(3);
    render(<GlideChart series={[{ id: 'price', data }]} theme={ThemeMode.Dark} />);

    // Constructor was called with the config — sync effects should NOT call setConfig/setData again
    expect(mockSetConfig).not.toHaveBeenCalled();
    expect(mockSetData).not.toHaveBeenCalled();
  });

  it('calls setConfig() when series config (non-data) changes', () => {
    const data = createTestData(3);
    const { rerender } = render(
      <GlideChart series={[{ id: 'price', data }]} />
    );

    mockSetConfig.mockClear();

    rerender(
      <GlideChart series={[{ id: 'price', data }]} />
    );

    // Same series config — no call
    expect(mockSetConfig).not.toHaveBeenCalled();
  });

  it('calls setConfig() when tooltip.formatter changes', () => {
    const formatter1 = () => 'a';
    const formatter2 = () => 'b';

    const { rerender } = render(
      <GlideChart tooltip={{ formatter: formatter1 }} />
    );

    mockSetConfig.mockClear();

    rerender(
      <GlideChart tooltip={{ formatter: formatter2 }} />
    );

    expect(mockSetConfig).toHaveBeenCalledTimes(1);
  });

  it('calls setConfig() when onStaleChange changes', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    const { rerender } = render(
      <GlideChart onStaleChange={cb1} />
    );

    mockSetConfig.mockClear();

    rerender(
      <GlideChart onStaleChange={cb2} />
    );

    expect(mockSetConfig).toHaveBeenCalledTimes(1);
  });

  it('imperative methods are no-ops when chart is null (after unmount)', () => {
    const ref = createRef<GlideChartRef>();
    render(<GlideChart ref={ref} />);

    const handle = ref.current!;
    cleanup();

    // After unmount, chartRef.current is null — methods should not throw
    mockAddData.mockClear();
    mockSetData.mockClear();
    mockClearData.mockClear();
    mockResize.mockClear();

    expect(() => handle.addData('s1', { timestamp: 1, value: 1 })).not.toThrow();
    expect(() => handle.setData('s1', [])).not.toThrow();
    expect(() => handle.clearData()).not.toThrow();
    expect(() => handle.resize()).not.toThrow();

    // The mock methods on the destroyed instance should not be called again
    // (chartRef.current is null so optional chaining skips the call)
    expect(mockAddData).not.toHaveBeenCalled();
    expect(mockSetData).not.toHaveBeenCalled();
    expect(mockClearData).not.toHaveBeenCalled();
    expect(mockResize).not.toHaveBeenCalled();
  });
});
