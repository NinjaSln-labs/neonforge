# NeonForge

> 为 DeepSeek 打造的 **AI 问题工作台**：说出你当前的问题，拿到结果。帮用户解决当前的问题——一切能被数字工具解决的。

**产品定位**：AI 问题工作台（非 IDE、非 Chatbot）——对话进入 · 分步授权 · 内在工程/设计/编排自动推进 · 交付可验证结果 · 超出数字能力部分给产物 + 指导（不装能）。

**谁在用**：不会写代码的人（说出问题 → 被解决 → 拿到数字产物 + 指导）· 开发者（异常修复 / 0-1 交付，授权闭环）。

**核心流**：`说出问题 → 分析 → 分步授权 → 解决 → 交付结果（数字产物/修复闭环）→ 反馈 + 指导继续`

<video controls width="720" src="demo/neonforge-demo.mov" title="NeonForge 核心流演示（真实 API 录制——首次配置 → 打开项目 → 两轮对话）">
  你的浏览器不支持 video 标签——<a href="demo/neonforge-demo.mov">下载演示视频</a>。
</video>

---

## 当前状态（2026-08-03）

- **工程：tickets 01-15 全部收官**（信任阶梯 / 授权执行 / 可撤销 / 断点续做 / 交付包 / 0-1 编排 / Compaction / ContextEngine / LSP / CodeRAG / 预热 全链路落地）
- **质量链全绿**：L1 Vitest 88 · L2 tsc 0 错 · L3 组件交互 8 · L4 真实 Key E2E 10/10 · L5 视觉 47（39 visual + 8 interaction）
- **V1 门禁**：D0 §11 包含项 12/12 实现，无越界

## 功能亮点

1. **缓存预热**：打开项目即预热，首字延迟 ~0.1s（真实 API 实测：冷启动 275ms → 预热后 KV 命中 118ms，达标 D8 ≤500ms）
2. **精准上下文（1M 预算思路）**：LSP 真实连接（definition/references/type/diagnostics）+ CodeRAG 关键词检索 + `@引用` 文件注入——不倾倒垃圾 token
3. **Diff 审核写入**：写操作先快照（`.nf-bak`）→ 审核 → 应用 → 可一键回滚；交付包批量接受
4. **信任阶梯授权**：L1 观察 → L2 建议 → L3 操作（逐项授权 + 快照提示 + 风险明示）→ L4 委托（低危自动授权可撤销）；疲劳防护（批量合并授权，高危命令单独确认）；任何时刻可停止/撤销
5. **问题 = 一等公民**：问题台账 + 会话快照（目标/已决策/已授权/待办）+ 断点续做 + 复跑
6. **长对话不丢**：Compaction 自动压缩（真实摘要 + 保留最近 20 条）
7. **单实例**：同时只运行一个应用，重复启动聚焦已有窗口

## 快速上手

> 需要 DeepSeek API Key（`https://platform.deepseek.com` 获取）。

```bash
cd apps/desktop
npm install                # 依赖（Electron 下载失败见下方镜像）
npm run dev                # 仅 renderer dev server（:5173）
npm run dev:electron       # 完整应用（dev 模式，连接 :5173）
```

- 首次启动在「设置」中粘贴 API Key（Key 存本地 safeStorage，不上传）
- 「打开已有项目」→ 在对话里说出问题 → 分步授权 → 拿到交付结果
- 「从零开始」→ 自动创建项目骨架 → 0-1 交付（阶段指引 + 交付包验收）

### 打包安装

```bash
cd apps/desktop
npm run dist               # 产出 release/（macOS: .dmg + .zip；win: .nsis；linux: AppImage）
```

> **ExFAT/外置卷已知问题**：electron-builder 在 ExFAT 卷打包会生成损坏的 asar（报 `chromium-pickle` offset 越界）——仓库在 ExFAT 卷时指定输出到本地卷：`npm run build && npx electron-builder -c.directories.output=/tmp/nf-release`
>
> macOS 未签名版本首次打开需右键 → 打开（Gatekeeper 提示）。代码签名/公证列入后续路线。

### 测试

```bash
npx vitest run                          # L1 领域逻辑（88）
npx tsc -p tsconfig.json --noEmit       # L2 契约
npx playwright test --project=interaction # L3 组件交互（8）
npx playwright test                     # L5 视觉 + L3（47）
NF_TEST_KEY=<key> node e2e-suite.mjs    # L4 真实 Key E2E（前置：mkdir -p /tmp/nf-e2e-test）
```

### 镜像（Electron 下载失败时）

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node install.js
```

## 技术栈与架构

**技术栈**：Electron 36 + React 19 + TypeScript + Vite + esbuild + Monaco（产物查看） + Vitest + Playwright

**四层领域架构**：

```
Engineering   — AgentChain 流水线 → DiffApply → ChangeSet 交付
Orchestrate   — Compaction · PrefixCache · ContextEngine · Preheating
Design        — 信任阶梯授权 · 推理可视化 · 交付包验收
Code          — ToolRegistry · DeepSeekGateway · PluginSystem · LSP
```

## 文档

| 文档 | 说明 |
|------|------|
| `docs/product/00-product-design.md`（D0） | 产品设计总纲 |
| `docs/domain/00-domain-authority.md`（A0） | 领域实现权威 |
| `.agents/product-marketing.md` | 定位 / ICP / 差异化 |
| `.scratch/launch/launch-plan.md` | 发布计划（五阶段 + ORB 渠道）|

产品/领域文档全索引见 `docs/product/` 与 `docs/domain/`（D0-D9 / A0-A9）。

## Known Limitations（V1）

- **打包版 LSP 降级**：dev 模式 LSP 完整可用（查符号定义/引用/类型）；打包版若系统未装 `typescript-language-server` 则 LSP 工具提示未连接——对话/工具/交付主链路不受影响
- macOS 未签名（见上）；Windows/Linux 打包目标已配置未实测
- 单实例锁按应用作用域；测试环境注意残留实例（见 CI 脚本）

## 贡献指南

1. Fork + 新分支（`feat/xxx` 或 `fix/xxx`）
2. 改动前先读 `docs/domain/00-domain-authority.md`（A0 实现权威）与对应 ticket（`.scratch/neonforge-v1/issues/`）
3. 改动后质量链全绿再提 PR：`npx vitest run` + `npx tsc -p tsconfig.json --noEmit` + 相关 L3/L5
4. 安全约定：Key 不落盘不上传；写操作先快照；IPC 参数校验

---

**License**：MIT（见 [LICENSE](LICENSE)）· **Contact**：GitHub Issues
