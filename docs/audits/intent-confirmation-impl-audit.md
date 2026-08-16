# 意图确认重设计——T0+S1 实现审计（设计与实现 + 代码质量，2026-08-16）

> 范围：`7b7e50e..HEAD`（T0 测试基建 `25fa6ae` + S1 领域层重写 `5eceebf`，11 文件 +1625/-291）。
> 方法：code-review 两轴（Spec = `docs/design/intent-confirmation-domain-design.md` §3/§4/§6/§7.1/§8/§9；Standards = 仓库隐含规范 + Fowler smell 基线）双子代理并行 + 主代理实证复核（每项 P0/P1 均以临时 vitest 实测）。
> 与既有审计关系：上一轮 `ddd-vs-impl-audit.md`（M1-M10，重构前基线）——本审计验证重构后的偏离消解情况。

---

## 一、评分总览

| 维度 | 得分 | 主要发现 |
|------|------|---------|
| Spec 符合度（设计↔实现） | 7.5/10 | Inv 1-8 主体承载完整（值对象/转换/派生/矩阵测试）；**2 处缺失**（C8 拒绝计数、事件注册四成员只加一）+ 1 处实现分歧（Inv 4 unverifiable）+ 1 处阶段蔓延（S6 门控提前） |
| 代码质量（Standards） | 8/10 | 领域层纯函数/溯源注释/L1 命名/commits 达标；**1 硬违规**（decision.* 事件无 L1 测试——三步登记缺第 3 步）+ 3 smell（证据规则重复且已分歧、unsafe cast、diff 倒推双份维护） |
| 测试质量 | 8.5/10 | 不变量矩阵 80 it（8 Inv + 值对象 + 6 继承锁定）组织符合 §9.2；T0 自测 4 场景验收达成；缺口=事件断言、unverifiable 决策点用例 |

**加权结论：~7.8/10——设计主体落地正确、行为语义对齐（不变量矩阵强）；2 处领域缺陷需立即修（Inv 4 分歧 P0 / C8 计数缺失 P1），其余为 S3-S6 接线清单项。**

---

## 二、Spec 轴报告（设计文档 vs 实现）

### P0（行为/数据风险——本次审计已修）

| # | 问题 | 证据 | 处置 |
|---|------|------|------|
| S1 | **Inv 4 承载分歧：存在 unverifiable 证据的完成声明仍进入 resolution 决策点** | 设计 §3.3「证据不足（verification 空 / pendingQuestions 非空 / **存在 unverifiable**）→ ok=false + 不进入对账」；实现 `completionEvidenceComplete`（仅查 verification 非空 && pendingQuestions 空）与 `verifyCompletion`（查 unverifiable）两套规则——实测：claim 含 `npm install` 验证命令 → `verifyCompletion.ok=false` 但 `deriveDecisionPoint='resolution'`（进入对账） | **已修**（commit `S1.1`）：`evidenceVerifiable` 公共谓词（verification 非空 + 全部只读可代跑 + 无 pendingQuestions）——completionEvidenceComplete 与 verifyCompletion 同源；补 L1 用例（含非只读验证 → 不进入对账） |

### P1（结构/范围偏离）

| # | 问题 | 证据 | 处置 |
|---|------|------|------|
| S2 | **C8 决策点协商保护缺席（设计 §4.1 明确要求「纳入 L1 状态空间测试」）** | 设计 §4.1「同一决策点连续拒绝（含 kind='modify'）计数上限（建议 3 次）——计数随决策点确认/新提议重置」——实现无 rejectStreak 字段、无 L1 用例 | **已修**（commit `S1.1`）：`rejectStreak` 字段（拒绝+1/确认重置 0/任务边界重置 0）+ Inv 8 用例。**语义裁定**：模型重提议（setPending 带新 content）属同一决策点延续**不重置**（否则「3 次上限」因每次重提议清零而永不可达——保护失效）；「随新提议重置」按 C2 语义（用户新意图 = 新决策点）由应用层经 goal 确认边界落实（S3）。超限回退（AskToAct/人工接管）S3 消费 |
| S3 | **事件注册表只加 'decision' 单成员（设计 §8.2 D 要求 S1 扩展四成员 proposal/decision/completion/gate + 7 事件）** | 设计 §3.5 注记「S1 随注册表扩展」；实现 timeline.ts 仅 `decision.requested/resolved`（proposal.* 需解析层 S2、evidence_missing S4、gate.denied S6——**阶段拆解合理**，但顶层注释（conversationState.ts L3-8）声称「timeline decision.requested/resolved 事件登记」之外未提剩余事件归属——注释不完整） | 文档级修复：注释补阶段归属；剩余事件 S2/S4/S6 随阶段登记（无需改码） |
| S4 | **外网 curl 门控空洞（拍板 3 与 S1 过渡语义矛盾）** | 实测：`sessionGate` 放行 network-read（内外网不分）+ `canExecute` ask 全放行 → `curl https://外网` 双门 ok:true；运行时无洞（renderer 仍走 classifyAction 壳 fail-closed——curl 需授权），但领域层组合语义与拍板 3 相悖，S6 接线时若误读 canExecute 即漏 | **已锁**（commit `S1.1`）：L1 用例锁定 S1 过渡语义（外网 curl 双门 ok——注释标 S6 变更点：actionGate 接入后 ask 必须由执行层消费）——S6 接线清单首项 |
| S5 | **S6 门控内容提前实现（classifyReadonly 链递归/git 子命令/网络只读 + actionGate 全量）** | 设计 §6 S6 才「门控双维」；S1 已落地纯函数（无接线）——行为无害（无消费方）且与 S1「领域层重写」名义基本兼容（§3.3 属领域模型） | 接受（领域模型层实现，接线 S6）；不视为缺陷，标注阶段归属 |

### P2（近似可接受）

| # | 问题 | 处置 |
|---|------|------|
| S6 | renderer 属性改名（executionConfirmed→planConfirmed 等）在 S1 完成（§6 归 S3）——系类型改名维持 L2 tsc 绿的机械替换 | 接受（无行为变化——L3 31 回归锁定） |
| S7 | verifyCompletion 纯逻辑版提前于 S2（V1a 系统代跑/`systemState` 参数未落地——S2 扩展） | 声明内（S1 只为 Inv 4 测试需要） |

---

## 三、Standards 轴报告（仓库规范 + smell 基线）

### 硬违规

| # | 问题 | 位置 | 处置 |
|---|------|------|------|
| Q1 | **timeline 事件三步登记缺第 3 步**：`decision.requested/resolved` 已登记（TIMELINE_EVENT_SPECS）+ 已派生（deriveStateEvents），但全测试零断言（timelineEvents.test.ts / conversationState.test.ts grep 零命中）——timeline.ts L80 自声明「新增事件三步：登记 → emit → **测试**」 | timeline.ts:130-131/169-185 | **已修**（commit `S1.1`）：timelineEvents.test.ts 补 decision.* 派生断言（pending_set 同发 requested；confirm/reject/approval deny 的 resolved 推断） |

### Smell（判断级）

| # | Smell | 位置 | 处置 |
|---|-------|------|------|
| Q2 | **Duplicated Code（已产生实际分歧）**：`completionEvidenceComplete` 与 `verifyCompletion` 重复实现「证据完整」规则——含非只读 verification、无 pendingQuestions 的 claim 两函数结论相反（= Spec S1 分歧） | conversationState.ts | **已修**（commit `S1.1`）：抽 `evidenceVerifiable` 公共谓词，两函数同源 |
| Q3 | **Primitive/unsafe cast**：`userDecided('plan')` 用 `as PlanProposal | undefined` 直接收窄三型 union，未校验 `decisionContent.kind === 'plan'` | conversationState.ts:161 | **已修**（commit `S1.1`）：按 kind 收窄取值（kind 非 plan 视为无 proposal——防御） |
| Q4 | **Divergent change 风险**：`decision.resolved` 的 confirm/reject 由状态 diff 倒推（确认位反转 + deniedApprovals 增长），与 userDecided 转换逻辑双份维护——改转换易漏同步 | timeline.ts:173-185 | 记录（deriveStateEvents diff 派生是既有模式——Q1 测试补齐后风险收敛；S3 若转换语义再变需同步） |
| Q5 | **双套清单匹配**：领域层 `sessionGate.inPlannedFiles`（endsWith 宽松）与 renderer `inPlannedFiles`（trustPath 归一）并存——同一语义两个实现（仓库反复强调的「单一权威/缝隙 4 同源」原则） | conversationState.ts:322 vs ConversationPanel.tsx:619 | S3 接线统一（领域层判定为权威——renderer 传参改引用）；记录为 S3 清单项 |
| Q6 | 文件头注释日期未更新（conversationState.ts 首行仍「2026-08-14」——S1 增量注释已并存） | conversationState.ts:1 | 记录（delta 注释惯例——git log 溯源，可接受） |

---

## 四、遗留清单（非本次修复——随阶段）

| 项 | 阶段 | 内容 |
|----|------|------|
| 外网 curl ask 消费（S4 锁定测试已标注变更点） | S6 | canExecute/执行层消费 actionGate ask（network-read 外网 → 授权卡）；main preApproval 同源 |
| 清单匹配统一 | S3 | sessionGate 判定权威化，renderer inPlannedFiles 引用领域层 |
| proposal.* / completion.evidence_missing / gate.denied 事件 | S2/S4/S6 | 随解析层/对账/门控接线登记 |
| 拒绝超限回退（AskToAct/人工接管） | S3 | rejectStreak ≥3 的消费（状态栏提示/澄清回退） |
| verifyCompletion V1a/V1b（systemState 系统代跑核验） | S2/S4 | 只读验证命令代跑 + diff 系统派生 |

---

## 五、修复验证（commit `S1.1`）

- 门禁：L1 全量（338 + 新增） / 双 tsc 0 错 / L3 31 全绿
- 新增 L1 用例：Inv 4（unverifiable 不进入对账）、Inv 8（rejectStreak 递增/重置）、S1 过渡语义锁定（外网 curl 双门）、timeline decision.* 事件派生
