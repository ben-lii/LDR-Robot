/**
 * Userspace software PWM for arbitrary GPIO lines.
 * Good enough for N20 + DRV8833; timing is best-effort (Node timers).
 */

export type DigitalOut = {
  write(level: 0 | 1): void;
  close(): void;
};

type Channel = {
  pin: DigitalOut;
  /** When true, pin is held at staticLevel (no PWM). */
  staticMode: boolean;
  staticLevel: 0 | 1;
  /** Duty 0..1 when not in static mode. */
  duty: number;
  offTimer: ReturnType<typeof setTimeout> | null;
};

/** Soft PWM above this tends to be unreliable with setTimeout; clamp quietly. */
export const SOFT_PWM_MAX_HZ = 400;

export class SoftPwmEngine {
  readonly #periodMs: number;
  readonly #channels = new Map<string, Channel>();
  #tickTimer: ReturnType<typeof setTimeout> | null = null;
  #running = false;
  #disposed = false;
  readonly frequencyHz: number;

  constructor(frequencyHz: number) {
    const hz = Math.max(1, Math.min(SOFT_PWM_MAX_HZ, Math.round(frequencyHz)));
    this.frequencyHz = hz;
    this.#periodMs = 1000 / hz;
  }

  attach(id: string, pin: DigitalOut): void {
    this.#ensureLive();
    if (this.#channels.has(id)) {
      throw new Error(`SoftPwmEngine: duplicate channel ${id}`);
    }
    pin.write(0);
    this.#channels.set(id, {
      pin,
      staticMode: true,
      staticLevel: 0,
      duty: 0,
      offTimer: null,
    });
  }

  /** Hold a constant level (cancels PWM on that channel). */
  setStatic(id: string, level: 0 | 1): void {
    const ch = this.#channel(id);
    this.#clearOff(ch);
    ch.staticMode = true;
    ch.staticLevel = level;
    ch.duty = 0;
    ch.pin.write(level);
  }

  /** PWM duty 0..1 (0 = low, 1 = high). */
  setDuty(id: string, duty01: number): void {
    const ch = this.#channel(id);
    const duty = Math.min(1, Math.max(0, duty01));
    ch.staticMode = false;
    ch.duty = duty;
    if (duty <= 0) {
      this.#clearOff(ch);
      ch.pin.write(0);
      return;
    }
    if (duty >= 1) {
      this.#clearOff(ch);
      ch.pin.write(1);
      return;
    }
    this.#ensureRunning();
  }

  start(): void {
    this.#ensureLive();
    this.#ensureRunning();
  }

  /** Drive every channel low and stop the tick loop. */
  stopAllLow(): void {
    if (this.#disposed) {
      return;
    }
    this.#stopTick();
    for (const ch of this.#channels.values()) {
      this.#clearOff(ch);
      ch.staticMode = true;
      ch.staticLevel = 0;
      ch.duty = 0;
      try {
        ch.pin.write(0);
      } catch {
        // ignore — dispose / fail-safe
      }
    }
  }

  /** Hold every channel high (DRV8833 brake). */
  setAllHigh(): void {
    this.#ensureLive();
    this.#stopTick();
    for (const ch of this.#channels.values()) {
      this.#clearOff(ch);
      ch.staticMode = true;
      ch.staticLevel = 1;
      ch.duty = 0;
      ch.pin.write(1);
    }
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.stopAllLow();
    for (const ch of this.#channels.values()) {
      try {
        ch.pin.close();
      } catch {
        // ignore
      }
    }
    this.#channels.clear();
    this.#disposed = true;
  }

  #channel(id: string): Channel {
    this.#ensureLive();
    const ch = this.#channels.get(id);
    if (!ch) {
      throw new Error(`SoftPwmEngine: unknown channel ${id}`);
    }
    return ch;
  }

  #ensureLive(): void {
    if (this.#disposed) {
      throw new Error('SoftPwmEngine disposed');
    }
  }

  #ensureRunning(): void {
    if (this.#running || this.#disposed) {
      return;
    }
    this.#running = true;
    this.#scheduleTick();
  }

  #stopTick(): void {
    this.#running = false;
    if (this.#tickTimer !== null) {
      clearTimeout(this.#tickTimer);
      this.#tickTimer = null;
    }
  }

  #clearOff(ch: Channel): void {
    if (ch.offTimer !== null) {
      clearTimeout(ch.offTimer);
      ch.offTimer = null;
    }
  }

  #scheduleTick(): void {
    this.#tickTimer = setTimeout(() => {
      this.#tickTimer = null;
      this.#onTick();
    }, this.#periodMs);
  }

  #onTick(): void {
    if (!this.#running || this.#disposed) {
      return;
    }

    let needsPwm = false;
    const period = this.#periodMs;

    for (const ch of this.#channels.values()) {
      this.#clearOff(ch);
      if (ch.staticMode) {
        ch.pin.write(ch.staticLevel);
        continue;
      }
      if (ch.duty <= 0) {
        ch.pin.write(0);
        continue;
      }
      if (ch.duty >= 1) {
        ch.pin.write(1);
        continue;
      }
      needsPwm = true;
      ch.pin.write(1);
      const highMs = period * ch.duty;
      ch.offTimer = setTimeout(() => {
        ch.offTimer = null;
        if (!this.#disposed && !ch.staticMode && ch.duty > 0 && ch.duty < 1) {
          ch.pin.write(0);
        }
      }, highMs);
    }

    if (needsPwm) {
      this.#scheduleTick();
    } else {
      this.#running = false;
    }
  }
}
