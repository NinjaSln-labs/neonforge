# ADR-010：多源 Provider 注册表 + DeepSeek 模型 Catalog

- 状态: accepted
- 日期: 2026-09-28
- 相关: ADR-007（单源 Command Code 映射——本 ADR 取代其「两常量切源」实现形态）；`src/main/providers/`；`docs/domain/07-api-gateway.md`；A0 §1

## Context

ADR-007 把官方 DeepSeek 换成 Command Code，靠 `API_BASE` + `API_MODEL` 两处常量。产品需要同时接受：

- DeepSeek 官方
- Command Code
- OpenCode Zen
- OpenCode Go

模型调优仍只覆盖 DeepSeek 族；以后要加多模型/多供应商，但不能把「传输」和「模型行为」再缠死。Zen 与 Go 共用同一 API Key、baseURL 不同，不能靠自动探测认源。

## Decision

**两轴拆分 + 显式选源：**

1. **Provider**（`src/main/providers/`）：descriptor（baseURL / 文案）+ 共享 OpenAI Chat Completions 传输；加一家 = 加 descriptor + 注册。
2. **ModelCatalog**：产品档位 `flash` | `pro`；上游名优先各源 `GET /models` 过滤 DeepSeek 后按 v4.1-flash / pro 挑选；失败用 descriptor.fallback（默认 flash = v4.1 / 官方 `deepseek-flash`）。非档位硬失败。
3. **ModelProfile（deepseek-v4）**：thinking 四档、`tool_choice` 恒 auto、reasoning 多源字段——按模型族挂，不按 provider。
4. **Config**：存 `providerId` + key；旧配置无 `providerId` → 默认 `commandcode`（保持 ADR-007 生产通道）。
5. **UI**：ConfigPage 四选一接入方后再校验；校验打 flash；OpenCode `RegionError`/403 → `region-blocked`（不混成 key-invalid）。
6. **Gateway**：门面，不再硬编码单一 base。

运行时默认全程 flash；ModelRouter 的 pro 分支保留扩展点，本轮无模型选择 UI。

## Consequences

- 积极：四源可并存；Conversation/prompt 不感知接入方；加源/加 DeepSeek 型号改 Catalog；开多族时加 Profile。
- 代价：Config 多一步选源；Go 侧 flash 区域门需用户浏览器开通（文案引导）。
- 边界：非 DeepSeek 族 / Anthropic·Google 协议 / 多 key 账户夹 / 模型选择 UI——本 ADR 不覆盖。
- ADR-007：决策意图（模型 DeepSeek-only、接入方可切）保留；实现从「两常量」升级为注册表——007 不标 superseded（历史成本切换仍有效），实现权威以本 ADR + `providers/` 为准。
