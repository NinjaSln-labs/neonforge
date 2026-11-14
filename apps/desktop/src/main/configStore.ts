// configStore：API Key + providerId 本地存储（env/file 优先；safeStorage 加密为主，
// 明文 fallback 仅在 NEONFORGE_ALLOW_PLAINTEXT_KEY=1 时显式开启，0600 权限）
// V1 降级说明：macOS 未签名 Electron 的 safeStorage（keychain）重启后可能解密失败——
// 需要稳定明文副本时显式设置 NEONFORGE_ALLOW_PLAINTEXT_KEY=1；否则推荐环境变量/凭据文件。
import { app, safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { DEFAULT_PROVIDER_ID, isProviderId, type ProviderId } from './providers/index.js'

const API_KEY_ENV = 'NEONFORGE_API_KEY'
const API_KEY_FILE_ENV = 'NEONFORGE_API_KEY_FILE'
const ALLOW_PLAINTEXT_ENV = 'NEONFORGE_ALLOW_PLAINTEXT_KEY'

/** 环境变量/凭据文件优先（不落盘、不进日志）；文件内容只取首行 trim */
function keyFromEnv(): string | null {
  const value = process.env[API_KEY_ENV]?.trim()
  return value || null
}

function keyFromFile(): string | null {
  const file = process.env[API_KEY_FILE_ENV]?.trim()
  if (!file) return null
  try {
    const value = readFileSync(file, 'utf-8').trim()
    return value || null
  } catch {
    return null
  }
}

function allowPlaintextFallback(): boolean {
  return process.env[ALLOW_PLAINTEXT_ENV] === '1'
}

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
    // 以「当前可实际取出」的 key 为准：只有密文但无法解密（keychain 失效）→ 视为无 Key，
    // 走配置页/环境变量路径，避免进入工作区后每个请求都失败。
    return Boolean(this.getApiKey())
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

  // 返回解密后的 key：环境变量/凭据文件优先；其次 safeStorage 解密；再次明文 fallback。
  // 加密不可用时不再把加密 base64 当作明文返回（旧实现的降级分支会把密文传给 provider）。
  getApiKey(): string | null {
    const fromEnv = keyFromEnv()
    if (fromEnv) return fromEnv
    const fromFile = keyFromFile()
    if (fromFile) return fromFile
    if (this.config.apiKey) {
      try {
        if (safeStorage.isEncryptionAvailable()) {
          const dec = safeStorage.decryptString(Buffer.from(this.config.apiKey, 'base64'))
          if (dec) return dec
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
    const trimmed = key.trim()
    if (!trimmed) throw new Error('API Key 不能为空')
    const allowPlaintext = allowPlaintextFallback()
    const next: NeonForgeConfig = { ...this.config }
    let encrypted = false
    if (safeStorage.isEncryptionAvailable()) {
      try {
        next.apiKey = safeStorage.encryptString(trimmed).toString('base64')
        encrypted = true
      } catch {
        delete next.apiKey // 加密失败——仅在不允许明文时报错
      }
    }
    if (encrypted) {
      // 加密可用：默认清除历史明文副本；不稳定 keychain 需显式 opt-in 才保留
      if (allowPlaintext) next.apiKeyPlain = trimmed
      else delete next.apiKeyPlain
    } else {
      if (!allowPlaintext) {
        throw new Error(
          '系统安全存储不可用——请设置 NEONFORGE_API_KEY 或 NEONFORGE_API_KEY_FILE；' +
            '如确需本机明文副本，显式设置 NEONFORGE_ALLOW_PLAINTEXT_KEY=1',
        )
      }
      delete next.apiKey
      next.apiKeyPlain = trimmed
    }
    next.providerId = isProviderId(providerId) ? providerId : DEFAULT_PROVIDER_ID
    const mid = modelId?.trim()
    if (mid) next.modelId = mid
    else delete next.modelId
    this.config = next
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
