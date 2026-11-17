import { describe, it, expect, vi, afterEach } from 'vitest'
import { DeepSeekGateway } from '../../src/main/gateway'

// ADR-017：显式模型选择优先 + 非 DeepSeek 模型不发送 DeepSeek thinking 字段
describe('gateway 显式模型选择（ADR-017）', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('显式非 DeepSeek 模型：校验请求使用该模型且不带 thinking', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('nope', { status: 404 })) // /models
      .mockResolvedValueOnce(new Response('{}', { status: 200 })) // /chat/completions
    vi.stubGlobal('fetch', fetchMock)
    const gw = new DeepSeekGateway()
    const res = await gw.validateKey('sk-x', 'commandcode', 'gpt-4o')
    expect(res).toMatchObject({
      ok: true,
      modelSource: 'manual',
      selectedModel: 'gpt-4o',
    })
    const chatBody = JSON.parse(String(fetchMock.mock.calls[1][1].body))
    expect(chatBody.model).toBe('gpt-4o')
    expect(chatBody.thinking).toBeUndefined()
    expect(chatBody.reasoning_effort).toBeUndefined()
  })

  it('列表有 DeepSeek 且显式选择非 DeepSeek → 显式选择优先', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: 'deepseek-flash' }] }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const gw = new DeepSeekGateway()
    const res = await gw.validateKey('sk-x', 'deepseek', 'gpt-4o')
    expect(res).toMatchObject({ ok: true, modelSource: 'manual', selectedModel: 'gpt-4o' })
    const chatBody = JSON.parse(String(fetchMock.mock.calls[1][1].body))
    expect(chatBody.model).toBe('gpt-4o')
  })
})
