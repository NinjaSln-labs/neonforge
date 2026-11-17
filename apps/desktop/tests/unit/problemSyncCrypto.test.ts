import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  decryptLedgerPayload,
  encryptLedgerPayload,
  resolveSyncPassphrase,
  SYNC_MAX_BYTES,
} from '../../src/main/problemSyncCrypto'

let dir = ''
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'nf-problem-crypto-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('problemSyncCrypto（ADR-018）', () => {
  it('环境变量优先；口令文件回退；都缺失 → none', () => {
    const file = path.join(dir, 'pass.txt')
    writeFileSync(file, 'file-pass\n', 'utf-8')
    expect(
      resolveSyncPassphrase({ NEONFORGE_SYNC_PASSPHRASE: 'env-pass' } as NodeJS.ProcessEnv),
    ).toMatchObject({ value: 'env-pass', source: 'env' })
    expect(
      resolveSyncPassphrase({ NEONFORGE_SYNC_PASSPHRASE_FILE: file } as NodeJS.ProcessEnv),
    ).toMatchObject({ value: 'file-pass', source: 'file' })
    expect(resolveSyncPassphrase({} as NodeJS.ProcessEnv)).toMatchObject({
      value: null,
      source: 'none',
    })
  })

  it('AES-256-GCM roundtrip；每次 salt/iv 不同', () => {
    const payload = { schemaVersion: 1, problems: [{ id: 'a', title: '秘密问题' }] }
    const a = encryptLedgerPayload(payload, 'correct horse')
    const b = encryptLedgerPayload(payload, 'correct horse')
    expect(a).not.toBe(b)
    expect(decryptLedgerPayload(a, 'correct horse')).toEqual(payload)
  })

  it('错误口令/篡改 → 拒绝', () => {
    const encrypted = encryptLedgerPayload({ ok: true }, 'right')
    expect(() => decryptLedgerPayload(encrypted, 'wrong')).toThrow(/口令错误|损坏/)
    const env = JSON.parse(encrypted) as { data: string }
    env.data = Buffer.from('tampered').toString('base64')
    expect(() => decryptLedgerPayload(JSON.stringify(env), 'right')).toThrow(/口令错误|损坏/)
  })

  it('超限/未知版本 → 拒绝', () => {
    const huge = 'x'.repeat(SYNC_MAX_BYTES + 1)
    expect(() => decryptLedgerPayload(huge, 'p')).toThrow(/大小上限/)
    expect(() => decryptLedgerPayload(JSON.stringify({ v: 99, alg: 'aes-256-gcm' }), 'p')).toThrow(
      /版本/,
    )
    expect(() => encryptLedgerPayload({}, '  ')).toThrow(/口令/)
  })
})
