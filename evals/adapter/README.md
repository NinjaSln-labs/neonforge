# NeonForge 无头评估适配器（v0）

把外部 harness 的 OpenAI Chat Completions 请求转给本机 Magpie，同时复用 NeonForge 的产品层：

- 产品系统提示（`NF_ADAPTER_PROMPT=product` 时注入；`none` 为对照）
- `gateway.toolCallRepair` 同源工具参数修复
- 固定的上游模型 / Provider 鉴权（`MAGPIE_GATEWAY_KEY` 只从环境变量读取）

传输可靠性：上游请求改用 `node:http`/`node:https`，避免全局 `fetch`（undici）默认 300 秒 `headersTimeout` 在 Magpie 慢启动/长思考时提前触发并误报 502。适配器显式支持：

- `NF_ADAPTER_TIMEOUT_MS`：请求总超时（默认 180000；Terminal-Bench VM 使用 900000）。
- `NF_ADAPTER_HEADERS_TIMEOUT_MS`：等待响应头的上限（默认等于总超时），超时返回 502，不重试。
- 仅对上游关闭连接（`ECONNRESET`/`EPIPE`）做一次 250 ms 后的重试，并在日志记录 `upstream request attempt=N error=...`；不重试 HTTP 错误、超时或无效 JSON。

不做的事（v0 边界）：

- 不执行工具，不接管 harness 的工具循环
- 不应用 NeonForge 的工具授权/审批门（`approved` / `ask` / `deny`）
- 不记录请求或响应正文

因此能力卡只能声明“产品提示 + 网关传输 + 参数修复”，不能声明“完整产品级安全认证”。

## 本地运行

```bash
bash evals/adapter/build.sh
MAGPIE_GATEWAY_KEY=... \
  NF_ADAPTER_HOST=127.0.0.1 NF_ADAPTER_PORT=18080 NF_ADAPTER_PROMPT=product \
  node evals/adapter/dist/adapter.mjs
```

端点：

- `GET /health`
- `GET /v1/models`
- `POST /v1/chat/completions`（支持 `stream=true` 透传）

上游默认 `http://127.0.0.1:3425/v1`，模型默认 `opendesign/deepseek-v4.1-flash-eco`（本机别名 `DSV4.1FE-OD`）；它与原 `opendesign/deepseek-v4.1-flash` 是**同一模型，仅 eco/慢速模式**。可用 `MAGPIE_BASE_URL` / `MAGPIE_MODEL` 覆盖。

## 评估用容忍模式

`NF_ADAPTER_TOLERANT_ARGS=1` 时，`toolCallRepair` 仍无法解析的参数会被降级为 `{}`，并在适配器日志记录 `coerced tool_calls=N`（不记录参数内容）。默认关闭；它会改变工具调用语义，不能与其他基线的分数混用，也不是产品行为。

## 测试

```bash
bash evals/adapter/build.sh
node --test evals/adapter/test/adapter.test.mjs
```

沙箱集成见 `evals/sandbox/README.md` 的 “本地 Magpie / opendesign DSV4.1F”。
