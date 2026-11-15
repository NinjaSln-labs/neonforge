# P1-05 · ConversationPanel 拆分计划

> 状态：阶段 1–5 已完成（`ConversationPanel.tsx` 3372 → 1320 行）。目标：应用层编排与领域状态分离，组件只保留组合与布局。

## 现状

- `ConversationPanel.tsx`：约 1320 行；保留状态装配、确认卡/工具卡视图派生与渲染（视图子组件 `DecisionCards`/`CandidateButtons`/`ConversationComposer` 已独立）。
- 已独立：`useConversationState`（领域状态写路径）、`useToolApproval`（授权动作）、`useChatStream`（流式事件）、`useChatEngine`（轮次编排）、`useTimelineLog`（时间线）、`useMessageStore`（消息持久化/恢复）、`useConversationTelemetry`（卡/状态打点）、`useEvidenceVerification`（完成声明对账）、`conversationFormat`、`conversationHistory`、`DecisionCards`、`ConversationComposer`。
- 约束：`applyChunk` / `runChat` 依赖大量 ref 与组件状态，不能一次性搬移；按阶段迁移、每阶段独立验证。

## 阶段

1. [x] **纯格式化/展示辅助**（2026-11-14）：`fmtToolResult`、`fmtToolArgs`、`AssumptionList`、`hasProtoCall`、`isActionPromise` → `conversationFormat.tsx`（102 行；无行为变更）。
2. [x] **决策卡组件**（2026-11-14）：目标/计划/达成确认卡 → `DecisionCards.tsx`；只接收快照与回调，组件内不读写 `stateRef`。卡片相关 interaction 40 项：39 通过 / 1 既有 `.nf-start` flaky。
3. [x] **输入区**（2026-11-15）：输入框、@引用浮层、发送/停止/合并授权按钮 → `ConversationComposer.tsx`；输入区本地状态内聚，发送/停止由面板回传。core interaction 28 项：27 通过 / 1 既有 `.nf-start` flaky。
4. [x] **流式/工具链编排**（分步迁移）：
   - [x] **4a 历史构建**（2026-11-15）：`buildHistory` → `conversationHistory.ts`（纯函数 + 单测；工具轮 rawResult/reasoning_content 语义不变）。
   - [x] **4b 流式事件**（2026-11-15）：`applyChunk` → `useChatStream.ts` 的 `createApplyChunk(deps)` 工厂（35 项显式依赖）；状态所有权仍归面板，闭包时序与 `applyChunkRef` 更新方式不变。interaction 71 项：69 通过 / 2 既有 flaky（`.nf-start`、自动续跑双发）；单测 760 通过。
   - [x] **4c 轮次编排**（2026-11-15）：`runChat` / `maybeContinue` / `send` / `finishError` / `retryFailedTurn` / `stopGeneration` / `flushPendingSend` → `useChatEngine.ts`（838 行 hook：链锁与跨轮重复检测内聚）。与 `useToolApproval` 的循环依赖用迟绑定 getter（`getApproveAllToolCalls`）解耦；`sendRef`/`doneNotifierRef`/`pendingSendRef` 仍由面板持有以保持 4b 时序。interaction 71 项：70 通过 / 1 既有 `.nf-start` flaky；单测 760 通过。
5. [x] **面板收敛（应用逻辑）**（2026-11-15）：会话时间线 → `useTimelineLog.ts`；消息状态/恢复/持久化 → `useMessageStore.ts`；卡弹出与状态变化打点 → `useConversationTelemetry.ts`；完成声明对账 → `useEvidenceVerification.ts`。面板保留状态装配与渲染（确认卡/工具卡视图与回调用法属组合层；不再外迁以避免高耦合 props 膨胀）。interaction 74/74（两个既有 flaky 已在 tasks 4.4 处置；代码审查修复后新增失败重试/排队回归）；单测 786 通过。

## 每阶段验收

- `npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.main.json --noEmit`
- `ELECTRON_OVERRIDE_DIST_PATH=/tmp/nf-electron-dummy npx vitest run`
- `npx eslint src tests`（0 error）
- `npm run build`
- 涉及渲染/交互的阶段额外跑 `npx playwright test --project=interaction`；已知既有 flaky 用例需先记录基线再比较（`.nf-start` 启动竞态、计划确认后重试双发；base 可复现）。

## 风险与回滚

- 阶段 4 风险最高（闭包/时序/React StrictMode 双调用）；若失败，保留前 3 阶段成果，阶段 4 单独回滚。
- 阶段 5 只搬移应用层逻辑，不改领域层与 IPC 契约；不借拆分修改行为（行为变更必须独立提交）。

## 每阶段验收

- `npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.main.json --noEmit`
- `ELECTRON_OVERRIDE_DIST_PATH=/tmp/nf-electron-dummy npx vitest run`
- `npx eslint src tests`（0 error）
- `npm run build`
- 涉及渲染/交互的阶段额外跑 `npx playwright test --project=interaction`；已知既有 flaky 用例需先记录基线再比较。

## 风险与回滚

- 阶段 4 风险最高（闭包/时序/React StrictMode 双调用）；若失败，保留前 3 阶段成果，阶段 4 单独回滚。
- 不改变领域层与 IPC 契约；不借拆分修改行为（行为变更必须独立提交）。
