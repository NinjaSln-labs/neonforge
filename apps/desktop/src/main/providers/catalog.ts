// 产品 Catalog：DeepSeek 过滤 + 档位挑选（上游 id 优先来自各家 /models）
import type { ModelTier, ProviderId } from './types.js'
import { getProvider } from './registry.js'

export function isDeepSeekModelId(id: string): boolean {
  return /deepseek/i.test(id)
}

export function filterDeepSeekModels(ids: readonly string[]): string[] {
  return [...new Set(ids.filter(isDeepSeekModelId))]
}

/** 从 DeepSeek 列表里挑 flash / pro；无命中返回 null（调用方用 fallback） */
export function pickModelForTier(deepseekIds: readonly string[], tier: ModelTier): string | null {
  if (deepseekIds.length === 0) return null
  const leaf = (id: string) => id.split('/').pop() ?? id

  if (tier === 'flash') {
    const prefs: Array<(id: string) => boolean> = [
      (id) => /^deepseek-v4\.1-flash$/i.test(leaf(id)),
      (id) => /^deepseek-flash$/i.test(leaf(id)),
      (id) => /v4\.1/i.test(id) && /flash/i.test(id),
      (id) => /flash/i.test(id) && !/pro/i.test(id),
    ]
    for (const p of prefs) {
      const hit = deepseekIds.find(p)
      if (hit) return hit
    }
    return deepseekIds[0] ?? null
  }

  const prefs: Array<(id: string) => boolean> = [
    (id) => /^deepseek-v4-pro$/i.test(leaf(id)),
    (id) => /pro/i.test(id) && !/flash/i.test(id),
  ]
  for (const p of prefs) {
    const hit = deepseekIds.find(p)
    if (hit) return hit
  }
  return null
}

/** /models 失败或空列表时用 descriptor.fallbackModels */
export function fallbackUpstream(providerId: ProviderId, tier: ModelTier): string {
  return getProvider(providerId).fallbackModels[tier]
}

export const MODEL_TIERS: readonly ModelTier[] = ['flash', 'pro']

export function isModelTier(id: unknown): id is ModelTier {
  return id === 'flash' || id === 'pro'
}

/** @deprecated 用 isModelTier */
export const isAllowedModel = isModelTier
/** @deprecated 用 MODEL_TIERS */
export const ALLOWED_MODELS = MODEL_TIERS

/** 已解析缓存优先，否则 fallback（同步路径——stream/preheat/summarize） */
export function resolveUpstreamModel(
  providerId: ProviderId,
  tier: ModelTier,
  resolved?: Partial<Record<ModelTier, string>> | null,
): string {
  if (!isModelTier(tier)) throw new Error(`catalog: model tier not allowed: ${String(tier)}`)
  return resolved?.[tier] ?? fallbackUpstream(providerId, tier)
}

/** 从 /models 原列表解析两档；无 DeepSeek 命中则整表走 fallback */
export function resolveFromList(
  providerId: ProviderId,
  ids: readonly string[],
): Record<ModelTier, string> {
  const deepseek = filterDeepSeekModels(ids)
  return {
    flash: pickModelForTier(deepseek, 'flash') ?? fallbackUpstream(providerId, 'flash'),
    pro: pickModelForTier(deepseek, 'pro') ?? fallbackUpstream(providerId, 'pro'),
  }
}
