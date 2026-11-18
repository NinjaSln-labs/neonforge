# NeonForge 无头评估适配器（v0）

把外部 harness 的 OpenAI Chat Completions 请求转给本机 Magpie，同时复用 NeonForge 的产品层：

- 产品系统提示（`NF_ADAPTER_PROMPT=product` 时注入；`none` 为对照）
- `gateway.toolCallRepair` 同源工具参数修复
- 固定的上游模型 / Provider 鉴权（`MAGPIE_GATEWAY_KEY` 只从环境变量读取）

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

上游默认 `http://127.0.0.1:3425/v1`，模型默认 `opendesign/deepseek-v4.1-flash-eco`（本机别名 `DSV4.1FE-OD`）；可用 `MAGPIE_BASE_URL` / `MAGPIE_MODEL` 覆盖。

## 评估用容忍模式

`NF_ADAPTER_TOLERANT_ARGS=1` 时，`toolCallRepair` 仍无法解析的参数会被降级为 `{}`，并在适配器日志记录 `coerced tool_calls=N`（不记录参数内容）。默认关闭；它会改变工具调用语义，不能与其他基线的分数混用，也不是产品行为。

## 测试

```bash
bash evals/adapter/build.sh
node --test evals/adapter/test/adapter.test.mjs
```

沙箱集成见 `evals/sandbox/README.md` 的 “本地 Magpie / opendesign DSV4.1F”。
