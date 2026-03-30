import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { GlideChart as GlideChartCore } from '../api/glide-chart';
import type { DataPoint } from '../api/types';
import type { GlideChartProps, GlideChartRef } from './types';

export const GlideChart = forwardRef<GlideChartRef, GlideChartProps>(
  function GlideChart(props, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<GlideChartCore | null>(null);
    const prevConfigJsonRef = useRef<string>('');
    const prevSeriesDataRef = useRef<Map<string, DataPoint[] | undefined>>(new Map());
    const prevOnStaleChangeRef = useRef(props.onStaleChange);
    const prevFormatterRef = useRef(props.tooltip?.formatter);

    // Lifecycle: create chart on mount, destroy on unmount
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const { className: _className, style: _style, series, ...configProps } = props;
      const chartConfig = {
        ...configProps,
        series: series?.map(({ data, ...seriesConfig }) => ({
          ...seriesConfig,
          data,
        })),
      };

      const chart = new GlideChartCore(container, chartConfig);
      chartRef.current = chart;

      // Initialize prev-refs so sync effects skip the first render (constructor already applied these)
      const { onStaleChange: _onStaleChange, tooltip, ...jsonSafeConfig } = configProps;
      const seriesConfigs = series?.map(({ data: _data, ...rest }) => rest);
      const tooltipWithoutFormatter = tooltip ? { ...tooltip, formatter: undefined } : undefined;
      prevConfigJsonRef.current = JSON.stringify({ ...jsonSafeConfig, tooltip: tooltipWithoutFormatter, series: seriesConfigs });
      prevOnStaleChangeRef.current = props.onStaleChange;
      prevFormatterRef.current = props.tooltip?.formatter;

      if (series) {
        for (const s of series) {
          prevSeriesDataRef.current.set(s.id, s.data);
        }
      }

      return () => {
        chart.destroy();
        chartRef.current = null;
        prevConfigJsonRef.current = '';
        prevSeriesDataRef.current = new Map();
      };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Sync config prop changes (including series config, excluding series data)
    useEffect(() => {
      const chart = chartRef.current;
      if (!chart) return;

      const { className: _className, style: _style, series, ...configProps } = props;
      const { onStaleChange: _onStaleChange, tooltip, ...jsonSafeConfig } = configProps;
      const seriesConfigs = series?.map(({ data: _data, ...rest }) => rest);
      const tooltipWithoutFormatter = tooltip ? { ...tooltip, formatter: undefined } : undefined;
      const configJson = JSON.stringify({ ...jsonSafeConfig, tooltip: tooltipWithoutFormatter, series: seriesConfigs });

      const formatterChanged = props.tooltip?.formatter !== prevFormatterRef.current;
      const onStaleChanged = props.onStaleChange !== prevOnStaleChangeRef.current;
      const configChanged = prevConfigJsonRef.current !== configJson;

      if (!configChanged && !formatterChanged && !onStaleChanged) return;

      prevConfigJsonRef.current = configJson;
      prevFormatterRef.current = props.tooltip?.formatter;
      prevOnStaleChangeRef.current = props.onStaleChange;

      chart.setConfig({ ...configProps, series: seriesConfigs });
    });

    // Sync series data prop changes
    useEffect(() => {
      const chart = chartRef.current;
      if (!chart || !props.series) return;

      for (const seriesItem of props.series) {
        const prevData = prevSeriesDataRef.current.get(seriesItem.id);
        if (seriesItem.data !== undefined && seriesItem.data !== prevData) {
          chart.setData(seriesItem.id, seriesItem.data);
        }
        prevSeriesDataRef.current.set(seriesItem.id, seriesItem.data);
      }

      // Prune entries for removed series
      const currentIds = new Set(props.series.map(s => s.id));
      for (const key of prevSeriesDataRef.current.keys()) {
        if (!currentIds.has(key)) {
          prevSeriesDataRef.current.delete(key);
        }
      }
    });

    // Expose imperative methods via ref
    useImperativeHandle(ref, () => ({
      addData(seriesId: string, point: DataPoint | DataPoint[]) {
        chartRef.current?.addData(seriesId, point);
      },
      setData(seriesId: string, points: DataPoint[]) {
        chartRef.current?.setData(seriesId, points);
      },
      clearData(seriesId?: string) {
        chartRef.current?.clearData(seriesId);
      },
      resize() {
        chartRef.current?.resize();
      },
    }), []);

    return <div ref={containerRef} className={props.className} style={props.style} />;
  }
);
