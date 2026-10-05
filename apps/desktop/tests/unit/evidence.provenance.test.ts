import { describe, it, expect } from 'vitest'
import { EvidenceItem } from '../../src/domain/evidence/EvidenceItem'
import type { Provenance } from '../../src/domain/evidence/EvidenceItem'

const rec = (id = 'e1') =>
  EvidenceItem.record({
    evidenceId: id,
    delegationId: 'd1',
    type: '命令输出',
    content: 'normal output',
  })

describe('EvidenceItem / Provenance 恒系统采集（C4/I-5）', () => {
  it('provenance 恒＝系统采集', () => {
    expect(rec().provenance).toBe('系统采集')
  })

  it('类型面：非系统采集不可表达（AI 自述被类型挡下）', () => {
    // @ts-expect-error Provenance 为单字面量类型，'AI自述' 不合规
    const illegal: Provenance = 'AI自述'
    expect(illegal).toBe('AI自述')
  })

  it('inspect 首次计入、重复打开不计', () => {
    const e = rec()
    expect(e.inspect()).toBe(true) // 首开
    expect(e.inspect()).toBe(false) // 重复
    expect(e.firstInspection).toBe(true)
  })

  it('record 产 PayloadRef{ptr,digest}', () => {
    const e = rec()
    expect(e.payloadRef.ptr).toContain('e1')
    expect(e.payloadRef.digest).toMatch(/^[0-9a-f]{8}$/)
  })
})
