# ADR-017：多模型网关与扩展能力治理（GitHub #14）
- 状态: accepted
- 日期: 2026-11-17
- 相关: GitHub #14（多模型网关 + 插件体系深化）；README Roadmap V2 #4；ADR-010（多源 Provider + DeepSeek Catalog）；`docs/ddd-rebuild/09-openspec/specs/provider-gateway/spec.md`、`extension-integration/spec.md`；`docs/design/stage-specs/V2-multi-model-plugin.md`

## Context

当前网关已完成 Provider / ModelProfile 两轴拆分（ADR-010）：四家 OpenAI Chat Completions 兼容接入方可选，`/models` 拉列表后只保留 DeepSeek 族并按 `flash`/`pro` 档位挑选；模型族参数仍由 `toDeepSeekParams` 单点收敛。遗留缺口：

1. provider-gateway spec 要求「用户选择另一个模型 → 后续对话使用新模型」，但运行时没有模型选择 UI；配置只支持在 `/models` 无 DeepSeek 时手填一个 model id，且手填值同时覆盖 flash/pro 两档，语义含混。
2. Catalog 把非 DeepSeek 模型全部过滤；新增模型族没有 profile 扩展点，参数构造与 reasoning 字段仍硬绑定 DeepSeek。
3. 扩展注册表（BC-13/A16）支持能力声明与第三方首次授权，但**重复注册只更新能力，不重审信任**：一个已 `user-authorized` 的 MCP 扩展在刷新工具清单后可自动获得新增能力的调用权，违背 extension-integration spec「已授权范围不自动扩大」。
4. MCP 刷新只增不删：已从配置移除的服务器对应扩展仍留在注册表，能力/状态不可回收；设置页只显示能力数量，不显示能力与风险明细。

## Decision

**在不引入运行时自定义 provider、不加载任意第三方代码的前提下，补齐模型选择与扩展能力治理。**

### 一、多模型网关（Provider 内模型选择）

1. **模型选择模型（ModelSelection）**：
   - `ModelSelection = { providerId, modelId?, tier: ModelTier }`；`modelId` 为用户显式选择的上游模型（来自 `/models` 列表或手填）。
   - 显式 `modelId` 优先，flash/pro 档位仅在无显式选择时按 `ModelRouter` 规则解析；不再用「手填 id 同时覆盖两档」的隐式语义。
   - 配置持久化扩展为 `providerId + modelId?`；`tier` 仍由 `ModelRouter` 运行时规则解析（本阶段不持久化档位）。旧配置（无 modelId）行为不变：默认 flash 档 + `/models`/fallback 解析。
2. **ModelProfile 扩展点**：
   - `ProviderDescriptor` 增加 `profile: ModelProfileId`（`deepseek-v4` | `generic-openai`）；默认 `deepseek-v4` 保持现状。
   - `ModelProfile` 提供 `buildParams(level)` 与 `matches(modelId)`；DeepSeek profile 原样复用 `toDeepSeekParams`，generic profile 只发标准 OpenAI 参数（不发送 DeepSeek thinking 字段）。
   - 运行时按“显式选中的 modelId / 解析出的上游名”选择 profile；无法匹配时 fail-safe 到 generic（不把 DeepSeek 专属字段发给未知模型）。
   - Catalog 仍默认优先 DeepSeek 族（现状兼容）；显式选择非 DeepSeek 模型时不再被过滤，改由 profile 决定参数形态。
3. **IPC / UI**：
   - `gateway:validate` 成功时返回 `{ models: string[], selectedModel: string }`；新增 `gateway:list-models`（使用已保存 Key，失败保留上一次可用列表）与 `gateway:set-model`（校验 provider/模型 id 后持久化）。
   - SettingsPanel 显示当前生效模型并提供切换入口（自动 flash 档 / 显式模型）；ConfigPage 保持既有「验证 → 进入」流程，首次配置默认自动解析，后续在设置页切换。
   - 运行中的流不因切换模型而中断；下一轮请求使用新模型（provider-gateway spec 既有语义）。
4. **安全边界**：模型 id 只接受非空、长度受限、无控制字符的字符串；provider id 仍只接受注册表枚举；不发起半配置请求。API Key/凭据管理不变。

### 二、扩展能力治理（BC-13）

1. **能力指纹**：`ExtensionState` 增加 `capabilityDigest`（能力 id + risk 的稳定排序摘要），并在 `extension.registered`/能力更新事件中记录。
2. **信任重审**：重复注册时若能力指纹变化：
   - `user-authorized` → 回退 `untrusted`（需要用户再次授权）；`builtin` 信任不变；
   - 发出 `extension.capabilities_changed` 事件（含 extensionId、old/new digest、added/removed capability ids）；
   - 未变化则保留授权与现有生命周期（幂等注册语义不变）。
3. **MCP 刷新回收**：`McpManager.refresh` 对已从配置移除的服务器调用 `pluginRegistry.unregister(name)`，发 `extension.unregistered` 事件；已授权范围不因列表新增而扩大（由能力指纹重审保证）。
4. **UI**：设置页扩展条目显示能力明细（名称/风险/描述摘要）而非仅数量；MCP 配置仍只存命令/参数/环境变量名。

## Consequences

- 积极：用户可在既有接入方内选择实际模型，非 DeepSeek 模型有合法参数形态；扩展授权与能力集合绑定，刷新 MCP 不会静默扩权；注册表可回收已移除服务器；provider-gateway / extension-integration spec 的缺口有实现路径。
- 代价：新增一次 `capabilityDigest` 计算与事件；SettingsPanel 增加模型选择；显式模型切换需要一次 IPC 往返。旧配置无迁移成本（默认路径不变）。
- 边界（不做）：
  - 不实现运行时自定义 provider / 任意第三方插件代码加载（仍是注册表内 descriptor + MCP stdio）。
  - 不实现 Anthropic/Google 原生协议适配（仅 OpenAI Chat Completions 兼容面）。
  - 不实现按任务自动模型路由/成本最优路由（显式选择 + 现有 `ModelRouter` 档位规则）。
  - 不实现跨设备配置同步（#15）。
  - 不改变 BC-02 授权卡、沙箱、MCP env 的既有安全边界。
