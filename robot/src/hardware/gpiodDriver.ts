/**
 * DRV8833 motor driver via libgpiod (rpi-io) + userspace software PWM.
 * This is the only module that may import `rpi-io` (dynamic).
 * Prefer MOTOR_DRIVER=gpiod on Raspberry Pi OS Trixie (pigpio is unavailable).
 */
import type { Config } from '../config.js';
import type { Logger } from '../logger.js';
import type { MotorDriver, Side } from './MotorDriver.js';
import { applyMinDuty } from './drv8833.js';
import {
  SoftPwmEngine,
  SOFT_PWM_MAX_HZ,
  type DigitalOut,
} from './softPwm.js';

const ID_LEFT_IN1 = 'leftIn1';
const ID_LEFT_IN2 = 'leftIn2';
const ID_RIGHT_IN1 = 'rightIn1';
const ID_RIGHT_IN2 = 'rightIn2';

type RioCtor = new (
  gpio: number,
  mode: string,
  options?: { value?: number },
) => {
  write(level: number): void;
  close(): void;
};

export class GpiodMotorDriver implements MotorDriver {
  #disposed = false;
  readonly #pwm: SoftPwmEngine;
  readonly #sleep: DigitalOut | null;
  readonly #minDuty: number;
  readonly #log: Logger;

  constructor(options: {
    pwm: SoftPwmEngine;
    sleep: DigitalOut | null;
    minDuty: number;
    log: Logger;
  }) {
    this.#pwm = options.pwm;
    this.#sleep = options.sleep;
    this.#minDuty = options.minDuty;
    this.#log = options.log;
  }

  setMotor(side: Side, signed: number): void {
    this.#ensureLive();
    const clamped = Math.min(1, Math.max(-1, signed));
    const duty = applyMinDuty(Math.abs(clamped), this.#minDuty);
    const in1 = side === 'left' ? ID_LEFT_IN1 : ID_RIGHT_IN1;
    const in2 = side === 'left' ? ID_LEFT_IN2 : ID_RIGHT_IN2;

    if (duty === 0) {
      this.#pwm.setStatic(in1, 0);
      this.#pwm.setStatic(in2, 0);
      return;
    }

    if (clamped > 0) {
      // Forward: IN1 PWM, IN2 low
      this.#pwm.setStatic(in2, 0);
      this.#pwm.setDuty(in1, duty);
    } else {
      // Reverse: IN1 low, IN2 PWM
      this.#pwm.setStatic(in1, 0);
      this.#pwm.setDuty(in2, duty);
    }
  }

  brake(): void {
    this.#ensureLive();
    this.#pwm.setAllHigh();
  }

  coast(): void {
    if (this.#disposed) {
      return;
    }
    this.#pwm.stopAllLow();
  }

  setEnabled(on: boolean): void {
    if (this.#disposed) {
      return;
    }
    if (!this.#sleep) {
      return;
    }
    // DRV8833 nSLEEP: high = enabled
    this.#sleep.write(on ? 1 : 0);
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    try {
      this.coast();
      this.setEnabled(false);
    } catch (error) {
      this.#log.warn({ err: error }, 'gpiod dispose coast/disable failed');
    }
    try {
      this.#pwm.dispose();
    } catch (error) {
      this.#log.warn({ err: error }, 'gpiod dispose pwm failed');
    }
    if (this.#sleep) {
      try {
        this.#sleep.close();
      } catch (error) {
        this.#log.warn({ err: error }, 'gpiod dispose sleep failed');
      }
    }
    this.#disposed = true;
  }

  #ensureLive(): void {
    if (this.#disposed) {
      throw new Error('GpiodMotorDriver disposed');
    }
  }
}

function wrapRio(line: {
  write(level: number): void;
  close(): void;
}): DigitalOut {
  return {
    write(level: 0 | 1): void {
      line.write(level);
    },
    close(): void {
      line.close();
    },
  };
}

export async function createGpiodDriver(
  config: Config,
  log: Logger,
): Promise<MotorDriver> {
  let RIO: RioCtor;
  try {
    const mod = (await import('rpi-io')) as { RIO: RioCtor };
    RIO = mod.RIO;
  } catch (error) {
    throw new Error(
      `Failed to load rpi-io (Pi + libgpiod only): ${
        error instanceof Error ? error.message : String(error)
      }. Install: sudo apt install -y libgpiod-dev gpiod && npm install rpi-io`,
    );
  }

  const requestedHz = config.pwmFrequencyHz;
  const pwm = new SoftPwmEngine(requestedHz);
  if (requestedHz > SOFT_PWM_MAX_HZ) {
    log.warn(
      { requestedHz, usingHz: pwm.frequencyHz },
      'soft PWM frequency clamped for userspace timing',
    );
  }

  const openOut = (bcm: number): DigitalOut =>
    wrapRio(new RIO(bcm, 'output', { value: 0 }));

  pwm.attach(ID_LEFT_IN1, openOut(config.pinAin1));
  pwm.attach(ID_LEFT_IN2, openOut(config.pinAin2));
  pwm.attach(ID_RIGHT_IN1, openOut(config.pinBin1));
  pwm.attach(ID_RIGHT_IN2, openOut(config.pinBin2));

  let sleep: DigitalOut | null = null;
  if (config.pinSleep !== undefined) {
    sleep = openOut(config.pinSleep);
    sleep.write(1);
  }

  const driver = new GpiodMotorDriver({
    pwm,
    sleep,
    minDuty: config.minDriveDuty,
    log,
  });

  log.info(
    {
      ain1: config.pinAin1,
      ain2: config.pinAin2,
      bin1: config.pinBin1,
      bin2: config.pinBin2,
      sleep: config.pinSleep ?? null,
      pwmHz: pwm.frequencyHz,
      backend: 'rpi-io+soft-pwm',
    },
    'gpiod motor driver ready',
  );

  return driver;
}
