import type { PointerState, CrosshairDataSource, TooltipDataPoint } from './types';
import type { ResolvedConfig } from '../config/types';
import type { Scale } from '../core/scale';

const OFFSET = 12;
const ARIA_DEBOUNCE_MS = 300;
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

export class Tooltip {
  private container: HTMLElement;
  private scale: Scale;
  private dataSource: CrosshairDataSource;
  private tooltipEl: HTMLDivElement;
  private timeEl: HTMLDivElement;
  private ariaEl: HTMLDivElement;
  private ariaTimer: ReturnType<typeof setTimeout> | null = null;
  private resultPool: TooltipDataPoint[];
  private formatterView: TooltipDataPoint[];
  private activeCount = 0;
  private customEl: HTMLDivElement;
  private rowEls: HTMLDivElement[] = [];
  private labelEls: HTMLSpanElement[] = [];
  private valueEls: HTMLSpanElement[] = [];
  private fmtSeconds: Intl.DateTimeFormat;
  private fmtMinutes: Intl.DateTimeFormat;
  private fmtDays: Intl.DateTimeFormat;
  private numberFmt: Intl.NumberFormat;
  private seriesCount: number;

  constructor(
    container: HTMLElement,
    scale: Scale,
    dataSource: CrosshairDataSource,
    config: Readonly<ResolvedConfig>,
  ) {
    if (!container) {
      throw new Error('Tooltip: container element is required');
    }
    if (!scale) {
      throw new Error('Tooltip: scale instance is required');
    }
    if (!dataSource) {
      throw new Error('Tooltip: dataSource is required');
    }
    if (!config) {
      throw new Error('Tooltip: config is required');
    }

    this.container = container;
    this.scale = scale;
    this.dataSource = dataSource;
    this.seriesCount = config.series.length;

    // Pre-allocate result pool sized to series count
    this.resultPool = new Array<TooltipDataPoint>(this.seriesCount);
    this.formatterView = new Array<TooltipDataPoint>(this.seriesCount);
    for (let i = 0; i < this.seriesCount; i++) {
      this.resultPool[i] = { seriesId: '', value: 0, timestamp: 0 };
      this.formatterView[i] = { seriesId: '', value: 0, timestamp: 0 };
    }

    // Create tooltip DOM element
    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'glide-chart-tooltip';
    this.tooltipEl.style.position = 'absolute';
    this.tooltipEl.style.left = '0';
    this.tooltipEl.style.top = '0';
    this.tooltipEl.style.pointerEvents = 'none';
    this.tooltipEl.style.display = 'none';
    this.tooltipEl.style.zIndex = '10';
    this.applyStyles(config);

    // Create timestamp header
    this.timeEl = document.createElement('div');
    this.timeEl.className = 'glide-chart-tooltip-time';
    this.tooltipEl.appendChild(this.timeEl);

    // Pre-create row elements for each series
    for (let i = 0; i < this.seriesCount; i++) {
      if (this.seriesCount === 1) {
        // Single series — just a value div, no label
        const valueEl = document.createElement('div');
        valueEl.className = 'glide-chart-tooltip-value';
        this.tooltipEl.appendChild(valueEl);
        this.valueEls.push(valueEl);
      } else {
        const rowEl = document.createElement('div');
        rowEl.className = 'glide-chart-tooltip-row';

        const labelEl = document.createElement('span');
        labelEl.className = 'glide-chart-tooltip-label';
        rowEl.appendChild(labelEl);

        const valueEl = document.createElement('span');
        valueEl.className = 'glide-chart-tooltip-value';
        rowEl.appendChild(valueEl);

        this.tooltipEl.appendChild(rowEl);
        this.rowEls.push(rowEl);
        this.labelEls.push(labelEl);
        this.valueEls.push(valueEl);
      }
    }

    // Custom formatter output element
    this.customEl = document.createElement('div');
    this.customEl.className = 'glide-chart-tooltip-custom';
    this.customEl.style.display = 'none';
    this.tooltipEl.appendChild(this.customEl);

    this.container.appendChild(this.tooltipEl);

    // Create ARIA live region
    this.ariaEl = document.createElement('div');
    this.ariaEl.setAttribute('aria-live', 'polite');
    this.ariaEl.setAttribute('aria-atomic', 'true');
    this.ariaEl.style.position = 'absolute';
    this.ariaEl.style.width = '1px';
    this.ariaEl.style.height = '1px';
    this.ariaEl.style.padding = '0';
    this.ariaEl.style.margin = '-1px';
    this.ariaEl.style.overflow = 'hidden';
    this.ariaEl.style.clip = 'rect(0,0,0,0)';
    this.ariaEl.style.whiteSpace = 'nowrap';
    this.ariaEl.style.border = '0';
    this.container.appendChild(this.ariaEl);

    // Pre-create Intl formatters
    const xLocale = this.resolveLocale(config.xAxis.locale);
    const tz = config.xAxis.timezone;
    const tzOpts: Intl.DateTimeFormatOptions | undefined = tz ? { timeZone: tz } : undefined;

    try {
      this.fmtSeconds = new Intl.DateTimeFormat(xLocale, {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hourCycle: 'h23', ...tzOpts,
      });
      this.fmtMinutes = new Intl.DateTimeFormat(xLocale, {
        hour: '2-digit', minute: '2-digit',
        hourCycle: 'h23', ...tzOpts,
      });
      this.fmtDays = new Intl.DateTimeFormat(xLocale, {
        month: 'short', day: 'numeric',
        ...tzOpts,
      });
    } catch {
      this.fmtSeconds = new Intl.DateTimeFormat(undefined, {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hourCycle: 'h23',
      });
      this.fmtMinutes = new Intl.DateTimeFormat(undefined, {
        hour: '2-digit', minute: '2-digit',
        hourCycle: 'h23',
      });
      this.fmtDays = new Intl.DateTimeFormat(undefined, {
        month: 'short', day: 'numeric',
      });
    }

    const yLocale = this.resolveLocale(config.yAxis.locale);
    try {
      this.numberFmt = new Intl.NumberFormat(yLocale);
    } catch {
      this.numberFmt = new Intl.NumberFormat();
    }
  }

  update(
    pointerState: Readonly<PointerState>,
    config: Readonly<ResolvedConfig>,
  ): void {
    if (!config.tooltip.enabled || !pointerState.active) {
      this.hide();
      return;
    }

    // Check if pointer is within the plot area
    const viewport = this.scale.viewport;
    if (
      pointerState.x < viewport.x ||
      pointerState.x > viewport.x + viewport.width ||
      pointerState.y < viewport.y ||
      pointerState.y > viewport.y + viewport.height
    ) {
      this.hide();
      return;
    }

    // Convert pointer X to timestamp
    const timestamp = this.scale.pixelToX(pointerState.x);

    // Find nearest data points across all series
    this.activeCount = 0;
    for (const series of this.dataSource.getSeries()) {
      let closestDistance = Infinity;
      let closestValue = 0;
      let closestTimestamp = 0;

      for (let i = 0; i < series.buffer.size; i++) {
        const point = series.buffer.get(i);
        if (!point) continue;
        const distance = Math.abs(point.timestamp - timestamp);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestValue = point.value;
          closestTimestamp = point.timestamp;
        } else if (point.timestamp > timestamp) {
          break;
        }
      }

      if (closestDistance < Infinity) {
        const entry = this.resultPool[this.activeCount];
        if (entry) {
          entry.seriesId = series.id;
          entry.value = closestValue;
          entry.timestamp = closestTimestamp;
          this.activeCount++;
        }
      }
    }

    if (this.activeCount === 0) {
      this.hide();
      return;
    }

    // Try custom formatter first
    let customFormatted = false;
    let customContent = '';
    if (config.tooltip.formatter) {
      try {
        // Populate pre-allocated view with defensive copies (no heap allocation for the array itself)
        for (let i = 0; i < this.activeCount; i++) {
          const src = this.resultPool[i]!;
          const dst = this.formatterView[i]!;
          dst.seriesId = src.seriesId;
          dst.value = src.value;
          dst.timestamp = src.timestamp;
        }
        const view = this.formatterView.slice(0, this.activeCount);
        const raw = config.tooltip.formatter(view);
        if (typeof raw !== 'string') {
          throw new TypeError('formatter must return a string');
        }
        customContent = raw;
        this.customEl.textContent = customContent;
        this.customEl.style.display = '';
        this.timeEl.style.display = 'none';
        this.hideDefaultRows();
        customFormatted = true;
      } catch {
        // Fall through to default rendering below
      }
    }

    if (!customFormatted) {
      this.customEl.style.display = 'none';
      this.timeEl.style.display = '';

      // Format timestamp
      const firstEntry = this.resultPool[0]!;
      const timeStr = this.formatTimestamp(firstEntry.timestamp, config);

      // Update tooltip content
      this.timeEl.textContent = timeStr;

      for (let i = 0; i < this.seriesCount; i++) {
        if (i < this.activeCount) {
          const entry = this.resultPool[i]!;
          const valStr = this.formatValue(entry.value, config);

          if (this.seriesCount === 1) {
            this.valueEls[i]!.textContent = valStr;
            this.valueEls[i]!.style.display = '';
          } else {
            this.labelEls[i]!.textContent = entry.seriesId;
            this.valueEls[i]!.textContent = valStr;
            this.rowEls[i]!.style.display = '';
          }
        } else {
          if (this.seriesCount === 1) {
            this.valueEls[i]!.style.display = 'none';
          } else {
            this.rowEls[i]!.style.display = 'none';
          }
        }
      }
    }

    // Show and position tooltip
    this.tooltipEl.style.display = '';
    this.positionTooltip(pointerState.x, pointerState.y);

    // Schedule debounced ARIA update
    // Pass customText to ARIA only when non-empty; empty string falls back to default ARIA rendering
    const ariaCustomText = customFormatted && customContent ? customContent : undefined;
    this.scheduleAriaUpdate(customFormatted && ariaCustomText ? undefined : this.formatTimestamp(this.resultPool[0]!.timestamp, config), config, ariaCustomText);
  }

  hide(): void {
    this.tooltipEl.style.display = 'none';
    this.clearAriaTimer();
    this.ariaEl.textContent = '';
  }

  destroy(): void {
    this.hide();
    if (this.tooltipEl.parentNode) {
      this.tooltipEl.parentNode.removeChild(this.tooltipEl);
    }
    if (this.ariaEl.parentNode) {
      this.ariaEl.parentNode.removeChild(this.ariaEl);
    }
  }

  private applyStyles(config: Readonly<ResolvedConfig>): void {
    const t = config.tooltip;
    this.tooltipEl.style.backgroundColor = t.backgroundColor;
    this.tooltipEl.style.color = t.textColor;
    this.tooltipEl.style.fontSize = `${t.fontSize}px`;
    this.tooltipEl.style.fontFamily = t.fontFamily;
    this.tooltipEl.style.padding = `${t.padding}px`;
    this.tooltipEl.style.borderRadius = `${t.borderRadius}px`;
  }

  private positionTooltip(px: number, py: number): void {
    const tooltipWidth = this.tooltipEl.offsetWidth;
    const tooltipHeight = this.tooltipEl.offsetHeight;
    const containerWidth = this.container.clientWidth;
    const containerHeight = this.container.clientHeight;

    let tooltipX = px + OFFSET;
    let tooltipY = py - tooltipHeight - OFFSET;

    // Flip right → left if overflow, clamp to 0
    if (tooltipX + tooltipWidth > containerWidth) {
      tooltipX = px - tooltipWidth - OFFSET;
    }
    if (tooltipX < 0) {
      tooltipX = 0;
    }
    // Flip top → bottom if overflow, clamp to container bottom
    if (tooltipY < 0) {
      tooltipY = py + OFFSET;
    }
    if (tooltipY + tooltipHeight > containerHeight) {
      tooltipY = containerHeight - tooltipHeight;
    }

    this.tooltipEl.style.transform = `translate(${tooltipX}px, ${tooltipY}px)`;
  }

  private formatTimestamp(timestamp: number, config: Readonly<ResolvedConfig>): string {
    if (config.xAxis.labelFormatter) {
      try {
        return String(config.xAxis.labelFormatter(timestamp));
      } catch {
        // Fall through to auto-format
      }
    }

    const domainX = this.scale.domainX;
    const span = domainX.max - domainX.min;

    if (span < MINUTE_MS) {
      return this.fmtSeconds.format(timestamp);
    }
    if (span < DAY_MS) {
      return this.fmtMinutes.format(timestamp);
    }
    return this.fmtDays.format(timestamp);
  }

  private formatValue(value: number, config: Readonly<ResolvedConfig>): string {
    if (config.yAxis.labelFormatter) {
      try {
        return String(config.yAxis.labelFormatter(value));
      } catch {
        // Fall through to auto-format
      }
    }

    return this.numberFmt.format(value);
  }

  private hideDefaultRows(): void {
    for (let i = 0; i < this.seriesCount; i++) {
      if (this.seriesCount === 1) {
        this.valueEls[i]!.style.display = 'none';
      } else {
        this.rowEls[i]!.style.display = 'none';
      }
    }
  }

  private scheduleAriaUpdate(timeStr: string | undefined, config: Readonly<ResolvedConfig>, customText?: string): void {
    this.clearAriaTimer();
    this.ariaTimer = setTimeout(() => {
      if (customText !== undefined) {
        this.ariaEl.textContent = customText;
        return;
      }
      const parts: string[] = [(timeStr ?? '') + ':'];
      for (let i = 0; i < this.activeCount; i++) {
        const entry = this.resultPool[i]!;
        const valStr = this.formatValue(entry.value, config);
        if (this.seriesCount === 1) {
          parts.push(valStr);
        } else {
          parts.push(`${entry.seriesId} ${valStr}`);
        }
      }
      this.ariaEl.textContent = parts.join(' ');
    }, ARIA_DEBOUNCE_MS);
  }

  private clearAriaTimer(): void {
    if (this.ariaTimer !== null) {
      clearTimeout(this.ariaTimer);
      this.ariaTimer = null;
    }
  }

  private resolveLocale(locale: string | undefined): string | undefined {
    if (!locale) return undefined;
    try {
      new Intl.DateTimeFormat(locale);
      return locale;
    } catch {
      return undefined;
    }
  }
}
