// configStore：API Key + providerId 本地存储（safeStorage 加密为主 + 明文 fallback，0600 权限）
// V1 降级说明：macOS 未签名 Electron 的 safeStorage（keychain）重启后可能解密失败——
// 因此 set 时同时存加密值 + 明文 fallback（本机 0600），get 时先解密、失败读明文。
import { app, safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { DEFAULT_PROVIDER_ID, isProviderId, type ProviderId } from './providers/index.js'

interface NeonForgeConfig {
  apiKey?: string // safeStorage 加密后 base64
  apiKeyPlain?: string // 明文 fallback（0600 权限——safeStorage 解密失败时使用，V1 本机降级）
  /** 接入方；缺省（旧配置）→ commandcode */
  providerId?: ProviderId
  /** 手填上游模型 id（无 /models 或列表无 DeepSeek 时） */
  modelId?: string
  /** 允许外网检索（web_search / web_fetch） */
  webAccessEnabled?: boolean
  /** 最近一次外网探测是否通过（无覆盖端点时 web_search 依赖） */
  webAccessProbeOk?: boolean
  /** 按可连性自动选定的内置搜：keenable | ddg（有 searchUrl 覆盖时无意义） */
  webAccessBuiltin?: 'keenable' | 'ddg'
  /** 用户自有搜索 HTTP 端点（有则跳过内置探测） */
  webSearchUrl?: string
  /** 覆盖端点可选 Bearer Key（明文 0600——与 apiKeyPlain 同级） */
  webSearchKey?: string
  /** Keenable API Key（明文 0600——与 webSearchKey 同级） */
  webKeenableApiKey?: string
  /** 允许无 Key 时走 Keenable 公共试用（默认关） */
  webKeenablePublicTrial?: boolean
  language?: 'zh' | 'en'
}

export type BuiltinSearchProvider = 'keenable' | 'ddg'

export interface WebAccessConfig {
  enabled: boolean
  probeOk: boolean
  /** 无覆盖时 web_search 走的内置源（探测自动分配） */
  builtinProvider: BuiltinSearchProvider | null
  searchUrl: string | null
  /** 是否有 Key（不回传明文给 UI 列表以外——设置页编辑时另取） */
  hasSearchKey: boolean
  searchKey: string | null
  keenableApiKey: string | null
  hasKeenableKey: boolean
  keenablePublicTrial: boolean
}

function configPath(): string {
  const dir = path.join(app.getPath('userData'), 'config')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return path.join(dir, 'neonforge-config.json')
}

export class ConfigStore {
  private config: NeonForgeConfig = {}

  constructor() {
    this.reload()
  }

  /** NF_TEST_USERDATA 等 setPath 之后重读——构造期可能已读到默认 userData */
  reload(): void {
    try {
      if (existsSync(configPath())) {
        this.config = JSON.parse(readFileSync(configPath(), 'utf-8')) as NeonForgeConfig
      } else {
        this.config = {}
      }
    } catch {
      this.config = {}
    }
  }

  hasValidKey(): boolean {
    return Boolean(this.config.apiKey || this.config.apiKeyPlain)
  }

  /** 当前接入方；无字段的旧配置默认 commandcode（ADR-007 生产通道） */
  getProviderId(): ProviderId {
    const id = this.config.providerId
    return isProviderId(id) ? id : DEFAULT_PROVIDER_ID
  }

  /** 手填上游模型；无则 null */
  getModelId(): string | null {
    const m = this.config.modelId?.trim()
    return m || null
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

  async setApiKey(
    key: string,
    providerId: ProviderId = DEFAULT_PROVIDER_ID,
    modelId?: string | null,
  ): Promise<void> {
    if (safeStorage.isEncryptionAvailable()) {
      try {
        this.config.apiKey = safeStorage.encryptString(key).toString('base64')
      } catch {
        this.config.apiKey = undefined // 加密失败——只存明文
      }
    }
    // 明文 fallback 始终存（0600——重启稳定）
    this.config.apiKeyPlain = key
    this.config.providerId = isProviderId(providerId) ? providerId : DEFAULT_PROVIDER_ID
    const mid = modelId?.trim()
    if (mid) this.config.modelId = mid
    else delete this.config.modelId
    writeFileSync(configPath(), JSON.stringify(this.config, null, 2), { mode: 0o600 })
  }

  clearApiKey(): void {
    delete this.config.apiKey
    delete this.config.apiKeyPlain
    delete this.config.providerId
    delete this.config.modelId
    writeFileSync(configPath(), JSON.stringify(this.config, null, 2), { mode: 0o600 })
  }

  getWebAccess(): WebAccessConfig {
    const url = this.config.webSearchUrl?.trim() || null
    const key = this.config.webSearchKey?.trim() || null
    const keenKey = this.config.webKeenableApiKey?.trim() || null
    const b = this.config.webAccessBuiltin
    return {
      enabled: Boolean(this.config.webAccessEnabled),
      probeOk: Boolean(this.config.webAccessProbeOk),
      builtinProvider: b === 'keenable' || b === 'ddg' ? b : null,
      searchUrl: url,
      hasSearchKey: Boolean(key),
      searchKey: key,
      keenableApiKey: keenKey,
      hasKeenableKey: Boolean(keenKey),
      keenablePublicTrial: Boolean(this.config.webKeenablePublicTrial),
    }
  }

  /** 持久化外网开关/探测/覆盖；不传的字段保持原值 */
  setWebAccess(patch: {
    enabled?: boolean
    probeOk?: boolean
    builtinProvider?: BuiltinSearchProvider | null
    searchUrl?: string | null
    searchKey?: string | null
    keenableApiKey?: string | null
    keenablePublicTrial?: boolean
  }): WebAccessConfig {
    if (patch.enabled !== undefined) this.config.webAccessEnabled = patch.enabled
    if (patch.probeOk !== undefined) this.config.webAccessProbeOk = patch.probeOk
    if (patch.builtinProvider !== undefined) {
      if (patch.builtinProvider === 'keenable' || patch.builtinProvider === 'ddg') {
        this.config.webAccessBuiltin = patch.builtinProvider
      } else {
        delete this.config.webAccessBuiltin
      }
    }
    if (patch.searchUrl !== undefined) {
      const u = patch.searchUrl?.trim()
      if (u) this.config.webSearchUrl = u
      else delete this.config.webSearchUrl
    }
    if (patch.searchKey !== undefined) {
      const k = patch.searchKey?.trim()
      if (k) this.config.webSearchKey = k
      else delete this.config.webSearchKey
    }
    if (patch.keenableApiKey !== undefined) {
      const k = patch.keenableApiKey?.trim()
      if (k) this.config.webKeenableApiKey = k
      else delete this.config.webKeenableApiKey
    }
    if (patch.keenablePublicTrial !== undefined) {
      this.config.webKeenablePublicTrial = patch.keenablePublicTrial
    }
    if (patch.enabled === false) {
      this.config.webAccessProbeOk = false
      delete this.config.webAccessBuiltin
    }
    writeFileSync(configPath(), JSON.stringify(this.config, null, 2), { mode: 0o600 })
    return this.getWebAccess()
  }
}

export const configStore = new ConfigStore()
