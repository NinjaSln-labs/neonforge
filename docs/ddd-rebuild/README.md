# NeonForge DDD 重建文档集

> 代码基线：`5c54924a5c91c543166a6636f023006a3f498b9e`（2026-09-30）
> 生成日期：2026-11-14
> 分析对象：`apps/desktop` 下的领域层、主进程、预加载桥、渲染层、单元/交互测试与 e2e 模拟器
> 证据边界：**本次分析没有读取 `docs/` 下的历史产品文档与旧领域文档**；所有结论均从运行代码、类型定义、测试用例与代码内注释重新推导。

---

## 1. 这套文档是什么

本目录是一套以 DDD（Domain-Driven Design）为组织方式、从现有 **NeonForge 桌面应用代码** 重新整理生成的文档。它不是对旧文档的修订，也不以旧文档为输入。它与“纯 as-is 反推”的区别在于：

1. 先用 `00-domain-blueprint.md` 从代码证据（运行时实现、占位/演示、字段与文案）推导出**产品应该有的完整领域**；
2. 再分别标注每个领域的 `已落地` / `部分落地` / `原型/演示` / `缺失（应有）`；
3. 对缺失或有误的部分，在文档中给出目标态设计，并在源码中修正可安全落地的 P0 问题。

文档覆盖：

| 编号 | 文档 | 对应 DDD 阶段 | 主要用途 |
| :--- | :--- | :--- | :--- |
| 00 | [领域蓝图](00-domain-blueprint.md) | 发现 / Blueprint | 完整领域目录、现状标记、目标态领域、隐藏缺口、演进顺序 |
| 01 | [范围收敛](01-scope.md) | 发现 / Scope | 问题、价值、目标/非目标、约束、术语种子、风险 |
| 02 | [领域发现](02-discovery.md) | 发现 / Discover | 事件流、命令/事件候选、热点、歧义、边界线索 |
| 03 | [子域划分](03-subdomains.md) | 战略 / Subdomains | 能力清单、Core/Supporting/Generic、核心域声明、所有权 |
| 04 | [限界上下文](04-bounded-contexts.md) | 战略 / Contexts | 上下文目录、通用语言、反术语、边界 ADR、演进规则 |
| 05 | [上下文映射](05-context-map.md) | 战略 / Context Map | 关系矩阵、集成模式、契约所有权、失败模式、版本策略 |
| 06 | [聚合设计](06-aggregates.md) | 战术 / Aggregates | 聚合目录、不变量、实体/值对象、事务边界、一致性策略 |
| 07 | [领域交互](07-domain-interactions.md) | 战术 / Interactions | 领域事件目录、集成契约、幂等/重放、领域服务、仓储、工厂 |
| 08 | [模型评审](08-model-review.md) | 验证 / Review | 评分、问题清单、行业对标、回溯触发、就绪判定 |
| 09 | [OpenSpec 衔接](09-openspec/proposal.md) | 规范 / Bridge | Proposal、Design、Spec、Tasks（按限界上下文分目录） |
| 10 | [代码证据索引](10-code-evidence.md) | 附录 | 文档结论到源文件/行号的映射 |

另有：

- [09-openspec/design.md](09-openspec/design.md) — 现有架构、契约与数据流的工程映射
- [09-openspec/tasks.md](09-openspec/tasks.md) — 文档化任务与后续代码对齐任务
- [09-openspec/specs/](09-openspec/specs/) — 按上下文组织的能力规范

## 2. 生成方法与安装的 Agent Skills

本套文档按 **一套从网络获取的标准 DDD Agent Skills** 的 5 阶段流程生成：

- 上游仓库：<https://github.com/ForceInjection/domain-driven-design-skills>
- 固定提交：`8923ce99f228da64ef1ae2fe7f94b578e3046acb`
- 安装位置：`../.claude/skills/`（相对本仓库为 `rebuild/.claude/skills/`）
- 安装的 9 个 Skill：`ddd-scope`、`ddd-discover`、`ddd-subdomains`、`ddd-contexts`、`ddd-context-map`、`ddd-aggregates`、`ddd-domain-interactions`、`ddd-model-review`、`ddd-openspec-bridge`
- 许可证：Apache License 2.0（见上游 `LICENSE`）

安装与来源记录见 `.claude/skills/DDD-SKILLS-SOURCE.md`。

> 说明：没有使用工作区父目录下已有的本地 DDD Skill 副本；本次以网络上游仓库该固定提交为准。

## 3. 代码证据边界

本次只把以下内容当作领域事实来源：

1. `apps/desktop/src/domain/` — 纯领域逻辑（会话状态机、时间线、协议工具、解析器、沙箱路径）
2. `apps/desktop/src/main/` — 主进程应用服务与基础设施（工具执行、网关、工作区、环境、服务、交付、持久化）
3. `apps/desktop/src/preload/` — renderer 与 main 的 IPC 契约（Published Language / ACL）
4. `apps/desktop/src/renderer/` — 应用层编排、UI 状态、演示面板
5. `apps/desktop/tests/` — 不变量与交互行为的可验证证据
6. `apps/desktop/e2e-sim/` — 旅程、信号、收敛守卫等可复现的领域语义

明确不作为输入：`docs/` 下的历史产品文档、旧领域文档、审计文档、决策文档。

## 4. 阅读顺序

- 想快速理解产品与完整领域：00 → 01 → 03 → 04 → 05
- 想评审模型质量：06 → 07 → 08
- 想核对目标态与现状差距：00 → 08 → 09
- 想把模型落到工程规范：04 → 05 → 06 → 07 → 09
- 想核对结论出处：10

## 5. 当前代码与目标状态的四种标记（重要）

为避免把“原型”当成“已落地”，本套文档统一使用以下标记：

| 标记 | 含义 | 例子 |
| :--- | :--- | :--- |
| `已落地` | 产品运行路径真实使用，有单元/交互测试或运行时代码 | 决策点状态机、工具授权、完成证据核验、问题台账持久化 |
| `部分落地` | 有真实代码与状态，但仅覆盖部分场景，或只在特定入口生效 | L4 低危委托（开关真实、信任阶梯可视化是演示）；长期记忆为非目标 |
| `原型/演示` | 只在 demo bridge 注入时渲染，产品运行时不可达 | `DigitalDeliveryPanel`、`DoDAlignPanel`、`TrustLadderPanel` 的阶梯升级/演示日志 |
| `缺失（应有）` | 代码中有字段/占位/文案证明产品需要，但完整领域尚未实现 | 长期记忆/知识库（明确非目标）；后续新发现的缺口按此标记 |

这类状态差异会在各文档中显式标注，而不是被当成完整能力。新增的目标态领域见 `00-domain-blueprint.md` 第 3 节；BC-10～BC-14 已于 2026-11-14 落地，相应文档中的“缺失/占位”描述仅保留为历史证据（`10-code-evidence.md`）。

## 6. 术语约定

- **搭档**：产品对 AI Agent 的用户可见称呼；代码中的 `assistant`、`agent` 在领域文档中统一译为“搭档”。
- **任务**：会话内一次目标驱动的交付单元，聚合根为 `ConversationState`（代码文件名为 `conversationState.ts`）。
- **决策点**：`goal` / `plan` / `approval` / `resolution` / `system_clarify` 五类等待用户决策的状态。
- **计划清单**：`plannedFiles`，由已确认方案派生、追加式合并的宿主边界。
- **产物**：`producedFiles`，write/edit 成功累积的实际产出。
- **证据**：完成声明中的 `verification`（命令、输出、是否通过），以及系统派生的 diff 对账。
- **接入方**：`ProviderId`，如 DeepSeek 官方、Command Code、OpenCode Zen/Go。
- **档位**：`ModelTier`，`flash` / `pro`。

## 7. 文档的已知局限

1. 这是 **as-is（现状）** 建模，不假设未实现的功能已经存在。
2. 代码注释中的历史编号（`S1`、`S5`、`坑 83`、`ticket 11` 等）仅作为证据线索，不进入通用语言。
3. 代码中存在旧命名兼容壳（如 `executionConfirmed`、`achievementConfirmed`、`forceTool`）；本文档以新语义为主，并在 08 中列出命名债。
4. 文档的首次产出是 as-is 建模；随后按用户要求对源码中 **缺失与错误** 的部分做了修正（见第 8 节与 `09-openspec/tasks.md`），文档与代码同步更新。

## 8. 本轮源码修正（2026-11-14）

在文档建模完成后，按 `08-model-review.md` 的阻塞项清单修正了源码，并补充回归测试：

| 编号 | 修正 | 验证 |
| :--- | :--- | :--- |
| P0-01 | `read` 读取边界：项目根内自动、根外授权；ENOENT 目录提示仅根内 | `tests/unit/tools.test.ts` |
| P0-02 | 只读判定补强：`sed -i`、`find -exec/-delete/-fprint`、`awk system()`、`sort -o`、`git branch/remote` 写形态、`rg --pre`、`wget` 下载、`curl` 写标志均判 hazardous | `tests/unit/conversationState.test.ts` 新增安全用例 |
| P0-03 | 方案提议阶段不再写 `plannedFiles`；清单只由用户确认方案派生 | 渲染层两处调用删除；领域派生单点保留 |
| P0-04 | 进程清理/服务停止统一 `isKillablePid` 守卫，跳过 `pid<=0` | `tests/unit/tools.test.ts`、`processGuard.ts` |
| P0-05 | 系统代跑仅 `readonly` 与 localhost `network-read`；外网证据不可代跑 | `tests/unit/verifyCompletionSystem.test.ts` |
| P1-01 | `web_fetch` 拒绝本机/私网/元数据地址；重定向手动逐跳校验（≤5 跳） | `tests/unit/webTools.test.ts` |

验证结果（截至 2026-11-17，PR #19-#22 合并 + #15 实现后）：双 tsconfig 类型检查通过；`npx vitest run` **79 文件 / 939 用例**全部通过；`npx eslint .` 0 error（6 条既有 React Hook 依赖 warning）；interaction **90/90**；L5 视觉（macOS 宿主）**37/37**，设置页新增模型/同步区块后的基线待 Mac 重跑；构建通过。审查修复批（15 findings）新增路径/URL 前缀边界、`read` realpath、交付 diff 根边界、MCP `envFrom`、SSRF DNS/IPv4-mapped、WAL mtime 守卫、新任务边界与会话 ID 持久化回归；恢复竞态回归（启动首渲染空消息不得清掉任务快照 approval pending）；结构化澄清（#13）新增假设核对卡、来源制裁与 JSON 回答格式回归；信任模式（#12）新增三档持久化、renderer 判定、main 委托边界与旧开关迁移回归；机制拒绝事件（#16）新增 `gate.denied` 结构化拒绝回归；多模型网关与扩展能力治理（#14）新增显式模型选择/generic profile/能力指纹信任重审/MCP 回收回归；问题台账同步（#15）新增 main 权威存储、加密快照、确定性合并/tombstone 与设置页同步区块回归。

此外，按“先分析应有领域、再以代码校准”的要求补充了 `00-domain-blueprint.md` 与 5 个目标态 spec（`change-version`、`task-orchestration`、`usage-cost`、`extension-integration`、`acceptance-quality`）。这些领域对应的 BC-10～BC-14 已于 2026-11-14 全部实现；实现顺序与任务见 `00-domain-blueprint.md §6` 和 `09-openspec/tasks.md §5`。
