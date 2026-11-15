import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { TrustPolicyStore, normalizeTrustMode } from '../../src/main/trustPolicyStore'

describe('TrustPolicyStore（ADR-015 三档信任模式持久化）', () => {
  let dir: string
  let file: string
  let store: TrustPolicyStore

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'nf-trust-policy-'))
    file = path.join(dir, 'config', 'trust-policy.json')
    mkdirSync(path.dirname(file), { recursive: true })
    store = new TrustPolicyStore(file)
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('缺失 → standard（默认档不静默委托）', () => {
    expect(store.load()).toBe('standard')
  })

  it('损坏 JSON / 非对象 / 非法模式 → standard（坏文件不锁死、不提权）', () => {
    writeFileSync(file, '{not json')
    expect(store.load()).toBe('standard')
    writeFileSync(file, '["delegated"]')
    expect(store.load()).toBe('standard')
    writeFileSync(file, '{"mode":"auto"}')
    expect(store.load()).toBe('standard')
  })

  it('三档枚举落盘并跨实例读回（0600 + JSON {mode}）', () => {
    expect(store.save('strict')).toBe('strict')
    expect(JSON.parse(readFileSync(file, 'utf-8'))).toEqual({ mode: 'strict' })
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(new TrustPolicyStore(file).load()).toBe('strict')
    store.save('delegated')
    expect(new TrustPolicyStore(file).load()).toBe('delegated')
    store.save('standard')
    expect(new TrustPolicyStore(file).load()).toBe('standard')
  })

  it('非法模式 save 抛出（IPC 边界 fail-closed）', () => {
    expect(() => store.save('auto')).toThrow(/strict\/standard\/delegated/)
    expect(() => normalizeTrustMode(null)).toThrow()
    expect(() => normalizeTrustMode(1)).toThrow()
  })
})
