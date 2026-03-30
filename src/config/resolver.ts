import { ThemeMode } from './types';
import type {
  ChartConfig,
  GradientConfig,
  LineConfig,
  ResolvedConfig,
  ResolvedSeriesConfig,
} from './types';
import { DEFAULT_CONFIG } from './defaults';
import { getThemePreset, getSeriesColors } from './themes';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

export function deepMerge<T>(target: T, source: Partial<T>): T {
  const result = { ...target } as Record<string, unknown>;

  for (const key of Object.keys(source as Record<string, unknown>)) {
    const sourceVal = (source as Record<string, unknown>)[key];
    const targetVal = result[key];

    if (sourceVal === undefined) {
      continue;
    }

    if (sourceVal === null) {
      delete result[key];
      continue;
    }

    if (isPlainObject(sourceVal) && isPlainObject(targetVal)) {
      result[key] = deepMerge(targetVal, sourceVal);
    } else {
      result[key] = sourceVal;
    }
  }

  return result as T;
}

export function deepFreeze<T extends object>(obj: T): T {
  Object.freeze(obj);
  for (const value of Object.values(obj)) {
    if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
      deepFreeze(value as object);
    }
  }
  return obj;
}

function validateLineAndGradient(
  line: Readonly<LineConfig>,
  gradient: Readonly<GradientConfig>,
  prefix: string
): void {
  if (!(line.width > 0) || !Number.isFinite(line.width)) {
    throw new Error(`ConfigResolver: ${prefix}line.width must be positive`);
  }

  if (!(line.opacity >= 0 && line.opacity <= 1)) {
    throw new Error(
      `ConfigResolver: ${prefix}line.opacity must be between 0 and 1`
    );
  }

  if (!(gradient.topOpacity >= 0 && gradient.topOpacity <= 1)) {
    throw new Error(
      `ConfigResolver: ${prefix}gradient.topOpacity must be between 0 and 1`
    );
  }

  if (!(gradient.bottomOpacity >= 0 && gradient.bottomOpacity <= 1)) {
    throw new Error(
      `ConfigResolver: ${prefix}gradient.bottomOpacity must be between 0 and 1`
    );
  }
}

function validateConfig(config: ResolvedConfig): void {
  if (
    !Number.isInteger(config.maxDataPoints) ||
    config.maxDataPoints <= 0
  ) {
    throw new Error('ConfigResolver: maxDataPoints must be a positive integer');
  }

  if (!(config.staleThreshold >= 0)) {
    throw new Error('ConfigResolver: staleThreshold must be non-negative');
  }

  validateLineAndGradient(config.line, config.gradient, '');

  for (const series of config.series) {
    validateLineAndGradient(
      series.line,
      series.gradient,
      `series '${series.id}': `
    );
  }
}

function validateTheme(theme: unknown): asserts theme is ThemeMode {
  if (theme !== ThemeMode.Dark && theme !== ThemeMode.Light) {
    throw new Error(`ConfigResolver: invalid theme '${theme}'`);
  }
}

export function resolveConfig(userConfig?: ChartConfig): ResolvedConfig {
  // Step 1: Deep clone defaults
  let merged = deepMerge(DEFAULT_CONFIG, {} as Partial<ResolvedConfig>);

  // Step 2: Apply theme preset if specified
  if (userConfig?.theme !== undefined) {
    validateTheme(userConfig.theme);
    const themePreset = getThemePreset(userConfig.theme);
    merged = deepMerge(merged, themePreset as Partial<ResolvedConfig>);
  }

  // Step 3: Apply user overrides (excluding series which is handled separately)
  if (userConfig) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { series: _series, ...userOverrides } = userConfig;
    merged = deepMerge(merged, userOverrides as Partial<ResolvedConfig>);
  }

  // Step 4: Resolve per-series configs
  const resolvedSeries: ResolvedSeriesConfig[] = [];
  if (userConfig?.series) {
    const usePalette = !userConfig?.line?.color;
    const palette = usePalette ? getSeriesColors(merged.theme) : [];

    for (let i = 0; i < userConfig.series.length; i++) {
      const seriesEntry = userConfig.series[i]!;
      const resolvedLine: LineConfig = seriesEntry.line
        ? deepMerge(merged.line, seriesEntry.line)
        : { ...merged.line };

      // Assign palette color when no explicit per-series or global line.color
      if (usePalette && !seriesEntry.line?.color) {
        resolvedLine.color = palette[i % palette.length]!;
      }

      const resolvedGradient: GradientConfig = seriesEntry.gradient
        ? deepMerge(merged.gradient, seriesEntry.gradient)
        : { ...merged.gradient };

      // Auto-match gradient colors to series line color when neither
      // per-series nor global user config explicitly sets gradient colors
      const seriesLineColor = resolvedLine.color;
      if (!seriesEntry.gradient?.topColor && !userConfig?.gradient?.topColor) {
        resolvedGradient.topColor = seriesLineColor;
      }
      if (!seriesEntry.gradient?.bottomColor && !userConfig?.gradient?.bottomColor) {
        resolvedGradient.bottomColor = seriesLineColor;
      }

      resolvedSeries.push({
        id: seriesEntry.id,
        line: resolvedLine,
        gradient: resolvedGradient,
      });
    }
  }

  // Clamp timeWindow: negative, non-finite, or sub-second values default to 0 (show all data)
  const clampedTimeWindow =
    Number.isFinite(merged.timeWindow) && merged.timeWindow >= 1
      ? merged.timeWindow
      : 0;

  const result: ResolvedConfig = {
    ...merged,
    series: resolvedSeries,
    timeWindow: clampedTimeWindow,
  };

  // Validate final merged result
  validateConfig(result);

  // Step 5: Deep freeze
  return deepFreeze(result);
}
