// Generic OpenAI Chat Completions 兼容模型：不发送 DeepSeek thinking 专属字段。
import type { ThinkingLevel } from '../types.js'

export function toGenericParams(_level: ThinkingLevel): Record<string, never> {
  return {}
}
