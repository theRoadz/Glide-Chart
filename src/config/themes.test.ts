import { getThemePreset, DARK_THEME, LIGHT_THEME } from './themes';
import { ThemeMode } from './types';

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
