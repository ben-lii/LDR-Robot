export type Side = 'left' | 'right';

export interface MotorDriver {
  /** signed = -1..1 (sign = direction, magnitude = speed fraction BEFORE min-duty). */
  setMotor(side: Side, signed: number): void;
  brake(): void;
  coast(): void;
  setEnabled(on: boolean): void;
  /** Coast, disable, release GPIO. Must be idempotent. */
  dispose(): void;
}
