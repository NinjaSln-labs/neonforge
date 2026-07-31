import { defineConfig } from '@playwright/test'

// pixel-perfect 视觉回归：renderer 走 dev server（Web 形态，验证 UI 层）
export default defineConfig({
  testDir: './tests/visual',
  testMatch: '**/*.visual.ts',
  snapshotDir: './snapshots',
  snapshotPathTemplate: '{snapshotDir}/{testFilePath}/{arg}{ext}',
  fullyParallel: true,
  workers: 1, // 截图确定性
  retries: 0, // 视觉回归不重试（重试会覆盖 diff 产物）
  webServer: {
    command: 'npx vite --config vite.config.ts',
    url: 'http://localhost:5173',
    reuseExistingServer: true
  },
  use: {
    baseURL: 'http://localhost:5173',
    browserName: 'chromium',
    viewport: { width: 1280, height: 800 },
    expect: {
      toHaveScreenshot: {
        maxDiffPixels: 100,
        maxDiffPixelRatio: 0.01,
        threshold: 0.2,
        animations: 'disabled'
      }
    }
  }
})
