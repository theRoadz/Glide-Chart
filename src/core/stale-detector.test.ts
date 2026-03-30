import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StaleDetector } from './stale-detector';
import type { StaleChangeEvent } from './stale-detector';

describe('StaleDetector', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires stale after threshold with no data', () => {
    const onStaleChange = vi.fn();
    const detector = new StaleDetector({ staleThreshold: 5000, onStaleChange });

    detector.recordDataArrival('price');
    detector.startChecking();

    // Advance past threshold — interval fires every 1000ms, need >5000ms elapsed
    vi.advanceTimersByTime(6000);

    expect(onStaleChange).toHaveBeenCalledWith(
      expect.objectContaining({ seriesId: 'price', isStale: true }),
    );

    detector.destroy();
  });

  it('clears stale when recordDataArrival called', () => {
    const onStaleChange = vi.fn();
    const detector = new StaleDetector({ staleThreshold: 5000, onStaleChange });

    detector.recordDataArrival('price');
    detector.startChecking();

    // Go stale
    vi.advanceTimersByTime(6000);
    expect(onStaleChange).toHaveBeenCalledWith(
      expect.objectContaining({ seriesId: 'price', isStale: true }),
    );

    // Clear stale
    onStaleChange.mockClear();
    detector.recordDataArrival('price');

    expect(onStaleChange).toHaveBeenCalledWith(
      expect.objectContaining({ seriesId: 'price', isStale: false }),
    );

    detector.destroy();
  });

  it('creates no timer when threshold is 0', () => {
    const onStaleChange = vi.fn();
    const detector = new StaleDetector({ staleThreshold: 0, onStaleChange });

    detector.startChecking();
    vi.advanceTimersByTime(10000);

    expect(onStaleChange).not.toHaveBeenCalled();

    detector.destroy();
  });

  it('tracks per-series independent stale state', () => {
    const events: StaleChangeEvent[] = [];
    const onStaleChange = vi.fn((e: StaleChangeEvent) => events.push(e));
    const detector = new StaleDetector({ staleThreshold: 5000, onStaleChange });

    detector.recordDataArrival('price');
    detector.recordDataArrival('volume');
    detector.startChecking();

    // Advance 3s, send data only for 'price'
    vi.advanceTimersByTime(3000);
    detector.recordDataArrival('price');

    // Advance another 3s — 'volume' is 6s stale, 'price' is 3s fresh
    vi.advanceTimersByTime(3000);

    const staleEvents = events.filter((e) => e.isStale);
    expect(staleEvents).toHaveLength(1);
    expect(staleEvents[0]!.seriesId).toBe('volume');

    detector.destroy();
  });

  it('fires onStaleChange with correct event data', () => {
    const onStaleChange = vi.fn();
    const detector = new StaleDetector({ staleThreshold: 5000, onStaleChange });

    const now = Date.now();
    detector.recordDataArrival('price');
    detector.startChecking();

    vi.advanceTimersByTime(6000);

    expect(onStaleChange).toHaveBeenCalledTimes(1);
    const event = onStaleChange.mock.calls[0]![0] as StaleChangeEvent;
    expect(event.seriesId).toBe('price');
    expect(event.isStale).toBe(true);
    expect(event.lastDataTimestamp).toBeGreaterThanOrEqual(now);

    detector.destroy();
  });

  it('destroy clears interval with no dangling timers', () => {
    const onStaleChange = vi.fn();
    const detector = new StaleDetector({ staleThreshold: 5000, onStaleChange });

    detector.recordDataArrival('price');
    detector.startChecking();
    detector.destroy();

    // After destroy, no callbacks should fire
    vi.advanceTimersByTime(10000);
    expect(onStaleChange).not.toHaveBeenCalled();
  });

  it('multiple rapid data arrivals do not cause redundant callbacks', () => {
    const onStaleChange = vi.fn();
    const detector = new StaleDetector({ staleThreshold: 5000, onStaleChange });

    detector.recordDataArrival('price');
    detector.startChecking();

    // Go stale
    vi.advanceTimersByTime(6000);
    expect(onStaleChange).toHaveBeenCalledTimes(1);

    // Multiple rapid data arrivals should only fire one "not stale" callback
    onStaleChange.mockClear();
    detector.recordDataArrival('price');
    detector.recordDataArrival('price');
    detector.recordDataArrival('price');

    // Only the first recordDataArrival after stale should fire callback
    expect(onStaleChange).toHaveBeenCalledTimes(1);
    expect(onStaleChange).toHaveBeenCalledWith(
      expect.objectContaining({ seriesId: 'price', isStale: false }),
    );

    detector.destroy();
  });

  it('removeSeries stops tracking and clears stale state', () => {
    const onStaleChange = vi.fn();
    const detector = new StaleDetector({ staleThreshold: 5000, onStaleChange });

    detector.recordDataArrival('price');
    detector.startChecking();

    // Go stale
    vi.advanceTimersByTime(6000);
    expect(onStaleChange).toHaveBeenCalledWith(
      expect.objectContaining({ seriesId: 'price', isStale: true }),
    );

    // Remove series — should fire "not stale" and stop tracking
    onStaleChange.mockClear();
    detector.removeSeries('price');

    expect(onStaleChange).toHaveBeenCalledWith(
      expect.objectContaining({ seriesId: 'price', isStale: false }),
    );

    // No more events for removed series
    onStaleChange.mockClear();
    vi.advanceTimersByTime(10000);
    expect(onStaleChange).not.toHaveBeenCalled();

    detector.destroy();
  });

  it('getStaleSeriesIds returns correct set', () => {
    const detector = new StaleDetector({ staleThreshold: 5000 });

    detector.recordDataArrival('price');
    detector.recordDataArrival('volume');
    detector.startChecking();

    expect(detector.getStaleSeriesIds().size).toBe(0);

    vi.advanceTimersByTime(6000);

    const staleIds = detector.getStaleSeriesIds();
    expect(staleIds.has('price')).toBe(true);
    expect(staleIds.has('volume')).toBe(true);
    expect(staleIds.size).toBe(2);

    // Clear one
    detector.recordDataArrival('price');
    expect(detector.getStaleSeriesIds().has('price')).toBe(false);
    expect(detector.getStaleSeriesIds().has('volume')).toBe(true);

    detector.destroy();
  });

  it('onStaleChange callback throwing does not crash StaleDetector', () => {
    const onStaleChange = vi.fn(() => {
      throw new Error('Consumer error!');
    });
    const detector = new StaleDetector({ staleThreshold: 5000, onStaleChange });

    detector.recordDataArrival('price');
    detector.startChecking();

    // Should not throw
    expect(() => vi.advanceTimersByTime(6000)).not.toThrow();

    // Stale state should still be tracked correctly
    expect(detector.getStaleSeriesIds().has('price')).toBe(true);

    // recordDataArrival should also handle throwing callback
    expect(() => detector.recordDataArrival('price')).not.toThrow();
    expect(detector.getStaleSeriesIds().has('price')).toBe(false);

    detector.destroy();
  });

  it('recordDataArrival is a no-op when threshold is 0', () => {
    const onStaleChange = vi.fn();
    const detector = new StaleDetector({ staleThreshold: 0, onStaleChange });

    detector.recordDataArrival('price');
    detector.startChecking();
    vi.advanceTimersByTime(10000);

    expect(onStaleChange).not.toHaveBeenCalled();
    expect(detector.getStaleSeriesIds().size).toBe(0);

    detector.destroy();
  });

  it('negative threshold behaves same as 0 (disabled)', () => {
    const onStaleChange = vi.fn();
    const detector = new StaleDetector({ staleThreshold: -100, onStaleChange });

    detector.recordDataArrival('price');
    detector.startChecking();
    vi.advanceTimersByTime(10000);

    expect(onStaleChange).not.toHaveBeenCalled();

    detector.destroy();
  });
});
