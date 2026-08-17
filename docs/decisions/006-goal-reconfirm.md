# ADR-006：换目标重新确认——goal 已确认后的新目标提议 = 新任务提议（#7）

- 状态: accepted
- 日期: 2026-08-16
- 相关: #7（V1.x——连续任务体验观察项）；docs/domain/00-domain-authority.md（确认卡=推进门槛/触发权在系统）；conversationState.ts deriveDecisionPoint（不变量 2）

## Context

现状：`deriveDecisionPoint` 第 1 条 `!state.goalConfirmed && proposals.goal → 'goal'`——goal 已确认后，模型输出新【目标确认：X】（用户换目标）**不触发目标卡**（goalConfirmed 残留 true）——换目标没有确认门槛，且 UI 上模型自报的【目标确认】被忽略——与「确认卡=推进门槛/触发权在系统」语义矛盾（连续任务体验缺口——2026-08-16 D3-2 场景设计中暴露的观察项）。

## Decision

**goal 已确认后的新目标提议（`proposals.goal !== undefined`）→ 仍然触发 goal 决策点（换目标/新任务提议）**：

- `deriveDecisionPoint` 第 1 条去掉 `!state.goalConfirmed` 前置——任何 goal 提议（含已确认后）→ `'goal'`
- 语义：goal 已确认 + 新 goal 提议 = **换目标（新任务）**——用户确认 → `userConfirmed('goal')` 既有的任务边界清理自动生效（清进度/清单/达成/拒绝记忆——A0 §9 目标驱动原点）；拒绝 → 保持当前任务
- 误弹防御：模型同任务内重复输出【目标确认】标记才误弹——sysPrompt ⑬ 契约「收敛后输出一次」+ L1 锁定「已确认后无标记不弹卡」；正常对话（复述目标但不带标记）→ `goalProposal` undefined → 不弹
- 触发权保持：模型只能**提议**（弹卡），确认动作永远在用户（确认卡）——不破坏不变量 2

## Consequences

- 积极：换目标有明确确认门槛（与目标/方案/解决三卡一致）；新任务边界（清清单+reset 同步 main——D3）随确认自动生效；拒绝 = 回到目标澄清（安全回退——不会误推进新任务）
- 代价：模型同任务内重复输出【目标确认】标记会弹卡（契约防御 + 测试锁定——误弹时用户点拒绝即恢复）；D3 的 plannedFiles 在换目标确认时被清（正确语义——新任务不继承旧批准）；**拒绝换目标 = 回到目标澄清**（goalConfirmed 回 false——用户重申原目标；「拒绝 = 维持原任务」需 state 记录旧目标文本——归 V2 会话快照范畴，本 ADR 不扩张）
- 边界：goalFallback（userRequested==='goal'——用户主动发起确认）语义不变；「换目标」的自由文本触发通道（用户打字换目标）由模型提议承载（现有 C2 分流——非确认意图文本 → 模型重提议）
