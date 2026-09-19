import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      'server-only': path.join(root, 'src/test/server-only-stub.ts'),
      '@': path.join(root, 'src'),
    },
  },
});
