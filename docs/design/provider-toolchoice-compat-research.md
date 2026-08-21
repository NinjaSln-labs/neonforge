# 工具强制（tool_choice）与 thinking 字段的 provider 兼容性调研

> 日期：2026-08-21 · 触发：ADR-007 provider 切换（DeepSeek 官方 → Command Code）后发现 `tool_choice: required` 400
> 范围：DSH 源码 × 真机实测 × 工业实践 × 学术研究 四方交叉
> 状态：调研结论（待实现）

## 1. 真机实测（Command Code，model=deepseek/deepseek-v4-flash）

| 项                                                | 结果                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------- |
| `thinking: {type:'enabled'}` + `reasoning_effort` | ✅ 200（参数被接受）                                                      |
| SSE delta 字段                                    | `role, reasoning, reasoning_details, content`——**无 `reasoning_content`** |
| 多轮回传 `reasoning` 字段                         | ✅ 200（thinking 多轮正常）                                               |
| `tool_choice: 'required'`（thinking 开关任意）    | ❌ 400「Thinking mode does not support this tool_choice」                 |
| `tool_choice: 'auto'`                             | ✅ 200（正常返回 tool_calls）                                             |

## 2. DeepSeek 官方证据（关键认知修正）

[deepseek-ai/DeepSeek-V3 issue #1376](https://github.com/deepseek-ai/DeepSeek-V3/issues/1376)（官方仓库，open）完整测试矩阵（官方端点实测）：

| `tool_choice`         | deepseek-chat (V3.2) | V4-flash | V4-pro |
| --------------------- | -------------------: | -------: | -----: |
| omitted / auto / none |                   ✅ |       ✅ |     ✅ |
| **required**          |                   ✅ |   ❌ 400 | ❌ 400 |
| 具体 function         |                   ✅ |   ❌ 400 | ❌ 400 |

- **V4 全系默认 thinking 模式，thinking 下永远拒绝 required**（显式 `thinking: disabled` 也拒绝——本调研实测 T3b）
- 错误消息与 Command Code 透传的一模一样 → **不是 Command Code 的锅，是 DeepSeek V4 本身**
- DeepSeek 官方 Oh My Pi 集成指南为 V4 设 `supportsToolChoice: false`，官方明说「DeepSeek V4 thinking mode does not accept tool_choice」
- 推论：NeonForge 之前连官方 V4 + required「没炸」= 真机触发少，问题潜伏；切 Command Code 只是暴露

## 3. DSH/pi-ai 源码（正确做法基准）

`@earendil-works/pi-ai/dist/api/openai-completions.js`：

- **reasoning 字段归一**（L349-362）：`["reasoning_content", "reasoning", "reasoning_text"]` 取第一个非空——兼容所有 OpenAI 兼容端点（注释明写「some endpoints return reasoning, others reasoning_content」）
- **thinking 参数按 `compat.thinkingFormat` 分支**（deepseek/zai/qwen/openai…）；`isDeepSeek` 判定 = `provider==="deepseek" || baseUrl.includes("deepseek.com")`（L1143）——Command Code 的 URL 不匹配 → 走默认 openai 分支（只发 `reasoning_effort`）
- **从不发 `tool_choice`**：`dsh-llm` 的 `GenerateOptions` 无此字段（types.d.ts 确认）；adapter 只发 `tools`；DSH 全平台（含官方 DeepSeek）不靠 API 级强制
- 多轮回传：`requiresReasoningContentOnAssistantMessages` 按 provider 开关（L1155）

## 4. 工业实践共识（竞品全在绕开 required）

| 框架                  | 做法                                                                                                | 来源                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| pydantic-ai           | `openai_supports_tool_choice_required` **按模型门控**——V4 关掉                                      | [#5193](https://github.com/pydantic/pydantic-ai/issues/5193)          |
| onyx                  | Claude/Qwen thinking 模型 `required→auto` **降级** + **循环层兜底**（llm_loop fallback 仍强制工具） | [PR #12867](https://github.com/onyx-dot-app/onyx/pull/12867)          |
| LangChain             | `disabled_params={"tool_choice": None}` **完全抑制**                                                | [#31403](https://github.com/langchain-ai/langchain/issues/31403)      |
| DSH/pi-ai             | **从不发**，靠循环层自然收敛                                                                        | 源码                                                                  |
| claude-code-router 等 | 社区踩坑「no working workaround」                                                                   | [#1378](https://github.com/musistudio/claude-code-router/issues/1378) |

⚠️ LangChain 实测代价：V4 无 required 后 **40% 场景模型不调工具返回自由文本**（PydanticToolsParser 返回 None）→ 降级必须配循环层兜底，不能裸降。

## 5. 学术研究

- **结构化输出约束抑制工具调用**（Constraint Tax，[arXiv 2606.25605](https://huggingface.co/papers/2606.25605)）：约束越硬越易让模型不调工具——API 级强制不是免费午餐
- **constrained decoding**（[Don't Fine-Tune, Decode，arXiv 2310.07075](https://papers.lunadong.com/paper/7473)）：只保证工具调用**语法正确**，不保证「必须调」——不能替代 required 语义
- **语义活锁检测**（[Zombie Agents，AIware 2026](https://2026.aiwareconf.org/details/aiware-2026-papers/10/Zombie-Agents-Detecting-Semantic-Livelock-in-Long-Horizon-Autonomous-Software)）：「只说不做」的学术解法 = 停滞检测——NeonForge `StuckDetector/escalate` 的对应物

## 6. 本地竞品源码实证（14 仓库——最可靠证据）

`~/Documents/myself/analysis/competitor-crawler/data/source/`（aider/cline/codex/deep-code/deepcode-hkuds/deepseek-harness/gemini-cli/goose/oh-my-pi/openclaw/openhands/pi/reasonix/swe-agent）：

| 竞品                                                                         | tool_choice 用法                                                                                         | 强制机制                                                                                                                                                |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Codex**（OpenAI 官方）                                                     | `tool_choice: "auto"` 恒用（`core/src/client.rs:928`）；guardian 用 `"none"`                             | **prompt 层**：「You must keep going until the query or task is completely resolved... persevere even when function calls fail」（`gpt_5_2_prompt.md`） |
| **pi**（Command Code 底层）                                                  | `coding-agent/src` **从不主动设置 toolChoice**（零赋值）；API 层仅透传                                   | prompt + 循环层；DeepSeek V4 多轮回放 400 修复（CHANGELOG #3636）：**发 DeepSeek 兼容 thinking + 回放 `reasoning_content`**                             |
| **cline / openhands / swe-agent / goose / gemini-cli / deepseek-harness 等** | **零 tool_choice**（全库搜无）                                                                           | 无 API 级强制                                                                                                                                           |
| **aider**                                                                    | 唯一例外：`tool_choice: {"type":"function","function":{"name":…}}`（models.py:1009）——具体 function 形式 | 但官方 issue #1376 矩阵证明：**V4 下具体 function 也 400**                                                                                              |

**结论**：14 个竞品无一用 `tool_choice: required` API 级强制。OpenAI 官方（Codex）用 auto + prompt 强制；pi 用 auto + 循环层 + DeepSeek 兼容 thinking 控制。**NeonForge 的 `required` 用法是孤例，且恰好撞上 V4 的 400 限制。**

## 7. 结论与方案（对齐工业共识）

**硬事实：`tool_choice: required` 在 DeepSeek V4 系（官方或 Command Code）不可用，且主流竞品（含 OpenAI 官方）从不使用。必须改。**

1. **gateway `tool_choice` 恒 `auto`**（删 required 分支）——Codex/pi/DSH/onyx/pydantic-ai 共识。forceTool 布尔语义保留（timeline 取证 / L3 断言 mock 布尔不受影响）
2. **循环层兜底保留**：`StuckDetector/escalate`（连续无进展 escalate + 连续 read 假装进展检测）——降级后防「只说不做」主力（学术语义活锁检测对应物；Codex prompt「keep going」同思想）
3. **prompt 层兜底保留**：sysPrompt ⑨「执行工具必须通过真正的函数调用发出——说了就做」（对齐 Codex「must keep going」）
4. **reasoning 字段名**：照搬 pi/DSH 多字段兼容——**读**用 `["reasoning_content","reasoning","reasoning_text"]` 取第一个非空；**回放**统一 `reasoning_content`（pi #3636/#4678 实证：DeepSeek V4 多轮 thinking 回放必须带 `reasoning_content`）

**改动面**：gateway.ts（tool_choice 1 处 + reasoning 解析 1 处）+ ConversationPanel.tsx（回传字段名 1 处）+ sysPrompt（保留 ⑨「说了就做」——已够兜底；「确认后无产出」场景由循环层 escalate 承载——A-011 实现阶段评估是否需增强措辞）+ preload/ipc 类型（2 处机械）。测试全绿预期（L3 断言 mock 布尔，不验证真实 API 参数）。

**验证点**：改后真机跑一轮带工具 + 高 thinking 对话，确认 reasoning 展示 + 多轮 thinking + 工具调用全部正常。
