# 开发指南（DEVELOPMENT）

## 环境

- **Node** ≥ 22.22.1（`engines` 下限：lint-staged 17 要求 ≥22.22.1；CI 固定 22；Electron 43 运行时自带 Node 24.18）——推荐 nvm（仓库有 `.nvmrc`）
- **主开发环境**：WSL2（Linux）；macOS 用于真机验收
- **monorepo 布局**：仓库根无 `package.json`，所有工程命令在 `apps/desktop` 下执行

## 安装与启动

```bash
cd apps/desktop
npm ci          # 按锁文件安装（可复现构建）
npm run dev     # 开发模式（vite + electron）
npm start       # 以已构建产物启动 electron
```

> **`npm ci` 之后需要手动装 Electron 二进制**（仅当要跑 Electron 真机/L3/L4/探针时）。
> electron 43 的 npm 包**没有 postinstall 脚本**（`package.json` 的 `scripts` 为空），
> 二进制只在首次 `require('electron')` 时由 `node_modules/electron/index.js` 懒下载。
> 干净安装后直接跑 `npm start` / 产品探针会报 `electron binary missing`。
>
> ```bash
> # 走镜像（install.js 不读 .npmrc 的 electron_mirror，必须用环境变量）
> ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node node_modules/electron/install.js
> ls node_modules/electron/dist/            # Linux: electron；macOS: Electron.app
> ```
>
> 纯 L1/L2/L3(Playwright) 不需要该二进制——`vitest.config.ts` 用
> `ELECTRON_OVERRIDE_DIST_PATH` 主动切断懒下载，单测不会触发 100MB 下载。

## 验证链

| 层          | 命令（均在 `apps/desktop` 下）                                                |
| ----------- | ----------------------------------------------------------------------------- |
| L1 单元     | `npx vitest run`                                                              |
| L2 类型     | `npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.main.json --noEmit` |
| L2b 测试类型 | `npx tsc -p tsconfig.tests.json --noEmit`（tests/unit 与其引用的 src）         |
| L3 交互     | `npx playwright test --project=interaction`                                   |
| Lint / 格式 | `npx eslint .` · `npm run format:check`                                       |
| L4 端到端   | e2e 脚本（自动检测 main/preload 产物过期并重 build）                          |
| 打包        | `npm run dist`（electron-builder）                                            |

全量命令清单以 `apps/desktop/package.json` `scripts` 为准。

## 构建与产物

- `dist/`——main / preload / renderer 构建产物（e2e 直接加载，入口脚本会自动检测过期）
- 打包只含 `dist/**` + `package.json`（+ `extraResources` 的 LSP server）。monaco/react 是
  **devDependencies**：Vite 已把它们打进 `dist/renderer`，运行期不需要在 `node_modules` 里再放一份
  （否则 asar 会从 11 MB 膨胀到 113 MB）

## 上下文与约定

- **新会话 / 接手**：先读 `HANDOFF.md`；历史周期与已修坑在 `HANDOFF-ARCHIVE/`
- **文档权威与防双源**：见 `AGENTS.md`
- **私有材料**（`.scratch/` · `research/` · `scripts/` · `HANDOFF*`）经 `.git/info/exclude` 排除，不入库
