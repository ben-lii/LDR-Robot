import 'server-only';

type Bucket = {
  count: number;
  resetAt: number;
};

/**
 * Tiny in-memory rate limiter. On serverless this is per-instance only
 * (a speed bump, not a hard guarantee). See docs/TROUBLESHOOTING.md.
 */
export class MemoryRateLimiter {
  readonly #buckets = new Map<string, Bucket>();

  constructor(
    private readonly options: {
      limit: number;
      windowMs: number;
      now?: () => number;
    },
  ) {}

  isLimited(key: string): boolean {
    const now = this.options.now?.() ?? Date.now();
    const existing = this.#buckets.get(key);
    if (!existing || now >= existing.resetAt) {
      return false;
    }
    return existing.count >= this.options.limit;
  }

  /** Record a failure. Returns false if the key is now (or already) limited. */
  recordFailure(key: string): boolean {
    const now = this.options.now?.() ?? Date.now();
    const existing = this.#buckets.get(key);
    if (!existing || now >= existing.resetAt) {
      this.#buckets.set(key, {
        count: 1,
        resetAt: now + this.options.windowMs,
      });
      return true;
    }
    existing.count += 1;
    return existing.count <= this.options.limit;
  }

  reset(key: string): void {
    this.#buckets.delete(key);
  }

  clear(): void {
    this.#buckets.clear();
  }
}

/** Login failures: max 5 per (IP + email) per 10 minutes. */
export const loginFailureLimiter = new MemoryRateLimiter({
  limit: 5,
  windowMs: 10 * 60 * 1000,
});
