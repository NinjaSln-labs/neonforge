import type { ProviderDescriptor } from '../types.js'

export const opencodeGoDescriptor: ProviderDescriptor = {
  id: 'opencode-go',
  label: 'OpenCode Go',
  baseURL: 'https://opencode.ai/zen/go/v1',
  fallbackModels: {
    flash: 'deepseek-v4.1-flash',
    pro: 'deepseek-v4-pro',
  },
  docsUrl: 'https://opencode.ai/docs/go/',
  howToGetKey: {
    zh: '① 打开 opencode.ai 登录并开通 Go → ② 复制 API Key（与 Zen 共用；选 Go 走订阅端点）。若 flash 报区域限制，需在工作区浏览器开通该模型。',
    en: '① Sign in at opencode.ai and enable Go → ② Copy the API key (same as Zen). If flash hits a region gate, opt in via the workspace link in the browser.',
  },
}
