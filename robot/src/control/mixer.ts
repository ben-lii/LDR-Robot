export type MixerInput = {
  throttle: number;
  steer: number;
  speed: number;
};

export type MixerConfig = {
  maxSpeedPercent: number;
  swapMotors: boolean;
  invertLeft: boolean;
  invertRight: boolean;
};

export type MixerOutput = {
  left: number;
  right: number;
};

const DEADBAND = 0.02;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function applyDeadband(value: number): number {
  return Math.abs(value) < DEADBAND ? 0 : value;
}

/**
 * Differential-drive mixer.
 * steer > 0 = right (D): left +, right − when spinning in place.
 */
export function mix(input: MixerInput, config: MixerConfig): MixerOutput {
  let left = input.throttle + input.steer;
  let right = input.throttle - input.steer;
  const m = Math.max(1, Math.abs(left), Math.abs(right));
  left /= m;
  right /= m;

  const k = clamp(input.speed, 0, config.maxSpeedPercent) / 100;
  left *= k;
  right *= k;

  if (config.swapMotors) {
    const tmp = left;
    left = right;
    right = tmp;
  }
  if (config.invertLeft) {
    left = -left;
  }
  if (config.invertRight) {
    right = -right;
  }

  return {
    left: applyDeadband(left),
    right: applyDeadband(right),
  };
}
