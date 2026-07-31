# Product Marketing Context

**Document version:** v1
**Last updated:** 2026-07-31

## Product Overview
**One-liner:** 专为 DeepSeek 打造的开源桌面 AI 编程 IDE——工程设计编排 IDE，不是聊天工具。
**What it does:** 用户打开项目，和"搭档"（AI）一起写代码：说想法 → 搭档分析方案 → 用户确认 → 搭档改 → 用户审核写入。
**Product category:** 桌面 AI 编程 IDE（AI Coding Agent 桌面客户端）
**Product type:** 开源 + 本地优先的桌面应用（Electron + React + Monaco + TypeScript + SQLite）
**Business model:** 开源（V1 免费）；收入方向待定（V2+ 可考虑 Pro 能力/插件市场/云端同步——当前未决）

## Target Audience
**Target companies:** 个体开发者 / 小团队（0–20 人）；开源项目维护者
**Decision-makers:** 开发者本人（自下而上工具选择，无企业采购流程）
**Primary use case:** 与 AI 搭档协作完成项目工程实现（分析→改代码→审核），尤其适合"不会写代码的人"做产品落地
**Jobs to be done:**
- 让 AI 帮我改代码但每一步我可控（不直接写文件）
- 用 DeepSeek 的便宜 + 1M 上下文做完整项目而不被上下文截断
- 不用学 IDE 指令、不注册，打开就能用
**Use cases:** 新项目从零搭建、存量项目改需求、非技术用户做产品原型落地

## Personas
| Persona | Cares about | Challenge | Value we promise |
|---------|-------------|-----------|------------------|
| 会写代码的开发者 | 效率、可控、上下文不丢 | 现有多模型客户端体验平庸、缓存无优化、prompt 臃肿 | DeepSeek 深度优化（预热+1M+推理可视化）、极简内核 |
| 不会写代码的人 | 可理解、不学操作 | 不知道代码在干嘛、怕改坏 | 页面预览 + 改动说明 + 非技术审核视图 |
| DeepSeek API 用户 | 便宜 + 效果 | 通用客户端没吃满 DeepSeek 红利 | PrefixCache 预热（首字 ~0.3s）、reasoning_content 可视化 |

## Problems & Pain Points
**Core problem:** 现有 AI 编程工具要么是通用多模型客户端（体验平庸、无深度优化），要么闭源付费（Cursor）、要么终端限定（Pi/DeepCode）
**Why alternatives fall short:**
- Cursor：闭源 + 付费 + 大 System prompt
- Reasonix：非开源、无 Compaction、单 Agent
- DeepCode：Python 7-Agent 固定流水线、无缓存优化
**What it costs them:** 上下文被截断重写、缓存零命中延迟高、改完不敢写文件、学不完的 IDE 指令
**Emotional tension:** 怕改坏代码、怕上下文丢失重来、怕工具绑死供应商

## Competitive Landscape
**Direct:** Cursor（闭源付费）、Reasonix（83K stars、DeepSeek 适配但不开源）、Windsurf
**Secondary:** 终端 CLI Agent（Pi、DeepCode、OpenCode）、VS Code + 插件组合
**Indirect:** 手动写代码 / 外包开发 / 让 AI 生成后手动粘贴

## Differentiation
**Key differentiators:**
- DeepSeek 深度优化：PrefixCache 预热（首字 ~0.3s）、1M 上下文预算、reasoning_content 全流程可视化
- LSP 先行上下文（确定性 70%）+ CodeRAG 兜底，零 token 成本精准注入
- 极简内核：核心 <5000 行、System prompt <300 tokens、4+6 工具
- 开源 + 本地优先 + 非技术用户可理解视图
**How we do it differently:** 只为一个模型做极致优化（不做多模型抽象妥协）
**Why that's better:** 选对模型的极致体验 > 所有模型都凑合
**Why customers choose us:** 便宜（DeepSeek）+ 快（预热）+ 可控（Diff 审核写入）+ 开源（不锁死）

## Objections
| Objection | Response |
|-----------|----------|
| 锁死 DeepSeek 供应商 | V1 深度适配换取极致体验；网关参数收敛一处，V2+ 可扩展 |
| 开源项目会不会烂尾 | 极简内核 + 插件化，社区可接力 |
| 比 Cursor 差远了？ | V1 聚焦 DeepSeek 用户刚需：便宜、快、可控、开源；不做多模型/并行摊大饼 |

**Anti-persona:** 需要企业级安全审计/团队管理/多模型 A/B 的企业客户（V2+ 再议）

## Switching Dynamics
**Push:** Cursor 越来越贵、Reasonix 不开源不透明、多模型客户端上下文频繁丢
**Pull:** 首字 0.3s 的缓存预热、1M 上下文从容、Diff 审核写入可控、开源可自审
**Habit:** 已熟悉 VS Code/Cursor 快捷键的开发者迁移成本
**Anxiety:** 新工具是否稳定、DeepSeek API 稳定性、开源项目维护活跃度

## Customer Language
**How they describe the problem:**
- "用 Cursor 每月 20 刀，还老烧上下文"
- "DeepSeek 便宜但没个好用的客户端"
- "AI 改完代码我不敢直接让它写"
**How they describe us:**
- "专吃 DeepSeek 红利的 IDE"
- "AI 改代码先给我看 diff"
**Words to use:** 搭档、可控、预热、1M 上下文、审核写入、开源本地优先
**Words to avoid:** 多模型、兼容所有、云同步、企业版（V1 不做）
**Glossary:**
| Term | Meaning |
|------|---------|
| 搭档 | 内置 AI 协作者（第一人称"我"，称用户"你"） |
| 预热 | 打开项目后台预缓存 KV，首字 0.3s |
| ChangeSet | 暂存改动集合（待审核→已暂存→已写入） |
| 本轮用量 | 详情面板折叠行的 token/缓存命中统计 |

## Brand Voice
**Tone:** 安静、克制、可信（"搭档"人设；不炫技、不用弹窗打扰）
**Style:** 直接、具体、少术语；确认用面板内提示条
**Personality:** 可靠 · 克制 · 懂工程 · 不吵闹

## Proof Points
**Metrics:** （V1 未发布，占位：首字延迟 ~0.3s / 缓存命中 ≥90% / 核心 <5000 行）
**Customers:** 内部种子用户（2026-07 内测）
**Testimonials:** （未发布，占位）
**Value themes:**
| Theme | Proof |
|-------|-------|
| 快 | 预热架构（产品/领域文档已设计） |
| 便宜 | DeepSeek 定价 + 缓存命中省 token |
| 可控 | Diff 审核写入模型（产品 D0 权威） |
| 开源 | 定位承诺（README） |

## Goals
**Business goal:** V1 发布 + 首批 1000 开发者用户（开源口碑起步）
**Conversion action:** GitHub Star + 安装体验；从 Reasonix/DeepSeek 社区迁移
**Current metrics:** （未发布）
