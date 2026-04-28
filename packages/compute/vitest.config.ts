import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 60_000,
    hookTimeout: 30_000,
    setupFiles: ['./src/__tests__/setup.ts'],
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
})
