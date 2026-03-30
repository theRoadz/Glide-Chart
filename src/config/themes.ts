import { ThemeMode } from './types';
import type { ChartConfig } from './types';

const SYSTEM_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

export const DARK_THEME: Partial<ChartConfig> = {
  backgroundColor: '#0a0a0f',
  line: {
    color: '#00d4aa',
    width: 2,
    opacity: 1,
  },
  gradient: {
    enabled: true,
    topColor: '#00d4aa',
    bottomColor: '#00d4aa',
    topOpacity: 0.3,
    bottomOpacity: 0.0,
  },
  grid: {
    visible: true,
    color: '#ffffff',
    opacity: 0.35,
    lineWidth: 1,
  },
  animation: {
    enabled: true,
    duration: 300,
  },
  xAxis: {
    visible: true,
    labelColor: '#8a8a9a',
    labelFontSize: 11,
    labelFontFamily: SYSTEM_FONT_STACK,
    tickColor: '#3a3a4a',
    tickLength: 4,
  },
  yAxis: {
    visible: true,
    labelColor: '#8a8a9a',
    labelFontSize: 11,
    labelFontFamily: SYSTEM_FONT_STACK,
    tickColor: '#3a3a4a',
    tickLength: 4,
  },
  crosshair: {
    enabled: true,
    color: '#ffffff',
    lineWidth: 1,
    dashPattern: [4, 4],
  },
  tooltip: {
    enabled: true,
    backgroundColor: '#1a1a2e',
    textColor: '#e0e0e0',
    fontSize: 12,
    fontFamily: SYSTEM_FONT_STACK,
    padding: 8,
    borderRadius: 4,
  },
  zoom: true,
  ariaLabel: 'Chart',
  maxDataPoints: 10000,
  staleThreshold: 5000,
  timeWindow: 0,
};

export const LIGHT_THEME: Partial<ChartConfig> = {
  backgroundColor: '#ffffff',
  line: {
    color: '#0066cc',
    width: 2,
    opacity: 1,
  },
  gradient: {
    enabled: true,
    topColor: '#0066cc',
    bottomColor: '#0066cc',
    topOpacity: 0.2,
    bottomOpacity: 0.0,
  },
  grid: {
    visible: true,
    color: '#000000',
    opacity: 0.5,
    lineWidth: 1,
  },
  animation: {
    enabled: true,
    duration: 300,
  },
  xAxis: {
    visible: true,
    labelColor: '#555555',
    labelFontSize: 11,
    labelFontFamily: SYSTEM_FONT_STACK,
    tickColor: '#cccccc',
    tickLength: 4,
  },
  yAxis: {
    visible: true,
    labelColor: '#555555',
    labelFontSize: 11,
    labelFontFamily: SYSTEM_FONT_STACK,
    tickColor: '#cccccc',
    tickLength: 4,
  },
  crosshair: {
    enabled: true,
    color: '#333333',
    lineWidth: 1,
    dashPattern: [4, 4],
  },
  tooltip: {
    enabled: true,
    backgroundColor: '#ffffff',
    textColor: '#333333',
    fontSize: 12,
    fontFamily: SYSTEM_FONT_STACK,
    padding: 8,
    borderRadius: 4,
  },
  zoom: true,
  ariaLabel: 'Chart',
  maxDataPoints: 10000,
  staleThreshold: 5000,
  timeWindow: 0,
};

export function getThemePreset(mode: ThemeMode): Partial<ChartConfig> {
  switch (mode) {
    case ThemeMode.Dark:
      return DARK_THEME;
    case ThemeMode.Light:
      return LIGHT_THEME;
  }
}
