import { defineConfig } from '@playwright/test'

// 渲染器 UI 性能基准专用配置：mock bridge、无视觉基线、单 worker。
export default defineConfig({
  testDir: './tests/perf',
  testMatch: /\.perf\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  webServer: {
    command: 'npx vite --config vite.config.ts --port 5176 --strictPort',
    url: 'http://localhost:5176',
    reuseExistingServer: true,
    timeout: 90_000,
  },
  use: {
    baseURL: 'http://localhost:5176',
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 800 },
    trace: 'off',
  },
})
