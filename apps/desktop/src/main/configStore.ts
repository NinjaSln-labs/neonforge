// configStore：API Key 本地存储（safeStorage 加密，不进代码/日志）
import { app, safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

interface NeonForgeConfig {
  apiKey?: string // safeStorage 加密后 base64
  language?: 'zh' | 'en'
}

function configPath(): string {
  const dir = path.join(app.getPath('userData'), 'config')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return path.join(dir, 'neonforge-config.json')
}

export class ConfigStore {
  private config: NeonForgeConfig = {}

  constructor() {
    try {
      if (existsSync(configPath())) {
        this.config = JSON.parse(readFileSync(configPath(), 'utf-8')) as NeonForgeConfig
      }
    } catch { this.config = {} }
  }

  hasValidKey(): boolean {
    return Boolean(this.config.apiKey)
  }

  // 返回解密后的 key；safeStorage 不可用时明文（标注降级）
  getApiKey(): string | null {
    if (!this.config.apiKey) return null
    try {
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(Buffer.from(this.config.apiKey, 'base64'))
      }
      return this.config.apiKey // 降级：明文（应避免生产，V1 本地可接受并标注）
    } catch { return null }
  }

  async setApiKey(key: string): Promise<void> {
    if (safeStorage.isEncryptionAvailable()) {
      this.config.apiKey = safeStorage.encryptString(key).toString('base64')
    } else {
      this.config.apiKey = key // 降级明文
    }
    writeFileSync(configPath(), JSON.stringify(this.config, null, 2), { mode: 0o600 })
  }

  clearApiKey(): void {
    delete this.config.apiKey
    writeFileSync(configPath(), JSON.stringify(this.config, null, 2), { mode: 0o600 })
  }
}

export const configStore = new ConfigStore()
