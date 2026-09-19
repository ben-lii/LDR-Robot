/**
 * Minimal typings for the optional `pigpio` native module.
 * Installed only on the Pi (`optionalDependencies`); never imported statically.
 */
declare module 'pigpio' {
  export class Gpio {
    static readonly OUTPUT: number;
    constructor(
      gpio: number,
      options: {
        mode: number;
      },
    );
    pwmFrequency(frequency: number): this;
    pwmRange(range: number): this;
    /** Duty cycle 0..pwmRange (default range 255). */
    pwmWrite(dutyCycle: number): this;
    digitalWrite(level: 0 | 1): this;
  }
}
