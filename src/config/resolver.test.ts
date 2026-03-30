import { deepMerge, resolveConfig } from './resolver';
import { ThemeMode } from './types';
import { DEFAULT_CONFIG } from './defaults';
import { DARK_SERIES_COLORS, LIGHT_SERIES_COLORS } from './themes';

describe('deepMerge', () => {
  it('returns target unchanged when source is empty', () => {
    const target = { a: 1, b: 'hello', c: { d: true } };
    const result = deepMerge(target, {});
    expect(result).toEqual(target);
  });

  it('overrides primitive values from source', () => {
    const target = { a: 1, b: 'hello' };
    const result = deepMerge(target, { a: 42 });
    expect(result.a).toBe(42);
    expect(result.b).toBe('hello');
  });

  it('preserves non-overlapping target properties in nested merge', () => {
    const target = { nested: { a: 1, b: 2, c: 3 } };
    const result = deepMerge(target, {
      nested: { a: 10 },
    } as Partial<typeof target>);
    expect(result.nested).toEqual({ a: 10, b: 2, c: 3 });
  });

  it('overrides overlapping properties in nested objects', () => {
    const target = { nested: { a: 1, b: 2 } };
    const result = deepMerge(target, { nested: { a: 99, b: 88 } });
    expect(result.nested).toEqual({ a: 99, b: 88 });
  });

  it('replaces arrays instead of concatenating', () => {
    const target = { dashPattern: [4, 4] };
    const result = deepMerge(target, { dashPattern: [2, 2] });
    expect(result.dashPattern).toEqual([2, 2]);
  });

  it('does not override target when source value is undefined', () => {
    const target = { a: 1, b: 2 };
    const result = deepMerge(target, { a: undefined } as Partial<typeof target>);
    expect(result.a).toBe(1);
  });

  it('removes target key when source value is null', () => {
    const target = { a: 1, b: 2 };
    const result = deepMerge(
      target,
      { a: null } as unknown as Partial<typeof target>
    );
    expect(result).not.toHaveProperty('a');
    expect(result.b).toBe(2);
  });

  it('treats class instances as primitives (replaced, not recursed)', () => {
    const targetDate = new Date('2020-01-01');
    const sourceDate = new Date('2025-06-15');
    const target = { created: targetDate };
    const result = deepMerge(target, { created: sourceDate });
    expect(result.created).toBe(sourceDate);
    expect(result.created).not.toBe(targetDate);
  });

  it('does not mutate source or target', () => {
    const target = { nested: { a: 1, b: 2 } };
    const source: Partial<typeof target> = { nested: { a: 10, b: 2 } };
    const targetCopy = JSON.parse(JSON.stringify(target));
    const sourceCopy = JSON.parse(JSON.stringify(source));

    deepMerge(target, source);

    expect(target).toEqual(targetCopy);
    expect(source).toEqual(sourceCopy);
  });
});

describe('resolveConfig', () => {
  it('returns complete ResolvedConfig with dark theme defaults when no user config', () => {
    const config = resolveConfig();
    expect(config.theme).toBe(ThemeMode.Dark);
    expect(config.backgroundColor).toBe('#0a0a0f');
    expect(config.line.color).toBe('#00d4aa');
    expect(config.line.width).toBe(2);
    expect(config.line.opacity).toBe(1);
    expect(config.gradient.enabled).toBe(true);
    expect(config.grid.visible).toBe(true);
    expect(config.animation.enabled).toBe(true);
    expect(config.animation.duration).toBe(300);
    expect(config.maxDataPoints).toBe(10000);
    expect(config.staleThreshold).toBe(5000);
    expect(config.zoom).toBe(true);
    expect(config.series).toEqual([]);
  });

  it('overrides only specified values with partial user config', () => {
    const config = resolveConfig({ backgroundColor: '#111111' });
    expect(config.backgroundColor).toBe('#111111');
    expect(config.line.color).toBe('#00d4aa');
    expect(config.grid.visible).toBe(true);
  });

  it('applies light theme preset when theme is light', () => {
    const config = resolveConfig({ theme: ThemeMode.Light });
    expect(config.theme).toBe(ThemeMode.Light);
    expect(config.backgroundColor).toBe('#ffffff');
    expect(config.line.color).toBe('#0066cc');
    expect(config.gradient.topOpacity).toBe(0.2);
    expect(config.crosshair.color).toBe('#333333');
    expect(config.tooltip.backgroundColor).toBe('#ffffff');
  });

  it('applies dark theme preset when theme is explicitly dark', () => {
    const config = resolveConfig({ theme: ThemeMode.Dark });
    expect(config.theme).toBe(ThemeMode.Dark);
    expect(config.backgroundColor).toBe('#0a0a0f');
    expect(config.line.color).toBe('#00d4aa');
  });

  it('applies user overrides on top of theme preset (defaults <- theme <- user)', () => {
    const config = resolveConfig({
      theme: ThemeMode.Light,
      line: { color: '#ff0000' },
    });
    expect(config.theme).toBe(ThemeMode.Light);
    expect(config.backgroundColor).toBe('#ffffff');
    expect(config.line.color).toBe('#ff0000');
    expect(config.line.width).toBe(2);
  });

  it('resolves per-series line color override while retaining default width and opacity', () => {
    const config = resolveConfig({
      series: [{ id: 'price', line: { color: '#00ff00' } }],
    });
    expect(config.series).toHaveLength(1);
    const series0 = config.series[0]!;
    expect(series0.id).toBe('price');
    expect(series0.line.color).toBe('#00ff00');
    expect(series0.line.width).toBe(2);
    expect(series0.line.opacity).toBe(1);
  });

  it('resolves per-series gradient override while retaining default line settings', () => {
    const config = resolveConfig({
      series: [{ id: 'volume', gradient: { topOpacity: 0.5 } }],
    });
    const series0 = config.series[0]!;
    expect(series0.gradient.topOpacity).toBe(0.5);
    expect(series0.gradient.enabled).toBe(true);
    expect(series0.line.color).toBe(DARK_SERIES_COLORS[0]);
  });

  it('resolves multiple series each with different overrides', () => {
    const config = resolveConfig({
      line: { color: '#ff0000', width: 3 },
      series: [
        { id: 'price', line: { color: '#00ff00' } },
        { id: 'ref', line: {} },
        { id: 'volume' },
      ],
    });
    expect(config.series).toHaveLength(3);
    const s0 = config.series[0]!;
    const s1 = config.series[1]!;
    const s2 = config.series[2]!;
    expect(s0.line.color).toBe('#00ff00');
    expect(s0.line.width).toBe(3);
    expect(s1.line.color).toBe('#ff0000');
    expect(s1.line.width).toBe(3);
    expect(s2.line.color).toBe('#ff0000');
    expect(s2.line.width).toBe(3);
  });

  it('all resolved series configs are deeply frozen (immutable)', () => {
    const config = resolveConfig({
      series: [
        { id: 'price', line: { color: '#ff0000' } },
        { id: 'ref' },
      ],
    });
    for (const series of config.series) {
      expect(Object.isFrozen(series)).toBe(true);
      expect(Object.isFrozen(series.line)).toBe(true);
      expect(Object.isFrozen(series.gradient)).toBe(true);
    }
  });

  it('series with no overrides inherits global line AND gradient defaults correctly', () => {
    const config = resolveConfig({
      line: { color: '#ff0000', width: 3, opacity: 0.8 },
      gradient: { enabled: false, topColor: '#aabbcc', topOpacity: 0.5, bottomColor: '#112233', bottomOpacity: 0.1 },
      series: [{ id: 'test' }],
    });
    const series0 = config.series[0]!;
    expect(series0.line.color).toBe('#ff0000');
    expect(series0.line.width).toBe(3);
    expect(series0.line.opacity).toBe(0.8);
    expect(series0.gradient.enabled).toBe(false);
    expect(series0.gradient.topColor).toBe('#aabbcc');
    expect(series0.gradient.topOpacity).toBe(0.5);
    expect(series0.gradient.bottomColor).toBe('#112233');
    expect(series0.gradient.bottomOpacity).toBe(0.1);
  });

  it('returns a frozen top-level config object', () => {
    const config = resolveConfig();
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('returns deeply frozen nested objects', () => {
    const config = resolveConfig();
    expect(Object.isFrozen(config.line)).toBe(true);
    expect(Object.isFrozen(config.gradient)).toBe(true);
    expect(Object.isFrozen(config.grid)).toBe(true);
    expect(Object.isFrozen(config.animation)).toBe(true);
    expect(Object.isFrozen(config.xAxis)).toBe(true);
    expect(Object.isFrozen(config.yAxis)).toBe(true);
    expect(Object.isFrozen(config.crosshair)).toBe(true);
    expect(Object.isFrozen(config.tooltip)).toBe(true);
    expect(Object.isFrozen(config.series)).toBe(true);
  });

  it('has no undefined values at any level', () => {
    const config = resolveConfig();
    const checkNoUndefined = (obj: Record<string, unknown>, path: string) => {
      for (const [key, value] of Object.entries(obj)) {
        const fullPath = `${path}.${key}`;
        expect(value).not.toBeUndefined();
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          checkNoUndefined(value as Record<string, unknown>, fullPath);
        }
      }
    };
    checkNoUndefined(config as unknown as Record<string, unknown>, 'config');
  });

  it('throws for invalid maxDataPoints (0)', () => {
    expect(() => resolveConfig({ maxDataPoints: 0 })).toThrow(
      'ConfigResolver: maxDataPoints must be a positive integer'
    );
  });

  it('throws for invalid maxDataPoints (negative)', () => {
    expect(() => resolveConfig({ maxDataPoints: -5 })).toThrow(
      'ConfigResolver: maxDataPoints must be a positive integer'
    );
  });

  it('throws for invalid maxDataPoints (non-integer)', () => {
    expect(() => resolveConfig({ maxDataPoints: 1.5 })).toThrow(
      'ConfigResolver: maxDataPoints must be a positive integer'
    );
  });

  it('throws for invalid staleThreshold (negative)', () => {
    expect(() => resolveConfig({ staleThreshold: -1 })).toThrow(
      'ConfigResolver: staleThreshold must be non-negative'
    );
  });

  it('throws for invalid line.opacity (less than 0)', () => {
    expect(() => resolveConfig({ line: { opacity: -0.1 } })).toThrow(
      'ConfigResolver: line.opacity must be between 0 and 1'
    );
  });

  it('throws for invalid line.opacity (greater than 1)', () => {
    expect(() => resolveConfig({ line: { opacity: 1.5 } })).toThrow(
      'ConfigResolver: line.opacity must be between 0 and 1'
    );
  });

  it('throws for invalid theme string', () => {
    expect(() =>
      resolveConfig({ theme: 'midnight' as ThemeMode })
    ).toThrow("ConfigResolver: invalid theme 'midnight'");
  });

  it('series with empty overrides gets palette color and auto-matched gradient', () => {
    const config = resolveConfig({
      series: [{ id: 'test' }],
    });
    const series0 = config.series[0]!;
    expect(series0.line.color).toBe(DARK_SERIES_COLORS[0]);
    expect(series0.line.width).toBe(DEFAULT_CONFIG.line.width);
    expect(series0.line.opacity).toBe(DEFAULT_CONFIG.line.opacity);
    expect(series0.gradient.topColor).toBe(DARK_SERIES_COLORS[0]);
    expect(series0.gradient.bottomColor).toBe(DARK_SERIES_COLORS[0]);
  });

  it('throws for invalid per-series line.width (negative)', () => {
    expect(() =>
      resolveConfig({ series: [{ id: 'bad', line: { width: -1 } }] })
    ).toThrow("ConfigResolver: series 'bad': line.width must be positive");
  });

  it('throws for invalid per-series line.opacity (out of range)', () => {
    expect(() =>
      resolveConfig({ series: [{ id: 'bad', line: { opacity: 2 } }] })
    ).toThrow(
      "ConfigResolver: series 'bad': line.opacity must be between 0 and 1"
    );
  });

  it('throws for invalid per-series gradient.topOpacity (out of range)', () => {
    expect(() =>
      resolveConfig({
        series: [{ id: 'bad', gradient: { topOpacity: -0.1 } }],
      })
    ).toThrow(
      "ConfigResolver: series 'bad': gradient.topOpacity must be between 0 and 1"
    );
  });

  it('throws for NaN line.width', () => {
    expect(() => resolveConfig({ line: { width: NaN } })).toThrow(
      'ConfigResolver: line.width must be positive'
    );
  });

  it('throws for NaN staleThreshold', () => {
    expect(() => resolveConfig({ staleThreshold: NaN })).toThrow(
      'ConfigResolver: staleThreshold must be non-negative'
    );
  });

  it('throws for Infinity line.width', () => {
    expect(() => resolveConfig({ line: { width: Infinity } })).toThrow(
      'ConfigResolver: line.width must be positive'
    );
  });

  it('throws for NaN maxDataPoints', () => {
    expect(() => resolveConfig({ maxDataPoints: NaN })).toThrow(
      'ConfigResolver: maxDataPoints must be a positive integer'
    );
  });

  describe('timeWindow resolution', () => {
    it('defaults to 0 when no user config', () => {
      const config = resolveConfig();
      expect(config.timeWindow).toBe(0);
    });

    it('preserves user override', () => {
      const config = resolveConfig({ timeWindow: 300 });
      expect(config.timeWindow).toBe(300);
    });

    it('clamps negative value to 0', () => {
      const config = resolveConfig({ timeWindow: -10 });
      expect(config.timeWindow).toBe(0);
    });

    it('clamps NaN to 0', () => {
      const config = resolveConfig({ timeWindow: NaN });
      expect(config.timeWindow).toBe(0);
    });

    it('clamps Infinity to 0', () => {
      const config = resolveConfig({ timeWindow: Infinity });
      expect(config.timeWindow).toBe(0);
    });

    it('clamps -Infinity to 0', () => {
      const config = resolveConfig({ timeWindow: -Infinity });
      expect(config.timeWindow).toBe(0);
    });

    it('clamps sub-second value to 0', () => {
      const config = resolveConfig({ timeWindow: 0.5 });
      expect(config.timeWindow).toBe(0);
    });

    it('merges correctly with theme preset (theme has 0, user overrides)', () => {
      const config = resolveConfig({ theme: ThemeMode.Light, timeWindow: 60 });
      expect(config.timeWindow).toBe(60);
    });
  });

  describe('palette color assignment', () => {
    it('two series with no color overrides get different palette colors', () => {
      const config = resolveConfig({
        series: [{ id: 'a' }, { id: 'b' }],
      });
      expect(config.series[0]!.line.color).toBe(DARK_SERIES_COLORS[0]);
      expect(config.series[1]!.line.color).toBe(DARK_SERIES_COLORS[1]);
    });

    it('series with explicit line.color keeps its color, not overridden by palette', () => {
      const config = resolveConfig({
        series: [
          { id: 'a', line: { color: '#ff0000' } },
          { id: 'b' },
        ],
      });
      expect(config.series[0]!.line.color).toBe('#ff0000');
      expect(config.series[1]!.line.color).toBe(DARK_SERIES_COLORS[1]);
    });

    it('series at index >= palette length wraps around', () => {
      const series = Array.from({ length: 9 }, (_, i) => ({ id: `s${i}` }));
      const config = resolveConfig({ series });
      expect(config.series[8]!.line.color).toBe(DARK_SERIES_COLORS[0]);
    });

    it('series gradient colors auto-match line color when no explicit gradient config', () => {
      const config = resolveConfig({
        series: [{ id: 'a' }, { id: 'b' }],
      });
      expect(config.series[0]!.gradient.topColor).toBe(DARK_SERIES_COLORS[0]);
      expect(config.series[0]!.gradient.bottomColor).toBe(DARK_SERIES_COLORS[0]);
      expect(config.series[1]!.gradient.topColor).toBe(DARK_SERIES_COLORS[1]);
      expect(config.series[1]!.gradient.bottomColor).toBe(DARK_SERIES_COLORS[1]);
    });

    it('theme change (dark->light) changes palette colors to light variants', () => {
      const config = resolveConfig({
        theme: ThemeMode.Light,
        series: [{ id: 'a' }, { id: 'b' }],
      });
      expect(config.series[0]!.line.color).toBe(LIGHT_SERIES_COLORS[0]);
      expect(config.series[1]!.line.color).toBe(LIGHT_SERIES_COLORS[1]);
    });

    it('global line.color override applies to all series without per-series overrides (palette NOT used)', () => {
      const config = resolveConfig({
        line: { color: '#aabbcc' },
        series: [{ id: 'a' }, { id: 'b' }, { id: 'c', line: { color: '#112233' } }],
      });
      expect(config.series[0]!.line.color).toBe('#aabbcc');
      expect(config.series[1]!.line.color).toBe('#aabbcc');
      expect(config.series[2]!.line.color).toBe('#112233');
    });

    it('gradient auto-matches explicit per-series line.color override', () => {
      const config = resolveConfig({
        series: [{ id: 'a', line: { color: '#ff0000' } }],
      });
      expect(config.series[0]!.gradient.topColor).toBe('#ff0000');
      expect(config.series[0]!.gradient.bottomColor).toBe('#ff0000');
    });

    it('two series with per-series gradient overrides get specific gradient config merged with globals', () => {
      const config = resolveConfig({
        series: [
          { id: 'a', gradient: { topColor: '#ff0000', topOpacity: 0.5 } },
          { id: 'b', gradient: { bottomColor: '#00ff00' } },
        ],
      });
      expect(config.series[0]!.gradient.topColor).toBe('#ff0000');
      expect(config.series[0]!.gradient.topOpacity).toBe(0.5);
      // bottomColor auto-matched to line color since not explicitly set
      expect(config.series[0]!.gradient.bottomColor).toBe(DARK_SERIES_COLORS[0]);
      expect(config.series[1]!.gradient.bottomColor).toBe('#00ff00');
      // topColor auto-matched to line color since not explicitly set
      expect(config.series[1]!.gradient.topColor).toBe(DARK_SERIES_COLORS[1]);
    });

    it('explicit gradient topColor/bottomColor NOT overridden by auto-matching', () => {
      const config = resolveConfig({
        series: [{
          id: 'a',
          line: { color: '#ff0000' },
          gradient: { topColor: '#00ff00', bottomColor: '#0000ff' },
        }],
      });
      expect(config.series[0]!.gradient.topColor).toBe('#00ff00');
      expect(config.series[0]!.gradient.bottomColor).toBe('#0000ff');
    });
  });

  describe('grid config validation', () => {
    it('grid.dashPattern with negative value throws validation error', () => {
      expect(() => resolveConfig({ grid: { dashPattern: [4, -2] } })).toThrow(
        'ConfigResolver: grid.dashPattern values must be non-negative finite numbers'
      );
    });

    it('grid.dashPattern with NaN or Infinity throws validation error', () => {
      expect(() => resolveConfig({ grid: { dashPattern: [NaN] } })).toThrow(
        'ConfigResolver: grid.dashPattern values must be non-negative finite numbers'
      );
      expect(() => resolveConfig({ grid: { dashPattern: [Infinity] } })).toThrow(
        'ConfigResolver: grid.dashPattern values must be non-negative finite numbers'
      );
    });

    it('grid.dashPattern: [] resolves successfully (solid lines)', () => {
      const config = resolveConfig({ grid: { dashPattern: [] } });
      expect(config.grid.dashPattern).toEqual([]);
    });

    it('grid.dashPattern deep-merges from theme (user override replaces theme default)', () => {
      const config = resolveConfig({ grid: { dashPattern: [6, 3] } });
      expect(config.grid.dashPattern).toEqual([6, 3]);
    });

    it('grid.opacity: 1.5 throws validation error (out of 0-1 range)', () => {
      expect(() => resolveConfig({ grid: { opacity: 1.5 } })).toThrow(
        'ConfigResolver: grid.opacity must be between 0 and 1'
      );
    });

    it('grid.lineWidth: 0 throws validation error (must be positive)', () => {
      expect(() => resolveConfig({ grid: { lineWidth: 0 } })).toThrow(
        'ConfigResolver: grid.lineWidth must be positive'
      );
    });
  });

  describe('animation config validation', () => {
    it('animation.duration: -1 throws validation error (must be non-negative)', () => {
      expect(() => resolveConfig({ animation: { duration: -1 } })).toThrow(
        'ConfigResolver: animation.duration must be non-negative and finite'
      );
    });

    it('animation.duration: NaN throws validation error (must be finite)', () => {
      expect(() => resolveConfig({ animation: { duration: NaN } })).toThrow(
        'ConfigResolver: animation.duration must be non-negative and finite'
      );
    });

    it('animation.duration: 0 resolves successfully with duration: 0', () => {
      const config = resolveConfig({ animation: { duration: 0 } });
      expect(config.animation.duration).toBe(0);
    });

    it('animation.duration: 2000 resolves with custom duration, overriding 300ms theme default', () => {
      const config = resolveConfig({ animation: { duration: 2000 } });
      expect(config.animation.duration).toBe(2000);
    });
  });
});
