import { describe, expect, it } from 'vitest';

import { applyMinDuty } from './pigpioDriver.js';

describe('applyMinDuty', () => {
  it('returns 0 for zero magnitude', () => {
    expect(applyMinDuty(0, 0.25)).toBe(0);
  });

  it('maps non-zero into [min, 1]', () => {
    expect(applyMinDuty(1, 0.25)).toBe(1);
    expect(applyMinDuty(0.5, 0.25)).toBeCloseTo(0.625);
    expect(applyMinDuty(0.001, 0.25)).toBeGreaterThan(0.25);
  });
});
