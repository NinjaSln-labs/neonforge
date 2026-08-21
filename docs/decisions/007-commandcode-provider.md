# ADR-007：provider 切换——DeepSeek 官方 → Command Code（模型仍 DeepSeek V4 系列）

- 状态: accepted
- 日期: 2026-08-21
- 相关: docs/domain/00-domain-authority.md §1（模型策略）；src/main/gateway.ts（API_BASE / API_MODEL）；用户成本优化拍板

## Context

现状：V1 网关硬编码单一 provider（`API_BASE = 'https://api.deepseek.com'`），模型名 `deepseek-v4-flash` / `deepseek-v4-pro` 直接透传上游。DeepSeek 官方 API 计费偏高（用户拍板「dp 官方有点贵」），需换更便宜但模型不变的接入方。

可选方案：

1. 直接改 `API_BASE` + 4 处模型名字面量 → 最小改动，但 provider/模型名再次散落，日后加第三家再改 5 处。
2. 抽出「内部档位 → 上游模型名」映射（`API_MODEL`），请求点统一经 `apiModel()` 转名 → 切 provider 只改 `API_BASE` + `API_MODEL` 两处。

## Decision

**切到 Command Code 聚合 API（OpenAI 兼容），内部模型档位与调用链不变：**

- `API_BASE` → `https://api.commandcode.ai/provider/v1`
- 新增 `API_MODEL` 映射：`deepseek-v4-flash → deepseek/deepseek-v4-flash`、`deepseek-v4-pro → deepseek/deepseek-v4-pro`（Command Code 上游用 `deepseek/` 前缀），全部请求点经 `apiModel()` 转名。
- **不推翻「DeepSeek-only」——该口径指模型（仍是 DeepSeek V4 系列），非接入方**；A0 §1 措辞从「网关按单一 provider 设计」澄清为「模型 DeepSeek-only，接入方可切换」。
- `ModelRouter` 的档位决策（`userRequestedPro` / `thinking==='high'`）、`toDeepSeekParams` 四档 thinking 映射、`tool_choice`、SSE `reasoning_content` 解析全部保留——这些是模型行为，与 provider 无关。
- Key 存储逻辑不变（本地加密），只是 key 内容换成 Command Code 的（`CMD_API_KEY`）；`ConfigPage` 引导文案同步。

## Consequences

- 积极：成本下降；切回官方或加第三家只改 `API_BASE` + `API_MODEL` 两处（单点）；内部档位/路由/thinking 全零改动。
- 代价（待真机验证）：Command Code 是聚合代理，DeepSeek 特有的 `reasoning_content` / `thinking: enabled` / `reasoning_effort` / `tool_choice: required` 经代理透传是否合规需真机实测（第三方 `ccr-deepseek-thinking-fix` 提示 thinking 多轮 agent 有 400 风险）；旧 DeepSeek 官方 key 失效，需用户换 Command Code key。
- 边界：本 ADR 只动 provider + 模型名映射，不引入「多模型运行时切换」，不改变 thinking/工具调用语义。
