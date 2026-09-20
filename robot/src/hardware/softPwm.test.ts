import { afterEach, describe, expect, it, vi } from 'vitest';

import { SoftPwmEngine, type DigitalOut } from './softPwm.js';

function mockPin(): DigitalOut & { levels: number[] } {
  const levels: number[] = [];
  return {
    levels,
    write(level: 0 | 1): void {
      levels.push(level);
    },
    close(): void {},
  };
}

describe('SoftPwmEngine', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('setStatic holds level without PWM', () => {
    const pin = mockPin();
    const pwm = new SoftPwmEngine(100);
    pwm.attach('a', pin);
    pin.levels.length = 0;
    pwm.setStatic('a', 1);
    expect(pin.levels.at(-1)).toBe(1);
    pwm.setStatic('a', 0);
    expect(pin.levels.at(-1)).toBe(0);
    pwm.dispose();
  });

  it('setDuty 0 and 1 are static extremes', () => {
    const pin = mockPin();
    const pwm = new SoftPwmEngine(100);
    pwm.attach('a', pin);
    pin.levels.length = 0;
    pwm.setDuty('a', 0);
    expect(pin.levels.at(-1)).toBe(0);
    pwm.setDuty('a', 1);
    expect(pin.levels.at(-1)).toBe(1);
    pwm.dispose();
  });

  it('setDuty mid-range pulses high then low within a period', () => {
    vi.useFakeTimers();
    const pin = mockPin();
    const pwm = new SoftPwmEngine(100); // 10ms period
    pwm.attach('a', pin);
    pin.levels.length = 0;
    pwm.setDuty('a', 0.5);
    // First tick is scheduled after one period
    vi.advanceTimersByTime(10);
    expect(pin.levels).toContain(1);
    vi.advanceTimersByTime(5);
    expect(pin.levels.at(-1)).toBe(0);
    pwm.dispose();
  });

  it('setAllHigh / stopAllLow', () => {
    const a = mockPin();
    const b = mockPin();
    const pwm = new SoftPwmEngine(100);
    pwm.attach('a', a);
    pwm.attach('b', b);
    pwm.setAllHigh();
    expect(a.levels.at(-1)).toBe(1);
    expect(b.levels.at(-1)).toBe(1);
    pwm.stopAllLow();
    expect(a.levels.at(-1)).toBe(0);
    expect(b.levels.at(-1)).toBe(0);
    pwm.dispose();
  });

  it('clamps frequency to SOFT_PWM_MAX_HZ', () => {
    const pwm = new SoftPwmEngine(10_000);
    expect(pwm.frequencyHz).toBeLessThanOrEqual(400);
    pwm.dispose();
  });
});
