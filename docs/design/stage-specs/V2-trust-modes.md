# Stage V2-Trust-Modes Spec（信任模式预设与低危委托边界）
> 来源：GitHub #12（授权疲劳治理——低危委托档位/模式预设）；ADR：`docs/decisions/015-trust-modes-delegation-boundary.md`

## DoD（机器可验证断言——stage-gate 逐条执行）

- [x] L1 全量绿：`npx vitest run`（75 文件 / 875 用例；新增 trustPolicyStore/authModel 判定/tools 委托边界/迁移回归）
- [x] L2 契约：双 tsconfig 0 错；IPC schema + main↔preload parity 通过
- [x] L3 交互：84/84 通过（含 trustModes 3 场景：设置页切换/迁移、delegated 计划内 edit 自动、strict 计划内 write 仍授权）
- [x] 行为验收：strict 计划确认不自动放行写入；standard 计划内 write 自动、edit 授权；delegated 计划内 write/edit 自动；清单外/根外/bash 始终弹卡；旧 localStorage 开关迁移到 delegated。L5 像素基线待 macOS 宿主更新（按边界约定）
- [x] 审计状态：本阶段无 open 审计项
- [x] 覆盖矩阵已更新（表 12）
- [x] 决策日志同步：ADR-015（accepted）；决策日志索引已更新
- [x] 已提交（未推送——按用户要求）

## TDD 网格（本阶段新增功能——spec-first + test-first）

| 功能 | 规范断言（来源 ADR-015 §Decision） | 失败测试（红） | 实现（绿） | 重构 |
|------|-----------------------------------|---------------|-----------|------|
| 信任策略持久化 | 三档枚举；缺失/损坏 → standard；0600/tmp+rename；非法 set 抛错 | `trustPolicyStore.test.ts` | `M/trustPolicyStore.ts` | 复用 permissionRulesStore 原子写模式 |
| IPC 契约 | `trust:get`/`trust:set` 运行时 schema + main↔preload parity；非法模式拒绝 | `ipcSchema.test.ts`/`ipcContractParity.test.ts` | `ipc.ts`/`preload.ts`/`ipcSchema.ts` | schema 单源 |
| renderer 判定 | trusted 恒自动；strict 无；standard write 计划内；delegated write/edit 计划内；bash 无 | `authModel.test.ts` | `authModel.shouldAutoApproveTool` | 纯函数单源 |
| 委托 main 边界 | delegate 仅 write/edit；根内 + plannedFiles 已批准包含；否则 needApproval + 事件 | `tools.test.ts` | `tools.ts` execute 守卫 | 路径归一复用 resolvePath/isInSandboxRealpath |
| 自动来源审计 | `tool.executing` 带 approvalSource；委托拒绝记 `security.trust_delegation_denied` | `tools.test.ts`/`timelineEvents.test.ts` | `tools.ts`/`timeline.ts` | — |
| 旧开关迁移 | 首次加载旧 `nf-delegate-lowrisk=1` → delegated，删除旧键/置 `nf-trust-v2`；否则 standard | `useTrustPolicy.test.ts`（纯迁移函数） | `useTrustPolicy.ts`/`ConversationPanel` | 迁移逻辑抽纯函数 |
| 设置页与面板 | 三档选择写 main 并广播；面板显示真实模式，无演示升级/日志 | `trustModes.interaction.ts` | `SettingsPanel`/`TrustLadderPanel` | 保留样式类，替换假状态 |

## 产出物

- `apps/desktop/src/main/trustPolicyStore.ts`（新增）、`ipc.ts`、`ipcSchema.ts`、`preload/preload.ts`
- `apps/desktop/src/renderer/authModel.ts`（`shouldAutoApproveTool` + `TrustMode`）
- `apps/desktop/src/renderer/useTrustPolicy.ts`（新增）、`ConversationPanel.tsx`、`SettingsPanel.tsx`、`TrustLadderPanel.tsx`、`useChatStream.ts`、`types.d.ts`
- `apps/desktop/src/domain/timeline.ts`（`security.trust_delegation_denied` 登记）
- `apps/desktop/tests/unit/trustPolicyStore.test.ts`、`authModel.test.ts`、`tools.test.ts` 扩充、`ipcSchema.test.ts`、`ipcContractParity.test.ts`
- `apps/desktop/tests/interaction/trustModes.interaction.ts`
- 文档：ADR-015、本 spec、DDD 02/03/04/06/07/10、覆盖矩阵、tasks §10

## 边界（不做——防蔓延）

- 自动学习/按模型自评提升信任（信任分）
- 跨设备信任同步（#15）
- 改变权限规则引擎（deny > allow > ask 保持）
- 信任模式细分到单个工具/项目（权限规则已覆盖自定义）
- L5 视觉基线更新（Mac 宿主另行执行）
