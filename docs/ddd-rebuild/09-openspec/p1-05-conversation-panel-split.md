# P1-05 · ConversationPanel 拆分计划

> 状态：进行中（阶段 1 已完成）。目标：应用层编排与领域状态分离，组件只保留组合与布局。

## 现状

- `ConversationPanel.tsx`：约 3372 行；同时承担 UI 渲染、流式事件处理、工具链续聊、确认卡逻辑、输入区交互。
- 已独立：`useConversationState`（领域状态写路径）、`useToolApproval`（授权动作）、`CandidateButtons`、`conversationFormat`（纯格式化辅助）。
- 约束：`applyChunk` / `runChat` / `maybeContinue` 依赖大量 ref 与组件状态，不能一次性搬移；按阶段迁移、每阶段独立验证。

## 阶段

1. [x] **纯格式化/展示辅助**（2026-11-14）：`fmtToolResult`、`fmtToolArgs`、`AssumptionList`、`hasProtoCall`、`isActionPromise` → `conversationFormat.tsx`（102 行；无行为变更）。
2. [x] **决策卡组件**（2026-11-14）：目标/计划/达成确认卡 → `DecisionCards.tsx`；只接收快照与回调，组件内不读写 `stateRef`。卡片相关 interaction 40 项：39 通过 / 1 既有 `.nf-start` flaky。
3. [ ] **输入区**：输入框、@引用浮层、发送/停止/合并授权按钮 → `ConversationComposer.tsx`。
4. [ ] **流式/工具链编排**：`applyChunk` / `runChat` / `maybeContinue` / `send` / `finishError` / `retryFailedTurn` → `useChatEngine.ts`；以显式依赖对象接入（参照 `useToolApproval`），状态所有权仍归面板。
5. [ ] **面板收敛**：`ConversationPanel` 仅组合布局、订阅 hook 返回值与渲染子组件。

## 每阶段验收

- `npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.main.json --noEmit`
- `ELECTRON_OVERRIDE_DIST_PATH=/tmp/nf-electron-dummy npx vitest run`
- `npx eslint src tests`（0 error）
- `npm run build`
- 涉及渲染/交互的阶段额外跑 `npx playwright test --project=interaction`；已知既有 flaky 用例需先记录基线再比较。

## 风险与回滚

- 阶段 4 风险最高（闭包/时序/React StrictMode 双调用）；若失败，保留前 3 阶段成果，阶段 4 单独回滚。
- 不改变领域层与 IPC 契约；不借拆分修改行为（行为变更必须独立提交）。
