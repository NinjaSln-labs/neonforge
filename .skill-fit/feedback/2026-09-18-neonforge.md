# Skill-Fit Feedback — neonforge — 2026-09-18

## 数据源状态
**catalog.yaml 单源**（真源仓 `~/ninjasin-labs/agent-skills/catalog.yaml`，version 1，updated 2026-09-18）
retired.txt：session-health / task-loop-progress / core-rules（退役 3）
registry 查重：`scripts/skill-name-check.sh` 实时查（结果不落表）

## 画像
- 语言: TypeScript + React 19 + Electron 43 + Vite 6（monorepo，根无 package.json）
- git: 有（main，工作树脏：5 改 + 2 未跟踪）；有 HANDOFF-ARCHIVE/
- 测试: vitest（L1/L2）+ @playwright/test（L3/L5）
- CI: .github/workflows/qa.yml
- 阶段: 成熟产品（docs/{decisions,domain,product,launch,audits,design/stage-specs,tests} + DDD src/domain/* + axe a11y + HANDOFF）
- 已挂载: 用户级 86（全部非退役技能，软链到真源 ~/ninjasin-labs/agent-skills），项目级 0（`.agents/skills` 不存在）

## 建议挂（项目级 · 16 组）
| 技能组 | 命中 when | 裁决 |
|---|---|---|
| electron-best-practices / react-vite-best-practices / typescript-best-practices | electron, react, ts | ✅ 采纳（记录） |
| playwright-best-practices / visual-regression-tester / accessibility-auditor | testing, frontend, a11y | ✅ 采纳（记录） |
| frontend-design / ui-ux-pro-max / ui-typography / ui-animation / ux-heuristics / web-design-guidelines | frontend | ✅ 采纳（记录） |
| ddd-* 全家（11）+ event-storming + prd-driven-ddd + ddd-qa-chain | ddd | ✅ 采纳（记录） |
| stage-gate / stage-spec / audit-item / coverage-matrix | stage-flow | ✅ 采纳（记录） |
| git-workflow | version-control | ✅ 采纳（记录） |
| secrets-scan / security-scan / dependency-scan / config-scan | security | ✅ 采纳（记录） |
| cicd-pipeline / api-contract-validator | ci, api | ✅ 采纳（记录） |
| systematic-debugging / code-review / codebase-design / architecture-patterns / deep-codebase-analysis | code | ✅ 采纳（记录） |
| writing-plans / executing-plans / plan-grilling / grill-me / roadmap-planning / to-tickets | planning | ✅ 采纳（记录） |
| product-doc-audit / marketing-copywriting / product-launch / product-marketing / press-release / write-spec / prd-development / positioning-statement / problem-statement | docs, marketing, product-0-1 | ✅ 采纳（记录） |
| autonomous-investigation / delegated-research / user-research / intelligence-collection-disciplines / competitive-* / market-landscape-scan / voice-of-customer-miner | research, intel | ✅ 采纳（记录） |
| skill-eval | skill-library | ✅ 采纳（记录） |

> 当前全部已在用户级可用；catalog 规定 `tier=project` 应挂项目级 `<proj>/.agents/skills`（本仓缺失）。

## 建议摘（用户级 · 10 + 1 结构性）
| 技能组 | 裁决 |
|---|---|
| workshop-facilitation（collaboration 不命中） | ⚠️ 不执行，保留 |
| experiment-handoff（experiment 不命中，无 .experiments/） | ⚠️ 不执行，保留 |
| k6-performance（仅弱命中 testing，无压测痕迹） | ⚠️ 不执行，保留 |
| proto-persona / customer-journey-map / jobs-to-be-done / discovery-interview-prep / positioning-workshop（product-0-1，已过探索期） | ⚠️ 不执行，保留 |
| battle-card-builder / company-intel（intel，无 B2B 场景） | ⚠️ 不执行，保留 |
| 结构性：86 项全常驻用户级（catalog 仅 universal 应常驻；core-rules 反而退役） | ⚠️ 不执行（用户级为全局挂载，摘除影响其它项目） |

## 缺口（5）
| 能力 | 裁决 | registry 实时查 |
|---|---|---|
| WSL/Windows 互操作与环境维护（编码/命令替换/binfmt 恢复） | ✅ 采纳为缺口记录 | wsl-interop → free |
| Electron 打包/分发（electron-builder / asar / 签名 / 更新） | ✅ 采纳为缺口记录 | electron-packaging → free |
| Mac 真机 QA 自动化（CDP 驱动 + asar 部署流水） | ✅ 采纳为缺口记录 | — |
| UAT 人格模拟（LLM-as-user e2e） | ✅ 采纳为缺口记录 | uat-simulation → free |
| LLM 网关多 provider tool_choice 兼容矩阵 | ✅ 采纳为缺口记录 | llm-gateway-compat → free |

## 裁决说明
- 用户裁决：**采纳 / 只记录反馈，不实际执行**——不增删任何符号链接、不建项目级挂载、不改任何技能或项目文件
- 本次运行全程只读（画像探测 + catalog 对照 + registry 查重）

## 校准记录（影响下次 catalog 补全）
- 「建议摘」全部不执行：用户对用户级全局挂载倾向**保留**——catalog 的 `tier=project 应项目级` 规则与「单一全局 skills 目录」的实操存在张力，下次评估可考虑将规则表述为「推荐」而非硬判
- 建议补 catalog：Electron 打包/分发、WSL/Windows 互操作、UAT 人格模拟、LLM 网关兼容 四类缺口
