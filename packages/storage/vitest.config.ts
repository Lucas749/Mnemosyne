import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 60_000,
    hookTimeout: 30_000,
    setupFiles: ['./src/__tests__/setup.ts'],
    // run files one at a time — prevents nonce collisions when tests
    // submit concurrent transactions to the same wallet on 0G testnet
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
})
