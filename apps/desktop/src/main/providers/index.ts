export type {
  ProviderId,
  ModelID,
  ModelTier,
  ModelProfileId,
  ModelSelection,
  ThinkingLevel,
  DeepSeekThinkingParams,
  ProviderDescriptor,
} from './types.js'
export { DEFAULT_PROVIDER_ID, listProviders, getProvider, isProviderId } from './registry.js'
export {
  MODEL_TIERS,
  isModelTier,
  isDeepSeekModelId,
  filterDeepSeekModels,
  pickModelForTier,
  fallbackUpstream,
  resolveUpstreamModel,
  resolveFromList,
  resolveSelectedModel,
  normalizeModelId,
  resolveModelProfileId,
  modelParams,
} from './catalog.js'
export {
  toDeepSeekParams,
  extractReasoningText,
  REASONING_FIELDS,
  DEEPSEEK_TOOL_CHOICE,
} from './profiles/deepseek.js'
export { toGenericParams } from './profiles/generic.js'
export {
  postChatCompletions,
  listModels,
  classifyValidateResponse,
  classifyFetchError,
  type ValidateError,
} from './transport/openaiCompat.js'
