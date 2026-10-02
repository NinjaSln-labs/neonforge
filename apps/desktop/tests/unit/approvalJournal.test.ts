import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { appendFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ApprovalJournal, fingerprintArgs } from '../../src/main/approvalJournal'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'nf-journal-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('ADR-017 approvalJournal', () => {
  it('issueId 跨实例唯一（bootNonce 在 id 内——重启撞号封堵）', () => {
    const a = new ApprovalJournal(path.join(dir, 'j.jsonl'))
    const b = new ApprovalJournal(path.join(dir, 'j2.jsonl'))
    const idsA = new Set(Array.from({ length: 50 }, () => a.issueId()))
    const idsB = Array.from({ length: 50 }, () => b.issueId())
    expect(idsA.size).toBe(50)
    expect(idsB.every((x) => !idsA.has(x))).toBe(true) // 两"进程世代"不撞号
    expect(idsA.values().next().value).toMatch(/^apr_[a-z0-9]+_\d+$/)
  })
  it('append 后 phaseOf 取最新阶段；latestRows 每 id 一行', () => {
    const j = new ApprovalJournal(path.join(dir, 'j.jsonl'))
    const id = j.issueId()
    j.append({ requestId: id, toolName: 'bash', argsFingerprint: 'fp1', phase: 'issued' })
    j.append({ requestId: id, toolName: 'bash', argsFingerprint: 'fp1', phase: 'started' })
    expect(j.phaseOf(id)).toBe('started')
    const rows = j.latestRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ requestId: id, phase: 'started' })
  })
  it('损坏行忽略（append-only 容错——configStore 模式）；未知 id → null', () => {
    const fp = path.join(dir, 'j.jsonl')
    const j = new ApprovalJournal(fp)
    appendFileSync(fp, 'NOT-JSON\n')
    expect(() => j.latestRows()).not.toThrow()
    expect(j.phaseOf('apr_none_1')).toBeNull()
  })
  it('fingerprintArgs：键序无关、异 args 必不同', () => {
    expect(fingerprintArgs('write', { path: '/a', content: 'x' })).toBe(
      fingerprintArgs('write', { content: 'x', path: '/a' }),
    )
    expect(fingerprintArgs('write', { path: '/a' })).not.toBe(
      fingerprintArgs('write', { path: '/b' }),
    )
  })
})
