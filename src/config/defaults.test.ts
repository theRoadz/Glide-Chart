import { DEFAULT_CONFIG } from './defaults';
import { ThemeMode } from './types';

describe('DEFAULT_CONFIG', () => {
  it('has theme set to ThemeMode.Dark', () => {
    expect(DEFAULT_CONFIG.theme).toBe(ThemeMode.Dark);
  });

  it('has empty series array', () => {
    expect(DEFAULT_CONFIG.series).toEqual([]);
  });

  it('has no undefined values at any nesting level', () => {
    const checkNoUndefined = (obj: Record<string, unknown>, path: string) => {
      for (const [key, value] of Object.entries(obj)) {
        const fullPath = `${path}.${key}`;
        expect(value).not.toBeUndefined();
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          checkNoUndefined(value as Record<string, unknown>, fullPath);
        }
      }
    };
    checkNoUndefined(
      DEFAULT_CONFIG as unknown as Record<string, unknown>,
      'DEFAULT_CONFIG'
    );
  });

  it('has all required line fields', () => {
    expect(DEFAULT_CONFIG.line.color).toBeDefined();
    expect(DEFAULT_CONFIG.line.width).toBeDefined();
    expect(DEFAULT_CONFIG.line.opacity).toBeDefined();
  });

  it('has all required gradient fields', () => {
    expect(DEFAULT_CONFIG.gradient.enabled).toBeDefined();
    expect(DEFAULT_CONFIG.gradient.topColor).toBeDefined();
    expect(DEFAULT_CONFIG.gradient.bottomColor).toBeDefined();
    expect(DEFAULT_CONFIG.gradient.topOpacity).toBeDefined();
    expect(DEFAULT_CONFIG.gradient.bottomOpacity).toBeDefined();
  });

  it('has all required grid fields', () => {
    expect(DEFAULT_CONFIG.grid.visible).toBeDefined();
    expect(DEFAULT_CONFIG.grid.color).toBeDefined();
    expect(DEFAULT_CONFIG.grid.opacity).toBeDefined();
    expect(DEFAULT_CONFIG.grid.lineWidth).toBeDefined();
  });

  it('has all required xAxis and yAxis fields', () => {
    for (const axis of [DEFAULT_CONFIG.xAxis, DEFAULT_CONFIG.yAxis]) {
      expect(axis.visible).toBeDefined();
      expect(axis.labelColor).toBeDefined();
      expect(axis.labelFontSize).toBeDefined();
      expect(axis.labelFontFamily).toBeDefined();
      expect(axis.tickColor).toBeDefined();
      expect(axis.tickLength).toBeDefined();
    }
  });

  it('has all required crosshair fields', () => {
    expect(DEFAULT_CONFIG.crosshair.enabled).toBeDefined();
    expect(DEFAULT_CONFIG.crosshair.color).toBeDefined();
    expect(DEFAULT_CONFIG.crosshair.lineWidth).toBeDefined();
    expect(DEFAULT_CONFIG.crosshair.dashPattern).toBeDefined();
  });

  it('has all required tooltip fields', () => {
    expect(DEFAULT_CONFIG.tooltip.enabled).toBeDefined();
    expect(DEFAULT_CONFIG.tooltip.backgroundColor).toBeDefined();
    expect(DEFAULT_CONFIG.tooltip.textColor).toBeDefined();
    expect(DEFAULT_CONFIG.tooltip.fontSize).toBeDefined();
    expect(DEFAULT_CONFIG.tooltip.fontFamily).toBeDefined();
    expect(DEFAULT_CONFIG.tooltip.padding).toBeDefined();
    expect(DEFAULT_CONFIG.tooltip.borderRadius).toBeDefined();
  });

  it('has maxDataPoints as a positive integer', () => {
    expect(DEFAULT_CONFIG.maxDataPoints).toBeGreaterThan(0);
    expect(Number.isInteger(DEFAULT_CONFIG.maxDataPoints)).toBe(true);
  });

  it('has staleThreshold as a non-negative number', () => {
    expect(DEFAULT_CONFIG.staleThreshold).toBeGreaterThanOrEqual(0);
  });
});
