// configStore：API Key 本地存储（safeStorage 加密为主 + 明文 fallback，0600 权限）
// V1 降级说明：macOS 未签名 Electron 的 safeStorage（keychain）重启后可能解密失败——
// 因此 set 时同时存加密值 + 明文 fallback（本机 0600），get 时先解密、失败读明文。
import { app, safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

interface NeonForgeConfig {
  apiKey?: string // safeStorage 加密后 base64
  apiKeyPlain?: string // 明文 fallback（0600 权限——safeStorage 解密失败时使用，V1 本机降级）
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
    } catch {
      this.config = {}
    }
  }

  hasValidKey(): boolean {
    return Boolean(this.config.apiKey || this.config.apiKeyPlain)
  }

  // 返回解密后的 key：优先 safeStorage 解密；失败读明文 fallback；再失败 null
  getApiKey(): string | null {
    if (this.config.apiKey) {
      try {
        if (safeStorage.isEncryptionAvailable()) {
          const dec = safeStorage.decryptString(Buffer.from(this.config.apiKey, 'base64'))
          if (dec) return dec
        } else {
          return this.config.apiKey // 加密不可用——旧数据按明文返回（降级）
        }
      } catch {
        // 解密失败（macOS keychain 不稳定）——走明文 fallback
      }
    }
    return this.config.apiKeyPlain ?? null
  }

  async setApiKey(key: string): Promise<void> {
    if (safeStorage.isEncryptionAvailable()) {
      try {
        this.config.apiKey = safeStorage.encryptString(key).toString('base64')
      } catch {
        this.config.apiKey = undefined // 加密失败——只存明文
      }
    }
    // 明文 fallback 始终存（0600——重启稳定）
    this.config.apiKeyPlain = key
    writeFileSync(configPath(), JSON.stringify(this.config, null, 2), { mode: 0o600 })
  }

  clearApiKey(): void {
    delete this.config.apiKey
    delete this.config.apiKeyPlain
    writeFileSync(configPath(), JSON.stringify(this.config, null, 2), { mode: 0o600 })
  }
}

export const configStore = new ConfigStore()
