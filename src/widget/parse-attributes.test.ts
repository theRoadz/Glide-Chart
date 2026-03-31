import { describe, it, expect, vi } from 'vitest';
import { parseDataAttributes } from './parse-attributes';

function createElement(attrs: Record<string, string>): HTMLElement {
  const el = document.createElement('div');
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  return el;
}

describe('parseDataAttributes', () => {
  // Theme
  it('parses data-theme to config.theme', () => {
    const config = parseDataAttributes(createElement({ 'data-theme': 'dark' }));
    expect(config.theme).toBe('dark');
  });

  it('parses data-theme light', () => {
    const config = parseDataAttributes(createElement({ 'data-theme': 'light' }));
    expect(config.theme).toBe('light');
  });

  it('ignores invalid theme values', () => {
    const config = parseDataAttributes(createElement({ 'data-theme': 'neon' }));
    expect(config.theme).toBeUndefined();
  });

  // Numeric attributes
  it('parses data-time-window to config.timeWindow', () => {
    const config = parseDataAttributes(createElement({ 'data-time-window': '300' }));
    expect(config.timeWindow).toBe(300);
  });

  it('parses data-max-points to config.maxDataPoints', () => {
    const config = parseDataAttributes(createElement({ 'data-max-points': '500' }));
    expect(config.maxDataPoints).toBe(500);
  });

  it('parses data-stale-threshold to config.staleThreshold', () => {
    const config = parseDataAttributes(createElement({ 'data-stale-threshold': '5000' }));
    expect(config.staleThreshold).toBe(5000);
  });

  it('parses data-line-width as number', () => {
    const config = parseDataAttributes(createElement({ 'data-line-width': '2' }));
    expect(config.line?.width).toBe(2);
  });

  it('parses data-line-opacity as number', () => {
    const config = parseDataAttributes(createElement({ 'data-line-opacity': '0.8' }));
    expect(config.line?.opacity).toBe(0.8);
  });

  it('skips NaN numeric values', () => {
    const config = parseDataAttributes(createElement({ 'data-time-window': 'abc' }));
    expect(config.timeWindow).toBeUndefined();
  });

  // Boolean attributes
  it('parses data-zoom="true" to config.zoom=true', () => {
    const config = parseDataAttributes(createElement({ 'data-zoom': 'true' }));
    expect(config.zoom).toBe(true);
  });

  it('parses data-zoom="false" to config.zoom=false', () => {
    const config = parseDataAttributes(createElement({ 'data-zoom': 'false' }));
    expect(config.zoom).toBe(false);
  });

  it('parses boolean case-insensitively', () => {
    const config = parseDataAttributes(createElement({ 'data-zoom': 'TRUE' }));
    expect(config.zoom).toBe(true);
  });

  it('parses data-grid-visible as boolean', () => {
    const config = parseDataAttributes(createElement({ 'data-grid-visible': 'false' }));
    expect(config.grid?.visible).toBe(false);
  });

  it('parses data-gradient-enabled as boolean', () => {
    const config = parseDataAttributes(createElement({ 'data-gradient-enabled': 'true' }));
    expect(config.gradient?.enabled).toBe(true);
  });

  it('parses data-animation-enabled as boolean', () => {
    const config = parseDataAttributes(createElement({ 'data-animation-enabled': 'false' }));
    expect(config.animation?.enabled).toBe(false);
  });

  it('parses data-crosshair-enabled as boolean', () => {
    const config = parseDataAttributes(createElement({ 'data-crosshair-enabled': 'true' }));
    expect(config.crosshair?.enabled).toBe(true);
  });

  it('parses data-tooltip-enabled as boolean', () => {
    const config = parseDataAttributes(createElement({ 'data-tooltip-enabled': 'false' }));
    expect(config.tooltip?.enabled).toBe(false);
  });

  // String attributes
  it('parses data-line-color as string', () => {
    const config = parseDataAttributes(createElement({ 'data-line-color': '#00ff00' }));
    expect(config.line?.color).toBe('#00ff00');
  });

  it('parses data-aria-label as string', () => {
    const config = parseDataAttributes(createElement({ 'data-aria-label': 'BTC Price' }));
    expect(config.ariaLabel).toBe('BTC Price');
  });

  it('parses data-grid-color as string', () => {
    const config = parseDataAttributes(createElement({ 'data-grid-color': '#333' }));
    expect(config.grid?.color).toBe('#333');
  });

  // Gradient string attributes
  it('parses gradient color strings', () => {
    const config = parseDataAttributes(createElement({
      'data-gradient-top-color': '#00ff00',
      'data-gradient-bottom-color': '#000',
    }));
    expect(config.gradient?.topColor).toBe('#00ff00');
    expect(config.gradient?.bottomColor).toBe('#000');
  });

  it('parses gradient opacity numbers', () => {
    const config = parseDataAttributes(createElement({
      'data-gradient-top-opacity': '0.4',
      'data-gradient-bottom-opacity': '0',
    }));
    expect(config.gradient?.topOpacity).toBe(0.4);
    expect(config.gradient?.bottomOpacity).toBe(0);
  });

  // Grid numeric attributes
  it('parses data-grid-opacity and data-grid-line-width', () => {
    const config = parseDataAttributes(createElement({
      'data-grid-opacity': '0.5',
      'data-grid-line-width': '1',
    }));
    expect(config.grid?.opacity).toBe(0.5);
    expect(config.grid?.lineWidth).toBe(1);
  });

  // Comma-separated dash pattern
  it('parses data-grid-dash-pattern to number array', () => {
    const config = parseDataAttributes(createElement({ 'data-grid-dash-pattern': '5,3' }));
    expect(config.grid?.dashPattern).toEqual([5, 3]);
  });

  it('filters NaN from dash pattern values', () => {
    const config = parseDataAttributes(createElement({ 'data-grid-dash-pattern': '5,bad,3' }));
    expect(config.grid?.dashPattern).toEqual([5, 3]);
  });

  // Animation duration
  it('parses data-animation-duration as number', () => {
    const config = parseDataAttributes(createElement({ 'data-animation-duration': '200' }));
    expect(config.animation?.duration).toBe(200);
  });

  // Unknown attributes ignored
  it('ignores unknown data attributes', () => {
    const config = parseDataAttributes(createElement({
      'data-glide-chart': '',
      'data-unknown-thing': 'whatever',
      'data-theme': 'dark',
    }));
    expect(config.theme).toBe('dark');
    expect((config as Record<string, unknown>)['unknownThing']).toBeUndefined();
    expect((config as Record<string, unknown>)['glideChart']).toBeUndefined();
  });

  // data-config JSON
  it('parses data-config as JSON and merges into config', () => {
    const jsonConfig = JSON.stringify({ theme: 'light', timeWindow: 60 });
    const config = parseDataAttributes(createElement({ 'data-config': jsonConfig }));
    expect(config.theme).toBe('light');
    expect(config.timeWindow).toBe(60);
  });

  it('individual attributes take precedence over data-config', () => {
    const jsonConfig = JSON.stringify({ theme: 'light', timeWindow: 60 });
    const config = parseDataAttributes(createElement({
      'data-config': jsonConfig,
      'data-theme': 'dark',
    }));
    expect(config.theme).toBe('dark');
    expect(config.timeWindow).toBe(60);
  });

  it('warns and skips on data-config parse failure', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const config = parseDataAttributes(createElement({ 'data-config': '{invalid json' }));
    expect(warnSpy).toHaveBeenCalledWith(
      'GlideChart: failed to parse data-config JSON:',
      '{invalid json',
    );
    expect(config).toEqual({});
  });

  // Empty element — no config keys
  it('produces empty config for element with no data attributes', () => {
    const config = parseDataAttributes(document.createElement('div'));
    expect(config).toEqual({});
  });

  it('produces empty config for element with only data-glide-chart marker', () => {
    const config = parseDataAttributes(createElement({ 'data-glide-chart': '' }));
    expect(config).toEqual({});
  });

  // Module boundary test
  it('only imports from ../api/ or ./ (module boundary discipline)', async () => {
    // @ts-expect-error -- ?raw import is a Vite/Vitest feature not typed in tsconfig
    const rawModule: { default: string } = await import('./parse-attributes.ts?raw');
    const source = rawModule.default;

    const importRegex = /from\s+['"]([^'"]+)['"]/g;
    const imports: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(source)) !== null) {
      imports.push(match[1]!);
    }

    for (const importPath of imports) {
      expect(
        importPath.startsWith('../api/') || importPath.startsWith('./'),
        `Forbidden import: ${importPath}`,
      ).toBe(true);
    }
  });
});
