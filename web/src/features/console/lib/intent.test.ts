import { describe, expect, it } from 'vitest';

import { driveKeyFromCode, intentFromKeys } from './intent';

describe('intentFromKeys', () => {
  it('maps single keys', () => {
    expect(intentFromKeys(new Set(['w']))).toEqual({
      throttle: 1,
      steer: 0,
      brake: false,
    });
    expect(intentFromKeys(new Set(['s']))).toEqual({
      throttle: -1,
      steer: 0,
      brake: false,
    });
    expect(intentFromKeys(new Set(['a']))).toEqual({
      throttle: 0,
      steer: -1,
      brake: false,
    });
    expect(intentFromKeys(new Set(['d']))).toEqual({
      throttle: 0,
      steer: 1,
      brake: false,
    });
    expect(intentFromKeys(new Set(['space']))).toEqual({
      throttle: 0,
      steer: 0,
      brake: true,
    });
  });

  it('cancels opposing axes', () => {
    expect(intentFromKeys(new Set(['w', 's']))).toEqual({
      throttle: 0,
      steer: 0,
      brake: false,
    });
    expect(intentFromKeys(new Set(['a', 'd']))).toEqual({
      throttle: 0,
      steer: 0,
      brake: false,
    });
  });

  it('combines forward and turn', () => {
    expect(intentFromKeys(new Set(['w', 'a']))).toEqual({
      throttle: 1,
      steer: -1,
      brake: false,
    });
  });
});

describe('driveKeyFromCode', () => {
  it('maps letters, arrows, space, escape', () => {
    expect(driveKeyFromCode('KeyW')).toBe('w');
    expect(driveKeyFromCode('ArrowLeft')).toBe('a');
    expect(driveKeyFromCode('Space')).toBe('space');
    expect(driveKeyFromCode('Escape')).toBe('escape');
    expect(driveKeyFromCode('KeyQ')).toBeNull();
  });
});
