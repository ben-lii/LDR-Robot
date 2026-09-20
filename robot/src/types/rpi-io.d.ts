/**
 * Minimal typings for the optional `rpi-io` native module (Pi / libgpiod).
 */
declare module 'rpi-io' {
  export class RIO {
    constructor(
      gpio: number,
      mode: string,
      options?: {
        value?: number;
      },
    );
    write(level: number): void;
    close(): void;
  }
}
