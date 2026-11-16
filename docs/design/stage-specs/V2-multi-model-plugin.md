# Stage V2-Multi-Model-Plugin Spec（多模型网关 + 扩展能力治理）
> 来源：GitHub #14（多模型网关 + 插件体系深化）；ADR：`docs/decisions/017-multi-model-plugin-capability-governance.md`；开工前定稿（2026-11-17）

## DoD（机器可验证断言——stage-gate 逐条执行）

- [ ] L1 全量绿：`npx vitest run`（新增 ≥12 条——见 TDD 网格）
- [ ] L2 契约：`npx tsc -p tsconfig.json --noEmit` + `npx tsc -p tsconfig.main.json --noEmit` 0 错
- [ ] L3 交互：`npx playwright test --project=interaction`（模型选择/扩展能力明细相关场景 + 全量回归）
- [ ] 行为验收：显式选择非 DeepSeek 模型后，下一轮请求使用该模型且不发送 DeepSeek thinking 字段；旧配置无 modelId 时仍走 flash 档 / `/models` / fallback 旧路径
- [ ] 行为验收：已 `user-authorized` 的 MCP 扩展刷新后能力集合变化 → 信任回退 `untrusted` 且出现 `extension.capabilities_changed`；能力不变则保留授权
- [ ] 行为验收：配置移除 MCP 服务器后刷新 → 对应扩展被 unregister 且出现 `extension.unregistered`，不再出现在 `extensions:list`
- [ ] 审计状态：上阶段 open 项全部 fixed / recorded（含 PR #18 后审查修复批）
- [ ] 覆盖矩阵已更新（表 15）
- [ ] 决策日志同步：ADR-017；`000-decision-log.md` 索引已更新
- [ ] 已 push + CI 绿（qa.yml run）

## TDD 网格（本阶段新增功能——spec-first + test-first）

| 功能 | 规范断言（来源 ADR-017 §Decision） | 失败测试（红） | 实现（绿） | 重构 |
|------|-----------------------------------|---------------|-----------|------|
| ModelSelection 解析 | 显式 modelId 优先；无显式选择时 flash/pro 档位按旧规则；非法 modelId 拒绝 | `providersCatalog.test.ts` 扩充 / 新 `modelSelection.test.ts` | `src/main/providers/catalog.ts` | 从字符串布尔改为 selection 值对象 |
| ModelProfile 扩展 | DeepSeek profile 参数不变；generic profile 不发送 thinking；未知模型 fail-safe generic | `providersCatalog.test.ts`（profile 参数矩阵） | `src/main/providers/profiles/*`、`types.ts` | profile 匹配集中到类型层 |
| 网关显式模型 | 选中 modelId 后请求使用该模型；运行中的流不中断；旧配置路径不变 | `gatewayModelSelection.test.ts` | `gateway.ts` `refreshModels`/`streamChatOnce` | 上游解析单源 |
| 模型 IPC/UI | `gateway:list-models` 失败保留上次列表；`gateway:set-model` 运行时校验；ConfigPage/Settings 可选择 | `ipcSchema.test.ts` + 新 `modelSelection.interaction.ts` | `ipc.ts`、`ipcSchema.ts`、`preload.ts`、ConfigPage/SettingsPanel | 选择状态单源 |
| 能力指纹 | digest 稳定排序（id+risk）；能力增删/风险变化改变 digest | `extension.test.ts` 扩充 | `src/domain/extension.ts` | 纯函数 |
| 信任重审 | 重复注册能力变化 → user-authorized 回退 untrusted；builtin 不变；发 `extension.capabilities_changed` | `pluginSystem.test.ts`、`timelineEvents.test.ts` | `pluginSystem.ts`、`timeline.ts` | 注册路径单源 |
| MCP 回收 | 移除服务器 → unregister + `extension.unregistered`；新增能力不自动扩大授权 | `mcpManager.test.ts` | `mcpManager.ts`、`pluginSystem.ts`、`timeline.ts` | refresh 差异计算 |
| 扩展能力明细 UI | 设置页显示能力名称/风险；授权状态与失败原因保持 | `extensions.interaction.ts`（新增或扩充） | `SettingsPanel.tsx` | 仅展示层 |

## 产出物

- `apps/desktop/src/main/providers/types.ts`（ModelProfileId/ModelSelection 契约）
- `apps/desktop/src/main/providers/catalog.ts`（显式模型优先 + 档位 fallback）
- `apps/desktop/src/main/providers/profiles/deepseek.ts`（显式 profile 接口；保留 `toDeepSeekParams`）
- `apps/desktop/src/main/providers/profiles/generic.ts`（generic OpenAI 参数）
- `apps/desktop/src/main/gateway.ts`（ModelSelection/profile 路由）
- `apps/desktop/src/main/ipc.ts`、`ipcSchema.ts`、`src/preload/preload.ts`、`src/renderer/types.d.ts`（模型列表/切换契约）
- `apps/desktop/src/renderer/ConfigPage.tsx`、`SettingsPanel.tsx`（模型选择 + 扩展能力明细）
- `apps/desktop/src/domain/extension.ts`、`src/main/pluginSystem.ts`、`src/main/mcpManager.ts`、`src/domain/timeline.ts`（能力指纹/信任重审/回收）
- 测试：`modelSelection.test.ts`、`gatewayModelSelection.test.ts`、`modelSelection.interaction.ts`、`extensions.interaction.ts` + 既有文件扩充
- 文档：ADR-017、本 spec、覆盖矩阵表 15、`06-domain-events.md` 事件注记、tasks §13

## 边界（不做——防蔓延）

- 不实现运行时自定义 provider / 任意第三方插件代码加载
- 不实现 Anthropic/Google 原生协议适配（仅 OpenAI Chat Completions 兼容）
- 不实现按任务自动模型路由/成本最优路由
- 不实现跨设备配置同步（#15）
- 不改变 BC-02 授权卡、沙箱、MCP env allowlist、信任三档语义
