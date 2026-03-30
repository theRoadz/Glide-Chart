export type {
  DataPoint,
  Padding,
  ScaleDomain,
  ScaleOptions,
  Viewport,
} from '../core/types';

export type {
  ChartConfig,
  SeriesConfig,
  ResolvedConfig,
  ResolvedSeriesConfig,
  LineConfig,
  GradientConfig,
  GridConfig,
  AnimationConfig,
  AxisConfig,
  CrosshairConfig,
  TooltipConfig,
  CrosshairMoveEvent,
  ZoomEvent,
} from '../config/types';

export { ThemeMode } from '../config/types';

export type { DataSourceState, WebSocketDataSourceConfig } from '../streaming/types';

export type { StaleChangeEvent } from '../core/stale-detector';

import type { ChartConfig, SeriesConfig } from '../config/types';
import type { DataPoint } from '../core/types';

export interface GlideChartConfig extends ChartConfig {
  series?: Array<SeriesConfig & { data?: DataPoint[] }>;
}
