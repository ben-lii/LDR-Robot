import { describe, expect, it } from 'vitest';

import { createFakeClock } from './clock.js';
import { BRAKE_HOLD_MS, MotorController, rampAxis } from './motorController.js';
import { MockMotorDriver } from '../hardware/mockDriver.js';

function createSut(watchdogMs = 300, rampMs = 250) {
  const clock = createFakeClock(1_000_000);
  const driver = new MockMotorDriver();
  const controller = new MotorController({
    driver,
    clock,
    mixer: {
      maxSpeedPercent: 100,
      swapMotors: false,
      invertLeft: false,
      invertRight: false,
    },
    watchdogMs,
    rampMs,
  });
  driver.clearCalls();
  return { clock, driver, controller };
}

describe('MotorController', () => {
  it('watchdog trips just after WATCHDOG_MS and not before', () => {
    const { clock, driver, controller } = createSut(300);
    controller.setDrive({ throttle: 1, steer: 0, speed: 100 });
    controller.tick();
    expect(driver.calls.some((c) => c.op === 'setMotor')).toBe(true);

    driver.clearCalls();
    clock.advance(300);
    controller.tick();
    expect(driver.calls.some((c) => c.op === 'brake')).toBe(false);

    clock.advance(1);
    controller.tick();
    expect(driver.calls.some((c) => c.op === 'brake')).toBe(true);
  });

  it('steady drive keeps the watchdog alive', () => {
    const { clock, driver, controller } = createSut(300);
    for (let i = 0; i < 10; i += 1) {
      controller.setDrive({ throttle: 1, steer: 0, speed: 100 });
      clock.advance(100);
      controller.tick();
    }
    expect(driver.calls.filter((c) => c.op === 'brake')).toHaveLength(0);
    expect(controller.getState().mode).toBe('driving');
  });

  it('estop overrides everything and survives revokeControl', () => {
    const { clock, driver, controller } = createSut();
    controller.setDrive({ throttle: 1, steer: 0, speed: 100 });
    controller.tick();
    controller.setEstop(true);
    controller.tick();
    expect(controller.getState().mode).toBe('estop');
    expect(driver.calls.at(-1)?.op).toBe('brake');

    controller.revokeControl();
    controller.setDrive({ throttle: 1, steer: 0, speed: 100 });
    clock.advance(BRAKE_HOLD_MS + 10);
    controller.tick();
    expect(controller.getState().mode).toBe('estop');
  });

  it('brake overrides drive', () => {
    const { driver, controller } = createSut();
    controller.setDrive({ throttle: 1, steer: 0, speed: 100 });
    controller.setBrake(true);
    controller.tick();
    expect(controller.getState().mode).toBe('braking');
    expect(driver.calls.at(-1)?.op).toBe('brake');
  });

  it('ramp limits acceleration but not deceleration', () => {
    expect(rampAxis(0, 1, 20, 200)).toBeCloseTo(0.1);
    expect(rampAxis(1, 0, 20, 200)).toBe(0);
    expect(rampAxis(1, -1, 20, 200)).toBe(0);
  });

  it('dispose is idempotent and coasts', () => {
    const { driver, controller } = createSut();
    controller.dispose();
    controller.dispose();
    expect(driver.calls.filter((c) => c.op === 'dispose')).toHaveLength(1);
    expect(driver.calls.some((c) => c.op === 'coast')).toBe(true);
  });

  it('driver exception → fault', () => {
    const clock = createFakeClock();
    const driver = new MockMotorDriver();
    const controller = new MotorController({
      driver,
      clock,
      mixer: {
        maxSpeedPercent: 100,
        swapMotors: false,
        invertLeft: false,
        invertRight: false,
      },
      watchdogMs: 300,
      rampMs: 1,
    });
    driver.setMotor = () => {
      throw new Error('gpio fail');
    };
    controller.setDrive({ throttle: 1, steer: 0, speed: 100 });
    controller.tick();
    expect(controller.getState().mode).toBe('fault');
  });

  it('honors invert/swap via mixer', () => {
    const clock = createFakeClock();
    const driver = new MockMotorDriver();
    const controller = new MotorController({
      driver,
      clock,
      mixer: {
        maxSpeedPercent: 100,
        swapMotors: true,
        invertLeft: false,
        invertRight: false,
      },
      watchdogMs: 300,
      rampMs: 1,
    });
    driver.clearCalls();
    controller.setDrive({ throttle: 1, steer: 1, speed: 100 });
    clock.advance(20);
    controller.tick();
    const motors = driver.calls.filter((c) => c.op === 'setMotor');
    expect(motors).toContainEqual({
      op: 'setMotor',
      side: 'left',
      signed: 0,
    });
    expect(motors).toContainEqual({
      op: 'setMotor',
      side: 'right',
      signed: 1,
    });
  });
});
