export enum ThemeMode {
  Light = 'light',
  Dark = 'dark',
}

export interface LineConfig {
  color: string;
  width: number;
  opacity: number;
}

export interface GradientConfig {
  enabled: boolean;
  topColor: string;
  bottomColor: string;
  topOpacity: number;
  bottomOpacity: number;
}

export interface GridConfig {
  visible: boolean;
  color: string;
  opacity: number;
  lineWidth: number;
  dashPattern: number[];
}

export interface AnimationConfig {
  enabled: boolean;
  duration: number;
}

export interface AxisConfig {
  visible: boolean;
  labelColor: string;
  labelFontSize: number;
  labelFontFamily: string;
  tickColor: string;
  tickLength: number;
  labelFormatter?: (value: number) => string;
  timezone?: string;
  locale?: string;
}

export interface CrosshairConfig {
  enabled: boolean;
  color: string;
  lineWidth: number;
  dashPattern: number[];
}

export interface TooltipConfig {
  enabled: boolean;
  backgroundColor: string;
  textColor: string;
  fontSize: number;
  fontFamily: string;
  padding: number;
  borderRadius: number;
  formatter?: (points: ReadonlyArray<Readonly<{ seriesId: string; value: number; timestamp: number }>>) => string;
}

export interface SeriesConfig {
  id: string;
  line?: Partial<LineConfig>;
  gradient?: Partial<GradientConfig>;
}

export interface ChartConfig {
  theme?: ThemeMode;
  backgroundColor?: string;
  line?: Partial<LineConfig>;
  gradient?: Partial<GradientConfig>;
  grid?: Partial<GridConfig>;
  animation?: Partial<AnimationConfig>;
  xAxis?: Partial<AxisConfig>;
  yAxis?: Partial<AxisConfig>;
  crosshair?: Partial<CrosshairConfig>;
  tooltip?: Partial<TooltipConfig>;
  series?: SeriesConfig[];
  maxDataPoints?: number;
  staleThreshold?: number;
  /** Visible time window in seconds. 0 or undefined = show all data. */
  timeWindow?: number;
  zoom?: boolean;
  ariaLabel?: string;
  onStaleChange?: (event: { seriesId: string; isStale: boolean; lastDataTimestamp: number }) => void;
}

export interface ResolvedSeriesConfig {
  readonly id: string;
  readonly line: Readonly<LineConfig>;
  readonly gradient: Readonly<GradientConfig>;
}

export interface ResolvedConfig {
  readonly theme: ThemeMode;
  readonly backgroundColor: string;
  readonly line: Readonly<LineConfig>;
  readonly gradient: Readonly<GradientConfig>;
  readonly grid: Readonly<GridConfig>;
  readonly animation: Readonly<AnimationConfig>;
  readonly xAxis: Readonly<AxisConfig>;
  readonly yAxis: Readonly<AxisConfig>;
  readonly crosshair: Readonly<CrosshairConfig>;
  readonly tooltip: Readonly<TooltipConfig>;
  readonly series: readonly Readonly<ResolvedSeriesConfig>[];
  readonly maxDataPoints: number;
  readonly staleThreshold: number;
  readonly timeWindow: number;
  readonly zoom: boolean;
  readonly ariaLabel: string;
}
