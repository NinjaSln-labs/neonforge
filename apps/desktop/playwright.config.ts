import { defineConfig } from '@playwright/test'

// NeonForge 质量链：
// - L5 视觉回归（pixel-perfect 截图——macOS 基线，本地跑；CI Linux 渲染不同 → 不进 CI）
// - L3 组件交互测试（纯 DOM 断言无截图——跨平台稳定，CI 可跑；ddd-qa-chain 缺层 2026-08-02 补）
// L5 基线：只在 macOS 更新（npx playwright test --project=visual --update-snapshots）。
// WSL/Linux 渲染 ≠ 基线宿主——禁止在非 Mac 上 update 后入库（K8）。
export default defineConfig({
  testDir: './tests',
  testMatch: /\.(visual|interaction)\.ts$/,
  testIgnore: '**/._*', // macOS AppleDouble 元数据文件——不匹配（坑 10）
  snapshotDir: './snapshots',
  snapshotPathTemplate: '{snapshotDir}/{testFilePath}/{arg}{ext}',
  fullyParallel: true,
  workers: 1, // 截图确定性
  retries: 0, // 视觉回归不重试（重试会覆盖 diff 产物）
  timeout: 90_000, // WSL 下 Vite 首次模块图编译常 >30s（默认单测超时会先于断言超时触发）
  // 断言超时必须放顶层（use.expect 不是 Playwright 有效选项——放 use 里会被静默忽略 → 直接 expect 仍用 5s 默认，
  // Vite 冷模块编译下 .nf-start 等直接断言偶发超时）。
  expect: {
    timeout: 30_000,
    toHaveScreenshot: {
      maxDiffPixels: 100,
      maxDiffPixelRatio: 0.01,
      threshold: 0.2,
      animations: 'disabled',
    },
  },
  webServer: {
    command: 'npx vite --config vite.config.ts --port 5175 --strictPort',
    url: 'http://localhost:5175',
    reuseExistingServer: true,
  },
  use: {
    baseURL: 'http://localhost:5175',
    browserName: 'chromium',
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    {
      name: 'visual', // L5 视觉回归（像素基线）
      testDir: './tests/visual',
      testMatch: '**/*.visual.ts',
    },
    {
      name: 'interaction', // L3 组件交互（无截图——CI 可跑）
      testDir: './tests/interaction',
      testMatch: '**/*.interaction.ts',
    },
  ],
})
