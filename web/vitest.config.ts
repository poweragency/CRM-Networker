import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Vitest config — unit tests for pure, dependency-light logic (no DB/DOM).
 * The `@` alias mirrors tsconfig so tests import app modules the same way the app
 * does. Run with `npm test` (also wired into CI).
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
});
