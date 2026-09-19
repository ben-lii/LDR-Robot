import { describe, expect, it } from 'vitest';

import { backoffDelayMs } from './backoff';

describe('backoffDelayMs', () => {
  it('stays within [0, cap]', () => {
    const delay = backoffDelayMs(0, 1000, 5000, () => 0.5);
    expect(delay).toBe(500);
    expect(backoffDelayMs(10, 1000, 5000, () => 1)).toBe(5000);
    expect(backoffDelayMs(0, 1000, 5000, () => 0)).toBe(0);
  });
});
