import type { ProviderDescriptor } from '../types.js'

export const commandcodeDescriptor: ProviderDescriptor = {
  id: 'commandcode',
  label: 'Command Code',
  baseURL: 'https://api.commandcode.ai/provider/v1',
  fallbackModels: {
    flash: 'deepseek/deepseek-v4.1-flash',
    pro: 'deepseek/deepseek-v4-pro',
  },
  docsUrl: 'https://commandcode.ai',
  howToGetKey: {
    zh: '① 打开 commandcode.ai 注册/登录 → ② Studio「API Keys」→ ③ Generate API key 并复制。',
    en: '① Open commandcode.ai → ② Studio → API Keys → ③ Generate and copy.',
  },
}
