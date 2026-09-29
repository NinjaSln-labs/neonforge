export type {
  ProviderId,
  ModelID,
  ModelTier,
  ThinkingLevel,
  DeepSeekThinkingParams,
  ProviderDescriptor,
} from './types.js'
export { DEFAULT_PROVIDER_ID, listProviders, getProvider, isProviderId } from './registry.js'
export {
  MODEL_TIERS,
  ALLOWED_MODELS,
  isModelTier,
  isAllowedModel,
  isDeepSeekModelId,
  filterDeepSeekModels,
  pickModelForTier,
  fallbackUpstream,
  resolveUpstreamModel,
  resolveFromList,
} from './catalog.js'
export {
  toDeepSeekParams,
  extractReasoningText,
  REASONING_FIELDS,
  DEEPSEEK_TOOL_CHOICE,
} from './profiles/deepseek.js'
export {
  postChatCompletions,
  listModels,
  classifyValidateResponse,
  classifyFetchError,
  type ValidateError,
} from './transport/openaiCompat.js'
