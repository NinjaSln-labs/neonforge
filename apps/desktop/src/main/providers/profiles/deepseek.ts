// DeepSeek V4 ModelProfile——行为调优按模型族挂，不按 provider（ADR-010）
import type { DeepSeekThinkingParams, ThinkingLevel } from '../types.js'

export const REASONING_FIELDS = ['reasoning_content', 'reasoning', 'reasoning_text'] as const

export function extractReasoningText(delta: Record<string, unknown>): string | undefined {
  for (const k of REASONING_FIELDS) {
    const v = delta[k]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return undefined
}

/** ThinkingLevel 四档 → DeepSeek API 参数（A0 §2 / D-C4） */
export function toDeepSeekParams(level: ThinkingLevel): DeepSeekThinkingParams {
  switch (level) {
    case 'none':
      return { thinking: { type: 'disabled' } }
    case 'basic':
      return { thinking: { type: 'enabled' } }
    case 'medium':
      return { thinking: { type: 'enabled' }, reasoning_effort: 'high' }
    case 'high':
      return { thinking: { type: 'enabled' }, reasoning_effort: 'max' }
  }
}

/** V4 全系拒绝 tool_choice required——恒 auto */
export const DEEPSEEK_TOOL_CHOICE = 'auto' as const
