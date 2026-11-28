// Provider / Model 两轴契约（ADR-010）
// Provider = 传输+鉴权+上游模型名；ModelProfile = 模型族行为调优
// Catalog = DeepSeek 过滤 + 档位挑选（上游名优先来自各家 GET /models）

export type ProviderId = 'deepseek' | 'commandcode' | 'opencode-zen' | 'opencode-go'

/** 模型族参数配置（Provider 内可混用模型族） */
export type ModelProfileId = 'deepseek-v4' | 'generic-openai'

/** 产品档位——上游具体 id 由 /models 列表 + 挑选策略解析 */
export type ModelTier = 'flash' | 'pro'

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
  /** 是否支持流式 usage（stream_options.include_usage）；不支持的接入方不发送该字段 */
  streamUsage?: boolean
  /** 该接入方的默认模型族参数（显式选中的 modelId 仍按模型匹配优先） */
  profile?: ModelProfileId
}

/** 显式模型选择：modelId 优先，档位仅用于无显式选择时的解析 */
export interface ModelSelection {
  providerId: ProviderId
  modelId: string | null
  tier: ModelTier
}
