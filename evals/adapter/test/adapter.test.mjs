import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildMessages,
  buildUpstreamRequest,
  repairToolCalls,
  resolveConfig,
} from '../dist/adapter.mjs'

test('resolveConfig 要求 MAGPIE_GATEWAY_KEY，并收敛默认模型', () => {
  assert.throws(() => resolveConfig({}), /MAGPIE_GATEWAY_KEY/)
  const config = resolveConfig({ MAGPIE_GATEWAY_KEY: 'test-key' })
  assert.equal(config.upstreamModel, 'opendesign/deepseek-v4.1-flash')
  assert.equal(config.promptMode, 'none')
  assert.equal(config.upstreamBase, 'http://127.0.0.1:3425/v1')
  assert.equal(
    resolveConfig({ MAGPIE_GATEWAY_KEY: 'test-key', NF_ADAPTER_PROMPT: 'product' }).promptMode,
    'product',
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
    { upstreamModel: 'opendesign/deepseek-v4.1-flash', promptMode: 'none' },
  )
  assert.equal(out.model, 'opendesign/deepseek-v4.1-flash')
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
  repairToolCalls(payload)
  assert.equal(payload.choices[0].message.tool_calls[0].function.arguments, 'not-json')
})
