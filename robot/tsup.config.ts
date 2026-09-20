import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  clean: true,
  splitting: false,
  dts: false,
  // Bundle the protocol package; keep native optional deps external.
  noExternal: ['@teleop/protocol'],
  external: ['pigpio', 'rpi-io'],
});
