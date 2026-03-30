export interface StaleChangeEvent {
  seriesId: string;
  isStale: boolean;
  lastDataTimestamp: number;
}

export interface StaleDetectorConfig {
  staleThreshold: number;
  onStaleChange?: (event: StaleChangeEvent) => void;
}

export class StaleDetector {
  private readonly threshold: number;
  private readonly onStaleChange: ((event: StaleChangeEvent) => void) | undefined;
  private readonly lastDataTimestamps: Map<string, number> = new Map();
  private readonly staleSeries: Set<string> = new Set();
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;

  constructor(config: StaleDetectorConfig) {
    this.threshold = config.staleThreshold;
    this.onStaleChange = config.onStaleChange;
  }

  recordDataArrival(seriesId: string): void {
    if (this.threshold <= 0 || this.destroyed) return;

    this.lastDataTimestamps.set(seriesId, Date.now());

    if (this.staleSeries.has(seriesId)) {
      this.staleSeries.delete(seriesId);
      this.fireCallback(seriesId, false, Date.now());
    }
  }

  startChecking(): void {
    if (this.threshold <= 0 || this.destroyed || this.checkInterval !== null) return;

    const interval = Math.max(100, Math.min(this.threshold, 1000));
    this.checkInterval = setInterval(() => this.checkAllSeries(), interval);
  }

  stopChecking(): void {
    if (this.checkInterval !== null) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  destroy(): void {
    this.stopChecking();
    this.lastDataTimestamps.clear();
    this.staleSeries.clear();
    this.destroyed = true;
  }

  removeSeries(seriesId: string): void {
    if (this.destroyed) return;

    const wasStale = this.staleSeries.has(seriesId);
    const lastTimestamp = this.lastDataTimestamps.get(seriesId) ?? 0;
    this.lastDataTimestamps.delete(seriesId);
    this.staleSeries.delete(seriesId);

    if (wasStale) {
      this.fireCallback(seriesId, false, lastTimestamp);
    }
  }

  getStaleSeriesIds(): ReadonlySet<string> {
    return new Set(this.staleSeries);
  }

  getState(): { timestamps: ReadonlyMap<string, number>; staleIds: ReadonlySet<string> } {
    return { timestamps: this.lastDataTimestamps, staleIds: this.staleSeries };
  }

  restoreState(timestamps: ReadonlyMap<string, number>, staleIds: ReadonlySet<string>): void {
    if (this.threshold <= 0 || this.destroyed) return;

    for (const [seriesId, ts] of timestamps) {
      this.lastDataTimestamps.set(seriesId, ts);
    }
    for (const seriesId of staleIds) {
      this.staleSeries.add(seriesId);
    }
  }

  private checkAllSeries(): void {
    const now = Date.now();

    for (const [seriesId, lastTimestamp] of this.lastDataTimestamps) {
      const elapsed = now - lastTimestamp;
      const wasStale = this.staleSeries.has(seriesId);

      if (elapsed > this.threshold && !wasStale) {
        this.staleSeries.add(seriesId);
        this.fireCallback(seriesId, true, lastTimestamp);
      }
    }
  }

  private fireCallback(seriesId: string, isStale: boolean, lastDataTimestamp: number): void {
    if (!this.onStaleChange) return;

    try {
      this.onStaleChange({ seriesId, isStale, lastDataTimestamp });
    } catch {
      // Consumer callback errors must not crash StaleDetector
    }
  }
}
