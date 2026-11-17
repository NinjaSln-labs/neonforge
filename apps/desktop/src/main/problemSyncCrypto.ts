// 问题台账同步快照加密（ADR-018）：口令只来自环境变量或本机凭据文件，不写入配置。
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { readFileSync } from 'node:fs'

export const SYNC_PASSPHRASE_ENV = 'NEONFORGE_SYNC_PASSPHRASE'
export const SYNC_PASSPHRASE_FILE_ENV = 'NEONFORGE_SYNC_PASSPHRASE_FILE'
export const SYNC_ENVELOPE_VERSION = 1
export const SYNC_MAX_BYTES = 1024 * 1024

export type PassphraseSource = 'env' | 'file' | 'none'

export interface PassphraseResolution {
  value: string | null
  source: PassphraseSource
  error?: string
}

/** 口令来源：显式注入 env（单测）优先；否则进程环境。 */
export function resolveSyncPassphrase(env: NodeJS.ProcessEnv = process.env): PassphraseResolution {
  const direct = env[SYNC_PASSPHRASE_ENV]?.trim()
  if (direct) return { value: direct, source: 'env' }
  const file = env[SYNC_PASSPHRASE_FILE_ENV]?.trim()
  if (!file) return { value: null, source: 'none' }
  try {
    const value = readFileSync(file, 'utf-8').split(/\r?\n/)[0]?.trim()
    return value
      ? { value, source: 'file' }
      : { value: null, source: 'file', error: '口令文件为空' }
  } catch (e) {
    return {
      value: null,
      source: 'file',
      error: `口令文件读取失败：${e instanceof Error ? e.message : String(e)}`,
    }
  }
}

export interface SyncEnvelope {
  v: 1
  alg: 'aes-256-gcm'
  salt: string
  iv: string
  tag: string
  data: string
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
}

export function encryptLedgerPayload(payload: unknown, passphrase: string): string {
  if (!passphrase.trim()) throw new Error('同步口令为空')
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = deriveKey(passphrase, salt)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf-8')
  const data = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  const envelope: SyncEnvelope = {
    v: SYNC_ENVELOPE_VERSION,
    alg: 'aes-256-gcm',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: data.toString('base64'),
  }
  return JSON.stringify(envelope)
}

export function decryptLedgerPayload(raw: string, passphrase: string): unknown {
  if (!passphrase.trim()) throw new Error('同步口令为空')
  if (Buffer.byteLength(raw, 'utf-8') > SYNC_MAX_BYTES) throw new Error('同步快照超过大小上限')
  let envelope: SyncEnvelope
  try {
    envelope = JSON.parse(raw) as SyncEnvelope
  } catch {
    throw new Error('同步快照不是合法 JSON')
  }
  if (envelope?.v !== SYNC_ENVELOPE_VERSION || envelope.alg !== 'aes-256-gcm') {
    throw new Error('同步快照版本/算法不支持')
  }
  const salt = Buffer.from(envelope.salt, 'base64')
  const iv = Buffer.from(envelope.iv, 'base64')
  const tag = Buffer.from(envelope.tag, 'base64')
  const data = Buffer.from(envelope.data, 'base64')
  if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16) {
    throw new Error('同步快照头部无效')
  }
  const key = deriveKey(passphrase, salt)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  try {
    const plaintext = Buffer.concat([decipher.update(data), decipher.final()])
    return JSON.parse(plaintext.toString('utf-8')) as unknown
  } catch {
    throw new Error('同步口令错误或快照损坏')
  }
}
