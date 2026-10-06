# 审计闭环：单源方案·道路 B 定稿（Git 原生，不碰 handoff）

> 前置：`draft-audit-closure-gaps.md`（症状＋成熟方案对比）、`draft-audit-single-source.md`（单源初稿）。
> 本文＝**道路 B 深入定稿**：本仓自持、**不改造 handoff**、**复用 git 原生机制**（调研结论：比自写 JSONL+sha 成熟）。
> 用户约束：单源、一次解决、（道路 B）不碰通用技能库件。未立 ADR，待裁。

## 1. 调研结论（决定形态的三条）

1. **git 本身＝内容寻址＋哈希链＋Merkle DAG＋签名**（`git hash-object` 内容寻址、commit DAG 哈希链、`git tag -s` 签名锚点）。**不用自造 JSONL+sha**——git object store 就是业界验证过的成熟实现（先例：Google `git-appraise` 把 code review 结论存进 git objects/notes）。
2. **版本键用 blob SHA（`git hash-object`），不是 commit SHA**。blob SHA 是纯内容哈希，**与 rename／分支／历史改写无关**；commit SHA 受这些影响（`git log -1 --format=%h -- <path>` 在 rename 时需 `--follow`、且会随历史改写而变）。**实测**：契约件 blob＝`de928c5d…`、详设 blob＝`ff37f5b5…`。
3. **硬约束（诚实标注）**：单机环境下**拥有 `.git` 写权限者能 `rebase`/`filter-branch` 重写历史** ⇒ 只能做到 **tamper-evident（可检测篡改），非 tamper-proof**。要检测历史改写，验证方须持**外部锚点**（签名 tag 副本 / 历史 head 记录）。这是所有透明日志（CT/Rekor）的共同前提，不是缺陷——**本方案把「锚点」显式设计进来**。

**不采用**：Rekor/Sigstore/Trillian/immudb（需联网或常驻服务，桌面文档仓过重）；in-toto/SLSA（生态偏 CI 容器，本仓无需标准 attestation 互操作）。**借鉴其概念**（subject.digest 绑定、inclusion/consistency 的"锚点"思想），**不引其依赖**。

## 2. 单源形态：独立 ref `refs/audit/log` 承载审计记录

**每条审计记录 = `refs/audit/log` 分支上的一个 JSON 文件**（append-only 提交历史＝哈希链）。**不用 `git notes`**——实测其在 rebase 下**脱锚**（note 仍挂旧 commit SHA，与新 HEAD 脱钩，见 §7 实测）。独立 ref 是 git 的一等公民分支，**不受 HEAD/其他分支的 rebase 影响**。

- **承载**：`refs/audit/log` 分支，目录 `audit/<id>.json`（一条一文件、id 单调）。每个 commit = 一次记录写入 ⇒ **分支历史即不可回改的哈希链**（改早期记录须改写后续，留下痕迹）。
- **锚点**：分支 head commit SHA 另存 `docs/audits/.anchor`（受 git＋desens 双管），`audit-check` 比对——head 被改写而未更新锚点 ⇒ 报「历史被改写」。
- **记录内容**（一条 = 一个被审对象、一版）：

```jsonc
{
  "id": "a000001",
  "subject": "docs/design/stage-specs/V1-S3-persistence-recovery.md",
  "subject_blob": "de928c5d60edb6a3ef306d5e1f68954224bb359f",   // ★ 版本键（内容寻址）
  "subject_commit": "c6e024e",                                    // 溯源用
  "auditor": "qodercn@Qwen3.8-Max",
  "auditor_out_sha256": "…",                                      // 异体原始产出（/tmp）的哈希
  "attachment_sha256": "…",                                       // prose 报告（docs/audits/*.md）的哈希
  "verdict": "accepted",                                          // accepted|conditional|rejected
  "findings": "3阻断+12非阻断; 全部采纳修入",
  "reverify_of": null,                                            // 指向同 subject 的上一条 id（版本链）
  "ts": "2026-10-07T…"
}
```

- **单源四问**同源于这一条：subject（审什么）＋subject_blob（哪版）＋verdict/findings（结论）＋reverify_of 链（还作不作数）。
- **prose 报告降为附件**（`attachment_sha256` 约束）；异体原始产出由 `auditor_out_sha256` 约束。
- **写入＝`tools/audit-record.py`**（唯一写入口）：`git update-ref`/临时 worktree 提交到 `refs/audit/log`，手改磁盘文件即被 §3③ 抓。

## 3. 判据：`tools/audit-check.py`（本仓自持，独立跑）

`handoff check && python3 tools/audit-check.py`（紧挨着交接门禁，不并入、不改 handoff）。三条判据，**一道脚本解三症状**：

| # | 判据（机械） | 解的症状 |
|---|---|---|
| ① **绑定新鲜** | 对每 subject 取 `refs/audit/log` 上最新条目，比对 `subject_blob` vs 当前 `git hash-object <subject>`；不等 ⇒ **STALE** | B：结论绑旧版本 |
| ② **复验链完整** | 存在 STALE 的 subject，且无 `reverify_of` 指向它的**更新**条目 ⇒ **红** | C：修完不复验 |
| ③ **凭证对账** | 记录条目的 sha256 与 chain head 记录比对；prose 附件与 `attachment_sha256` 比对；不等 ⇒ **未经登记的写入** | A：改记录/附件无痕 |

**外部锚点**（解"懂 git 的人 rebase 重写"）：`audit-check` 把 notes ref 的**当前 head commit SHA** 与 `docs/audits/.anchor`（受 git＋desens 双重管辖的一行文本）比对；不等 ⇒ 报「audit 历史被改写，需复核」。锚点更新走 CLI 留痕（写一条带理由的 note），不手改。

## 4. 为什么这是「单源＋一次解决＋不碰 handoff」

- **单源**：审计事实只有一份＝`refs/audit/log` 里的条目（git object store 托管、内容寻址）。prose 报告降附件。
- **一次解决**：一道 `audit-check` 同时判 STALE／复验链／凭证——三症状一闸。
- **不碰 handoff**：只用 git 原生命令（`update-ref`／`hash-object`／`rev-parse`），判据是本仓 `tools/audit-check.py`。`.handoff/` 位置约定不涉及——审计记录本就该跟**被审工件**走（在 git 里），不跟交接存储走。
- **零新依赖**：Python 3.12 stdlib（`hashlib`/`json`/`subprocess`）＋git，与 `tools/desens-scan.py` 同风格。
- **怎么让 agent 遵守**：`audit-check` 挂进 `AGENTS.md` 命令节 ＋ lefthook pre-commit（可选提示）＋ `pipeline-0to1` 段6 拦截条引它。**全部机器判据，零「请记得」**。

## 5. 落地件（一次交付）

1. **`tools/audit-check.py`**（约 150 行，含 3 判据＋`--selftest` 自证夹具，仿 `desens-scan.py` 风格）。
2. **`tools/audit-record.py`**（或并入上者）：写一条审计记录（提交到 `refs/audit/log`：`audit/<id>.json`）＋校验附件哈希＋更新锚点；**唯一写入口**，手改即被 ③ 抓。
3. **ADR-035**：本单源裁定（道路 B／独立 ref `refs/audit/log`／blob SHA／tamper-evident 边界＋锚点）。
4. **AGENTS.md**：命令节加 `python3 tools/audit-check.py`；流程第 9 条改指向记录。
5. **`pipeline-0to1` 段6 拦截条**：改引「audit-check 无 STALE 未复验」（条件式，不写死字段）。
6. **自举**：把本轮两份 S3 审计报告回填为首批 audit 记录，跑 `audit-check` 自证。

## 6. 验收判据（方案成立标准）

重演两实证，**不靠记得**：
1. 改 prose 附件 ⇒ ③ 报「未经登记的写入」。
2. 改被审工件、记录不动 ⇒ ① 报 STALE。
3. 修 finding 后不补记录 ⇒ ② 报「STALE 无复验」。
4. （新增）`refs/audit/log` 被直接改写而不更新锚点 ⇒ ③+锚点比对报「历史被改写」。
四条全红即成立。

## 7. 边界与风险（诚实）

- **tamper-evident 非 tamper-proof**：§1.3 已述。锚点（`docs/audits/.anchor`）本身也在 git 里、也能被一起改写——**真正的防护需要锚点在写权限之外**（如推送到 remote 后的 tag）。**V1 取「锚点＋推送」折中**：锚点纳入常规 push，改写历史需同时改锚点＋force-push（远端留有痕迹）。**登记为已知天花板，不假装解决**。
- **承载选型＝独立 ref `refs/audit/log`**（实测决定，见下「实测对照」）：`git notes` 在 rebase 下**脱锚**，独立 ref 免疫 rebase。notes 仅作备选（需配 `notes.rewriteRef`，脆弱）。
- **成本**：两脚本约 250 行 ＋ ADR ＋ 两处文档改写。一次性。

### 承载机制实测对照（本会话 scratch 仓跑出）

| 机制 | rebase 后 | 结论 |
|---|---|---|
| `git notes --ref=audit` | note 仍挂**旧 commit SHA**（`fcbc762`），新 HEAD 为 `e24d3f8` ⇒ **脱锚**（note 存在于旧 SHA 上，但当前历史已不含它） | ❌ 不选 |
| 独立 ref `refs/audit/log` | 不受 `feat` 分支 rebase 影响，SHA 存续 | ✅ **选它** |

（实测记录：node `gittest2`，`git rebase` 改写 c2 后 `git notes list` 仍指旧 SHA；`refs/audit/log` 独立存续。）

## 8. 待用户裁

1. 采纳**道路 B·Git 原生**定稿？
2. 承载＝**独立 ref `refs/audit/log`**（§7 实测已定，`git notes` 因 rebase 脱锚被否）——确认即可。
3. 立 **ADR-035**＋落地交付（§5 六件一次做齐）？
