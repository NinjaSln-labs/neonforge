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
  // flake 治理（2026-10-03 三层）：retries 0 的理由仅 visual 成立（重试覆盖 diff 产物）；
  // interaction 归因轮（retries=0 三层前两层）亦保持 0——L3 retries 经归因批后条件启用（计划 T6）
  retries: 0,
  webServer: {
    command: 'npx vite --config vite.config.ts --port 5175 --strictPort',
    url: 'http://localhost:5175',
    reuseExistingServer: !process.env.CI, // CI 强制新起——防旧树服务（cards440 归因先例）
  },
  use: {
    baseURL: 'http://localhost:5175',
    browserName: 'chromium',
    viewport: { width: 1280, height: 800 },
    expect: {
      toHaveScreenshot: {
        maxDiffPixels: 100,
        maxDiffPixelRatio: 0.01,
        threshold: 0.2,
        animations: 'disabled',
      },
    },
  },
  projects: [
    {
      name: 'warmup', // L2 预热：vite 按需编译发生在首个浏览器页面（webServer 探活只测端口）——
      // 冷编译类 flake 根治位；setup project 由 runner 保证 webServer 就绪后才跑（复核 D2 取代 globalSetup：
      // App.tsx:21-25 无桥不挂 .nf-start，裸预热必炸）
      testDir: './tests/interaction',
      testMatch: '**/warmup.setup.ts',
      retries: 2, // 防一次预热失败全停（复核 D9）
    },
    {
      name: 'visual', // L5 视觉回归（像素基线）
      testDir: './tests/visual',
      testMatch: '**/*.visual.ts',
      dependencies: ['warmup'],
    },
    {
      name: 'interaction', // L3 组件交互（无截图——CI 可跑）
      testDir: './tests/interaction',
      testMatch: '**/*.interaction.ts',
      dependencies: ['warmup'],
      timeout: 60000, // 挂载门 15s＋长链步骤叠加——防新型 test-timeout flake（复核 D5；默认 30s 偏紧）
      use: {
        // L1 定向超时：15s 覆盖全部无参裸 expect(...).toBeVisible()（.nf-start 挂载点——冷 vite/负载轮实测 >5s）
        expect: { timeout: 15000, toHaveScreenshot: undefined }, // 截图断言禁用（L3 无像素基线）
      },
    },
  ],
})
