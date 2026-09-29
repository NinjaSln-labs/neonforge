// Provider / Model 两轴契约（ADR-010）
// Provider = 传输+鉴权+上游模型名；ModelProfile = 模型族行为调优
// Catalog = DeepSeek 过滤 + 档位挑选（上游名优先来自各家 GET /models）

export type ProviderId = 'deepseek' | 'commandcode' | 'opencode-zen' | 'opencode-go'

/** 产品档位——上游具体 id 由 /models 列表 + 挑选策略解析 */
export type ModelTier = 'flash' | 'pro'

/** @deprecated 用 ModelTier；保留别名避免旧 import 碎 */
export type ModelID = ModelTier

export type ThinkingLevel = 'none' | 'basic' | 'medium' | 'high'

export interface DeepSeekThinkingParams {
  thinking: { type: 'enabled' | 'disabled' }
  reasoning_effort?: 'high' | 'max'
}

/** 接入方纯数据描述——加一家 = 加一个 descriptor + 注册 */
export interface ProviderDescriptor {
  id: ProviderId
  /** UI 显示名 */
  label: string
  /** OpenAI 兼容根（无尾斜杠）：`/chat/completions` + `/models` */
  baseURL: string
  /** /models 不可用或列表无 DeepSeek 时的档位兜底上游名 */
  fallbackModels: Record<ModelTier, string>
  /** 领 key 说明（ConfigPage details） */
  howToGetKey: { zh: string; en: string }
  /** 文档/控制台入口（可选） */
  docsUrl?: string
}
