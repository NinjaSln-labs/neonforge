import { describe, it, expect } from 'vitest'
import {
  MODEL_TIERS,
  DEFAULT_PROVIDER_ID,
  isModelTier,
  isProviderId,
  listProviders,
  resolveUpstreamModel,
  resolveFromList,
  pickModelForTier,
  filterDeepSeekModels,
  normalizeModelId,
  modelParams,
  resolveModelProfileId,
  resolveSelectedModel,
  toDeepSeekParams,
  classifyValidateResponse,
} from '../../src/main/providers/index.js'

describe('providers catalog（ADR-010）', () => {
  it('注册四源', () => {
    expect(listProviders().map((p) => p.id)).toEqual([
      'deepseek',
      'commandcode',
      'opencode-zen',
      'opencode-go',
    ])
  })

  it('旧配置默认 commandcode', () => {
    expect(DEFAULT_PROVIDER_ID).toBe('commandcode')
    expect(isProviderId('commandcode')).toBe(true)
    expect(isProviderId('openai')).toBe(false)
  })

  it('档位仅 flash/pro', () => {
    expect(MODEL_TIERS).toEqual(['flash', 'pro'])
    expect(isModelTier('flash')).toBe(true)
    expect(isModelTier('gpt-4')).toBe(false)
  })

  it('无缓存时四源 fallback 为 v4.1 flash / pro', () => {
    expect(resolveUpstreamModel('deepseek', 'flash')).toBe('deepseek-flash')
    expect(resolveUpstreamModel('commandcode', 'flash')).toBe('deepseek/deepseek-v4.1-flash')
    expect(resolveUpstreamModel('opencode-zen', 'pro')).toBe('deepseek-v4-pro')
    expect(resolveUpstreamModel('opencode-go', 'flash')).toBe('deepseek-v4.1-flash')
  })

  it('非档位 → 硬失败', () => {
    expect(() => resolveUpstreamModel('deepseek', 'gpt-4' as never)).toThrow(/not allowed/)
  })

  it('DeepSeek 过滤 + flash 优先 v4.1', () => {
    const ids = [
      'gpt-4',
      'claude-sonnet',
      'deepseek/deepseek-v4-flash',
      'deepseek/deepseek-v4.1-flash',
      'deepseek/deepseek-v4-pro',
    ]
    expect(filterDeepSeekModels(ids)).toEqual([
      'deepseek/deepseek-v4-flash',
      'deepseek/deepseek-v4.1-flash',
      'deepseek/deepseek-v4-pro',
    ])
    expect(pickModelForTier(filterDeepSeekModels(ids), 'flash')).toBe(
      'deepseek/deepseek-v4.1-flash',
    )
    expect(pickModelForTier(filterDeepSeekModels(ids), 'pro')).toBe('deepseek/deepseek-v4-pro')
  })

  it('resolveFromList 空列表走 fallback', () => {
    expect(resolveFromList('commandcode', ['gpt-4'])).toEqual({
      flash: 'deepseek/deepseek-v4.1-flash',
      pro: 'deepseek/deepseek-v4-pro',
    })
  })

  it('resolveUpstreamModel 吃缓存', () => {
    expect(
      resolveUpstreamModel('commandcode', 'flash', {
        flash: 'deepseek/deepseek-v4.1-flash',
      }),
    ).toBe('deepseek/deepseek-v4.1-flash')
  })

  // ADR-017：显式模型优先；非 DeepSeek 族使用 generic profile
  it('resolveSelectedModel：显式 modelId 优先，无显式选择回退档位', () => {
    expect(
      resolveSelectedModel(
        'commandcode',
        { modelId: 'gpt-4o', tier: 'flash' },
        {
          flash: 'deepseek/deepseek-v4.1-flash',
        },
      ),
    ).toBe('gpt-4o')
    expect(
      resolveSelectedModel(
        'commandcode',
        { modelId: null, tier: 'pro' },
        {
          pro: 'deepseek/deepseek-v4-pro',
        },
      ),
    ).toBe('deepseek/deepseek-v4-pro')
    expect(resolveSelectedModel('commandcode', { modelId: '  ', tier: 'flash' })).toBe(
      'deepseek/deepseek-v4.1-flash',
    )
  })

  it('modelParams：DeepSeek 保留 thinking；非 DeepSeek 不发专属字段', () => {
    expect(modelParams('deepseek', 'deepseek-flash', 'high')).toEqual(toDeepSeekParams('high'))
    expect(modelParams('commandcode', 'gpt-4o', 'high')).toEqual({})
    expect(resolveModelProfileId('commandcode', 'deepseek/deepseek-v4.1-flash')).toBe('deepseek-v4')
    expect(resolveModelProfileId('commandcode', 'gpt-4o')).toBe('generic-openai')
  })

  it('normalizeModelId：拒绝空/控制字符/超长，保留合法 id', () => {
    expect(normalizeModelId(' gpt-4o ')).toBe('gpt-4o')
    expect(normalizeModelId('')).toBeNull()
    expect(normalizeModelId('bad\nmodel')).toBeNull()
    expect(normalizeModelId('x'.repeat(513))).toBeNull()
    expect(normalizeModelId(42)).toBeNull()
  })
})

describe('deepseek profile', () => {
  it('thinking 四档', () => {
    expect(toDeepSeekParams('none')).toEqual({ thinking: { type: 'disabled' } })
    expect(toDeepSeekParams('basic')).toEqual({ thinking: { type: 'enabled' } })
    expect(toDeepSeekParams('medium')).toEqual({
      thinking: { type: 'enabled' },
      reasoning_effort: 'high',
    })
    expect(toDeepSeekParams('high')).toEqual({
      thinking: { type: 'enabled' },
      reasoning_effort: 'max',
    })
  })
})

describe('validate 响应分类', () => {
  it('401 → key-invalid', async () => {
    expect(await classifyValidateResponse(new Response('', { status: 401 }))).toEqual({
      ok: false,
      error: 'key-invalid',
    })
  })

  it('403 RegionError → region-blocked', async () => {
    const body = JSON.stringify({
      error: {
        type: 'RegionError',
        message: 'requires explicit opt in: https://opencode.ai/workspace/wrk_x/go',
      },
    })
    expect(await classifyValidateResponse(new Response(body, { status: 403 }))).toEqual({
      ok: false,
      error: 'region-blocked',
    })
  })

  it('403 普通 → http-403', async () => {
    expect(await classifyValidateResponse(new Response('forbidden', { status: 403 }))).toEqual({
      ok: false,
      error: 'http-403',
    })
  })
})
