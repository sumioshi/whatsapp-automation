import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['scripts/**/*.test.ts', 'web/lib/**/*.test.ts'],
    environment: 'node',
  },
});
