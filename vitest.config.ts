import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: [
      'packages/*/tests/**/*.test.ts',
      'examples/**/tests/**/*.test.ts',
    ],
  },
  resolve: {
    alias: {
      '@simple-agents/core': path.resolve(__dirname, './packages/core/src/index.ts'),
      '@simple-agents/adapters': path.resolve(__dirname, './packages/adapters/src/index.ts'),
    },
  },
});

