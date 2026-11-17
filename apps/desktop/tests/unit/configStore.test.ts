// P1-09 密钥存储：env/凭据文件优先、safeStorage 加密、明文 fallback 必须显式 opt-in。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const TMP = '/tmp/nf-unit-config-store'

const state = vi.hoisted(() => ({
  userData: '',
  encryptionAvailable: false,
}))

vi.mock('electron', () => ({
  app: { getPath: () => state.userData },
  safeStorage: {
    isEncryptionAvailable: () => state.encryptionAvailable,
    encryptString: (value: string) => Buffer.from(`enc:${value}`, 'utf-8'),
    decryptString: (buffer: Buffer) => buffer.toString('utf-8').replace(/^enc:/, ''),
  },
}))

import { ConfigStore } from '../../src/main/configStore'

function configFile(): string {
  return path.join(TMP, 'config', 'neonforge-config.json')
}

function readConfig(): Record<string, unknown> {
  return JSON.parse(readFileSync(configFile(), 'utf-8')) as Record<string, unknown>
}

describe('ConfigStore 密钥存储（P1-09）', () => {
  beforeEach(() => {
    rmSync(TMP, { recursive: true, force: true })
    mkdirSync(TMP, { recursive: true })
    state.userData = TMP
    state.encryptionAvailable = false
    delete process.env.NEONFORGE_API_KEY
    delete process.env.NEONFORGE_API_KEY_FILE
    delete process.env.NEONFORGE_SEARCH_KEY
    delete process.env.NEONFORGE_SEARCH_KEY_FILE
    delete process.env.NEONFORGE_KEENABLE_API_KEY
    delete process.env.NEONFORGE_KEENABLE_API_KEY_FILE
    delete process.env.NEONFORGE_ALLOW_PLAINTEXT_KEY
  })
  afterEach(() => {
    delete process.env.NEONFORGE_API_KEY
    delete process.env.NEONFORGE_API_KEY_FILE
    delete process.env.NEONFORGE_SEARCH_KEY
    delete process.env.NEONFORGE_SEARCH_KEY_FILE
    delete process.env.NEONFORGE_KEENABLE_API_KEY
    delete process.env.NEONFORGE_KEENABLE_API_KEY_FILE
    delete process.env.NEONFORGE_ALLOW_PLAINTEXT_KEY
    rmSync(TMP, { recursive: true, force: true })
  })

  it('环境变量优先于本地配置', async () => {
    mkdirSync(path.join(TMP, 'config'), { recursive: true })
    writeFileSync(configFile(), JSON.stringify({ apiKeyPlain: 'disk-key' }), { mode: 0o600 })
    const store = new ConfigStore()
    process.env.NEONFORGE_API_KEY = 'env-key'
    expect(store.hasValidKey()).toBe(true)
    expect(store.getApiKey()).toBe('env-key')
  })

  it('凭据文件优先于本地配置，且文件内容 trim', () => {
    mkdirSync(path.join(TMP, 'config'), { recursive: true })
    writeFileSync(configFile(), JSON.stringify({ apiKeyPlain: 'disk-key' }), { mode: 0o600 })
    const keyFile = path.join(TMP, 'key.txt')
    writeFileSync(keyFile, '  file-key\n', 'utf-8')
    process.env.NEONFORGE_API_KEY_FILE = keyFile
    const store = new ConfigStore()
    expect(store.getApiKey()).toBe('file-key')
  })

  it('safeStorage 可用：只存加密值，并清除历史明文副本', async () => {
    mkdirSync(path.join(TMP, 'config'), { recursive: true })
    writeFileSync(configFile(), JSON.stringify({ apiKeyPlain: 'legacy-plain' }), { mode: 0o600 })
    state.encryptionAvailable = true
    const store = new ConfigStore()
    await store.setApiKey('secret')
    const cfg = readConfig()
    expect(typeof cfg.apiKey).toBe('string')
    expect(cfg.apiKeyPlain).toBeUndefined()
    expect(store.getApiKey()).toBe('secret')
    const status = store.getApiKeyStatus()
    expect(status.source).toBe('encrypted')
    expect(status.storedAt).toBeTruthy()
    expect(status.plaintextCopy).toBe(false)
    expect(status.rotateRecommended).toBe(false)
  })

  it('safeStorage 不可用且未 opt-in：拒绝落盘明文', async () => {
    const store = new ConfigStore()
    await expect(store.setApiKey('secret')).rejects.toThrow(/系统安全存储不可用/)
    expect(existsSync(configFile())).toBe(false)
    expect(store.getApiKey()).toBeNull()
  })

  it('显式 opt-in 时允许明文 fallback（0600）', async () => {
    process.env.NEONFORGE_ALLOW_PLAINTEXT_KEY = '1'
    const store = new ConfigStore()
    await store.setApiKey('legacy-secret')
    expect(readConfig().apiKeyPlain).toBe('legacy-secret')
    expect(store.getApiKey()).toBe('legacy-secret')
    const status = store.getApiKeyStatus()
    expect(status.source).toBe('plaintext')
    expect(status.plaintextCopy).toBe(true)
    expect(status.storedAt).toBeTruthy()
  })

  it('环境变量来源不显示保存时间；旧明文超过 90 天提示轮换', () => {
    process.env.NEONFORGE_API_KEY = 'env-key'
    const store = new ConfigStore()
    expect(store.getApiKeyStatus().source).toBe('env')
    expect(store.getApiKeyStatus().storedAt).toBeNull()
    delete process.env.NEONFORGE_API_KEY

    mkdirSync(path.join(TMP, 'config'), { recursive: true })
    writeFileSync(
      configFile(),
      JSON.stringify({
        apiKeyPlain: 'old-secret',
        apiKeyStoredAt: new Date(Date.now() - 100 * 86_400_000).toISOString(),
      }),
      { mode: 0o600 },
    )
    const oldStore = new ConfigStore()
    const status = oldStore.getApiKeyStatus()
    expect(status.source).toBe('plaintext')
    expect(status.rotateRecommended).toBe(true)
  })

  it('加密不可用时不把加密 base64 当明文返回（旧配置安全降级）', () => {
    mkdirSync(path.join(TMP, 'config'), { recursive: true })
    writeFileSync(configFile(), JSON.stringify({ apiKey: 'placeholder-ciphertext' }), {
      mode: 0o600,
    })
    const store = new ConfigStore()
    expect(store.getApiKey()).toBeNull()
    expect(store.hasValidKey()).toBe(false)
  })

  it('Web Key 加密存储；回填时解密给设置页', () => {
    state.encryptionAvailable = true
    const store = new ConfigStore()
    const cfg = store.setWebAccess({ searchKey: 'search-secret', keenableApiKey: 'keen-secret' })
    expect(String(readConfig().webSearchKey)).toMatch(/^enc1:/)
    expect(String(readConfig().webKeenableApiKey)).toMatch(/^enc1:/)
    expect(cfg.searchKey).toBe('search-secret')
    expect(cfg.keenableApiKey).toBe('keen-secret')
    expect(cfg.hasSearchKey).toBe(true)
    expect(cfg.hasKeenableKey).toBe(true)
  })

  it('Web Key 加密不可用且未 opt-in：拒绝落盘', () => {
    const store = new ConfigStore()
    expect(() => store.setWebAccess({ searchKey: 'search-secret' })).toThrow(/系统安全存储不可用/)
    expect(existsSync(configFile())).toBe(false)
  })

  it('Web Key 环境变量优先，旧明文配置仍可读取', () => {
    mkdirSync(path.join(TMP, 'config'), { recursive: true })
    writeFileSync(configFile(), JSON.stringify({ webSearchKey: 'legacy-search' }), {
      mode: 0o600,
    })
    process.env.NEONFORGE_SEARCH_KEY = 'env-search'
    const store = new ConfigStore()
    expect(store.getWebAccess().searchKey).toBe('env-search')
    expect(store.getWebAccess().searchKeySource).toBe('env')
    delete process.env.NEONFORGE_SEARCH_KEY
    expect(store.getWebAccess().searchKey).toBe('legacy-search')
    expect(store.getWebAccess().searchKeySource).toBe('config')
  })

  it('Web Key opt-in 明文副本：keychain 解密失败时仍可用（与 API Key 同策略）', () => {
    process.env.NEONFORGE_ALLOW_PLAINTEXT_KEY = '1'
    state.encryptionAvailable = true
    const store = new ConfigStore()
    store.setWebAccess({ searchKey: 'search-secret', keenableApiKey: 'keen-secret' })
    const cfg = readConfig()
    expect(String(cfg.webSearchKey)).toMatch(/^enc1:/)
    expect(cfg.webSearchKeyPlain).toBe('search-secret')
    expect(String(cfg.webKeenableApiKey)).toMatch(/^enc1:/)
    expect(cfg.webKeenableApiKeyPlain).toBe('keen-secret')
    // 模拟 keychain 重置/解密不可用：密文不可读 → 回退 opt-in 明文副本
    state.encryptionAvailable = false
    expect(store.getWebAccess().searchKey).toBe('search-secret')
    expect(store.getWebAccess().keenableApiKey).toBe('keen-secret')
  })

  it('Web Key 未 opt-in：不保留明文副本，重新保存会清除历史副本', () => {
    process.env.NEONFORGE_ALLOW_PLAINTEXT_KEY = '1'
    state.encryptionAvailable = true
    const store = new ConfigStore()
    store.setWebAccess({ searchKey: 'old-secret' })
    expect(readConfig().webSearchKeyPlain).toBe('old-secret')
    delete process.env.NEONFORGE_ALLOW_PLAINTEXT_KEY
    store.setWebAccess({ searchKey: 'new-secret' })
    expect(readConfig().webSearchKeyPlain).toBeUndefined()
    expect(store.getWebAccess().searchKey).toBe('new-secret')
  })

  it('Web Key 来源标注：凭据文件 → file', () => {
    const keyFile = path.join(TMP, 'search.txt')
    writeFileSync(keyFile, 'file-search\n', 'utf-8')
    process.env.NEONFORGE_SEARCH_KEY_FILE = keyFile
    const store = new ConfigStore()
    expect(store.getWebAccess().searchKey).toBe('file-search')
    expect(store.getWebAccess().searchKeySource).toBe('file')
  })

  // ADR-017：模型选择与 Key 分离持久化
  it('setModelSelection：写入 providerId/modelId，不清除 Key；null 清除显式模型', async () => {
    mkdirSync(path.join(TMP, 'config'), { recursive: true })
    writeFileSync(
      configFile(),
      JSON.stringify({ apiKeyPlain: 'disk-key', providerId: 'commandcode' }),
      { mode: 0o600 },
    )
    const store = new ConfigStore()
    expect(store.getApiKey()).toBe('disk-key')
    await store.setModelSelection('gpt-4o', 'deepseek')
    expect(store.getProviderId()).toBe('deepseek')
    expect(store.getModelId()).toBe('gpt-4o')
    expect(readConfig().apiKeyPlain).toBe('disk-key')
    await store.setModelSelection(null)
    expect(store.getModelId()).toBeNull()
    expect(readConfig().modelId).toBeUndefined()
  })
})
