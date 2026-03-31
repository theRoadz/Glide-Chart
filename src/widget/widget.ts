import { GlideChart } from '../api/glide-chart';
import type { GlideChartConfig } from '../api/types';
import { parseDataAttributes } from './parse-attributes';

/** Tracks initialized elements to prevent double-init. GC-friendly via WeakMap. */
const instances = new WeakMap<HTMLElement, GlideChart>();

/** Tracks in-flight AbortControllers for data-src fetches, keyed by element. */
const abortControllers = new WeakMap<HTMLElement, AbortController>();

interface DataSrcArrayItem {
  t: unknown;
  v: unknown;
}

interface DataSrcSeriesItem {
  id: string;
  data: DataSrcArrayItem[];
}

interface DataSrcObjectFormat {
  series: DataSrcSeriesItem[];
}

function isDataSrcObjectFormat(data: unknown): data is DataSrcObjectFormat {
  return (
    data !== null &&
    typeof data === 'object' &&
    Array.isArray((data as DataSrcObjectFormat).series)
  );
}

function toDataPoints(items: DataSrcArrayItem[]): Array<{ timestamp: number; value: number }> {
  const points: Array<{ timestamp: number; value: number }> = [];
  for (const item of items) {
    if (typeof item.t === 'number' && typeof item.v === 'number' && isFinite(item.t) && isFinite(item.v)) {
      points.push({ timestamp: item.t, value: item.v });
    }
  }
  return points;
}

function fetchDataSrc(chart: GlideChart, url: string, signal: AbortSignal): void {
  fetch(url, { signal })
    .then(res => {
      if (!res.ok) {
        console.warn(`GlideChart: data-src fetch failed (${res.status}) for ${url}`);
        return;
      }
      return res.json();
    })
    .then((data: unknown) => {
      if (data === undefined) return;

      if (Array.isArray(data)) {
        // Array of DataPoints — use "default" series
        const points = toDataPoints(data as DataSrcArrayItem[]);
        chart.setData('default', points);
      } else if (isDataSrcObjectFormat(data)) {
        // Object with series array — register series then set data
        const validSeries = data.series.filter(s => typeof s.id === 'string' && s.id !== '');
        if (validSeries.length === 0) {
          console.warn(`GlideChart: data-src returned no valid series from ${url}`);
          return;
        }
        const seriesConfigs = validSeries.map(s => ({ id: s.id }));
        chart.setConfig({ series: seriesConfigs });
        for (const s of validSeries) {
          const points = toDataPoints(Array.isArray(s.data) ? s.data : []);
          chart.setData(s.id, points);
        }
      } else {
        console.warn(`GlideChart: data-src returned unexpected format from ${url}`);
      }
    })
    .catch((err: unknown) => {
      console.warn(`GlideChart: data-src fetch error for ${url}`, err);
    });
}

/**
 * Discovers all `[data-glide-chart]` elements and creates GlideChart instances.
 * Skips already-initialized elements. Returns array of newly created instances.
 */
function init(): GlideChart[] {
  const elements = document.querySelectorAll<HTMLElement>('[data-glide-chart]');
  const created: GlideChart[] = [];

  for (const el of elements) {
    if (instances.has(el)) continue;

    const config: Partial<GlideChartConfig> = parseDataAttributes(el);
    const hasSrc = el.dataset.src !== undefined && el.dataset.src !== '';

    // When data-src is present, ensure a default series exists for the array format
    if (hasSrc && (!config.series || config.series.length === 0)) {
      config.series = [{ id: 'default' }];
    }

    const chart = new GlideChart(el, config as GlideChartConfig);
    instances.set(el, chart);
    created.push(chart);

    // Fire-and-forget data fetch with abort support
    if (hasSrc) {
      const controller = new AbortController();
      abortControllers.set(el, controller);
      fetchDataSrc(chart, el.dataset.src!, controller.signal);
    }
  }

  return created;
}

/**
 * Destroys the GlideChart instance for the given element.
 * Aborts any in-flight data-src fetch, calls chart.destroy(), and removes tracking.
 * Returns true if an instance was found and destroyed, false otherwise.
 */
function destroy(el: HTMLElement): boolean {
  const controller = abortControllers.get(el);
  if (controller) {
    controller.abort();
    abortControllers.delete(el);
  }

  const chart = instances.get(el);
  if (!chart) return false;

  chart.destroy();
  instances.delete(el);
  return true;
}

// Attach init and destroy as static properties on GlideChart
(GlideChart as unknown as Record<string, unknown>).init = init;
(GlideChart as unknown as Record<string, unknown>).destroy = destroy;

// Auto-init on script load
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init());
  } else {
    init();
  }
}

export default GlideChart;
