/** Median of a finite number list. Returns null for empty. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid] ?? null;
  }
  const lo = sorted[mid - 1];
  const hi = sorted[mid];
  if (lo === undefined || hi === undefined) {
    return null;
  }
  return (lo + hi) / 2;
}

export type LatencyTone = 'ok' | 'warn' | 'bad';

export function latencyTone(ms: number | null): LatencyTone {
  if (ms === null) {
    return 'ok';
  }
  if (ms < 150) {
    return 'ok';
  }
  if (ms < 300) {
    return 'warn';
  }
  return 'bad';
}

/** Keep the last `max` samples (FIFO). */
export function pushSample(
  samples: readonly number[],
  value: number,
  max: number,
): number[] {
  const next = [...samples, value];
  if (next.length <= max) {
    return next;
  }
  return next.slice(next.length - max);
}
