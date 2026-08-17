# Product Hunt / 渠道发布素材（NeonForge 草稿）

> 2026-08-16（#5 产出草稿——待发布时取用；PH 发布通常配合 Landing 上线后）
> 标语参考：你之所向，我之所往；你之所定，我之所行

## Product Hunt

- **名称**：NeonForge
- **副标题（tagline）**：AI Problem Workbench for DeepSeek — say what's blocking you, get it solved.（每一步经你确认，结果可验证）
- **Description（PH 卡片主文案，约 1-2 句）**：
  > NeonForge is an AI problem workbench for DeepSeek: describe the problem in plain language,
  > the agent drives engineering/design/orchestration — every step gated by confirmation cards,
  > step-by-step approval, and verifiable results. Non-coders get artifacts + guidance;
  > developers get a tight approval loop.
- **First comment（发布人开场——工程故事）**：
  > We built NeonForge to answer one question: can a non-coder "say the problem and get the result"
  > with a real approval loop standing guard? Three design decisions shaped it —
  > confirmation cards as progression gates, host-enforced write boundaries (approved file plan,
  > survives restarts), and single-model deep integration (KV-cache preheating: first-token 275ms → 118ms).
  > Our design-notes series covers each: [link Blog 1 预热] [link Blog 2 LSP 精准注入] [link Blog 3 只做 DeepSeek].
  > Roadmap is public on GitHub Issues (label `roadmap`).
- **首图（Gallery）**：主界面截图（对话+确认卡+授权卡+文件树）/ 迷你流程动图（说出问题→确认→交付）
- **标记**：Mac · Developer Tools · AI Agent
- **Topics**：DeepSeek · Agent · AI Tools

## 渠道（备选/平行）

| 渠道 | 内容 | 平台字段 |
|------|------|---------|
| HN（Show HN） | 标题：Show HN: NeonForge — AI problem workbench for DeepSeek（确认卡门槛 + 批准文件计划）| 同上工程故事 + 下载直链 |
| Twitter/X | 短帖 + 动图 | 标语 + Releases 链接 + Roadmap 链接 |
| Reddit（r/LocalLLaMA / r/aiagents） | 技术向：单模型深度集成 + KV 预热实测 | 同上 |
| 中文社区（知乎/掘金） | Blog 系列中文版发布 | 平台后定 |

## 待拍板/待补

- PH 发布时间（配合 Landing + waitlist 上线后）
- 主界面截图/动图（需应用内录屏——真机）
- 图标（当前默认 Electron 图标——正式发布前可补自定义图标）
- 中文平台（Blog）与英文平台（PH/HN）的节奏
