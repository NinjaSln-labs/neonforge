import assert from 'node:assert/strict'
import http from 'node:http'
import { test } from 'node:test'
import {
  buildMessages,
  buildUpstreamRequest,
  createServer,
  repairToolCalls,
  resolveConfig,
} from '../dist/adapter.mjs'

test('resolveConfig 要求 MAGPIE_GATEWAY_KEY，并收敛默认模型', () => {
  assert.throws(() => resolveConfig({}), /MAGPIE_GATEWAY_KEY/)
  const config = resolveConfig({ MAGPIE_GATEWAY_KEY: 'test-key' })
  assert.equal(config.upstreamModel, 'opendesign/deepseek-v4.1-flash-eco')
  assert.equal(config.promptMode, 'none')
  assert.equal(config.upstreamBase, 'http://127.0.0.1:3425/v1')
  assert.equal(
    resolveConfig({ MAGPIE_GATEWAY_KEY: 'test-key', NF_ADAPTER_PROMPT: 'product' }).promptMode,
    'product',
  )
  assert.equal(config.tolerantArgs, false)
  assert.equal(
    resolveConfig({ MAGPIE_GATEWAY_KEY: 'test-key', NF_ADAPTER_TOLERANT_ARGS: '1' }).tolerantArgs,
    true,
  )
  assert.throws(
    () => resolveConfig({ MAGPIE_GATEWAY_KEY: 'test-key', NF_ADAPTER_PORT: '0' }),
    /NF_ADAPTER_PORT/,
  )
})

test('buildMessages 在 product 模式下前置产品系统提示，且不重复', () => {
  const input = [{ role: 'user', content: 'hi' }]
  const none = buildMessages(input, 'none')
  assert.deepEqual(none, input)

  const product = buildMessages(input, 'product')
  assert.equal(product.length, 2)
  assert.equal(product[0].role, 'system')
  assert.match(product[0].content, /你是 NeonForge 搭档/)
  assert.deepEqual(product[1], input[0])

  const again = buildMessages(product, 'product')
  assert.equal(again.length, 2)
})

test('buildUpstreamRequest 重写模型并只保留允许字段', () => {
  const out = buildUpstreamRequest(
    {
      model: 'openbmb/MiniCPM-SALA',
      messages: [{ role: 'user', content: 'x' }],
      tools: [{ type: 'function', function: { name: 'f' } }],
      store: false,
      metadata: { trace: 'no' },
      temperature: 0.1,
    },
    { upstreamModel: 'opendesign/deepseek-v4.1-flash-eco', promptMode: 'none' },
  )
  assert.equal(out.model, 'opendesign/deepseek-v4.1-flash-eco')
  assert.equal(out.store, undefined)
  assert.equal(out.metadata, undefined)
  assert.equal(out.temperature, 0.1)
  assert.equal(out.tools.length, 1)
})

test('repairToolCalls 修复尾逗号参数并统计条数', () => {
  const payload = {
    choices: [
      {
        message: {
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'f', arguments: '{"a":1,}' },
            },
          ],
        },
      },
    ],
  }
  const result = repairToolCalls(payload)
  assert.equal(result.repaired, 1)
  assert.deepEqual(JSON.parse(payload.choices[0].message.tool_calls[0].function.arguments), {
    a: 1,
  })
})

test('repairToolCalls 保留无法修复的参数原文', () => {
  const payload = {
    choices: [
      {
        message: {
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'f', arguments: 'not-json' },
            },
          ],
        },
      },
    ],
  }
  const result = repairToolCalls(payload)
  assert.equal(result.coerced, 0)
  assert.equal(payload.choices[0].message.tool_calls[0].function.arguments, 'not-json')
})

test('repairToolCalls 容忍模式把无法解析的参数降级为 {}', () => {
  const payload = {
    choices: [
      {
        message: {
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'f', arguments: '{"query": "x" "date": "2024-05-16"}' },
            },
            {
              id: 'call_2',
              type: 'function',
              function: { name: 'g', arguments: '{"a":1}' },
            },
          ],
        },
      },
    ],
  }
  const result = repairToolCalls(payload, true)
  assert.equal(result.coerced, 1)
  assert.equal(result.repaired, 0)
  assert.equal(payload.choices[0].message.tool_calls[0].function.arguments, '{}')
  assert.equal(payload.choices[0].message.tool_calls[1].function.arguments, '{"a":1}')
})

test('repairToolCalls 默认不启用容忍模式', () => {
  const payload = {
    choices: [
      {
        message: {
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'f', arguments: '{"query": "x" "date": "2024-05-16"}' },
            },
          ],
        },
      },
    ],
  }
  const result = repairToolCalls(payload)
  assert.equal(result.coerced, 0)
  assert.equal(
    payload.choices[0].message.tool_calls[0].function.arguments,
    '{"query": "x" "date": "2024-05-16"}',
  )
})

test('createServer 对首次连接重置重试一次', async () => {
  let upstreamRequests = 0
  const upstream = http.createServer((req, res) => {
    upstreamRequests += 1
    req.resume()
    if (upstreamRequests === 1) {
      req.socket.destroy()
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        id: 'chatcmpl-test',
        object: 'chat.completion',
        choices: [
          { index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    )
  })
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  const upstreamPort = (upstream.address()).port

  const adapter = createServer(
    resolveConfig({
      MAGPIE_GATEWAY_KEY: 'test-key',
      MAGPIE_BASE_URL: `http://127.0.0.1:${upstreamPort}/v1`,
      NF_ADAPTER_TIMEOUT_MS: '5000',
    }),
  )
  await new Promise((resolve) => adapter.listen(0, '127.0.0.1', resolve))
  const adapterPort = (adapter.address()).port

  try {
    const response = await fetch(`http://127.0.0.1:${adapterPort}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'test',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    })
    assert.equal(response.status, 200)
    const payload = await response.json()
    assert.equal(payload.choices[0].message.content, 'ok')
    assert.equal(upstreamRequests, 2)
  } finally {
    await new Promise((resolve) => adapter.close(resolve))
    await new Promise((resolve) => upstream.close(resolve))
  }
})

test('createServer 用 headersTimeout 覆盖 undici 默认 300 秒', { timeout: 2000 }, async () => {
  let upstreamRequests = 0
  // 永不发送响应头：适配器应在 50 毫秒 headersTimeout 后快速返回 502，
  // 而不是等待 undici 默认的 300 秒（或适配器总超时 5 秒）。
  const upstream = http.createServer((req) => {
    upstreamRequests += 1
    req.resume()
  })
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  const upstreamPort = (upstream.address()).port

  const adapter = createServer(
    resolveConfig({
      MAGPIE_GATEWAY_KEY: 'test-key',
      MAGPIE_BASE_URL: `http://127.0.0.1:${upstreamPort}/v1`,
      NF_ADAPTER_TIMEOUT_MS: '5000',
      NF_ADAPTER_HEADERS_TIMEOUT_MS: '50',
    }),
  )
  await new Promise((resolve) => adapter.listen(0, '127.0.0.1', resolve))
  const adapterPort = (adapter.address()).port

  try {
    const started = Date.now()
    const response = await fetch(`http://127.0.0.1:${adapterPort}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'test',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    })
    assert.equal(response.status, 502)
    assert.equal(upstreamRequests, 1)
    assert.ok(Date.now() - started < 1500, 'headers timeout should fire quickly')
  } finally {
    await new Promise((resolve) => adapter.close(resolve))
    upstream.closeAllConnections()
    await new Promise((resolve) => upstream.close(resolve))
  }
})
