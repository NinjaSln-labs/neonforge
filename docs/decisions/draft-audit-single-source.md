# 审计闭环：单源方案（一次解决三症状）——设计文档

> 前置：`docs/decisions/draft-audit-closure-gaps.md`（症状＋成熟方案对比）。
> 本文是**更好方案**：一个单源、一次解决。未立 ADR，待用户裁。
> 用户约束（2026-10-07）：「单源并一次解决」。

## 1. 为什么不是「A/B/C 三件」

A（记录哈希对账）、B（结论绑工件版本）、C（修→复验机械化）看似三件，实为**同一缺陷的三个症状**：

> **缺陷＝「审计这件事」没有单一事实源。** 「审过没／审的哪版／结论什么／还作不作数」四问，现在分别落在：prose 报告（人读）＋ commit 历史（版本）＋ handoff action（待办）＋人的记忆（作不作数）。**四源必漂**——本轮两处实证都是某两源脱节（报告 vs 工件版本；待办 vs 记忆）。

三件分开修，等于**给四个源各加一道对账**——源没减，闸反而多了（正是 ponytail 反对的「为同一个问题加三套机制」）。

## 2. 单源设计：`audit` 条目（一个新条目型，落在既有 `.handoff/` 存储）

**核心**：**审计 = 一条机器可读记录**，锚定在**既有单一存储**（`.handoff/`，已是本仓唯一未决语义落点、已有哈希凭证 `writes.jsonl`＋`check` 机械判据）。其余一切**派生**，不落第二份。

### 2.1 记录形（键集固定）

```
audit/<id>.md  ← 经 handoff CLI 写（沿用既有 add/close 入口 + 哈希凭证）
frontmatter:
  id            : a000001（新前缀 a＝audit，全槽唯一）
  created       : 日期（脚本盖）
  subject       : <被审工件的路径>            # 单一对象（一审计一对象）
  subject_rev   : <该工件的 commit 短哈希>      # ★ 绑不可变版本（解症状 B）
  auditor       : <agent@model>               # 谁审的
  auditor_sha   : <审计者产出的内容哈希>        # ★ 审计证据本身也不可静默改（解症状 A）
  verdict       : accepted | conditional | rejected
  findings      : <数量与状态摘要>（如 "3阻断+14非阻断; 全部采纳修入"）
  reverify_of   : <被替代的上一版 audit id 或 null>   # ★ 版本链
body: 结论全文（或指向 docs/audits/ 的 prose 报告路径——prose 降为「附件」，单源仍是本条）
```

### 2.2 三条派生规则（消灭三症状，不用三道闸）

| 症状 | 单源如何一次解决 |
|---|---|
| **A 改审计记录无痕** | `audit/<id>.md` 走**既有 `writes.jsonl`**——手改即被 `check` 的 writes 维抓到（机制现成，零新代码）。审计者的**原始产出**存 `auditor_sha`；prose 报告只是附件，改附件不影响本条、改本条即被抓。 |
| **B 结论绑旧版本** | `subject_rev` 记工件 commit。`check` 增一判据：**`subject_rev` ≠ 工件当前 commit ⇒ 本条 `STALE`、`check` 红**。工件一动，审计自动失效——不靠人记得。 |
| **C 修完不复验** | 修入 = **必产一条新 audit**（`reverify_of` 指向上一条）；`check` 判据：**存在 `STALE` 的 audit ⇒ 红**。段6「finding 未处置不许进出口闸」的「处置」被精确为「有一条 `reverify_of` 该 audit 且 verdict 非 rejected 的新记录」。段推进读的是**同一条记录**，不是另开的 action。 |

### 2.3 为什么这才是「单源＋一次解决」

- **一个对象回答四问**：subject（审什么）＋ subject_rev（哪版）＋ verdict/findings（结论）＋ reverify_of 链（还作不作数）。四问同源于一条记录。
- **一个闸判三症状**：`check` 的**同一条 audit 维度**同时判「绑定」(B)、「未复验」(C)、「被手改」(A，走既有 writes 维)。不是三道闸，是一道。
- **零新增机制类型**：复用 `.handoff/` 存储、CLI 写入口、`writes.jsonl` 凭证、`check` 扩展点。**不加第二套系统**——这是与 A/B/C 三件的根本区别。
- **prose 报告降级为附件**：`docs/audits/*.md`、`docs/reviews/*.md` 保留为人读件，但**不再是权限源**；单一事实源＝store 里的 `audit` 条目。天然消灭「报告说旧版本」类漂移。

## 3. 「怎么让 agent 遵守」（沿用正解：机械化到必经点）

- **写入口唯一**：审计记录**只经** `handoff` CLI（既有 `add` 入口 + 新 `audit` 型）——与 `.handoff` 其余条目同纪律，`check` 对账。
- **判据机械化**：`check` 增 `audit` 维（STALE 检测 / reverify 链完整性 / 凭证对账），**不记得也过不去**。
- **流程必经**：`pipeline-0to1` 段6 拦截条件已近义（「finding 未逐条处置 → 不许进出口闸」），把「处置」改引这条记录即可——**技能侧改一行引用，不新增条文**。
- **不加「请记得…」**：Automation bias 研究（JAMIA 2017）明确此类干预无效；本方案全部落在机器判据上。

## 4. 落地件（一次做齐，不拆三批）

### 嵌套情形（实证-2 的正解，单源天然覆盖）

「审计报告本身也能被手改」是自指问题——谁审审计报告？单源方案**不需要再套一层审计**：
- `audit` 记录（本仓 store）＝**单一事实源**，走 `writes.jsonl` 哈希凭证 → 改它即被抓（症状 A）。
- auditor 的**原始产出**（`/tmp/<单号>/`，异体所写）→ 摘要其哈希入 `auditor_sha` → 原始证据不可静默换。
- prose 报告（`docs/audits/*.md`）降级为**附件** → 其哈希也可入记录（`attachment_sha`）；主会话落笔时的增删（如实证-2 的计数订正）**若与记录不符即被抓**——且「订正记录」本身走 CLI 留痕（`edit`），不是手改。
- ⇒ 自指问题消解：**要改的是记录，改记录留痕；附件受记录约束，不再各自为政。**

### 落地清单

1. **`tools/audit-check.py`**（本仓自持，约百行）：读 `.handoff/audit/*.md` ＋ 逐条 `git log -1 --format=%h -- <subject>` 比对 `subject_rev`，判 STALE／reverify 链／凭证。`handoff check && python3 tools/audit-check.py`。
2. **本仓文档**：新 **ADR-035**（本单源裁定）＋ AGENTS.md 流程第 9 条改写（散文纪律指向记录）＋ 报告模板加 `subject_rev`／`auditor_sha`。
3. **`pipeline-0to1` 技能**：段6 拦截条改引 audit 记录（技能通用库件，**只改条件式引用、不写死本仓字段**，照 ADR-032 既有做法）。

## 5. 边界与风险（诚实标注）

- **不碰通用技能库件**：判据落**本仓自持** `tools/audit-check.py`，`handoff check` 之外单独跑（`handoff check && python3 tools/audit-check.py`）。单源＝本仓 store（`.handoff/audit/`），判据＝本仓脚本，**零跨仓影响**（不改 agent-skills 仓）。
- **`subject_rev` 的"工件当前 commit"口径**：取「该工件最后一次改动 commit」（`git log -1 --format=%h -- <path>`）。**已实测**（本会话）：契约件 → `c6e024e`、详设 → `f975155`，机制可复现。
- **`.handoff/audit/` 是新槽？** 不是——复用既有 store 的**条目型**机制（同 `decisions/<id>.md` 形：frontmatter＋哈希凭证），前缀 `a`。不新增存储系统。
- **成本**：`tools/audit-check.py`（约百行，照抄 handoff 判据形）＋ ADR-035 ＋ 报告模板 ＋ AGENTS 一行。**一次性**，不拆三批。

## 6. 验收判据（方案成立的标准）

把两处实证重演，**不靠任何人记得**：
1. 改 `audit` 记录（或它绑的 prose 附件）⇒ `audit-check` 报「未经登记的写入」。
2. 改被审工件、audit 记录不动 ⇒ `audit-check` 报 `STALE`。
3. 修 finding 后不补新 audit ⇒ `audit-check` 报「存在 STALE 无复验记录」。
三条全红即方案成立；任一漏 ⇒ 不成立。

## 7. 待用户裁

1. **采纳单源方案**（替代 A/B/C 三件）？
2. 落地＝**本仓自持 `tools/audit-check.py`**（§5 已定，零跨仓）——确认即可执行。
3. 立 **ADR-035** 记录本裁定＋改写 AGENTS.md 流程第 9 条？

**若采纳，我一次交付**：`tools/audit-check.py`（含 3 条验收判据的自证）＋ ADR-035 ＋ AGENTS.md 第 9 条改写 ＋ 报告模板（`subject_rev`/`auditor_sha`）＋ 把本轮两份 S3 审计报告**回填**成首批 `audit` 记录（自举验证）。
