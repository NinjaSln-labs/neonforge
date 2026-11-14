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
const WEB_SEARCH_KEY_ENV = 'NEONFORGE_SEARCH_KEY'
const WEB_SEARCH_KEY_FILE_ENV = 'NEONFORGE_SEARCH_KEY_FILE'
const KEENABLE_KEY_ENV = 'NEONFORGE_KEENABLE_API_KEY'
const KEENABLE_KEY_FILE_ENV = 'NEONFORGE_KEENABLE_API_KEY_FILE'
const ALLOW_PLAINTEXT_ENV = 'NEONFORGE_ALLOW_PLAINTEXT_KEY'
const SECRET_PREFIX = 'enc1:'
const KEY_ROTATION_DAYS = 90

export type ApiKeySource = 'env' | 'file' | 'encrypted' | 'plaintext' | 'none'

export interface ApiKeyStatus {
  source: ApiKeySource
  storedAt: string | null
  /** 配置中仍存在明文副本（即使当前使用加密值/环境变量） */
  plaintextCopy: boolean
  rotateRecommended: boolean
}

/** 环境变量/凭据文件优先（不落盘、不进日志）；文件内容 trim */
function secretFromEnvSource(
  valueEnv: string,
  fileEnv: string,
): { value: string | null; source: 'env' | 'file' | null } {
  const value = process.env[valueEnv]?.trim()
  if (value) return { value, source: 'env' }
  const file = process.env[fileEnv]?.trim()
  if (!file) return { value: null, source: null }
  try {
    const fromFile = readFileSync(file, 'utf-8').trim()
    return fromFile ? { value: fromFile, source: 'file' } : { value: null, source: null }
  } catch {
    return { value: null, source: null }
  }
}

function secretFromEnv(valueEnv: string, fileEnv: string): string | null {
  return secretFromEnvSource(valueEnv, fileEnv).value
}

function keyFromEnv(): string | null {
  return secretFromEnv(API_KEY_ENV, API_KEY_FILE_ENV)
}

/** 写入前加密（safeStorage）；不可用时仅显式 opt-in 允许明文 */
function protectSecret(value: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    try {
      return SECRET_PREFIX + safeStorage.encryptString(value).toString('base64')
    } catch {
      /* 加密失败 → 走 opt-in 判定 */
    }
  }
  if (!allowPlaintextFallback()) {
    throw new Error(
      '系统安全存储不可用——密钥未保存；请设置对应环境变量/凭据文件，' +
        '或显式设置 NEONFORGE_ALLOW_PLAINTEXT_KEY=1',
    )
  }
  return value
}

/** 读取时解密；旧明文配置（无前缀）兼容；密文无法解密 → null */
function revealSecret(stored: string | undefined): string | null {
  if (!stored) return null
  if (!stored.startsWith(SECRET_PREFIX)) return stored
  if (!safeStorage.isEncryptionAvailable()) return null
  try {
    return safeStorage.decryptString(Buffer.from(stored.slice(SECRET_PREFIX.length), 'base64')) || null
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
  /** 最近一次保存 Key 的时间（轮换提醒） */
  apiKeyStoredAt?: string
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
  /** 覆盖端点可选 Bearer Key（safeStorage 加密 `enc1:` 或旧明文） */
  webSearchKey?: string
  /** opt-in 明文副本（仅 NEONFORGE_ALLOW_PLAINTEXT_KEY=1——keychain 失效时读取） */
  webSearchKeyPlain?: string
  /** Keenable API Key（safeStorage 加密 `enc1:` 或旧明文） */
  webKeenableApiKey?: string
  /** opt-in 明文副本（仅 NEONFORGE_ALLOW_PLAINTEXT_KEY=1——keychain 失效时读取） */
  webKeenableApiKeyPlain?: string
  /** 允许无 Key 时走 Keenable 公共试用（默认关） */
  webKeenablePublicTrial?: boolean
  language?: 'zh' | 'en'
}

export type BuiltinSearchProvider = 'keenable' | 'ddg'

/** Web Key 实际生效来源（env/凭据文件优先——renderer 不应把 env 值回写为本地配置） */
export type WebSecretSource = 'env' | 'file' | 'config' | 'none'

export interface WebAccessConfig {
  enabled: boolean
  probeOk: boolean
  /** 无覆盖时 web_search 走的内置源（探测自动分配） */
  builtinProvider: BuiltinSearchProvider | null
  searchUrl: string | null
  /** 是否有 Key（不回传明文给 UI 列表以外——设置页编辑时另取） */
  hasSearchKey: boolean
  searchKey: string | null
  /** searchKey 的实际来源（env/file 优先；ipc 对 env/file 值做脱敏） */
  searchKeySource: WebSecretSource
  keenableApiKey: string | null
  hasKeenableKey: boolean
  keenableApiKeySource: WebSecretSource
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

  /** 密钥来源与轮换提示（不含密钥值；供设置页只读展示） */
  getApiKeyStatus(): ApiKeyStatus {
    const plaintextCopy = Boolean(this.config.apiKeyPlain)
    const envValue = process.env[API_KEY_ENV]?.trim()
    if (envValue) return { source: 'env', storedAt: null, plaintextCopy, rotateRecommended: false }
    const fileEnv = process.env[API_KEY_FILE_ENV]?.trim()
    if (fileEnv) {
      try {
        if (readFileSync(fileEnv, 'utf-8').trim()) {
          return { source: 'file', storedAt: null, plaintextCopy, rotateRecommended: false }
        }
      } catch {
        /* 文件不可读 → 继续检查本地配置 */
      }
    }
    let source: ApiKeySource = 'none'
    if (this.config.apiKey) {
      try {
        if (
          safeStorage.isEncryptionAvailable() &&
          safeStorage.decryptString(Buffer.from(this.config.apiKey, 'base64'))
        ) {
          source = 'encrypted'
        }
      } catch {
        /* 解密失败 → 明文/无 */
      }
    }
    if (source === 'none' && plaintextCopy) source = 'plaintext'
    const storedAt = this.config.apiKeyStoredAt ?? null
    const age = storedAt ? Date.now() - Date.parse(storedAt) : Number.NaN
    return {
      source,
      storedAt,
      plaintextCopy,
      rotateRecommended: Number.isFinite(age) && age > KEY_ROTATION_DAYS * 86_400_000,
    }
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
    next.apiKeyStoredAt = new Date().toISOString()
    const mid = modelId?.trim()
    if (mid) next.modelId = mid
    else delete next.modelId
    this.config = next
    writeFileSync(configPath(), JSON.stringify(this.config, null, 2), { mode: 0o600 })
  }

  clearApiKey(): void {
    delete this.config.apiKey
    delete this.config.apiKeyPlain
    delete this.config.apiKeyStoredAt
    delete this.config.providerId
    delete this.config.modelId
    writeFileSync(configPath(), JSON.stringify(this.config, null, 2), { mode: 0o600 })
  }

  getWebAccess(): WebAccessConfig {
    const url = this.config.webSearchUrl?.trim() || null
    // 2026-11-15 审查修复：web key 也支持 opt-in 明文副本（与 setApiKey 一致——keychain 重置后
    // 不会只丢 web 凭据）；并记录实际来源，renderer 据此不回写 env/文件值。
    const envSearch = secretFromEnvSource(WEB_SEARCH_KEY_ENV, WEB_SEARCH_KEY_FILE_ENV)
    const searchKey =
      envSearch.value ??
      revealSecret(this.config.webSearchKey) ??
      this.config.webSearchKeyPlain ??
      null
    const envKeen = secretFromEnvSource(KEENABLE_KEY_ENV, KEENABLE_KEY_FILE_ENV)
    const keenKey =
      envKeen.value ??
      revealSecret(this.config.webKeenableApiKey) ??
      this.config.webKeenableApiKeyPlain ??
      null
    const searchKeySource: WebSecretSource =
      envSearch.source ?? (searchKey ? 'config' : 'none')
    const keenableApiKeySource: WebSecretSource =
      envKeen.source ?? (keenKey ? 'config' : 'none')
    const b = this.config.webAccessBuiltin
    return {
      enabled: Boolean(this.config.webAccessEnabled),
      probeOk: Boolean(this.config.webAccessProbeOk),
      builtinProvider: b === 'keenable' || b === 'ddg' ? b : null,
      searchUrl: url,
      hasSearchKey: Boolean(searchKey),
      searchKey,
      searchKeySource,
      keenableApiKey: keenKey,
      hasKeenableKey: Boolean(keenKey),
      keenableApiKeySource,
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
    // 先改副本：任一新密钥无法安全写入（加密不可用且未 opt-in）时，不留下半更新配置
    const next: NeonForgeConfig = { ...this.config }
    if (patch.enabled !== undefined) next.webAccessEnabled = patch.enabled
    if (patch.probeOk !== undefined) next.webAccessProbeOk = patch.probeOk
    if (patch.builtinProvider !== undefined) {
      if (patch.builtinProvider === 'keenable' || patch.builtinProvider === 'ddg') {
        next.webAccessBuiltin = patch.builtinProvider
      } else {
        delete next.webAccessBuiltin
      }
    }
    if (patch.searchUrl !== undefined) {
      const u = patch.searchUrl?.trim()
      if (u) next.webSearchUrl = u
      else delete next.webSearchUrl
    }
    if (patch.searchKey !== undefined) {
      const k = patch.searchKey?.trim()
      if (k) {
        next.webSearchKey = protectSecret(k)
        // 加密可用 + 显式 opt-in → 保留明文副本（keychain 解密失败时仍可用）
        if (next.webSearchKey.startsWith(SECRET_PREFIX) && allowPlaintextFallback()) {
          next.webSearchKeyPlain = k
        } else {
          delete next.webSearchKeyPlain
        }
      } else {
        delete next.webSearchKey
        delete next.webSearchKeyPlain
      }
    }
    if (patch.keenableApiKey !== undefined) {
      const k = patch.keenableApiKey?.trim()
      if (k) {
        next.webKeenableApiKey = protectSecret(k)
        if (next.webKeenableApiKey.startsWith(SECRET_PREFIX) && allowPlaintextFallback()) {
          next.webKeenableApiKeyPlain = k
        } else {
          delete next.webKeenableApiKeyPlain
        }
      } else {
        delete next.webKeenableApiKey
        delete next.webKeenableApiKeyPlain
      }
    }
    if (patch.keenablePublicTrial !== undefined) {
      next.webKeenablePublicTrial = patch.keenablePublicTrial
    }
    if (patch.enabled === false) {
      next.webAccessProbeOk = false
      delete next.webAccessBuiltin
    }
    this.config = next
    writeFileSync(configPath(), JSON.stringify(this.config, null, 2), { mode: 0o600 })
    return this.getWebAccess()
  }
}

export const configStore = new ConfigStore()
