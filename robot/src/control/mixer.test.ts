import { describe, expect, it } from 'vitest';

import { mix } from './mixer.js';

const base = {
  maxSpeedPercent: 100,
  swapMotors: false,
  invertLeft: false,
  invertRight: false,
};

describe('mix', () => {
  it('W → both forward', () => {
    expect(mix({ throttle: 1, steer: 0, speed: 100 }, base)).toEqual({
      left: 1,
      right: 1,
    });
  });

  it('S → both reverse', () => {
    expect(mix({ throttle: -1, steer: 0, speed: 100 }, base)).toEqual({
      left: -1,
      right: -1,
    });
  });

  it('D alone → spin right (left +, right −)', () => {
    expect(mix({ throttle: 0, steer: 1, speed: 100 }, base)).toEqual({
      left: 1,
      right: -1,
    });
  });

  it('A alone → spin left', () => {
    expect(mix({ throttle: 0, steer: -1, speed: 100 }, base)).toEqual({
      left: -1,
      right: 1,
    });
  });

  it('W+D → arc right (left +1, right 0)', () => {
    expect(mix({ throttle: 1, steer: 1, speed: 100 }, base)).toEqual({
      left: 1,
      right: 0,
    });
  });

  it('clamps speed and honors invert/swap', () => {
    expect(mix({ throttle: 1, steer: 0, speed: 50 }, base)).toEqual({
      left: 0.5,
      right: 0.5,
    });

    expect(
      mix({ throttle: 1, steer: 0, speed: 100 }, { ...base, invertLeft: true }),
    ).toEqual({ left: -1, right: 1 });

    expect(
      mix({ throttle: 1, steer: 1, speed: 100 }, { ...base, swapMotors: true }),
    ).toEqual({ left: 0, right: 1 });
  });

  it('applies deadband', () => {
    expect(mix({ throttle: 0.01, steer: 0, speed: 100 }, base)).toEqual({
      left: 0,
      right: 0,
    });
  });
});
