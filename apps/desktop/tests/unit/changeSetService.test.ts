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
    expect(set.items[0].status).toBe('applied')
    expect(set.items[0].snapshotRef).toBeTruthy()
    expect(set.items[0].snapshotRef).not.toBe(`${file}.nf-bak`)
    expect(existsSync(set.items[0].snapshotRef as string)).toBe(true)
    expect(set.items[0].baseHash).toBeTruthy()
    expect(set.items[0].afterHash).not.toBe(set.items[0].baseHash)
  })

  it('多次写入：回滚仍恢复首次基线（不被后续 .nf-bak 覆盖）', () => {
    const file = path.join(proj, 'multi.txt')
    writeFileSync(file, 'v1', 'utf-8')
    writeFileSync(`${file}.nf-bak`, 'v1', 'utf-8')
    writeFileSync(file, 'v2', 'utf-8')
    svc.recordMutation('s1', file)
    // 第二次写：takeSnapshot 会把 .nf-bak 覆盖为 v2
    writeFileSync(`${file}.nf-bak`, 'v2', 'utf-8')
    writeFileSync(file, 'v3', 'utf-8')
    svc.recordMutation('s1', file)
    const r = svc.revert('s1')
    expect(r.ok).toBe(true)
    expect(readFileSync(file, 'utf-8')).toBe('v1')
  })

  it('冲突状态不被后续写入洗掉；重复回滚仍报告冲突', () => {
    const a = path.join(proj, 'ca.txt')
    const b = path.join(proj, 'cb.txt')
    writeFileSync(a, 'a1')
    writeFileSync(`${a}.nf-bak`, 'a1')
    writeFileSync(a, 'a2')
    svc.recordMutation('s1', a)
    writeFileSync(a, 'external')
    const first = svc.revert('s1')
    expect(first.ok).toBe(false)
    expect(first.conflicted).toContain(a)
    expect(svc.get('s1')?.status).toBe('conflicted')
    // 另一个文件写入后，冲突项仍必须保留
    writeFileSync(b, 'b1')
    writeFileSync(`${b}.nf-bak`, 'b1')
    writeFileSync(b, 'b2')
    svc.recordMutation('s1', b)
    expect(svc.get('s1')?.status).toBe('conflicted')
    const second = svc.revert('s1')
    expect(second.conflicted).toContain(a)
    expect(second.ok).toBe(false)
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

  it('preWrite 提供时即使 .nf-bak 缺失，回滚恢复原文件而非删除', () => {
    const file = path.join(proj, 'snapshot-missing.txt')
    writeFileSync(file, 'original', 'utf-8')
    // 模拟快照失败/已被任务边界清理：写后无 .nf-bak
    writeFileSync(file, 'changed', 'utf-8')
    svc.recordMutation('s1', file, { content: 'original' })
    expect(svc.get('s1')?.items[0].baseHash).toBeTruthy()
    const r = svc.revert('s1')
    expect(r.ok).toBe(true)
    expect(readFileSync(file, 'utf-8')).toBe('original')
  })

  it('preWrite content=null 表示新建文件：回滚删除', () => {
    const file = path.join(proj, 'created.txt')
    writeFileSync(file, 'new content', 'utf-8')
    svc.recordMutation('s1', file, { content: null })
    expect(svc.get('s1')?.items[0].baseHash).toBeNull()
    const r = svc.revert('s1')
    expect(r.ok).toBe(true)
    expect(existsSync(file)).toBe(false)
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

  it('commit 回调：变更集状态 + 基线文件 + 事件同一事务', () => {
    const file = path.join(proj, 'tx.txt')
    writeFileSync(file, 'new', 'utf-8')
    const commits: Array<{
      writes: Array<{ filePath: string; content: string }>
      events: Array<{ type: string }>
    }> = []
    let emitted = 0
    const txSvc = new ChangeSetService(
      path.join(TMP, 'changesets.json'),
      () => {
        emitted += 1
      },
      (writes, events) => {
        commits.push({ writes, events })
      },
    )
    txSvc.recordMutation('s1', file, { content: 'old' })
    expect(emitted).toBe(0)
    expect(commits).toHaveLength(1)
    expect(commits[0].writes.some((w) => w.filePath.endsWith('changesets.json'))).toBe(true)
    const baseline = commits[0].writes.find((w) => w.filePath.includes('changeset-baselines'))
    expect(baseline?.content).toBe('old')
    expect(commits[0].events.map((e) => e.type)).toEqual([
      'changeset.proposed',
      'changeset.applied',
    ])
  })
})
