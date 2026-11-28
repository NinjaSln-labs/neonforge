# Stage V2-Task-Snapshot Spec（任务状态机跨重启）

> 来源：GitHub #11（会话快照完整化——ITaskRepository）；开工日期：2026-11-15；ADR：`docs/decisions/013-task-snapshot-cross-restart.md`

## DoD（机器可验证断言——stage-gate 逐条执行）

- [x] L1 全量绿：`npx vitest run`（ADR-013 阶段时点：71 文件 / 837 用例；初始 9 条 + 审查修复批 8 条——见 TDD 网格）
- [x] L2 契约：`npx tsc -p tsconfig.json --noEmit` + `npx tsc -p tsconfig.main.json --noEmit` 0 错
- [x] L3 交互：`npx playwright test --project=interaction`（ADR-013 阶段时点：全量 78/78；新增恢复场景 3 条）
- [x] 行为验收：种子化 V2 会话快照 → 重启/新页面恢复 pending 卡与确认位；损坏快照不崩、旧 V1 存档可读；恢复待授权工具卡可见且启动时间线不出现伪造的 `session.pending_set`/`decision.requested`/`decision.resolved`
- [x] 审计状态：本阶段无 open 审计项
- [x] 覆盖矩阵已更新（`docs/tests/coverage-matrix.md`）
- [x] 决策日志同步：ADR-013（accepted）；决策日志索引已更新
- [x] 已提交（2026-11-15；未推送——按用户要求）

## TDD 网格（本阶段新增功能——spec-first + test-first）

| 功能               | 规范断言（来源 ADR-013 §Decision）                                 | 失败测试（红）                                          | 实现（绿）                              | 重构                        |
| ------------------ | ------------------------------------------------------------------ | ------------------------------------------------------- | --------------------------------------- | --------------------------- |
| 任务快照序列化往返 | 全部 A1 字段（Set/决策点/拒绝计数）JSON 往返不变                   | `tests/unit/taskSnapshot.test.ts`                       | `src/domain/taskSnapshot.ts`            | 校验分支抽纯函数            |
| 损坏/版本快照容错  | 非法版本、字段类型、pending 枚举 → `null` 不崩                     | 同上                                                    | `fromTaskSnapshot`                      | 复用类型守卫                |
| 会话快照原子写     | `saveSession(msgs, task)` → 单键 V2；`loadTaskSnapshot` 返回同对象 | `tests/unit/sessionStore.test.ts`                       | `sessionStore` V2                       | 保持 `saveSession` 兼容签名 |
| V1 存档兼容        | 旧数组存档 → 消息可读、任务快照 `null`                             | 同上                                                    | `parseSessionFile` 分支                 | —                           |
| 恢复不产生事件     | `restoreTaskState` 不改写 `deriveStateEvents` 时间线               | `tests/unit/useConversationState.test.ts`（纯函数等价） | `useConversationState.restoreTaskState` | —                           |
| 恢复卡显示         | 种子化 V2 快照后重启 → pending 卡可见且内容为快照                  | `tests/interaction/sessionRestore.interaction.ts`       | `useMessageStore` 恢复接线              | 快照优先于消息旧快照        |
| 持久化优先级       | 有任务快照时不被旧 `decisionContent` 覆盖                          | 同交互测试                                              | `useMessageStore` 分支                  | —                           |

## 产出物

- `apps/desktop/src/domain/taskSnapshot.ts`（新增）
- `apps/desktop/src/renderer/sessionStore.ts`（V2 会话记录）
- `apps/desktop/src/renderer/useConversationState.ts`（`restoreTaskState`）
- `apps/desktop/src/renderer/useMessageStore.ts`（恢复/持久化接线）
- `apps/desktop/tests/unit/taskSnapshot.test.ts`、`sessionStore.test.ts` 扩充、`tests/interaction/sessionRestore.interaction.ts`（3 场景）
- 文档：ADR-013、本 spec、`06/07/08/09/10` 与覆盖矩阵

## 边界（不做——防蔓延）

- 云端同步 / 多设备（#15）
- main 侧 TaskRepository 与新 IPC（renderer 状态所有权不变）
- 工具执行中的半截状态与 streaming 消息跨重启
- 信任分级（#12）、结构化澄清（#13）
