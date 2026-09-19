import type { RobotMode, RobotState } from '@teleop/protocol';

import type { Clock } from './clock.js';
import { mix, type MixerConfig } from './mixer.js';
import type { MotorDriver } from '../hardware/MotorDriver.js';
import type { Logger } from '../logger.js';

export const BRAKE_HOLD_MS = 500;
export const TICK_MS = 20;

export type DriveCommand = {
  throttle: number;
  steer: number;
  speed: number;
};

export type MotorControllerOptions = {
  driver: MotorDriver;
  clock: Clock;
  mixer: MixerConfig;
  watchdogMs: number;
  rampMs: number;
  log?: Logger;
  onStateChange?: (state: RobotState) => void;
  startedAtMs?: number;
  mediaReady?: () => boolean;
  driverPresent?: () => boolean;
};

type Outgoing = { left: number; right: number } | 'brake' | 'coast';

export class MotorController {
  readonly #driver: MotorDriver;
  readonly #clock: Clock;
  readonly #mixer: MixerConfig;
  readonly #watchdogMs: number;
  readonly #rampMs: number;
  readonly #log: Logger | undefined;
  readonly #onStateChange: ((state: RobotState) => void) | undefined;
  readonly #startedAtMs: number;
  readonly #mediaReady: () => boolean;
  readonly #driverPresent: () => boolean;

  #mode: RobotMode = 'idle';
  #estop = false;
  #brake = false;
  #fault = false;
  #drive: DriveCommand = { throttle: 0, steer: 0, speed: 0 };
  #lastDriveAt = 0;
  #watching = false;
  #holdBrakeUntil = 0;
  #currentLeft = 0;
  #currentRight = 0;
  #lastTickAt: number;
  #lastOutgoing: Outgoing | null = null;
  #timer: ReturnType<typeof setInterval> | null = null;
  #disposed = false;

  constructor(options: MotorControllerOptions) {
    this.#driver = options.driver;
    this.#clock = options.clock;
    this.#mixer = options.mixer;
    this.#watchdogMs = options.watchdogMs;
    this.#rampMs = options.rampMs;
    this.#log = options.log;
    this.#onStateChange = options.onStateChange;
    this.#startedAtMs = options.startedAtMs ?? options.clock.now();
    this.#lastTickAt = this.#clock.now();
    this.#mediaReady = options.mediaReady ?? (() => false);
    this.#driverPresent = options.driverPresent ?? (() => false);
    try {
      this.#driver.setEnabled(true);
      this.#driver.coast();
      this.#lastOutgoing = 'coast';
    } catch (error) {
      this.#enterFault(error);
    }
  }

  start(): void {
    if (this.#timer || this.#disposed) {
      return;
    }
    this.#timer = setInterval(() => {
      this.tick();
    }, TICK_MS);
    this.#timer.unref?.();
  }

  stopTick(): void {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  getState(): RobotState {
    return {
      mode: this.#mode,
      speedPercent: this.#drive.speed,
      driverPresent: this.#driverPresent(),
      mediaReady: this.#mediaReady(),
      uptimeS: Math.max(0, (this.#clock.now() - this.#startedAtMs) / 1000),
    };
  }

  setDrive(command: DriveCommand): void {
    if (this.#fault || this.#estop || this.#disposed) {
      return;
    }
    this.#drive = command;
    this.#watching = true;
    this.#lastDriveAt = this.#clock.now();
  }

  setBrake(active: boolean): void {
    if (this.#fault || this.#disposed) {
      return;
    }
    this.#brake = active;
  }

  setEstop(engaged: boolean): void {
    if (this.#fault || this.#disposed) {
      return;
    }
    if (engaged) {
      this.#estop = true;
      this.#holdBrakeUntil = this.#clock.now() + BRAKE_HOLD_MS;
      this.#setMode('estop');
      return;
    }
    this.#estop = false;
  }

  /** Clears drive + brake; does not clear e-stop. */
  revokeControl(): void {
    if (this.#disposed) {
      return;
    }
    this.#drive = { throttle: 0, steer: 0, speed: 0 };
    this.#watching = false;
    this.#brake = false;
    this.#holdBrakeUntil = this.#clock.now() + BRAKE_HOLD_MS;
    this.#currentLeft = 0;
    this.#currentRight = 0;
  }

  tick(): void {
    if (this.#disposed) {
      return;
    }
    const now = this.#clock.now();
    const dtMs = Math.max(0, now - this.#lastTickAt);
    this.#lastTickAt = now;

    try {
      // 1. fault
      if (this.#fault) {
        this.#applyOutgoing('coast');
        this.#setMode('fault');
        return;
      }

      // 2. estop
      if (this.#estop) {
        this.#applyHoldThenCoast(now, 'estop');
        return;
      }

      // 3. client brake
      if (this.#brake) {
        this.#applyOutgoing('brake');
        this.#currentLeft = 0;
        this.#currentRight = 0;
        this.#setMode('braking');
        return;
      }

      // 4. watchdog
      if (this.#watching && now - this.#lastDriveAt > this.#watchdogMs) {
        this.#watching = false;
        this.#drive = { throttle: 0, steer: 0, speed: 0 };
        this.#holdBrakeUntil = now + BRAKE_HOLD_MS;
        this.#currentLeft = 0;
        this.#currentRight = 0;
      }

      if (now < this.#holdBrakeUntil) {
        this.#applyOutgoing('brake');
        this.#setMode('braking');
        return;
      }

      // 5. drive
      if (!this.#watching) {
        this.#applyOutgoing('coast');
        this.#currentLeft = 0;
        this.#currentRight = 0;
        this.#setMode('idle');
        return;
      }

      const target = mix(this.#drive, this.#mixer);
      this.#currentLeft = rampAxis(
        this.#currentLeft,
        target.left,
        dtMs,
        this.#rampMs,
      );
      this.#currentRight = rampAxis(
        this.#currentRight,
        target.right,
        dtMs,
        this.#rampMs,
      );
      this.#applyOutgoing({
        left: this.#currentLeft,
        right: this.#currentRight,
      });
      this.#setMode(
        this.#currentLeft === 0 && this.#currentRight === 0
          ? 'idle'
          : 'driving',
      );
    } catch (error) {
      this.#enterFault(error);
    }
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.stopTick();
    try {
      this.#driver.coast();
      this.#driver.setEnabled(false);
      this.#driver.dispose();
    } catch (error) {
      this.#log?.error({ err: error }, 'motor dispose failed');
    }
  }

  #applyHoldThenCoast(now: number, mode: RobotMode): void {
    if (now < this.#holdBrakeUntil) {
      this.#applyOutgoing('brake');
    } else {
      this.#applyOutgoing('coast');
      this.#currentLeft = 0;
      this.#currentRight = 0;
    }
    this.#setMode(mode);
  }

  #applyOutgoing(next: Outgoing): void {
    if (sameOutgoing(this.#lastOutgoing, next)) {
      return;
    }
    if (next === 'brake') {
      this.#driver.brake();
    } else if (next === 'coast') {
      this.#driver.coast();
    } else {
      this.#driver.setMotor('left', next.left);
      this.#driver.setMotor('right', next.right);
    }
    this.#lastOutgoing = next;
  }

  #setMode(mode: RobotMode): void {
    if (this.#mode === mode) {
      return;
    }
    this.#mode = mode;
    this.#onStateChange?.(this.getState());
  }

  #enterFault(error: unknown): void {
    this.#fault = true;
    this.#mode = 'fault';
    this.#log?.error({ err: error }, 'motor driver fault');
    try {
      this.#driver.coast();
      this.#lastOutgoing = 'coast';
    } catch {
      // best effort
    }
    this.#onStateChange?.(this.getState());
  }
}

/** Limit acceleration; never limit deceleration or reversal-to-zero. */
export function rampAxis(
  current: number,
  target: number,
  dtMs: number,
  rampMs: number,
): number {
  if (rampMs <= 0 || dtMs <= 0) {
    return target;
  }
  // Deceleration / stop: immediate.
  if (
    Math.abs(target) <= Math.abs(current) &&
    Math.sign(target) === Math.sign(current)
  ) {
    return target;
  }
  if (target === 0) {
    return 0;
  }
  // Reversal: go to zero immediately (next ticks ramp the other way).
  if (current !== 0 && Math.sign(target) !== Math.sign(current)) {
    return 0;
  }
  const maxStep = dtMs / rampMs;
  const delta = target - current;
  if (Math.abs(delta) <= maxStep) {
    return target;
  }
  return current + Math.sign(delta) * maxStep;
}

function sameOutgoing(a: Outgoing | null, b: Outgoing): boolean {
  if (a === null) {
    return false;
  }
  if (a === 'brake' || a === 'coast' || b === 'brake' || b === 'coast') {
    return a === b;
  }
  return a.left === b.left && a.right === b.right;
}
