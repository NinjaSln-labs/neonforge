# Stage V2-Gate-Denied-Spec（机制拒绝事件 gate.denied）

> 来源：GitHub #16（机制事件补全——gate.denied 结构化拒绝事件）；ADR：`docs/decisions/016-gate-denied-mechanism-event.md`

## DoD（机器可验证断言——stage-gate 逐条执行）

- [x] L1 全量绿：`npx vitest run`（75 文件 / 884 用例；新增 gate.denied 注册与 canExecute 结构化拒绝断言）
- [x] L2 契约：`npx tsc -p tsconfig.json --noEmit` + `npx tsc -p tsconfig.main.json --noEmit` 0 错
- [x] L3 交互：`npx playwright test --project=interaction`（85/85；新增 gateDenied 1 场景）
- [x] 行为验收：用户拒绝 bash 授权后，模型重试同命令 → 不弹授权卡、不执行；时间线出现一条 `gate.denied`（gate=rejection-memory、name、reason、attribute.kind=hazardous、risk=high）；首次审批卡阶段不产生 `gate.denied`
- [x] 审计状态：本阶段无 open 审计项
- [x] 覆盖矩阵已更新（表 2/表 13）
- [x] 决策日志同步：ADR-016（accepted）；决策日志索引已更新
- [x] 已提交（2026-11-17）

## TDD 网格（本阶段新增功能——spec-first + test-first）

| 功能                  | 规范断言（来源 ADR-016 §Decision）                                                                  | 失败测试（红）                             | 实现（绿）                    | 重构                                       |
| --------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------- | ------------------------------------------ |
| canExecute 结构化拒绝 | 拒绝来源 `deniedBy` 三值；rejection-memory/action-gate 带 attribute+risk；session-gate 不带         | `conversationState.test.ts`                | `domain/conversationState.ts` | 先算 actionGate 再消费拒绝记忆（判定单源） |
| 事件注册              | `gate.denied` domain=gate、role=system、detailKeys=name/gate/reason/attribute/risk                  | `timelineEvents.test.ts`                   | `domain/timeline.ts`          | 复用既有注册表模式                         |
| 发送点                | 仅 rejection-memory/action-gate 且非 pending/confirm 抢先时发送；每次拦截一条；与 tool.blocked 共存 | `gateDenied.interaction.ts`                | `renderer/useChatStream.ts`   | 事件载荷由 toolGate 直取                   |
| 边界保持              | ask 不发送；session-gate（pending/确认点/清单）不发送；不改变门控顺序                               | `conversationState.test.ts` / 交互首卡断言 | —                             | —                                          |

## 产出物

- `apps/desktop/src/domain/conversationState.ts`（`ExecuteGateResult`）
- `apps/desktop/src/domain/timeline.ts`（`gate.denied` 登记）
- `apps/desktop/src/renderer/useChatStream.ts`（发送点）
- `apps/desktop/tests/unit/conversationState.test.ts`、`timelineEvents.test.ts` 扩充
- `apps/desktop/tests/interaction/gateDenied.interaction.ts`（新增）
- 文档：ADR-016、本 spec、`docs/domain/06-domain-events.md`（实现状态注记）、覆盖矩阵、决策日志

## 边界（不做——防蔓延）

- 改变 ActionGate 策略默认值或门控顺序（SessionGate 优先保持）
- 把 `ask` 计入 `gate.denied`
- 并入/删除 `tool.blocked`（工具层事件保留）
- main 执行层 `r.policy` 拒绝并入本事件（仍为 `tool.blocked gate='policy'`）
- 新的事件消费 UI（本阶段只登记与发送）
