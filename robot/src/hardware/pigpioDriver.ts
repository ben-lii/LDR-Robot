/**
 * DRV8833 motor driver via pigpio.
 * This is the only module that may import `pigpio` (dynamic).
 */
import type { Config } from '../config.js';
import type { Logger } from '../logger.js';
import type { MotorDriver, Side } from './MotorDriver.js';

const PWM_RANGE = 255;

type GpioHandle = {
  pwmFrequency(frequency: number): GpioHandle;
  pwmRange(range: number): GpioHandle;
  pwmWrite(dutyCycle: number): GpioHandle;
  digitalWrite(level: 0 | 1): GpioHandle;
};

type GpioCtor = {
  new (
    gpio: number,
    options: {
      mode: number;
    },
  ): GpioHandle;
  readonly OUTPUT: number;
};

/** Exported for unit tests — maps signed command to PWM duty 0..1 after min-duty. */
export function applyMinDuty(signedMagnitude: number, minDuty: number): number {
  const mag = Math.min(1, Math.max(0, signedMagnitude));
  if (mag === 0) {
    return 0;
  }
  const min = Math.min(1, Math.max(0, minDuty));
  return min + (1 - min) * mag;
}

function dutyToPwm(duty01: number): number {
  return Math.round(Math.min(1, Math.max(0, duty01)) * PWM_RANGE);
}

class PigpioMotorDriver implements MotorDriver {
  #disposed = false;
  readonly #leftIn1: GpioHandle;
  readonly #leftIn2: GpioHandle;
  readonly #rightIn1: GpioHandle;
  readonly #rightIn2: GpioHandle;
  readonly #sleep: GpioHandle | null;
  readonly #minDuty: number;
  readonly #log: Logger;

  constructor(options: {
    leftIn1: GpioHandle;
    leftIn2: GpioHandle;
    rightIn1: GpioHandle;
    rightIn2: GpioHandle;
    sleep: GpioHandle | null;
    minDuty: number;
    log: Logger;
  }) {
    this.#leftIn1 = options.leftIn1;
    this.#leftIn2 = options.leftIn2;
    this.#rightIn1 = options.rightIn1;
    this.#rightIn2 = options.rightIn2;
    this.#sleep = options.sleep;
    this.#minDuty = options.minDuty;
    this.#log = options.log;
  }

  setMotor(side: Side, signed: number): void {
    this.#ensureLive();
    const clamped = Math.min(1, Math.max(-1, signed));
    const duty = applyMinDuty(Math.abs(clamped), this.#minDuty);
    const pwm = dutyToPwm(duty);
    const [in1, in2] =
      side === 'left'
        ? [this.#leftIn1, this.#leftIn2]
        : [this.#rightIn1, this.#rightIn2];

    if (pwm === 0) {
      in1.digitalWrite(0);
      in2.digitalWrite(0);
      return;
    }

    if (clamped > 0) {
      // Forward: IN1 PWM, IN2 low
      in2.digitalWrite(0);
      in1.pwmWrite(pwm);
    } else {
      // Reverse: IN1 low, IN2 PWM
      in1.digitalWrite(0);
      in2.pwmWrite(pwm);
    }
  }

  brake(): void {
    this.#ensureLive();
    // Active brake: both inputs high
    for (const pin of [
      this.#leftIn1,
      this.#leftIn2,
      this.#rightIn1,
      this.#rightIn2,
    ]) {
      pin.digitalWrite(1);
    }
  }

  coast(): void {
    if (this.#disposed) {
      return;
    }
    for (const pin of [
      this.#leftIn1,
      this.#leftIn2,
      this.#rightIn1,
      this.#rightIn2,
    ]) {
      pin.digitalWrite(0);
    }
  }

  setEnabled(on: boolean): void {
    if (this.#disposed) {
      return;
    }
    if (!this.#sleep) {
      return;
    }
    // DRV8833 nSLEEP: high = enabled
    this.#sleep.digitalWrite(on ? 1 : 0);
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    try {
      this.coast();
      this.setEnabled(false);
    } catch (error) {
      this.#log.warn({ err: error }, 'pigpio dispose coast/disable failed');
    }
    this.#disposed = true;
  }

  #ensureLive(): void {
    if (this.#disposed) {
      throw new Error('PigpioMotorDriver disposed');
    }
  }
}

function configurePwmPin(
  Gpio: GpioCtor,
  bcm: number,
  frequencyHz: number,
): GpioHandle {
  const pin = new Gpio(bcm, { mode: Gpio.OUTPUT });
  pin.pwmFrequency(frequencyHz);
  pin.pwmRange(PWM_RANGE);
  pin.digitalWrite(0);
  return pin;
}

export async function createPigpioDriver(
  config: Config,
  log: Logger,
): Promise<MotorDriver> {
  let Gpio: GpioCtor;
  try {
    const mod = (await import('pigpio')) as { Gpio: GpioCtor };
    Gpio = mod.Gpio;
  } catch (error) {
    throw new Error(
      `Failed to load pigpio (install on the Pi only): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const freq = config.pwmFrequencyHz;
  const leftIn1 = configurePwmPin(Gpio, config.pinAin1, freq);
  const leftIn2 = configurePwmPin(Gpio, config.pinAin2, freq);
  const rightIn1 = configurePwmPin(Gpio, config.pinBin1, freq);
  const rightIn2 = configurePwmPin(Gpio, config.pinBin2, freq);

  let sleep: GpioHandle | null = null;
  if (config.pinSleep !== undefined) {
    sleep = new Gpio(config.pinSleep, { mode: Gpio.OUTPUT });
    sleep.digitalWrite(1);
  }

  const driver = new PigpioMotorDriver({
    leftIn1,
    leftIn2,
    rightIn1,
    rightIn2,
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
      pwmHz: freq,
    },
    'pigpio motor driver ready',
  );

  return driver;
}
