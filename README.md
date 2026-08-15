# NeonForge

> 为 DeepSeek 打造的 **AI 问题工作台**：说出你当前的问题，拿到结果。一切能被数字工具解决的：文件整理、小工具、网站、系统修复、0-1 交付。

NeonForge 不是 IDE，也不是 Chatbot。你用自然语言描述问题，工程/设计/编排由它内在推进——**分步授权**、**结果可验证**、超出数字能力时交付产物 + 分步指导（不装能、不半吊子）。

**谁在用**：不会写代码的人（说出问题 → 拿到结果 + 指导）· 开发者（异常修复 / 0-1 交付，授权闭环）。

**核心流**：`说出问题 → 澄清 → 分步授权 → 解决 → 交付（产物 / 修复闭环）→ 反馈 + 指导继续`

> English: [README.en.md](README.en.md)

<video controls width="720" src="demo/neonforge-demo.mov" title="NeonForge 核心流演示（真实 API 录制——首次配置 → 打开项目 → 两轮对话）">
  你的浏览器不支持 video 标签——<a href="demo/neonforge-demo.mov">下载演示视频</a>。
</video>

---

## 功能亮点

1. **KV 缓存预热**：打开项目即预热提示前缀，首字延迟 ~0.1s（真实 API 实测：冷启动 275ms → 预热命中 118ms）
2. **精准上下文（1M 预算思路）**：真实 LSP（定义/引用/类型/诊断）+ CodeRAG 关键词检索 + `@引用` 文件注入——不倾倒垃圾 token
3. **快照与回滚**：每次写入前快照（`.nf-bak`）→ 可一键回滚；交付包批量接受
4. **信任阶梯授权**：L1 观察 → L2 建议 → L3 操作（逐项授权 + 风险明示 + 写前备份）→ L4 委托（低危自动授权，可随时撤销）；疲劳防护（批量合并授权，高危命令永远单独确认）；任何时刻可停止/撤销
5. **问题 = 一等公民**：问题台账 + 会话快照（目标/已决策/已授权/待办）+ 断点续做 + 复跑
6. **长对话不丢**：自动压缩（真实摘要 + 保留最近 20 条）
7. **单实例**：重复启动聚焦已有窗口

## 快速上手

> 需要 DeepSeek API Key（`https://platform.deepseek.com` 获取）。

```bash
cd apps/desktop
npm install                # 安装依赖（Electron 下载失败见下方镜像）
npm run dev                # 仅 renderer dev server（:5173）
npm run dev:electron       # 完整应用（dev 模式，连接 :5173）
```

- 首次启动在「设置」中粘贴 API Key（Key 存系统级 `safeStorage`，绝不上传）
- 「打开已有项目」→ 在对话里说出问题 → 分步授权 → 拿到交付结果
- 「从零开始」→ 自动创建项目骨架 → 0-1 交付

### 打包安装

```bash
cd apps/desktop
npm run dist               # 产出 release/（macOS: .dmg + .zip；win: .nsis；linux: AppImage）
```

> **ExFAT/外置卷已知问题**：electron-builder 在 ExFAT 卷打包会生成损坏的 asar（`chromium-pickle` offset 越界）——仓库在 ExFAT 卷时输出到本地卷：`npm run build && npx electron-builder -c.directories.output=/tmp/nf-release`
>
> macOS 未签名版本首次打开需右键 → 打开（Gatekeeper 提示）。代码签名/公证列入后续路线。

### 测试

```bash
npx vitest run                            # L1 领域逻辑（257）
npx tsc -p tsconfig.json --noEmit         # L2 契约（renderer + main）
npx playwright test --project=interaction # L3 组件交互（25）
npx playwright test                       # L5 视觉 + L3
NF_TEST_KEY=<key> node e2e-suite.mjs      # L4 真实 API E2E（前置：mkdir -p /tmp/nf-e2e-test）
```

### 镜像（Electron 下载失败时）

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node install.js
```

## 技术栈与架构

**技术栈**：Electron 36 + React 19 + TypeScript + Vite + esbuild + Monaco（产物查看）+ Vitest + Playwright。V1 网关仅接 DeepSeek。

**领域架构（无阶段·目标驱动）**：

```
Conversation BC（核心域） — 目标状态机 · 确认点（目标/执行/达成确认卡）· 执行保障（forceTool）· 会话级单一 PENDING
Capability BC            — 环境检测（事实来源）· 能力视图（从环境推导）
Workspace BC             — 项目文件 · 计划清单（宿主强制边界）· 授权裁决 + 任务级信任
Delivery BC              — 交付包（产物+验收对照+确认关闭）· DoD 对齐 · 快照回滚
Session Timeline BC      — 全步骤统一记录（可观测性）
```

## 文档

| 文档 | 说明 |
|------|------|
| `docs/product/00-product-design.md`（D0） | 产品设计总纲 |
| `docs/domain/00-domain-authority.md`（A0） | 领域实现权威 |
| `.agents/product-marketing.md` | 定位 / ICP / 差异化 |

完整索引：`docs/product/`（D0-D9）与 `docs/domain/`（A0-A9）。

## 已知限制（V1）

- **打包版 LSP 降级**：dev 模式 LSP 完整可用；打包版若系统未装 `typescript-language-server` 则 LSP 工具提示未连接——对话/工具/交付主链路不受影响
- macOS 未签名（见上）；Windows/Linux 打包目标已配置未实测
- 单实例锁按应用作用域；测试环境注意残留实例（见 CI 脚本）

## 贡献指南

1. Fork + 新分支（`feat/xxx` 或 `fix/xxx`）
2. 改动前先读 `docs/domain/00-domain-authority.md`（A0 实现权威）
3. 改动后质量链全绿再提 PR：`npx vitest run` + `npx tsc -p tsconfig.json --noEmit` + 相关 L3/L5
4. 安全约定：Key 不落盘不上传；写操作先快照；IPC 参数校验

---

**License**：MIT（见 [LICENSE](LICENSE)）· **联系**：GitHub Issues
