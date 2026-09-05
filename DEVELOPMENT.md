# 开发指南（DEVELOPMENT）

## 环境

- **Node** ≥ 20（推荐 nvm 管理当前 LTS）
- **主开发环境**：WSL2（Linux）；macOS 用于真机验收
- **monorepo 布局**：仓库根无 `package.json`，所有工程命令在 `apps/desktop` 下执行

## 安装与启动

```bash
cd apps/desktop
npm ci          # 按锁文件安装（可复现构建）
npm run dev     # 开发模式（vite + electron）
npm start       # 以已构建产物启动 electron
```

## 验证链

| 层          | 命令（均在 `apps/desktop` 下）                                                |
| ----------- | ----------------------------------------------------------------------------- |
| L1 单元     | `npx vitest run`                                                              |
| L2 类型     | `npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.main.json --noEmit` |
| L3 交互     | `npx playwright test --project=interaction`                                   |
| Lint / 格式 | `npx eslint .` · `npm run format:check`                                       |
| L4 端到端   | e2e 脚本（自动检测 main/preload 产物过期并重 build）                          |
| 打包        | `npm run dist`（electron-builder）                                            |

全量命令清单以 `apps/desktop/package.json` `scripts` 为准。

## 构建与产物

- `dist/`——main / preload / renderer 构建产物（e2e 直接加载，入口脚本会自动检测过期）
- electron 镜像下载走 `.npmrc` 配置的镜像源

## 上下文与约定

- **新会话 / 接手**：先读 `HANDOFF.md`；历史周期与已修坑在 `HANDOFF-ARCHIVE/`
- **文档权威与防双源**：见 `AGENTS.md`
- **私有材料**（`.scratch/` · `research/` · `scripts/` · `HANDOFF*`）经 `.git/info/exclude` 排除，不入库
