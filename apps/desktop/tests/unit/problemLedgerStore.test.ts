import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ProblemLedgerStore, SYNC_SNAPSHOT_FILE } from '../../src/main/problemLedgerStore'
import { encryptLedgerPayload } from '../../src/main/problemSyncCrypto'
import type { LedgerProblem } from '../../src/domain/problemLedger'

let root = ''
let syncDir = ''
const PASS = { NEONFORGE_SYNC_PASSPHRASE: 'unit-test-passphrase' } as NodeJS.ProcessEnv

function problem(over: Partial<LedgerProblem> & { id: string }): LedgerProblem {
  return {
    id: over.id,
    title: over.title ?? '问题',
    status: 'executing',
    updatedAt: '10:00',
    updatedAtIso: '2026-11-17T10:00:00.000Z',
    revision: 1,
    ...over,
  }
}

function store(name: string, env: NodeJS.ProcessEnv = PASS): ProblemLedgerStore {
  return new ProblemLedgerStore({ baseDir: path.join(root, name), env })
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'nf-problem-ledger-'))
  syncDir = path.join(root, 'sync')
  mkdirSync(syncDir)
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('ProblemLedgerStore（ADR-018）', () => {
  it('保存/读取：0600 原子文件；内容变化递增 revision', () => {
    const s = store('a')
    const saved = s.save([problem({ id: 'p1', revision: 1 })])
    expect(saved.ok).toBe(true)
    expect(statSync(s.ledgerPath()).mode & 0o777).toBe(0o600)
    expect(s.load().problems[0]?.revision).toBe(1)
    const changed = s.save([problem({ id: 'p1', title: '新标题', revision: 1 })])
    expect(changed.problems[0]?.revision).toBe(2)
  })

  it('保存保留未提交的 tombstone（删除不被 renderer 回写复活）', () => {
    const s = store('a')
    s.save([problem({ id: 'p1' })])
    s.save([problem({ id: 'p1', deletedAt: '2026-11-17T12:00:00.000Z' })])
    const after = s.save([problem({ id: 'p1', title: '复活尝试' })])
    expect(after.problems.find((p) => p.id === 'p1')?.deletedAt).toBeTruthy()
  })

  it('损坏本地文件：load 返回错误且不抛出', () => {
    const s = store('a')
    mkdirSync(path.dirname(s.ledgerPath()), { recursive: true })
    writeFileSync(s.ledgerPath(), '{invalid', { mode: 0o600 })
    const r = s.load()
    expect(r.problems).toEqual([])
    expect(r.error).toMatch(/读取失败/)
  })

  it('同步目录：拒绝项目根与仓库子目录；接受普通目录；可关闭', () => {
    const s = store('a')
    const repo = path.join(root, 'repo')
    mkdirSync(repo)
    writeFileSync(path.join(repo, 'package.json'), '{}')
    expect(s.setSyncFolder(repo).ok).toBe(false)
    // ADR-018 §5：祖先目录是 git 仓库 → 拒绝（防快照提交入库）
    mkdirSync(path.join(repo, 'nested'))
    writeFileSync(path.join(repo, '.git'), 'gitdir: elsewhere')
    expect(s.setSyncFolder(path.join(repo, 'nested')).ok).toBe(false)
    expect(s.setSyncFolder(syncDir).ok).toBe(true)
    expect(s.status().folder).toBe(realpathSync(syncDir))
    expect(s.setSyncFolder(null).ok).toBe(true)
    expect(s.status().folder).toBeNull()
  })

  it('未配置目录/口令 → 明确错误且不写快照', () => {
    const s = store('a')
    expect(s.syncNow()).toMatchObject({ ok: false, error: 'folder-missing' })
    s.setSyncFolder(syncDir)
    expect(store('b', {} as NodeJS.ProcessEnv).syncNow()).toMatchObject({ ok: false })
    expect(existsSync(path.join(syncDir, SYNC_SNAPSHOT_FILE))).toBe(false)
  })

  it('两台设备往返：加密远端合并并写回本地', () => {
    const a = store('a')
    const b = store('b')
    a.save([problem({ id: 'p1', title: 'A 的版本', revision: 1 })])
    b.save([problem({ id: 'p1', title: 'B 的版本', revision: 2 })])
    a.setSyncFolder(syncDir)
    b.setSyncFolder(syncDir)
    const first = a.syncNow()
    expect(first.ok).toBe(true)
    const remote = readFileSync(path.join(syncDir, SYNC_SNAPSHOT_FILE), 'utf-8')
    expect(remote).not.toContain('A 的版本') // 加密快照不落明文
    const second = b.syncNow()
    expect(second.ok).toBe(true)
    expect(second.conflicts).toBe(1)
    expect(b.load().problems[0]?.title).toBe('B 的版本')
    const third = a.syncNow()
    expect(third.ok).toBe(true)
    expect(a.load().problems[0]?.title).toBe('B 的版本')
  })

  it('syncNow 回传合并台账与冲突摘要（ADR-018 §3：id/revision 不丢）', () => {
    const a = store('a')
    const b = store('b')
    a.save([problem({ id: 'p1', title: 'A 版', revision: 1 })])
    b.save([problem({ id: 'p1', title: 'B 版', revision: 2 }), problem({ id: 'p2', revision: 1 })])
    b.setSyncFolder(syncDir)
    expect(
      b
        .syncNow()
        .problems?.map((p) => p.id)
        .sort(),
    ).toEqual(['p1', 'p2'])
    a.setSyncFolder(syncDir)
    const synced = a.syncNow()
    expect(synced.ok).toBe(true)
    // renderer 刷新依据：合并后的权威台账随结果返回
    expect(synced.problems?.find((p) => p.id === 'p1')?.title).toBe('B 版')
    expect(synced.problems?.some((p) => p.id === 'p2')).toBe(true)
    expect(synced.conflictDetails).toEqual([
      { id: 'p1', localRevision: 1, remoteRevision: 2, winner: 'remote' },
    ])
  })

  it('陈旧 renderer 保存不得覆盖同步后的更高 revision（审计 P1 防数据丢失）', () => {
    const a = store('a')
    const b = store('b')
    a.save([problem({ id: 'p1', title: 'A 旧', revision: 1 })])
    b.save([problem({ id: 'p1', title: 'B 新', revision: 2 })])
    b.setSyncFolder(syncDir)
    b.syncNow()
    a.setSyncFolder(syncDir)
    expect(a.syncNow().problems?.find((p) => p.id === 'p1')?.title).toBe('B 新')
    // 模拟 renderer 未刷新（内存仍是同步前副本）：全量保存旧内容（revision 1）
    const stale = a.save([problem({ id: 'p1', title: 'A 旧', revision: 1 })])
    expect(stale.problems.find((p) => p.id === 'p1')?.title).toBe('B 新')
    expect(a.load().problems.find((p) => p.id === 'p1')?.title).toBe('B 新')
    // 用户真正的新编辑（revision 与 main 持平且内容变化）仍能生效并抬 revision
    const fresh = a.save([problem({ id: 'p1', title: 'A 再改', revision: 2 })])
    expect(fresh.problems.find((p) => p.id === 'p1')?.title).toBe('A 再改')
    expect(fresh.problems.find((p) => p.id === 'p1')?.revision).toBe(3)
  })

  it('renderer 保存不删除本次列表外的 main 条目（远端新增不被省略丢失）', () => {
    const a = store('a')
    const b = store('b')
    b.save([problem({ id: 'p2', title: '远端新增', revision: 1 })])
    b.setSyncFolder(syncDir)
    expect(b.syncNow().ok).toBe(true)
    a.setSyncFolder(syncDir)
    expect(a.syncNow().problems?.some((p) => p.id === 'p2')).toBe(true)
    // 陈旧 renderer 内存只含自己的 p1（不含 p2）→ 保存不得丢掉 p2
    const saved = a.save([problem({ id: 'p1', title: '本地', revision: 1 })])
    expect(saved.problems.some((p) => p.id === 'p2')).toBe(true)
    expect(a.load().problems.some((p) => p.id === 'p2')).toBe(true)
  })

  it('错误口令/未知 schema → 拒绝覆盖；本地保持原样', () => {
    const a = store('a')
    a.save([problem({ id: 'p1', title: '本地' })])
    a.setSyncFolder(syncDir)
    const remotePath = path.join(syncDir, SYNC_SNAPSHOT_FILE)
    writeFileSync(remotePath, encryptLedgerPayload({ schemaVersion: 99, problems: [] }, 'other'))
    const wrong = a.syncNow()
    expect(wrong.ok).toBe(false)
    expect(wrong.error).toBe('remote-invalid')
    expect(a.load().problems[0]?.title).toBe('本地')

    writeFileSync(
      remotePath,
      encryptLedgerPayload(
        { schemaVersion: 1, deviceId: 'x', exportedAt: '', problems: [] },
        'test-pass',
      ),
    )
    const b = store('b', { NEONFORGE_SYNC_PASSPHRASE: 'wrong' } as NodeJS.ProcessEnv)
    b.setSyncFolder(syncDir)
    expect(b.syncNow()).toMatchObject({ ok: false, error: 'remote-invalid' })
  })
})
