import { defineConfig } from '@playwright/test'

// NeonForge 质量链：
// - L5 视觉回归（pixel-perfect 截图——macOS 基线，本地跑；CI Linux 渲染不同 → 不进 CI）
// - L3 组件交互测试（纯 DOM 断言无截图——跨平台稳定，CI 可跑；ddd-qa-chain 缺层 2026-08-02 补）
export default defineConfig({
  testDir: './tests',
  testMatch: /\.(visual|interaction)\.ts$/,
  testIgnore: '**/._*', // macOS AppleDouble 元数据文件——不匹配（坑 10）
  snapshotDir: './snapshots',
  snapshotPathTemplate: '{snapshotDir}/{testFilePath}/{arg}{ext}',
  fullyParallel: true,
  workers: 1, // 截图确定性
  retries: 0, // 视觉回归不重试（重试会覆盖 diff 产物）
  webServer: {
    command: 'npx vite --config vite.config.ts --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: true
  },
  use: {
    baseURL: 'http://localhost:5174',
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
  },
  projects: [
    {
      name: 'visual', // L5 视觉回归（像素基线）
      testDir: './tests/visual',
      testMatch: '**/*.visual.ts'
    },
    {
      name: 'interaction', // L3 组件交互（无截图——CI 可跑）
      testDir: './tests/interaction',
      testMatch: '**/*.interaction.ts',
      use: { expect: { toHaveScreenshot: undefined } } // 禁用截图断言（L3 无像素基线）
    }
  ]
})
