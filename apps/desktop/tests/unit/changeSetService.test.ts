import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ChangeSetService } from '../../src/main/changeSetService'

const TMP = '/tmp/nf-unit-changeset'

describe('ChangeSetService（BC-10 持久化 + 基线校验）', () => {
  let svc: ChangeSetService
  let proj: string
  beforeEach(() => {
    rmSync(TMP, { recursive: true, force: true })
    mkdirSync(TMP, { recursive: true })
    proj = path.join(TMP, 'proj')
    mkdirSync(proj, { recursive: true })
    svc = new ChangeSetService(path.join(TMP, 'changesets.json'))
  })
  afterEach(() => rmSync(TMP, { recursive: true, force: true }))

  it('recordMutation：记录基线/结果哈希与快照；状态 applied', () => {
    const file = path.join(proj, 'a.txt')
    writeFileSync(file, 'old', 'utf-8')
    writeFileSync(`${file}.nf-bak`, 'old', 'utf-8')
    writeFileSync(file, 'new', 'utf-8')
    const set = svc.recordMutation('s1', file)
    expect(set.items).toHaveLength(1)
    expect(set.items[0]).toMatchObject({ path: file, snapshotRef: `${file}.nf-bak`, status: 'applied' })
    expect(set.items[0].baseHash).toBeTruthy()
    expect(set.items[0].afterHash).not.toBe(set.items[0].baseHash)
  })

  it('revert：恢复快照内容；状态 reverted', () => {
    const file = path.join(proj, 'b.txt')
    writeFileSync(file, 'before', 'utf-8')
    writeFileSync(`${file}.nf-bak`, 'before', 'utf-8')
    writeFileSync(file, 'after', 'utf-8')
    svc.recordMutation('s1', file)
    const r = svc.revert('s1')
    expect(r.ok).toBe(true)
    expect(readFileSync(file, 'utf-8')).toBe('before')
    expect(svc.get('s1')?.status).toBe('reverted')
  })

  it('revert：外部修改后拒绝覆盖（conflicted）', () => {
    const file = path.join(proj, 'c.txt')
    writeFileSync(file, 'before', 'utf-8')
    writeFileSync(`${file}.nf-bak`, 'before', 'utf-8')
    writeFileSync(file, 'after', 'utf-8')
    svc.recordMutation('s1', file)
    writeFileSync(file, 'external', 'utf-8')
    const r = svc.revert('s1')
    expect(r.ok).toBe(false)
    expect(readFileSync(file, 'utf-8')).toBe('external')
    expect(svc.get('s1')?.status).toBe('conflicted')
  })

  it('clear / 空会话：返回 null 且不阻断', () => {
    expect(svc.get('none')).toBeNull()
    const file = path.join(proj, 'd.txt')
    writeFileSync(file, 'x', 'utf-8')
    svc.recordMutation('s2', file)
    svc.clear('s2')
    expect(svc.get('s2')).toBeNull()
    expect(existsSync(path.join(TMP, 'changesets.json'))).toBe(true)
  })
})
