import { getThemePreset, DARK_THEME, LIGHT_THEME } from './themes';
import { ThemeMode } from './types';

/**
 * Compute WCAG 2.1 relative luminance from a hex color.
 * Formula: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const linearize = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * Compute WCAG 2.1 contrast ratio between two hex colors.
 * Returns ratio >= 1 (e.g. 4.5 means 4.5:1).
 */
function wcagContrast(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('getThemePreset', () => {
  it('returns dark theme values for ThemeMode.Dark', () => {
    expect(getThemePreset(ThemeMode.Dark)).toBe(DARK_THEME);
  });

  it('returns light theme values for ThemeMode.Light', () => {
    expect(getThemePreset(ThemeMode.Light)).toBe(LIGHT_THEME);
  });
});

describe('DARK_THEME', () => {
  it('has dark background (#0a0a0f)', () => {
    expect(DARK_THEME.backgroundColor).toBe('#0a0a0f');
  });

  it('has teal line color (#00d4aa)', () => {
    expect(DARK_THEME.line?.color).toBe('#00d4aa');
  });

  it('has all required config sections defined', () => {
    expect(DARK_THEME.line).toBeDefined();
    expect(DARK_THEME.gradient).toBeDefined();
    expect(DARK_THEME.grid).toBeDefined();
    expect(DARK_THEME.animation).toBeDefined();
    expect(DARK_THEME.xAxis).toBeDefined();
    expect(DARK_THEME.yAxis).toBeDefined();
    expect(DARK_THEME.crosshair).toBeDefined();
    expect(DARK_THEME.tooltip).toBeDefined();
  });
});

describe('LIGHT_THEME', () => {
  it('has white background (#ffffff)', () => {
    expect(LIGHT_THEME.backgroundColor).toBe('#ffffff');
  });

  it('has blue line color (#0066cc)', () => {
    expect(LIGHT_THEME.line?.color).toBe('#0066cc');
  });

  it('has all required config sections defined', () => {
    expect(LIGHT_THEME.line).toBeDefined();
    expect(LIGHT_THEME.gradient).toBeDefined();
    expect(LIGHT_THEME.grid).toBeDefined();
    expect(LIGHT_THEME.animation).toBeDefined();
    expect(LIGHT_THEME.xAxis).toBeDefined();
    expect(LIGHT_THEME.yAxis).toBeDefined();
    expect(LIGHT_THEME.crosshair).toBeDefined();
    expect(LIGHT_THEME.tooltip).toBeDefined();
  });
});

describe('WCAG 2.1 AA contrast ratios', () => {
  describe('dark theme', () => {
    it('axis label color vs background meets AA for text (>= 4.5:1)', () => {
      const ratio = wcagContrast(DARK_THEME.xAxis!.labelColor!, DARK_THEME.backgroundColor!);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('crosshair color vs background meets AA for text (>= 4.5:1)', () => {
      const ratio = wcagContrast(DARK_THEME.crosshair!.color!, DARK_THEME.backgroundColor!);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('tooltip text vs tooltip background meets AA for text (>= 4.5:1)', () => {
      const ratio = wcagContrast(DARK_THEME.tooltip!.textColor!, DARK_THEME.tooltip!.backgroundColor!);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('line color vs background meets AA for non-text (>= 3:1)', () => {
      const ratio = wcagContrast(DARK_THEME.line!.color!, DARK_THEME.backgroundColor!);
      expect(ratio).toBeGreaterThanOrEqual(3);
    });
  });

  describe('light theme', () => {
    it('axis label color vs background meets AA for text (>= 4.5:1)', () => {
      const ratio = wcagContrast(LIGHT_THEME.xAxis!.labelColor!, LIGHT_THEME.backgroundColor!);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('crosshair color vs background meets AA for text (>= 4.5:1)', () => {
      const ratio = wcagContrast(LIGHT_THEME.crosshair!.color!, LIGHT_THEME.backgroundColor!);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('tooltip text vs tooltip background meets AA for text (>= 4.5:1)', () => {
      const ratio = wcagContrast(LIGHT_THEME.tooltip!.textColor!, LIGHT_THEME.tooltip!.backgroundColor!);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('line color vs background meets AA for non-text (>= 3:1)', () => {
      const ratio = wcagContrast(LIGHT_THEME.line!.color!, LIGHT_THEME.backgroundColor!);
      expect(ratio).toBeGreaterThanOrEqual(3);
    });
  });
});
