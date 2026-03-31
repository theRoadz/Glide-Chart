import type { GlideChartConfig } from '../api/types';
import { ThemeMode } from '../api/types';

function parseBoolean(value: string): boolean | undefined {
  const lower = value.toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;
  return undefined;
}

function parseNumber(value: string): number | undefined {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseDashPattern(value: string): number[] | undefined {
  const nums = value.split(',').map(Number).filter(n => !isNaN(n));
  return nums.length > 0 ? nums : undefined;
}

export function parseDataAttributes(el: HTMLElement): Partial<GlideChartConfig> {
  const d = el.dataset;
  let config: Partial<GlideChartConfig> = {};

  // data-config JSON escape hatch (lowest precedence)
  if (d.config !== undefined) {
    try {
      const parsed = JSON.parse(d.config) as Partial<GlideChartConfig>;
      if (parsed && typeof parsed === 'object') {
        config = { ...parsed };
      }
    } catch {
      console.warn('GlideChart: failed to parse data-config JSON:', d.config);
    }
  }

  // Top-level properties (override data-config)
  if (d.theme !== undefined) {
    const t = d.theme.toLowerCase();
    if (t === 'light') {
      config.theme = ThemeMode.Light;
    } else if (t === 'dark') {
      config.theme = ThemeMode.Dark;
    }
  }

  if (d.timeWindow !== undefined) {
    const v = parseNumber(d.timeWindow);
    if (v !== undefined) config.timeWindow = v;
  }

  if (d.maxPoints !== undefined) {
    const v = parseNumber(d.maxPoints);
    if (v !== undefined) config.maxDataPoints = v;
  }

  if (d.staleThreshold !== undefined) {
    const v = parseNumber(d.staleThreshold);
    if (v !== undefined) config.staleThreshold = v;
  }

  if (d.zoom !== undefined) {
    const v = parseBoolean(d.zoom);
    if (v !== undefined) config.zoom = v;
  }

  if (d.ariaLabel !== undefined) {
    config.ariaLabel = d.ariaLabel;
  }

  // Line config
  if (d.lineColor !== undefined || d.lineWidth !== undefined || d.lineOpacity !== undefined) {
    const line: Record<string, unknown> = { ...(config.line ?? {}) };
    if (d.lineColor !== undefined) line.color = d.lineColor;
    if (d.lineWidth !== undefined) {
      const v = parseNumber(d.lineWidth);
      if (v !== undefined) line.width = v;
    }
    if (d.lineOpacity !== undefined) {
      const v = parseNumber(d.lineOpacity);
      if (v !== undefined) line.opacity = v;
    }
    config.line = line as GlideChartConfig['line'];
  }

  // Gradient config
  if (
    d.gradientEnabled !== undefined ||
    d.gradientTopColor !== undefined ||
    d.gradientBottomColor !== undefined ||
    d.gradientTopOpacity !== undefined ||
    d.gradientBottomOpacity !== undefined
  ) {
    const gradient: Record<string, unknown> = { ...(config.gradient ?? {}) };
    if (d.gradientEnabled !== undefined) {
      const v = parseBoolean(d.gradientEnabled);
      if (v !== undefined) gradient.enabled = v;
    }
    if (d.gradientTopColor !== undefined) gradient.topColor = d.gradientTopColor;
    if (d.gradientBottomColor !== undefined) gradient.bottomColor = d.gradientBottomColor;
    if (d.gradientTopOpacity !== undefined) {
      const v = parseNumber(d.gradientTopOpacity);
      if (v !== undefined) gradient.topOpacity = v;
    }
    if (d.gradientBottomOpacity !== undefined) {
      const v = parseNumber(d.gradientBottomOpacity);
      if (v !== undefined) gradient.bottomOpacity = v;
    }
    config.gradient = gradient as GlideChartConfig['gradient'];
  }

  // Grid config
  if (
    d.gridVisible !== undefined ||
    d.gridColor !== undefined ||
    d.gridOpacity !== undefined ||
    d.gridLineWidth !== undefined ||
    d.gridDashPattern !== undefined
  ) {
    const grid: Record<string, unknown> = { ...(config.grid ?? {}) };
    if (d.gridVisible !== undefined) {
      const v = parseBoolean(d.gridVisible);
      if (v !== undefined) grid.visible = v;
    }
    if (d.gridColor !== undefined) grid.color = d.gridColor;
    if (d.gridOpacity !== undefined) {
      const v = parseNumber(d.gridOpacity);
      if (v !== undefined) grid.opacity = v;
    }
    if (d.gridLineWidth !== undefined) {
      const v = parseNumber(d.gridLineWidth);
      if (v !== undefined) grid.lineWidth = v;
    }
    if (d.gridDashPattern !== undefined) {
      const v = parseDashPattern(d.gridDashPattern);
      if (v !== undefined) grid.dashPattern = v;
    }
    config.grid = grid as GlideChartConfig['grid'];
  }

  // Animation config
  if (d.animationEnabled !== undefined || d.animationDuration !== undefined) {
    const animation: Record<string, unknown> = { ...(config.animation ?? {}) };
    if (d.animationEnabled !== undefined) {
      const v = parseBoolean(d.animationEnabled);
      if (v !== undefined) animation.enabled = v;
    }
    if (d.animationDuration !== undefined) {
      const v = parseNumber(d.animationDuration);
      if (v !== undefined) animation.duration = v;
    }
    config.animation = animation as GlideChartConfig['animation'];
  }

  // Crosshair (enabled only)
  if (d.crosshairEnabled !== undefined) {
    const v = parseBoolean(d.crosshairEnabled);
    if (v !== undefined) {
      config.crosshair = { ...(config.crosshair ?? {}), enabled: v } as GlideChartConfig['crosshair'];
    }
  }

  // Tooltip (enabled only)
  if (d.tooltipEnabled !== undefined) {
    const v = parseBoolean(d.tooltipEnabled);
    if (v !== undefined) {
      config.tooltip = { ...(config.tooltip ?? {}), enabled: v } as GlideChartConfig['tooltip'];
    }
  }

  return config;
}
