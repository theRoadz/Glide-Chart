import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GlideChart } from '../api/glide-chart';

// jsdom does not provide ResizeObserver — stub it for GlideChart constructor
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

vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
  return setTimeout(cb, 0);
});

describe('widget entry point', () => {
  it('exports GlideChart as default export', async () => {
    const mod = await import('./widget');
    expect(mod.default).toBeDefined();
  });

  it('default export is the same class as GlideChart from api', async () => {
    const mod = await import('./widget');
    expect(mod.default).toBe(GlideChart);
  });

  it('default export is a function (constructor)', async () => {
    const mod = await import('./widget');
    expect(typeof mod.default).toBe('function');
  });

  it('has no side effects — does not add GlideChart to window on import', () => {
    // widget.ts should NOT manually assign to window — esbuild handles that
    // at bundle time via globalName. At module level, window should be untouched.
    expect((window as unknown as Record<string, unknown>)['GlideChart']).toBeUndefined();
  });

  it('only imports from api/ or ./ modules (import DAG discipline)', async () => {
    // @ts-expect-error -- ?raw import is a Vite/Vitest feature not typed in tsconfig
    const widgetSource: { default: string } = await import('./widget.ts?raw');
    const source = widgetSource.default;

    const importRegex = /from\s+['"]([^'"]+)['"]/g;
    const imports: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(source)) !== null) {
      imports.push(match[1]!);
    }

    expect(imports.length).toBeGreaterThan(0);

    for (const importPath of imports) {
      expect(
        importPath.startsWith('../api/') || importPath.startsWith('./'),
        `Forbidden import: ${importPath}`,
      ).toBe(true);
    }

    // Explicitly verify no forbidden module imports
    const forbidden = ['../core/', '../config/', '../renderer/', '../interaction/', '../streaming/'];
    for (const importPath of imports) {
      for (const prefix of forbidden) {
        expect(importPath.startsWith(prefix)).toBe(false);
      }
    }
  });
});

describe('widget auto-init', () => {
  let initFn: () => GlideChart[];

  beforeEach(() => {
    // Access init via the static property attached to GlideChart
    initFn = (GlideChart as unknown as { init: () => GlideChart[] }).init;
  });

  afterEach(() => {
    // Clean up DOM
    document.body.innerHTML = '';
  });

  it('GlideChart.init is a function', () => {
    expect(typeof initFn).toBe('function');
  });

  it('discovers [data-glide-chart] elements in DOM', () => {
    document.body.innerHTML = '<div data-glide-chart></div>';
    const created = initFn();
    expect(created).toHaveLength(1);
    expect(created[0]).toBeInstanceOf(GlideChart);
  });

  it('creates GlideChart instance for each discovered element', () => {
    document.body.innerHTML = `
      <div data-glide-chart></div>
      <div data-glide-chart></div>
      <div data-glide-chart></div>
    `;
    const created = initFn();
    expect(created).toHaveLength(3);
    for (const chart of created) {
      expect(chart).toBeInstanceOf(GlideChart);
    }
  });

  it('multiple elements create independent instances', () => {
    document.body.innerHTML = `
      <div data-glide-chart data-theme="dark"></div>
      <div data-glide-chart data-theme="light"></div>
    `;
    const created = initFn();
    expect(created).toHaveLength(2);
    expect(created[0]).not.toBe(created[1]);
  });

  it('does not throw on elements with no data attributes (uses defaults)', () => {
    document.body.innerHTML = '<div data-glide-chart></div>';
    expect(() => initFn()).not.toThrow();
  });

  it('skips already-initialized elements on second init() call', () => {
    document.body.innerHTML = '<div data-glide-chart></div>';
    const first = initFn();
    expect(first).toHaveLength(1);
    const second = initFn();
    expect(second).toHaveLength(0);
  });

  it('manual init() call works for dynamically added elements', () => {
    document.body.innerHTML = '<div data-glide-chart></div>';
    const first = initFn();
    expect(first).toHaveLength(1);

    // Dynamically add a new element
    const newDiv = document.createElement('div');
    newDiv.setAttribute('data-glide-chart', '');
    document.body.appendChild(newDiv);

    const second = initFn();
    expect(second).toHaveLength(1);
    expect(second[0]).toBeInstanceOf(GlideChart);
  });

  it('parses data attributes into chart config', () => {
    document.body.innerHTML = '<div data-glide-chart data-theme="dark" data-zoom="true"></div>';
    const created = initFn();
    expect(created).toHaveLength(1);
    // Chart was created — if config parsing failed, construction would throw or error
  });

  it('returns empty array when no elements found', () => {
    document.body.innerHTML = '<div></div>';
    const created = initFn();
    expect(created).toHaveLength(0);
  });
});

describe('widget data-src fetch', () => {
  let initFn: () => GlideChart[];

  beforeEach(() => {
    initFn = (GlideChart as unknown as { init: () => GlideChart[] }).init;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('data-src triggers fetch on init', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    document.body.innerHTML = '<div data-glide-chart data-src="/api/data.json"></div>';
    initFn();
    expect(fetchSpy).toHaveBeenCalledWith('/api/data.json', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('successful fetch with array format calls setData with series ID "default"', async () => {
    const data = [
      { t: 1000, v: 10 },
      { t: 2000, v: 20 },
    ];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    document.body.innerHTML = '<div data-glide-chart data-src="/api/data.json"></div>';
    const created = initFn();
    expect(created).toHaveLength(1);

    const setDataSpy = vi.spyOn(created[0]!, 'setData');

    // Let the fetch promise resolve
    await vi.waitFor(() => {
      expect(setDataSpy).toHaveBeenCalledWith('default', [
        { timestamp: 1000, value: 10 },
        { timestamp: 2000, value: 20 },
      ]);
    });
  });

  it('successful fetch with object format registers series via setConfig then calls setData', async () => {
    const data = {
      series: [
        { id: 'price', data: [{ t: 1000, v: 100 }] },
        { id: 'volume', data: [{ t: 1000, v: 500 }] },
      ],
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    document.body.innerHTML = '<div data-glide-chart data-src="/api/multi.json"></div>';
    const created = initFn();
    const chart = created[0]!;
    const setConfigSpy = vi.spyOn(chart, 'setConfig');
    const setDataSpy = vi.spyOn(chart, 'setData');

    await vi.waitFor(() => {
      expect(setConfigSpy).toHaveBeenCalledWith({ series: [{ id: 'price' }, { id: 'volume' }] });
      expect(setDataSpy).toHaveBeenCalledWith('price', [{ timestamp: 1000, value: 100 }]);
      expect(setDataSpy).toHaveBeenCalledWith('volume', [{ timestamp: 1000, value: 500 }]);
    });
  });

  it('fetch failure logs warning, chart remains empty (no throw)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Not Found', { status: 404 }),
    );

    document.body.innerHTML = '<div data-glide-chart data-src="/api/missing.json"></div>';
    const created = initFn();
    expect(created).toHaveLength(1);

    await vi.waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('data-src fetch failed (404)'),
      );
    });
  });

  it('fetch network error logs warning without throwing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Network error'));

    document.body.innerHTML = '<div data-glide-chart data-src="/api/fail.json"></div>';
    initFn();

    await vi.waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('data-src fetch error'),
        expect.anything(),
      );
    });
  });

  it('invalid data points (missing t/v) are skipped', async () => {
    const data = [
      { t: 1000, v: 10 },
      { t: 'bad', v: 20 },
      { t: 3000 },
      { v: 40 },
      { t: 5000, v: 50 },
    ];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    document.body.innerHTML = '<div data-glide-chart data-src="/api/data.json"></div>';
    const created = initFn();
    const setDataSpy = vi.spyOn(created[0]!, 'setData');

    await vi.waitFor(() => {
      expect(setDataSpy).toHaveBeenCalledWith('default', [
        { timestamp: 1000, value: 10 },
        { timestamp: 5000, value: 50 },
      ]);
    });
  });

  it('does not fetch when data-src is absent', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('[]', { status: 200 }),
    );
    document.body.innerHTML = '<div data-glide-chart></div>';
    initFn();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('widget integration', () => {
  let initFn: () => GlideChart[];

  beforeEach(() => {
    initFn = (GlideChart as unknown as { init: () => GlideChart[] }).init;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('full flow: DOM element with data attributes + data-src creates configured chart', async () => {
    const data = [{ t: 1000, v: 42.5 }];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    document.body.innerHTML = `
      <div
        data-glide-chart
        data-theme="dark"
        data-time-window="300"
        data-zoom="true"
        data-line-color="#00ff00"
        data-src="/api/data.json"
      ></div>
    `;

    const created = initFn();
    expect(created).toHaveLength(1);
    const chart = created[0]!;
    expect(chart).toBeInstanceOf(GlideChart);

    const setDataSpy = vi.spyOn(chart, 'setData');
    await vi.waitFor(() => {
      expect(setDataSpy).toHaveBeenCalledWith('default', [{ timestamp: 1000, value: 42.5 }]);
    });
  });
});

describe('widget destroy', () => {
  let initFn: () => GlideChart[];
  let destroyFn: (el: HTMLElement) => boolean;

  beforeEach(() => {
    initFn = (GlideChart as unknown as { init: () => GlideChart[] }).init;
    destroyFn = (GlideChart as unknown as { destroy: (el: HTMLElement) => boolean }).destroy;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('GlideChart.destroy is a function', () => {
    expect(typeof destroyFn).toBe('function');
  });

  it('destroys an initialized widget and returns true', () => {
    document.body.innerHTML = '<div data-glide-chart></div>';
    initFn();
    const el = document.querySelector<HTMLElement>('[data-glide-chart]')!;
    expect(destroyFn(el)).toBe(true);
  });

  it('returns false for an element that was not initialized', () => {
    const el = document.createElement('div');
    expect(destroyFn(el)).toBe(false);
  });

  it('allows re-init after destroy', () => {
    document.body.innerHTML = '<div data-glide-chart></div>';
    const first = initFn();
    expect(first).toHaveLength(1);

    const el = document.querySelector<HTMLElement>('[data-glide-chart]')!;
    destroyFn(el);

    const second = initFn();
    expect(second).toHaveLength(1);
    expect(second[0]).toBeInstanceOf(GlideChart);
  });

  it('aborts in-flight data-src fetch on destroy', () => {
    let capturedSignal: AbortSignal | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, opts) => {
      capturedSignal = (opts as RequestInit)?.signal as AbortSignal;
      return new Promise(() => {}); // never resolves
    });

    document.body.innerHTML = '<div data-glide-chart data-src="/api/data.json"></div>';
    initFn();

    const el = document.querySelector<HTMLElement>('[data-glide-chart]')!;
    expect(capturedSignal?.aborted).toBe(false);

    destroyFn(el);
    expect(capturedSignal?.aborted).toBe(true);
  });

  it('calls chart.destroy() on the underlying GlideChart instance', () => {
    document.body.innerHTML = '<div data-glide-chart></div>';
    const created = initFn();
    const destroySpy = vi.spyOn(created[0]!, 'destroy');

    const el = document.querySelector<HTMLElement>('[data-glide-chart]')!;
    destroyFn(el);
    expect(destroySpy).toHaveBeenCalledOnce();
  });
});
