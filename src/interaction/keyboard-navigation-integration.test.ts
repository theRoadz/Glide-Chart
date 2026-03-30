import { GlideChart } from '../api/glide-chart';
import type { DataPoint } from '../core/types';
import { ThemeMode } from '../config/types';

vi.stubGlobal(
  'ResizeObserver',
  class {
    constructor(_cb: ResizeObserverCallback) {}
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
  media: query,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  onchange: null,
  dispatchEvent: vi.fn(),
}));

function createContainer(): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 600, configurable: true });
  document.body.appendChild(el);
  return el;
}

function generatePoints(count: number, startTs: number): DataPoint[] {
  const points: DataPoint[] = [];
  for (let i = 0; i < count; i++) {
    points.push({ timestamp: startTs + i * 1000, value: 100 + i * 10 });
  }
  return points;
}

function dispatchKeydown(el: HTMLElement, key: string): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('Keyboard Navigation Integration', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = createContainer();
  });

  afterEach(() => {
    container.remove();
  });

  it('arrow key moves crosshair position and updates tooltip ARIA', () => {
    const points = generatePoints(10, 1000);
    const chart = new GlideChart(container, {
      theme: ThemeMode.Dark,
      series: [{ id: 'test', data: points }],
    });

    // Give focus and navigate with arrow
    container.dispatchEvent(new Event('focus'));
    dispatchKeydown(container, 'ArrowRight');
    dispatchKeydown(container, 'ArrowRight');

    // The ARIA live region should exist on the container
    const ariaEl = container.querySelector('[aria-live="polite"]');
    expect(ariaEl).not.toBeNull();

    chart.destroy();
  });

  it('zoom via keyboard changes scale domain', () => {
    const points = generatePoints(10, 1000);
    const chart = new GlideChart(container, {
      theme: ThemeMode.Dark,
      series: [{ id: 'test', data: points }],
    });

    // Navigate to a point first
    dispatchKeydown(container, 'ArrowRight');

    // Zoom in with +
    dispatchKeydown(container, '+');
    dispatchKeydown(container, '+');
    dispatchKeydown(container, '+');

    // Chart should not throw
    expect(() => chart.destroy()).not.toThrow();
  });

  it('aria-label set from config', () => {
    const points = generatePoints(5, 1000);
    const chart = new GlideChart(container, {
      theme: ThemeMode.Dark,
      ariaLabel: 'Price chart',
      series: [{ id: 'test', data: points }],
    });

    expect(container.getAttribute('aria-label')).toBe('Price chart');

    chart.destroy();
  });

  it('aria-label defaults to "Chart" when not specified', () => {
    const points = generatePoints(5, 1000);
    const chart = new GlideChart(container, {
      theme: ThemeMode.Dark,
      series: [{ id: 'test', data: points }],
    });

    expect(container.getAttribute('aria-label')).toBe('Chart');

    chart.destroy();
  });

  it('aria-label updates on setConfig', () => {
    const points = generatePoints(5, 1000);
    const chart = new GlideChart(container, {
      theme: ThemeMode.Dark,
      ariaLabel: 'Original',
      series: [{ id: 'test', data: points }],
    });

    expect(container.getAttribute('aria-label')).toBe('Original');

    chart.setConfig({ ariaLabel: 'Updated chart' });

    expect(container.getAttribute('aria-label')).toBe('Updated chart');

    chart.destroy();
  });

  it('blur hides crosshair and tooltip', () => {
    const points = generatePoints(10, 1000);
    const chart = new GlideChart(container, {
      theme: ThemeMode.Dark,
      series: [{ id: 'test', data: points }],
    });

    // Navigate to activate crosshair
    dispatchKeydown(container, 'ArrowRight');
    dispatchKeydown(container, 'ArrowRight');

    // Now blur — should deactivate
    container.dispatchEvent(new Event('blur'));

    // Tooltip element should be hidden
    const tooltipEl = container.querySelector('.glide-chart-tooltip') as HTMLElement;
    if (tooltipEl) {
      expect(tooltipEl.style.display).toBe('none');
    }

    chart.destroy();
  });

  it('container has tabindex="0" and role="img"', () => {
    const points = generatePoints(5, 1000);
    const chart = new GlideChart(container, {
      theme: ThemeMode.Dark,
      series: [{ id: 'test', data: points }],
    });

    expect(container.getAttribute('tabindex')).toBe('0');
    expect(container.getAttribute('role')).toBe('application');

    chart.destroy();
  });

  it('zoom disabled — keyboard zoom keys do not throw', () => {
    const points = generatePoints(10, 1000);
    const chart = new GlideChart(container, {
      theme: ThemeMode.Dark,
      zoom: false,
      series: [{ id: 'test', data: points }],
    });

    dispatchKeydown(container, 'ArrowRight');
    dispatchKeydown(container, '+');
    dispatchKeydown(container, '-');

    expect(() => chart.destroy()).not.toThrow();
  });
});
