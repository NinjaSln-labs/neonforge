# ADR-035：审计闭环＝单源记录（`refs/audit/log`）＋一道机械判据

- 状态: accepted
- 日期: 2026-10-07
- 相关：`docs/decisions/draft-audit-closure-gaps.md`（症状＋成熟方案对比）、`docs/decisions/draft-audit-single-source.md`（单源初稿）、`docs/decisions/draft-audit-road-b-git-native.md`（道路 B 定稿，本裁定全文依据）；ADR-032（切片码审——本件把其获「修入后复跑」条从 prose 升为机制）；ADR-031（拆单纪律）；`AGENTS.md` 流程第 9 条

## Context

2026-10-07 用户连问两轮，指出「很多次再次改完后没审计」，并在本会话坐实两处实证：

- **实证-1**：S3 两轮段5 出口审计各修 finding（契约件 7 条、详设 17 条）后，**都未复跑该切片闸**；用户指出才补派窄单（24/24 PASS）。
- **实证-2**：`55e162a` 主会话**手改两份审计报告**（计数笔误订正＋追加复验段）。改动实质无害，但**无任何门禁可见这次对审计记录的改写**。

**根因**：三条——①「修→复审」无强制回路（ADR-032 的「修入后复跑」是 prose，已漂移）；②审计结论不绑对象版本（报告挂着像有效）；③改稿者兼任判定者。**深层**：「审计」这件事**没有单一事实源**——「审过没/审的哪版/结论什么/还作不作数」四问散在 prose＋commit＋handoff action＋人的记忆**四源，必漂**。

调研（成熟方案对比，见 draft 件）：工业界正解＝**「任何使审查对象变化的动作，必须使旧结论自动失效；且失效—重验须机器可判或流程必经」**；Automation bias 研究（JAMIA 2017）明示「加强要求/训练/反馈」类干预**几乎无效**，须**降低认知负荷＋强制独立复核**。⇒ **本裁定不再加 prose 纪律，改上机制。**

## Decision

**1. 单一事实源＝`refs/audit/log` 分支上的一条审计记录**（一受审对象一版一记录，JSON，id 单调）。记录字段承载「审过没/审的哪版/结论什么/还作不作数」四问：

| 字段 | 回答 |
|---|---|
| `subject` | 审什么 |
| `subject_blob` | **哪版**（＝`git hash-object` 的内容寻址哈希；**不用 commit SHA**——blob 与 rename/分支/历史改写无关，实测确证） |
| `verdict` / `findings` | 结论 |
| `reverify_of` | 还作不作数（版本链：指向上一条同 subject 记录） |
| `auditor` / `auditor_out_sha256` / `attachment_sha256` | 谁审的＋证据与附件哈希（约束不可静默改） |

**承载用独立 ref `refs/audit/log`，不用 `git notes`**：实测（scratch 仓）`git notes` 在 rebase 下**脱锚**（note 仍挂旧 commit SHA、新 HEAD 已不含它）；独立 ref 是 git 一等公民分支，**免疫 rebase**。分支历史本身＝**哈希链**（改早期记录须改写后续，留痕）。

**prose 报告降为附件**（`docs/audits/*.md`、`docs/reviews/*.md`）——不再当权限源，单源只有记录。

**2. 判据＝`tools/audit-check.py` 一道脚本解三症状**（本仓自持、独立跑，不碰 handoff 库件）：

| 判据 | 机械做法 | 解 |
|---|---|---|
| ①绑定新鲜 | 每 subject 取 `refs/audit/log` 最新记录，`subject_blob` vs 当前 `git hash-object <subject>`；不等 ⇒ STALE | 实证-1（绑旧版本） |
| ②复验链完整 | 有 STALE 的 subject 且无 `reverify_of` 指向它的更新记录 ⇒ 红 | 实证-1（修完不复验） |
| ③凭证对账 | 记录条目 sha256 vs 锚点链、附件 vs `attachment_sha256`；不等 ⇒ 未经登记的写入 | 实证-2（改记录无痕） |

**锚点**＝`refs/audit/log` head commit SHA 另存 `docs/audits/.anchor`；head 被改写而未更新锚点 ⇒ 报「历史被改写」。

**3. 唯一写入口＝`tools/audit-record.py`**（提交到 `refs/audit/log`）；手改磁盘记录即被 §2③ 抓。改记录走 CLI 留痕，不是手改。

**4. 遵守机制（怎么让 agent 遵守）**：`AGENTS.md` 命令节加 `python3 tools/audit-check.py`；`pipeline-0to1` 段6 拦截条引它（「audit-check 无 STALE 未复验」才可进出口闸）。**全部机器判据，零「请记得」**——此即对 Automation bias 结论的落实。

**5. 边界（诚实标注）**：单机下拥有 `.git` 写权限者能 `rebase`/`filter-branch` 重写历史 ⇒ 本方案**tamper-evident（可检测篡改），非 tamper-proof**。要真防须**外部锚点**（写权限之外）；V1 取「锚点＋推送」折中（改写须同时改锚点＋force-push，远端留痕）。**登记为已知天花板，不假装解决**——所有透明日志（CT/Rekor）共享此前提。

## Consequences

**＋** 「审计」首次有单一事实源，四问同源于一条记录；一道判据解三症状（不是三套机制）；实证-1／实证-2 重演时**不靠任何人记得**，`audit-check` 即报红。
**＋** 零新依赖（Python stdlib＋git）、不碰通用技能库件（`handoff` 一字未改）、不新增存储系统。
**＋** 把 ADR-032 的 prose 纪律（「修入后复跑」）**升级为机制**——这正是它漂移的解药。
**−** 每受审对象增一条记录写入门槛（`audit-record.py` 一条命令）；`refs/audit/log` 需随 push 同步（否则锚点无外锚）。
**−** tamper-evident 天花板（§5），非本方案缺陷、是单机前提；真要 tamper-proof 须引外部锚点，登记为未来项。
**验收判据**（方案成立标准）：重演四幕——改附件／改工件／修完不补记录／直接改写 ref 不更新锚点——四条全红即成立。
