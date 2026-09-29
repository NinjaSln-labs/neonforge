import type { ProviderDescriptor } from '../types.js'

export const opencodeZenDescriptor: ProviderDescriptor = {
  id: 'opencode-zen',
  label: 'OpenCode Zen',
  baseURL: 'https://opencode.ai/zen/v1',
  fallbackModels: {
    flash: 'deepseek-v4.1-flash',
    pro: 'deepseek-v4-pro',
  },
  docsUrl: 'https://opencode.ai/docs/zen/',
  howToGetKey: {
    zh: '① 打开 opencode.ai 登录 Zen → ② 添加账单并复制 API Key（与 Go 共用同一 Key，选 Zen 走按量端点）。',
    en: '① Sign in at opencode.ai Zen → ② Add billing and copy the API key (same key as Go; Zen is pay-per-use).',
  },
}
