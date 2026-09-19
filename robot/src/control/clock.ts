export type Clock = {
  /** Milliseconds since an arbitrary epoch (Date.now()-compatible). */
  now(): number;
};

export const systemClock: Clock = {
  now: () => Date.now(),
};

export function createFakeClock(
  startMs = 0,
): Clock & { advance(ms: number): void } {
  let current = startMs;
  return {
    now: () => current,
    advance(ms: number) {
      current += ms;
    },
  };
}

/** Pi has no RTC; refuse tokens if the system year is before this. */
export const CLOCK_SYNC_MIN_YEAR = 2025;

export function isClockSynced(nowMs: number = Date.now()): boolean {
  return new Date(nowMs).getUTCFullYear() >= CLOCK_SYNC_MIN_YEAR;
}
