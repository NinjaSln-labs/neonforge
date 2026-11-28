// 产品 Catalog：DeepSeek 过滤 + 档位挑选（上游 id 优先来自各家 /models）
import type { ModelProfileId, ModelTier, ProviderId, ThinkingLevel } from './types.js'
import { getProvider } from './registry.js'
import { toDeepSeekParams } from './profiles/deepseek.js'
import { toGenericParams } from './profiles/generic.js'

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

/** 显式模型优先；无显式选择时按档位解析。 */
export function resolveSelectedModel(
  providerId: ProviderId,
  selection: { modelId?: string | null; tier: ModelTier },
  resolved?: Partial<Record<ModelTier, string>> | null,
): string {
  const explicit = normalizeModelId(selection.modelId)
  if (explicit) return explicit
  return resolveUpstreamModel(providerId, selection.tier, resolved)
}

/** 模型 id 输入校验：非空、长度受限、无控制字符（不做 provider 存在性判断）。 */
export function normalizeModelId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 512) return null
  for (const ch of trimmed) {
    const code = ch.codePointAt(0) ?? 0
    if (code < 0x20 || code === 0x7f) return null
  }
  return trimmed
}

/**
 * 模型族参数解析：DeepSeek 族沿用 v4 profile；其余（含未知模型）使用 generic，
 * 避免把 thinking 等专属字段发给不兼容模型。
 */
export function resolveModelProfileId(providerId: ProviderId, modelId: string): ModelProfileId {
  if (isDeepSeekModelId(modelId)) return 'deepseek-v4'
  return getProvider(providerId).profile ?? 'generic-openai'
}

export function modelParams(
  providerId: ProviderId,
  modelId: string,
  level: ThinkingLevel,
): Record<string, unknown> {
  return resolveModelProfileId(providerId, modelId) === 'deepseek-v4'
    ? { ...toDeepSeekParams(level) }
    : toGenericParams(level)
}
