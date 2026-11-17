# Stage V2-Problem-Ledger-Sync Spec（问题台账 Local-first 同步）
> 来源：GitHub #15（问题台账云端同步 / 多设备）；ADR：`docs/decisions/018-problem-ledger-sync.md`；开工日期：2026-11-17

## DoD（机器可验证断言——stage-gate 逐条执行）

- [x] L1 全量绿：`npx vitest run`（79 文件 / 939 用例；见 TDD 网格）
- [x] L2 契约：`npx tsc -p tsconfig.json --noEmit` + `npx tsc -p tsconfig.main.json --noEmit` 0 错
- [x] L3 交互：`npx playwright test --project=interaction`（90/90；设置页同步区块场景 + 全量回归）
- [x] 行为验收：renderer 启动加载 main 台账；保存后 main 文件存在且 0600；localStorage 仅作降级
- [x] 行为验收：加密快照 roundtrip；错误口令/损坏 → 拒绝覆盖；无口令 → 同步失败且不写明文
- [x] 行为验收：本地/远端同 id 冲突按 revision→updatedAt→deviceId 确定性合并；删除 tombstone 不复活；结果上限 20
- [x] 行为验收：同步目录指向项目根/工作区 → 拒绝；远端 >1 MiB/未知 schema → 拒绝
- [x] 审计状态：上阶段 open 项全部 fixed / recorded
- [x] 覆盖矩阵已更新（表 16）
- [x] 决策日志同步：ADR-018；`000-decision-log.md` 索引已更新
- [x] 已 push + CI 绿（qa.yml run；PR #23）

## TDD 网格（本阶段新增功能——spec-first + test-first）

| 功能 | 规范断言（来源 ADR-018 §Decision） | 失败测试（红） | 实现（绿） | 重构 |
|------|-----------------------------------|---------------|-----------|------|
| 台账合并 | revision 高者胜；同 revision updatedAt 晚者胜；再同 deviceId 大者胜；tombstone 传播 | 新 `problemLedger.test.ts` | `src/domain/problemLedger.ts` | 纯函数单源 |
| 台账规范化 | 白名单字段、上限 20、损坏项跳过、schemaVersion 校验 | 同上 | 同上 | 迁移器与合并器分离 |
| main 权威存储 | 0600/原子写/损坏回退/旧 localStorage 导入 | 新 `problemLedgerStore.test.ts` | `src/main/problemLedgerStore.ts` | 存储与加密分离 |
| 加密快照 | scrypt+AES-GCM roundtrip；错口令/损坏失败；无口令拒绝 | 新 `problemSyncCrypto.test.ts` | `src/main/problemSyncCrypto.ts` | 密钥来源解析单源 |
| 同步编排 | 读本地/远端 → merge → 写回；冲突摘要；目录边界/大小/schema 拒绝 | `problemLedgerStore.test.ts` | `problemLedgerStore.ts` | transport 可替换接口 |
| IPC/UI | load/save/status/choose-folder/sync-now；设置页提示与按钮状态 | `ipcSchema.test.ts` + 新 `problemSync.interaction.ts` | `ipc.ts`、`ipcSchema.ts`、`preload.ts`、SettingsPanel | 选择/错误状态单源 |
| renderer 迁移 | 启动 main 加载；保存 main + localStorage 降级；main 不可用仍可用 | `problemStore.test.ts`（扩充）+ interaction | `MainWorkspace.tsx`、`problemStore.ts` | 存储适配层 |

## 产出物

- `apps/desktop/src/domain/problemLedger.ts`（ProblemLedger/Tombstone/merge/normalize）
- `apps/desktop/src/main/problemSyncCrypto.ts`（口令来源、scrypt、AES-GCM）
- `apps/desktop/src/main/problemLedgerStore.ts`（main 权威、同步目录、原子写、syncNow）
- `apps/desktop/src/main/ipc.ts`、`ipcSchema.ts`、`src/preload/preload.ts`、`src/renderer/types.d.ts`
- `apps/desktop/src/renderer/SettingsPanel.tsx`（同步区块）、`MainWorkspace.tsx`、`problemStore.ts`
- 测试：`problemLedger.test.ts`、`problemLedgerStore.test.ts`、`problemSyncCrypto.test.ts`、`problemStore.test.ts` 扩充、`problemSync.interaction.ts`
- 文档：ADR-018、本 spec、覆盖矩阵表 16、tasks §14

## 边界（不做——防蔓延）

- 不实现厂商云 API/OAuth/账号体系（transport adapter 预留）
- 不实现实时协同/逐字段冲突合并 UI
- 不同步聊天正文、工具输出、API Key、项目文件
- 不改变 Task 快照/交付包/用量台账存储
