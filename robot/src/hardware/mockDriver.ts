import type { Side } from './MotorDriver.js';
import type { MotorDriver } from './MotorDriver.js';
import type { Logger } from '../logger.js';

export type MockDriverCall =
  | { readonly op: 'setMotor'; readonly side: Side; readonly signed: number }
  | { readonly op: 'brake' }
  | { readonly op: 'coast' }
  | { readonly op: 'setEnabled'; readonly on: boolean }
  | { readonly op: 'dispose' };

export class MockMotorDriver implements MotorDriver {
  readonly calls: MockDriverCall[] = [];
  #disposed = false;
  #enabled = true;

  constructor(private readonly log?: Logger) {}

  setMotor(side: Side, signed: number): void {
    this.#ensureLive();
    this.calls.push({ op: 'setMotor', side, signed });
    this.log?.info({ side, signed }, 'mock motor setMotor');
  }

  brake(): void {
    this.#ensureLive();
    this.calls.push({ op: 'brake' });
    this.log?.info('mock motor brake');
  }

  coast(): void {
    if (this.#disposed) {
      return;
    }
    this.calls.push({ op: 'coast' });
    this.log?.info('mock motor coast');
  }

  setEnabled(on: boolean): void {
    if (this.#disposed) {
      return;
    }
    this.#enabled = on;
    this.calls.push({ op: 'setEnabled', on });
    this.log?.info({ on }, 'mock motor setEnabled');
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.calls.push({ op: 'coast' });
    this.calls.push({ op: 'setEnabled', on: false });
    this.calls.push({ op: 'dispose' });
    this.#enabled = false;
    this.#disposed = true;
    this.log?.info('mock motor dispose');
  }

  get enabled(): boolean {
    return this.#enabled;
  }

  clearCalls(): void {
    this.calls.length = 0;
  }

  #ensureLive(): void {
    if (this.#disposed) {
      throw new Error('MockMotorDriver disposed');
    }
  }
}
