/**
 * Stub loaded only when MOTOR_DRIVER=pigpio (Phase 7 implements GPIO).
 * Dynamic import keeps pigpio optional on laptops.
 */
import type { Config } from '../config.js';
import type { Logger } from '../logger.js';
import type { MotorDriver } from './MotorDriver.js';

export async function createPigpioDriver(
  config: Config,
  log: Logger,
): Promise<MotorDriver> {
  void config;
  void log;
  throw new Error(
    'pigpio driver is not implemented yet (Phase 7). Use MOTOR_DRIVER=mock.',
  );
}
