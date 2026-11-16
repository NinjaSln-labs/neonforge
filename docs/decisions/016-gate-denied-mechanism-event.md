# ADR-016：机制拒绝事件 gate.denied（GitHub #16）
- 状态: accepted
- 日期: 2026-11-17
- 相关: GitHub #16（机制事件补全）；`docs/design/intent-confirmation-domain-design.md` §3.4 C6 / §3.5；`docs/audits/stage-review-S7-2026-08-16.md`（gate.denied deferred）；stage-specs/V2-gate-denied-events.md

## Context

意图确认重设计 §3.5 已登记领域事件 `gate.denied`（ActionGate deny——高风险动作被机制拦截，非 ask），但实现一直未落地：

1. `tool.blocked` 是工具执行层的拦截事件（载荷 `gate: pending/confirm/gate/out-of-plan/policy`），无法区分「等待用户决策」与「机制拒绝」；消费方要从 reason 文本反推；
2. S7 已落地拒绝记忆短封（`deniedApprovals`——同任务同类动作直接 deny），但该拒绝只写 `tool.blocked`，没有独立的领域事件；
3. `canExecute` 返回值只有 `{ ok, reason }`，没有拒绝来源/动作属性/风险等结构化字段，应用层无法在不重复判定逻辑的前提下打点；
4. ActionGate 的 `deny` 策略（`policy.hazardous='deny'`）在领域层可测，但事件契约缺失。

## Decision

**把 `canExecute` 的机制拒绝（deny）升级为结构化结果，并登记/发送 `gate.denied` 领域事件；`tool.blocked` 保留为工具层拦截事件，两者分层共存。**

1. **领域返回值（`conversationState.canExecute`）**：在 `{ ok, reason }` 基础上增加拒绝来源 `deniedBy`：
   - `session-gate`：会话冻结/确认点前置/清单边界（`sessionGate` 拒绝——不是 ActionGate 判定）；
   - `rejection-memory`：`deniedApprovals` 同任务同类短封；
   - `action-gate`：`actionGate` 的 `deny` 策略（`policy.hazardous='deny'`）。
   `rejection-memory` / `action-gate` 同时携带 `attribute`（ActionAttribute：kind+basis）与 `risk`（low/medium/high），由 `actionGate` 单源输出，供事件审计。
2. **timeline 注册（`timeline.ts`）**：
   - 新事件 `gate.denied`，domain `gate`（联合新增成员），role `system`；
   - 载荷 `detailKeys: ['name','gate','reason','attribute','risk']`；`gate` 取值 `'rejection-memory' | 'action-gate'`。
3. **发送点（`useChatStream`）**：在工具门控分支中，仅当本次拦截不是 `pendingBlocked`/`confirmGate` 抢先、且 `toolGate.deniedBy` 为 `rejection-memory`/`action-gate` 时发送一次 `gate.denied`；同点的 `tool.blocked` 保持原样。事件不重复记录 `args`，避免把命令/内容全文写入领域审计事件。
4. **边界**：
   - ActionGate 的 `ask` 不产生 `gate.denied`——它产生授权卡/`tool.blocked`；
   - `sessionGate` 的 pending/确认点/清单边界拒绝不归 `gate.denied`（仍由 `tool.blocked` 记录，`deniedBy='session-gate'` 仅供调用方分支）；
   - main 执行层的 `r.policy` 拒绝暂不并入本事件（仍为 `tool.blocked gate='policy'`）——它是执行边界二次判定，后续如需要再单列事件。

## Consequences

- 积极：机制拒绝与等待决策在时间线可区分；拒绝记忆/高危策略的拒绝可审计到动作属性（kind/basis）与风险；`canExecute` 成为门控判定+拒绝分类的单源，应用层无需重复 classify。
- 代价：`canExecute` 返回类型从两字段扩展为判别联合，调用方需处理新增字段；事件与 `tool.blocked` 在同一路径同时出现，消费方需按 domain 选择。
- 边界：不改变任何门控语义/顺序（SessionGate 仍优先）；不新增授权卡路径；不把 `args` 全文写入 `gate.denied`。
