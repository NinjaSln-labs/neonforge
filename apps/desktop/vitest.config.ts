import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/._*'],
    environment: 'node',
    // 2026-11-28 CI 根因修复：electron 43 的 npm 包无 postinstall 脚本（二进制靠 node_modules/electron/index.js
    // 运行期懒下载，spawnSync 同步阻塞 25–48s）。干净安装（CI npm ci）后首个 import 到 'electron' 的单测
    // 会触发下载并撞 5s 测试超时（CI 日志实测：Downloading Electron binary... 紧邻 timelineFile/write 两测试超时）。
    // ELECTRON_SKIP_BINARY_DOWNLOAD 只对 install.js 生效，拦不住 index.js 的懒下载路径；
    // ELECTRON_OVERRIDE_DIST_PATH 在 index.js 中先于下载判定——指向不存在路径即彻底切断懒下载，且不影响 vi.mock('electron')。
    env: {
      ELECTRON_OVERRIDE_DIST_PATH: '/no-electron-binary-in-unit-tests',
    },
  },
})
