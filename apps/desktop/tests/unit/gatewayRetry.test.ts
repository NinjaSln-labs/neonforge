import { describe, it, expect, vi, afterEach } from 'vitest'
import { DeepSeekGateway, GatewayHttpError } from '../../src/main/gateway'

// A-024 放大器（UAT-Sim 2026-09-07）：上游瞬态 http-400 杀死用户确认回合 → 模型收不到确认 →
// 反复重提议循环。修复：streamChat 对 400 恰好重试一次（连续 400 仍抛——不掩盖确定性 payload bug）；
// 401/5xx 语义保持不变（401 不重试）。

const SSE_DONE = 'data: [DONE]\n\n'

function sseBody(content: string) {
  return `data: {"choices":[{"delta":{"content":"${content}"}}]}\n\n${SSE_DONE}`
}

describe('gateway chat http-400 单次重试（A-024 放大器）', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('400 后重试一次成功 → 正常完成流', async () => {
    const fetchMock = vi
      .fn()
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
      messages: [{ role: 'user', content: '确认' }],
      onDelta: (c) => {
        if (c.type === 'content' && c.text) chunks.push(c.text)
      },
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(chunks.join('')).toContain('ok')
  })

  it('连续两次 400 → 抛 GatewayHttpError(400)（不掩盖确定性 bug）', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('bad request', { status: 400 }))
    vi.stubGlobal('fetch', fetchMock)
    const gw = new DeepSeekGateway()
    await expect(
      gw.streamChat('sk-test', {
        messages: [{ role: 'user', content: '确认' }],
        onDelta: () => {},
      }),
    ).rejects.toThrow(GatewayHttpError)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('401 不重试（key-invalid 语义保持，仅调 1 次）', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    const gw = new DeepSeekGateway()
    await expect(
      gw.streamChat('sk-bad', {
        messages: [{ role: 'user', content: 'hi' }],
        onDelta: () => {},
      }),
    ).rejects.toThrow(GatewayHttpError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
