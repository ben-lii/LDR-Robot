/**
 * Exponential backoff with full jitter.
 * delay = random(0, min(maxMs, minMs * 2^attempt))
 */
export function backoffDelayMs(
  attempt: number,
  minMs: number,
  maxMs: number,
  random: () => number = Math.random,
): number {
  const exp = Math.min(maxMs, minMs * 2 ** Math.max(0, attempt));
  return Math.floor(random() * exp);
}
