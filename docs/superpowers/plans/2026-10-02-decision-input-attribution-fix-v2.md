# β（stale 输入冲卡）修法实现计划 —— v2（领域忠实口径）

> ⚠️ **已被 v3 取代（`2026-10-02-decision-input-attribution-fix-v3.md`）——勿据本 v2 改码。本文留作历史链。v3 综合六轴 + 直读实现面，补入 v2 遗漏的队列载荷携带/回声 8 站点/T2 计数污染三点。**

> **For agentic workers:** 逐 Task 实现，Task 间设 review 闸。**本文件是 v1 的改判草案（status=草案·待终审）——ADR-014 裁定"保留 C2"后方向修订，未终审前不得据此改码（ADR-012）。**
> 取代 `docs/superpowers/plans/2026-10-01-decision-epoch-binding-fix.md`（v1）的决策表 D1/D2/D10/D11 与 Task 0.5/1/2/4 及 §14 待裁口径；v1 的 mechanics（文件区、sendRef/flush 约束、基线取数法）除本文标注外**沿用**。

**Goal（改判）**：让「对某决策点做出的答复」只作用于它被写就的那个决策点；**并把本不属于"用户答复"的产品回声挡在 C2 分类器之前**——C2（新意图文本→方向拒）作为领域不变量 1 的路由**保留**。

**Architecture（改判·三刀一因）**：
- ⓪→**Task 0.5**：回声（产品按钮自发文本）**不进 C2 分类**——给 `send` 加来源标记（`opts.echo`），按钮站点统一打标，路由块以 `if(opts.echo)→走非用户决策/续跑通道`。**〔第六轴修订〕** 原"接线 3 串 `isDecisionCardEcho`"经实证仅覆盖 3/6 回声（`ConversationPanel.tsx:3095 '方案需要调整一下'`、`:3134 '已解决，谢谢'`、`:3439 '确认，继续'` 漏）、串表脆弱，故升级为来源标记。零契约风险、主刀。
- ① 代次绑定 `decisionEpoch`：作 `ConversationState` 单调计数 + `decision.requested` 载荷字段；**〔第六轴修订〕换代只绑用户行为——`userDecided`（confirm/reject 落定）与 goal 任务边界 → +1；`setPending` 重提议永不换代**（对齐 `ADR-001`「重提议＝同一决策点延续」；原"内容实质变化才+1"与 ADR-001 冲突且 LLM summary 必变使同代次成死代码）。应用点 `send` pending 路由加**归属门**（代次不符→作废该答复，发 `conversation.stale_input_discarded`；代次相符且非回声非问句→照旧走 C2）。
- ② 控件守卫：`userDecided` 校验 `point===s.pending`（域忠实，可先行）。
- ③ 证据引导迟到作废 + 预算退还（沿用 v1 Task 4，含四轴 C2 退还 `evidenceGuideCountRef`）。
- **不动 flush 触发点**（`ConversationPanel.tsx:2614`）、**不做多槽**（`p000143`/`t000068` 方向反转）。

**Tech Stack / Global Constraints**：全部沿用 v1 `## Global Constraints`（ADR-012 修批分离、cwd `apps/desktop`、Conventional Commits、handoff 单一写入口、Mac 为 L5 权威、预存在红 `t000069` 本批不修、词表整句锚定教训）。

---

## 0. 输入与依据

| 项 | 位置 |
|---|---|
| 裁定正文 | `docs/decisions/014-decision-input-attribution-binding.md`（ADR-014，status=proposed·待终审） |
| 四轴审计（技术/治理/因果/外部） | `docs/audits/plan-review-decision-epoch-binding-2026-10-01.md`（GO-with-fixes；本文撤销其 ⓪废C2/S7-1翻转） |
| 第五轴审计（领域忠实度） | `docs/audits/ddd-model-review-decision-epoch-binding-2026-10-02.md` |
| 领域权威 | `docs/design/intent-confirmation-domain-design.md` §3.4 L215 / §3.1 / §4 / §4.1；`docs/domain/00-domain-authority.md` §3.2/§3.4；`ADR-001`/`ADR-006`/`ADR-013` |
| v1（沿用 mechanics 的母计划） | `docs/superpowers/plans/2026-10-01-decision-epoch-binding-fix.md` |

**β 因果链（收紧·第五轴 R3）**：busy 期回声入单槽 → 迟到 flush → `ConversationPanel.tsx:2460` C2 分类把回声判为"非确认" → `reject(direction)` 清空当前决策点。病根＝分类器把「回声/问句/新意图」塌缩成一类；回声豁免 `isDecisionCardEcho`（`agentLoop.ts:55-64`）零消费者。

---

## 1. 决策表（v2·修订项加粗）

| # | 决策 | 对 v1 的改判 |
|---|---|---|
| **D1'** | 待决策点时文本处置：① 回声（`opts.echo` 来源标记，**非**串表）→ 不进 C2、走续跑通道；② 确认词（`isConfirmIntent`）→ confirm；③ 代次相符且其余文本 → **照旧 C2 方向拒（保留）**；④ 代次不符 → 作废（`stale_input_discarded`） | **撤销 v1 D1「三态化废 C2」**；领域 `intent-design:215` 要求新意图 pivot，不废（第六轴：保留依据＝领域显式规定，非"废它打断三契约"——后者证伪） |
| **D2'** | `decisionEpoch` 换代**只绑用户行为**：`userDecided`（confirm/reject 落定）或 goal 边界 → +1；`setPending` 重提议**永不**换代 | **改 v1 D2「同 kind 也+1」+ 改初稿「内容实质变化才+1」**——后者与 `ADR-001` 延续语义冲突（第六轴 §2）；绑用户行为同时解四轴 C3 |
| **D3** | 校验在应用点（`send` pending 路由）；入队只冻结携带 | 沿用 v1 |
| **D4'** | 代次不符→**作废**（可见事件）；回声→**不进路由**；二者均**非**"降级为普通消息驱动" | **改 v1 D4「迟到文本一律降级为普通消息」**——普通消息化＝绕过 userDecided 的旁路，违不变量 1 |
| **D5** | flush 触发点不动 | 沿用 |
| **D6** | 单槽保持，载荷由 `string` 换 `{ text, answer }`（answer 携 epoch/kind） | 沿用 |
| **D7** | 落地 `d000008`：删 `:809` 直写槽特例，统一走 `send`；同批扩 `sendRef` 类型 `:458`（answer 字段） | 沿用（四轴 F3/F4：D7 须提前，Task3 自锁消解） |
| **D8** | ③ 只针对 `systemNudgeKind==='evidence'` 家族 | 沿用 |
| **D9'** | 新事件 `conversation.stale_input_discarded`，domain=`conversation`（**不扩 union**），三步登记，名↔载荷先对齐（第五轴 R6） | 改 v1 D9（四轴 D9 名漂移） |
| **D10'** | ADR-014 **保留并确认** `intent-design:215` C2 语义，**确认**（非取代）`ADR-001`/`ADR-006` | **彻底改 v1 D10「ADR 取代 C2 归义」**——方向反转 |
| **D11'** | `rejectStreak`/梯度阈值**不动**（C2 保留 → 文本累积与重置侧完整） | **撤销 v1 D11「梯度改由 unresolvedTextReplies 承载」**——那是废 C2 的连带补丁，现不需要 |
| **D12（新）** | 控件守卫 `userDecided` 加 `point!==s.pending→return`（system_clarify 例外）——域忠实、零契约风险、**可先行** | 四轴 C1 + 第五轴 R4 |
| **D13（新）** | **不新增打字拒绝词表**（`isDeclineIntent` 撤销）——显式拒绝＝卡片按钮 + `RejectReason` | 用户 Q2 + 第五轴（C2 保留已承载打字取消） |

---

## 2. 文件结构（改动落位·增量）

| 文件 | 本批职责 | Task |
|---|---|---|
| `src/domain/agentLoop.ts` | **（主刀）** `isDecisionCardEcho` 降为兜底/可删（第六轴：3 串仅覆盖 3/6 回声）；撤销 v1 拟新增 `isDeclineIntent` | 0.5 |
| `src/renderer/ConversationPanel.tsx` | `send` opts 扩来源标记 `echo`（`:458`/签名）；路由块（`:2454-2482`）以 `if(opts.echo)→续跑通道不进 C2`；按钮回声站点打标（`:3000/3018/3075/3095/3134/3436-3439 confirmText`）；队列载荷（`:758/:809/:2415-2421/:2447`）+ 代次归属门 + 迟到守卫 | 0.5,1,3,4 |
| `src/domain/conversationState.ts` | `decisionEpoch` 字段（`interface :111-126`/`initialState :128-141`）+ **换代只在 `userDecided`/goal 边界递增，`setPending`（`:303-316`）不递增** + `isAnswerToCurrent` + `DecisionAnswer` 类型；**控件守卫 `userDecided :149-171`** | 0.5(守卫),1 |
| `src/domain/timeline.ts` | `conversation.stale_input_discarded` 登记（复用 domain=conversation） | 4 |
| `tests/unit/conversationState.test.ts`/`agentLoop.test.ts` | L1：代次延续/换代、归属门、控件守卫、回声短路 | 0.5,1 |
| `tests/interaction/cards-from-decision-content.interaction.ts` | **S7-1 保持不变**；新增 **T-ECHO-1**（回声撞新决策点→不误拒/误确认）、T-BOUND-1（manualEmit 交错·四轴 F1）、T-STALE-1（补 write 轮·四轴 F2） | 0.5,1,3,4 |
| `docs/decisions/014-*.md`（已成稿）/`000-decision-log.md`（已加行）/`docs/tests/coverage-matrix.md` | 规范/矩阵 | 6 |
| `.handoff/`（经 CLI） | `t000071` 收口、新批状态 | 6 |

**独占区**（串行勿并行）：Task 0.5/1/3/4 同改 `ConversationPanel.tsx` 不同区——0.5 只碰路由块头（`:2454` 后插入短路）；1 只碰 `send` 签名 + 路由块内归属门；3 只碰 `:758/:809/:2415-2421/:2438-2450`；4 只碰 `:804-810` 与 `send` 顶守卫。

---

## Task 0 · 取改前基线（**不改码**）

沿用 v1 Task 0。**追加**：L3 稳定红集合须同命令**串行跑 N≥3 次取交集**（四轴 §0 表、第五轴 Not-Ready 阻塞项；`u000010` 现仅 N=2，第 3 次运行在此补）。记录 `#7-2`/`core:161` 等 flake vs 稳定红，`t000069` 三例本批不修。
- [ ] Gate：基线取到（含 N≥3 交集）+ 工作树干净才进。**取不到→停并汇报。**

## Task 0.5 · 主刀：回声来源标记 + 控件守卫（域忠实·可先行）

> **〔第六轴修订〕** 原"接线 3 串 `isDecisionCardEcho`"实证仅覆盖 3/6 回声（`方案需要调整一下`/`已解决，谢谢`/`确认，继续` 漏，且尾随全角逗号破坏 `isConfirmIntent` 整句锚定）——升级为 `send` 来源标记，去字符串表脆弱。

- Step1 失败测试（L1）：路由块对 `opts.echo=true` 的文本不触发 confirm/reject；`userDecided(s,'goal',…)` 当 `s.pending==='plan'` → 原样返回 `s`。
- Step2 实现：
  - `send` opts 扩 `echo?:boolean`（`:458` 签名）；全部按钮回声站点（`:3000/3018/3075/3095/3134/3436-3439`）改传 `{ text, echo: true }`。
  - 路由块 `ConversationPanel.tsx:2454` 进 `!silent`/C2 前：`if (opts.echo) { /* 产品自发回声：不进 C2 文本判定，走续跑/系统通道（ADR-014 #2；是否改 silent 触 T-FORCE-2 留终审 §14.2） */ }`——**非丢弃**（回声驱动模型续跑，丢弃＝误拒变停滞）。`isDecisionCardEcho` 保留为兜底（防未打标路径）。
  - `conversationState.ts:149-171` `userDecided` 首行：`if (point !== s.pending && point !== 'system_clarify') return s`
- Step3 L3：`-g "S7-1"` 须**仍绿**（不回退，不翻转）；`-g "T-ECHO-1"` 改前红（至少一条漏网回声如 `确认，继续` 撞新决策点误拒）、打标后绿。
- Gate：L1 新增绿、双 tsc 0 错、L3 失败清单 ⊆ 改前。

## Task 1 · 领域层：decisionEpoch（换代绑用户行为）

> **〔第六轴修订〕** 初稿"内容实质变化才+1"与 `ADR-001`「重提议＝同一决策点延续」冲突（LLM summary 必变→同代次死代码→误作废有效答复）。改为只绑用户行为。

- 字段 `decisionEpoch:number`（initial 0）。**`setPending` 重提议不递增 epoch**（同决策点延续，`rejectStreak` 亦不重置——`ADR-001`）；**仅在 `userDecided`（confirm/reject 落定）与 goal 任务边界递增**。
- `isAnswerToCurrent(answer, s)`：`answer.epoch===s.decisionEpoch && answer.kind===s.pending`。
- L1：`setPending` 重提议 epoch 不变；`userDecided` confirm/reject 后新决策点 epoch+1；跨代答复 `isAnswerToCurrent===false`（作废，走 `stale_input_discarded`）；队列里为旧代次写的确认语在同代次未变时可落地（解四轴 C3）。

## Task 2 · （撤销）

v1 Task 2「三态路由 + S7-1 契约翻转」**整节作废**（第五轴 R1/R2）。其有效部分并入 Task 0.5（回声短路）与 Task 1（归属门）。**S7-1 保持原断言。**

## Task 3 · 绑定贯通（沿用 v1 Task 3，含 D7 提前 + `sendRef` 类型 `:458` 扩 answer）

入队冻结 `{text, answer:{epoch,kind}}` → flush 携带 → `send` pending 路由先 `isAnswerToCurrent`，不符 → 走 Task 4 作废事件，**不进 C2**。相符且非回声 → C2/confirm 照旧。

## Task 4 · ③ 证据引导迟到作废 + 预算退还 + 交错定案（沿用 v1 Task 4，加四轴修正）

- 迟到 `evidence` 引导作废 + **退还 `evidenceGuideCountRef`（`:802` 先自增者须回退）**（四轴 C2，否则削不变量 4）。
- 新事件 `conversation.stale_input_discarded` 三步登记（domain=conversation）。
- **交错顺序断言**（四轴 F5）：`system_nudge` vs `pending_set{resolution}` 的 seq 定案；转红即停。

## Task 5 · 全链验证（不改产品码）+ Task 6 · 规范/矩阵/交接

沿用 v1 Task 5/6，但 §14 待裁口径按 ADR-014 重写：C2 保留、S7-1 不变、无拒绝词表、`t000069` 扩至 4 稳定红（含 `core:161`）与否**另裁**、N≥3 基线。

---

## 12. DoD 断言矩阵（闸门口径＝**不新增失败**）

| 断言 | 内容 | 判定 |
|---|---|---|
| A1 | 回声不再改动任何决策点（全部 6+ 按钮站点经来源标记；confirm/reject 皆不触发） | T-ECHO-1 绿 |
| A2 | 代次相符的真新意图**仍走 C2 方向拒**（`intent-design:215` 不变量 1 路由） | **S7-1 保持绿** |
| A3 | 代次不符的答复作废、发 `stale_input_discarded`、不 confirm 当前卡 | T-BOUND-1/T-STALE-1 绿 |
| A4 | `setPending` 重提议 epoch 不变、rejectStreak 不重置；**换代仅随 `userDecided`/goal 边界**（对齐 `ADR-001`） | L1 绿 |
| A5 | 控件点旧卡不清空新 pending（`point!==s.pending`→原样返回） | L1 绿（不变量 1+7） |
| A6 | 无 `isDeclineIntent`/拒绝词表引入 | grep 无该符号 |
| A7 | `ADR-006` 换目标通道、`ADR-001` 重置侧不受扰动 | 现有相关测试保持绿 |
| A8 | ③ 丢弃退还 `evidenceGuideCountRef`（不变量 4 不削） | 相关 L1/`S4-3b` 不因此新增红 |
| A9 | 全链不新增失败：L1/双 tsc/eslint 干净；**L3 改后失败清单 ⊆ 改前同次运行**（对照用清单，不用历史数字） | §14 逐字对照表 |

---

## 13. 影响矩阵 / 风险

- **降**：本 v2 保留 C2，不动 `intent-design:215`。〔第六轴降级〕原"废 C2 触三条契约（第五轴 R1）"被证伪——三契约机制不受伤；保留 C2 的真正依据是"领域显式规定它，改它＝契约变更（需勘误同步）"，非"废它必炸"。
- **残留**：C2 coarse 尾巴（「等下」类非意图文本仍判方向拒）——epoch 门 + `rejectStreak` 上限 + 按钮路径兜底，判可接受。回声通道定性（silent vs 不落用户通道）留终审（`ADR-013`/T-FORCE-2）。

## 15. 明确不做（本批范围外）

- 废 C2 / 翻转 S7-1 / 新增拒绝词表（均经领域裁定撤销）。
- 多槽队列、边缘 flush、approval 侧 `toolCallId` 精确配对（v1 §15 已列后续独立叶）。
- 若产品终审仍决意废 C2：只需**勘误级**同步（`intent-design:215` 一句 + `ADR-006:24` 边界句 + `conversationState.ts` 注释），**不必** supersede `ADR-001/006`（第六轴更正——三契约机制不依赖 C2）；但仍是领域语义变更，另裁。

## 14. 待终审（执行时填写证据表）

1. ADR-014 定稿批准（含"保留 C2 / 确认 ADR-001/006"）。
2. 回声通道定性：不进路由（默认）vs 改 silent（契约变更，触 T-FORCE-2）。
3. `isQuestionLike` 问句不作方向拒——是否纳入本批。
4. `t000069` 并入 `core:161`（第 4 稳定红）与否 + N≥3 基线达标确认。
5. 修批完成后 push 授权（ahead origin 20 + 本会话新增文件）。
