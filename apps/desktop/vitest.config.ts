import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/static/**/*.test.ts', 'tests/e2e/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/._*'],
    environment: 'node',
  },
})
