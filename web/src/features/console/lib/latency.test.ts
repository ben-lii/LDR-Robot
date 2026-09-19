import { describe, expect, it } from 'vitest';

import { latencyTone, median, pushSample } from './latency';

describe('median', () => {
  it('returns null for empty', () => {
    expect(median([])).toBeNull();
  });

  it('handles odd and even lengths', () => {
    expect(median([3])).toBe(3);
    expect(median([1, 3, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('latencyTone', () => {
  it('thresholds at 150 and 300', () => {
    expect(latencyTone(null)).toBe('ok');
    expect(latencyTone(149)).toBe('ok');
    expect(latencyTone(150)).toBe('warn');
    expect(latencyTone(299)).toBe('warn');
    expect(latencyTone(300)).toBe('bad');
  });
});

describe('pushSample', () => {
  it('caps length', () => {
    expect(pushSample([1, 2, 3], 4, 3)).toEqual([2, 3, 4]);
  });
});
