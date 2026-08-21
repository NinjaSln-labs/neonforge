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
- `ModelRouter` 的档位决策（`userRequestedPro` / `thinking==='high'`）、`toDeepSeekParams` 四档 thinking 映射保留——这些是模型行为，与 provider 无关。
- **2026-08-21 更正（真机实测 + 调研后）**：`tool_choice: 'required'` **不再使用**——DeepSeek V4 全系（官方与 Command Code 一致）拒绝 required（thinking 模式 400，官方 issue #1376 + 实测），API 层恒 `auto`，推进强制改由循环层（StuckDetector/escalate）+ prompt 层（sysPrompt ⑨）兜底（`provider-toolchoice-compat-research.md` §7）；SSE reasoning 字段改多源兼容（`reasoning_content`/`reasoning`/`reasoning_text` 取第一个非空，回放统一 `reasoning_content`）。领域文档已同步（A0 §1/§4、07 §1.1/§2、04 §3.1、05 §3、03、02）。
- Key 存储逻辑不变（本地加密），只是 key 内容换成 Command Code 的（`CMD_API_KEY`）；`ConfigPage` 引导文案同步。

## Consequences

- 积极：成本下降；切回官方或加第三家只改 `API_BASE` + `API_MODEL` 两处（单点）；内部档位/路由/thinking 全零改动。
- 代价（真机已验证——2026-08-21）：Command Code 透传 DeepSeek V4 上游行为——`tool_choice: 'required'` 400（官方 V4 同样如此，非代理问题）；SSE thinking 字段名 `reasoning`（非官方 `reasoning_content`）；`thinking: enabled`/`reasoning_effort` 参数接受正常；多轮回放需带 `reasoning_content`。旧 DeepSeek 官方 key 失效，需用户换 Command Code key。
- 边界：本 ADR 只动 provider + 模型名映射，不引入「多模型运行时切换」，不改变 thinking/工具调用语义。
