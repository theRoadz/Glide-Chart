import { ThemeMode } from './types';
import type { ResolvedConfig } from './types';
import { DARK_THEME } from './themes';
import type {
  LineConfig,
  GradientConfig,
  GridConfig,
  AnimationConfig,
  AxisConfig,
  CrosshairConfig,
  TooltipConfig,
} from './types';

export const DEFAULT_CONFIG: ResolvedConfig = {
  theme: ThemeMode.Dark,
  backgroundColor: DARK_THEME.backgroundColor as string,
  line: DARK_THEME.line as LineConfig,
  gradient: DARK_THEME.gradient as GradientConfig,
  grid: DARK_THEME.grid as GridConfig,
  animation: DARK_THEME.animation as AnimationConfig,
  xAxis: DARK_THEME.xAxis as AxisConfig,
  yAxis: DARK_THEME.yAxis as AxisConfig,
  crosshair: DARK_THEME.crosshair as CrosshairConfig,
  tooltip: DARK_THEME.tooltip as TooltipConfig,
  series: [],
  maxDataPoints: DARK_THEME.maxDataPoints as number,
  staleThreshold: DARK_THEME.staleThreshold as number,
  zoom: DARK_THEME.zoom as boolean,
};
