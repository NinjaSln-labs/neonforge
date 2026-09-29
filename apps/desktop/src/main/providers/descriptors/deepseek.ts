import type { ProviderDescriptor } from '../types.js'

export const deepseekDescriptor: ProviderDescriptor = {
  id: 'deepseek',
  label: 'DeepSeek 官方',
  baseURL: 'https://api.deepseek.com',
  // 官方 V4.1 Flash 规范名 deepseek-flash（deepseek-v4-flash 已退役仍可通）
  fallbackModels: {
    flash: 'deepseek-flash',
    pro: 'deepseek-v4-pro',
  },
  docsUrl: 'https://platform.deepseek.com/api_keys',
  howToGetKey: {
    zh: '① 打开 platform.deepseek.com 注册/登录 → ② 进入 API Keys → ③ 创建并复制 Key。',
    en: '① Open platform.deepseek.com → ② API Keys → ③ Create and copy the key.',
  },
}
