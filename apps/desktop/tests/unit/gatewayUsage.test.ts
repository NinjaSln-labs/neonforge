import { describe, it, expect } from 'vitest'
import { normalizeGatewayUsage } from '../../src/main/gateway'

describe('Gateway usage 归一（BC-12）', () => {
  it('标准 usage + DeepSeek 缓存字段', () => {
    const u = normalizeGatewayUsage(
      {
        prompt_tokens: 100,
        completion_tokens: 50,
        completion_tokens_details: { reasoning_tokens: 8 },
        prompt_cache_hit_tokens: 30,
        prompt_cache_miss_tokens: 70,
      },
      'deepseek',
      'deepseek-flash',
    )
    expect(u).toMatchObject({
      providerId: 'deepseek',
      model: 'deepseek-flash',
      promptTokens: 100,
      completionTokens: 50,
      reasoningTokens: 8,
      cacheHitTokens: 30,
      cacheMissTokens: 70,
    })
  })

  it('OpenAI prompt_tokens_details.cached_tokens 作为缓存命中', () => {
    const u = normalizeGatewayUsage(
      { prompt_tokens: 20, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 12 } },
      'opencode-zen',
      'm',
    )
    expect(u?.cacheHitTokens).toBe(12)
    expect(u?.cacheMissTokens).toBeNull()
  })

  it('缺失 usage → null（不伪造 0）', () => {
    expect(normalizeGatewayUsage(null, 'deepseek', 'm')).toBeNull()
    expect(normalizeGatewayUsage({}, 'deepseek', 'm')).toMatchObject({
      promptTokens: 0,
      completionTokens: 0,
      cacheHitTokens: null,
    })
  })

  it('畸形 token 值按 0，不抛错', () => {
    const u = normalizeGatewayUsage(
      { prompt_tokens: 'bad', completion_tokens: 10 },
      'deepseek',
      'm',
    )
    expect(u?.promptTokens).toBe(0)
    expect(u?.completionTokens).toBe(10)
  })
})
