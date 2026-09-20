/**
 * Shared DRV8833 helpers (duty mapping). Pin I/O stays in driver modules only.
 */

/** Maps signed command magnitude 0..1 into [minDuty, 1] (0 stays 0). */
export function applyMinDuty(signedMagnitude: number, minDuty: number): number {
  const mag = Math.min(1, Math.max(0, signedMagnitude));
  if (mag === 0) {
    return 0;
  }
  const min = Math.min(1, Math.max(0, minDuty));
  return min + (1 - min) * mag;
}
