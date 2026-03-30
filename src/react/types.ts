import type { ChartConfig, DataPoint, SeriesConfig } from '../api/types';

export interface GlideChartSeriesProps extends SeriesConfig {
  data?: DataPoint[];
}

export interface GlideChartProps extends ChartConfig {
  series?: GlideChartSeriesProps[];
  className?: string;
  style?: React.CSSProperties;
}

export interface GlideChartRef {
  addData(seriesId: string, point: DataPoint | DataPoint[]): void;
  setData(seriesId: string, points: DataPoint[]): void;
  clearData(seriesId?: string): void;
  resize(): void;
}
