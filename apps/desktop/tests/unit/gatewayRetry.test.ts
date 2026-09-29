import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  DeepSeekGateway,
  GatewayHttpError,
  classifyGatewayError,
  resetChatErrorHookForTests,
} from '../../src/main/gateway'

// A-024 放大器（UAT-Sim 2026-09-07）：上游瞬态 http-400 杀死用户确认回合 → 模型收不到确认 →
// 反复重提议循环。修复：streamChat 对 400 恰好重试一次（连续 400 仍抛——不掩盖确定性 payload bug）；
// 401/5xx 语义保持不变（401 不重试）。

const SSE_DONE = 'data: [DONE]\n\n'

function sseBody(content: string) {
  return `data: {"choices":[{"delta":{"content":"${content}"}}]}\n\n${SSE_DONE}`
}

function modelsOk(ids: string[] = ['deepseek/deepseek-v4.1-flash']) {
  return new Response(JSON.stringify({ data: ids.map((id) => ({ id })) }), { status: 200 })
}

describe('gateway chat http-400 单次重试（A-024 放大器）', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('400 后重试一次成功 → 正常完成流', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(modelsOk())
      .mockResolvedValueOnce(new Response('bad request', { status: 400 }))
      .mockResolvedValueOnce(
        new Response(sseBody('ok'), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)
    const gw = new DeepSeekGateway()
    const chunks: string[] = []
    await gw.streamChat('sk-test', {
      providerId: 'commandcode',
      messages: [{ role: 'user', content: '确认' }],
      onDelta: (c) => {
        if (c.type === 'content' && c.text) chunks.push(c.text)
      },
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(chunks.join('')).toContain('ok')
  })

  it('连续两次 400 → 抛 GatewayHttpError(400)（不掩盖确定性 bug）', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(modelsOk())
      .mockResolvedValue(new Response('bad request', { status: 400 }))
    vi.stubGlobal('fetch', fetchMock)
    const gw = new DeepSeekGateway()
    await expect(
      gw.streamChat('sk-test', {
        providerId: 'commandcode',
        messages: [{ role: 'user', content: '确认' }],
        onDelta: () => {},
      }),
    ).rejects.toThrow(GatewayHttpError)
    expect(fetchMock).toHaveBeenCalledTimes(3) // /models + 2× chat
  })

  it('401 不重试（key-invalid 语义保持，仅 chat 1 次）', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(modelsOk())
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    const gw = new DeepSeekGateway()
    await expect(
      gw.streamChat('sk-bad', {
        providerId: 'commandcode',
        messages: [{ role: 'user', content: 'hi' }],
        onDelta: () => {},
      }),
    ).rejects.toThrow(GatewayHttpError)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('gateway chat 超时/5xx/网络瞬态重试', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('TimeoutError 后重试一次成功', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(modelsOk())
      .mockRejectedValueOnce(
        new DOMException('The operation was aborted due to timeout', 'TimeoutError'),
      )
      .mockResolvedValueOnce(
        new Response(sseBody('recovered'), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)
    const gw = new DeepSeekGateway()
    const chunks: string[] = []
    await gw.streamChat('sk-test', {
      providerId: 'commandcode',
      messages: [{ role: 'user', content: 'hi' }],
      onDelta: (c) => {
        if (c.type === 'content' && c.text) chunks.push(c.text)
      },
    })
    expect(fetchMock).toHaveBeenCalledTimes(3) // models + fail + ok
    expect(chunks.join('')).toContain('recovered')
  })

  it('503 后重试一次成功', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(modelsOk())
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(sseBody('ok503'), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)
    const gw = new DeepSeekGateway()
    const chunks: string[] = []
    await gw.streamChat('sk-test', {
      providerId: 'commandcode',
      messages: [{ role: 'user', content: 'hi' }],
      onDelta: (c) => {
        if (c.type === 'content' && c.text) chunks.push(c.text)
      },
    })
    expect(chunks.join('')).toContain('ok503')
  })

  it('连续超时耗尽 → 仍抛 TimeoutError', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(modelsOk())
      .mockRejectedValue(
        new DOMException('The operation was aborted due to timeout', 'TimeoutError'),
      )
    vi.stubGlobal('fetch', fetchMock)
    const gw = new DeepSeekGateway()
    await expect(
      gw.streamChat('sk-test', {
        providerId: 'commandcode',
        messages: [{ role: 'user', content: 'hi' }],
        onDelta: () => {},
      }),
    ).rejects.toMatchObject({ name: 'TimeoutError' })
    // models + 3 chat attempts
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
})

describe('gateway chat 路径故障钩子（UAT 缺口 #8）', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    resetChatErrorHookForTests()
  })

  it('NF_FORCE_CHAT_ERROR=400-once：首击抛 400，streamChat 重试后走真实 fetch 成功', async () => {
    vi.stubEnv('NF_FORCE_CHAT_ERROR', '400-once')
    resetChatErrorHookForTests()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(modelsOk())
      .mockResolvedValueOnce(
        new Response(sseBody('recovered'), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)
    const gw = new DeepSeekGateway()
    const chunks: string[] = []
    await gw.streamChat('sk-test', {
      providerId: 'commandcode',
      messages: [{ role: 'user', content: 'hi' }],
      onDelta: (c) => {
        if (c.type === 'content' && c.text) chunks.push(c.text)
      },
    })
    expect(fetchMock).toHaveBeenCalledTimes(2) // /models + 重试后的 chat
    expect(chunks.join('')).toContain('recovered')
  })

  it('NF_FORCE_CHAT_ERROR=network-once：首击网络错误后重试成功', async () => {
    vi.stubEnv('NF_FORCE_CHAT_ERROR', 'network-once')
    resetChatErrorHookForTests()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(modelsOk())
      .mockResolvedValueOnce(
        new Response(sseBody('net-ok'), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)
    const gw = new DeepSeekGateway()
    const chunks: string[] = []
    await gw.streamChat('sk-test', {
      providerId: 'commandcode',
      messages: [{ role: 'user', content: 'hi' }],
      onDelta: (c) => {
        if (c.type === 'content' && c.text) chunks.push(c.text)
      },
    })
    expect(chunks.join('')).toContain('net-ok')
    expect(classifyGatewayError(new TypeError('fetch failed'))).toBe('service')
  })

  it('NF_FORCE_CHAT_ERROR=timeout-once：超时后重试成功', async () => {
    vi.stubEnv('NF_FORCE_CHAT_ERROR', 'timeout-once')
    resetChatErrorHookForTests()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(modelsOk())
      .mockResolvedValueOnce(
        new Response(sseBody('to-ok'), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)
    const gw = new DeepSeekGateway()
    const chunks: string[] = []
    await gw.streamChat('sk-test', {
      providerId: 'commandcode',
      messages: [{ role: 'user', content: 'hi' }],
      onDelta: (c) => {
        if (c.type === 'content' && c.text) chunks.push(c.text)
      },
    })
    expect(chunks.join('')).toContain('to-ok')
  })
})

describe('gateway validate 无 models 列表', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('无列表且无手填 → needs-model-id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 404 })))
    const gw = new DeepSeekGateway()
    const res = await gw.validateKey('sk-x', 'commandcode')
    expect(res).toMatchObject({
      ok: false,
      error: 'needs-model-id',
      suggestModelId: 'deepseek/deepseek-v4.1-flash',
    })
  })

  it('无列表 + 手填 → 用该 id 校验', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('nope', { status: 404 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const gw = new DeepSeekGateway()
    const res = await gw.validateKey('sk-x', 'commandcode', 'deepseek/custom-flash')
    expect(res).toEqual({ ok: true, modelSource: 'manual' })
    const chatBody = JSON.parse(String(fetchMock.mock.calls[1][1].body))
    expect(chatBody.model).toBe('deepseek/custom-flash')
  })
})
