import { describe, expect, it } from 'vitest';

import { GpiodMotorDriver } from './gpiodDriver.js';
import { SoftPwmEngine, type DigitalOut } from './softPwm.js';
import type { Logger } from '../logger.js';

function mockPin(): DigitalOut & { level: 0 | 1 } {
  const pin: DigitalOut & { level: 0 | 1 } = {
    level: 0,
    write(level: 0 | 1): void {
      pin.level = level;
    },
    close(): void {},
  };
  return pin;
}

function silentLog(): Logger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    fatal: () => {},
    trace: () => {},
    child: () => silentLog(),
  } as unknown as Logger;
}

describe('GpiodMotorDriver', () => {
  it('forward / reverse / coast / brake', () => {
    const pwm = new SoftPwmEngine(100);
    const leftIn1 = mockPin();
    const leftIn2 = mockPin();
    const rightIn1 = mockPin();
    const rightIn2 = mockPin();
    pwm.attach('leftIn1', leftIn1);
    pwm.attach('leftIn2', leftIn2);
    pwm.attach('rightIn1', rightIn1);
    pwm.attach('rightIn2', rightIn2);

    const driver = new GpiodMotorDriver({
      pwm,
      sleep: null,
      minDuty: 0,
      log: silentLog(),
    });

    driver.setMotor('left', 1);
    // Forward: IN1 PWM (high at duty 1), IN2 low
    expect(leftIn1.level).toBe(1);
    expect(leftIn2.level).toBe(0);

    driver.setMotor('left', -1);
    expect(leftIn1.level).toBe(0);
    expect(leftIn2.level).toBe(1);

    driver.brake();
    expect(leftIn1.level).toBe(1);
    expect(leftIn2.level).toBe(1);
    expect(rightIn1.level).toBe(1);
    expect(rightIn2.level).toBe(1);

    driver.coast();
    expect(leftIn1.level).toBe(0);
    expect(leftIn2.level).toBe(0);

    driver.dispose();
  });
});
