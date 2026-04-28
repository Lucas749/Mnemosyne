import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    // integration tests hit the real 0G testnet — give them room
    testTimeout: 60_000,
    hookTimeout: 30_000,
  },
})
