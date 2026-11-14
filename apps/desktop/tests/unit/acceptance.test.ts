import { describe, it, expect } from 'vitest'
import {
  deriveAcceptance,
  markPassed,
  markFailed,
  waiveItem,
  evaluateGate,
} from '../../src/domain/acceptance'

const at = '2026-11-14T00:00:00.000Z'

function record(labels: string[]) {
  return deriveAcceptance('r1', labels, 'plan-verification', at)
}

describe('AcceptanceRecord（BC-14）', () => {
  it('derive：从验证计划派生验收项；空来源显式为空', () => {
    const r = record(['npm test 通过', '页面可打开'])
    expect(r.items).toHaveLength(2)
    expect(r.items[0]).toMatchObject({
      id: 'item-1',
      label: 'npm test 通过',
      source: 'plan-verification',
      status: 'pending',
    })
    expect(record([]).items).toHaveLength(0)
  })

  it('markPassed：无证据/无手工理由 → 拒绝；有证据才通过', () => {
    const r = record(['a'])
    expect(() => markPassed(r, 'item-1')).toThrow(/证据/)
    const passed = markPassed(r, 'item-1', { evidenceRef: 'verification:npm test' })
    expect(passed.items[0]).toMatchObject({ status: 'passed', evidenceRef: 'verification:npm test' })
    const manual = markPassed(r, 'item-1', { manualReason: '用户目视确认' })
    expect(manual.items[0].status).toBe('passed')
  })

  it('markFailed / waive：失败记录原因；豁免必须带理由', () => {
    const failed = markFailed(record(['a']), 'item-1', '命令退出码 1')
    expect(failed.items[0]).toMatchObject({ status: 'failed', evidenceRef: '命令退出码 1' })
    expect(() => waiveItem(record(['a']), 'item-1', '')).toThrow(/理由/)
    const waived = waiveItem(record(['a']), 'item-1', '本次不覆盖该场景')
    expect(waived.items[0]).toMatchObject({ status: 'waived', waivedReason: '本次不覆盖该场景' })
  })

  it('evaluateGate：pending→incomplete；failed→failed；全 passed→passed', () => {
    expect(evaluateGate(record(['a'])).verdict).toBe('incomplete')
    const failed = markFailed(record(['a', 'b']), 'item-2', 'x')
    expect(evaluateGate(failed).verdict).toBe('failed')
    expect(evaluateGate(failed).blocking).toContain('item-2')
    const passed = markPassed(markPassed(record(['a', 'b']), 'item-1', { evidenceRef: 'e1' }), 'item-2', {
      evidenceRef: 'e2',
    })
    expect(evaluateGate(passed).verdict).toBe('passed')
  })

  it('evaluateGate：全豁免 → passed-with-waivers；无验收项 → incomplete', () => {
    const waived = waiveItem(record(['a', 'b']), 'item-1', 'r1')
    const waived2 = waiveItem(waived, 'item-2', 'r2')
    expect(evaluateGate(waived2).verdict).toBe('passed-with-waivers')
    expect(evaluateGate(record([])).verdict).toBe('incomplete')
    expect(evaluateGate(record([])).blocking).toContain('no-acceptance-source')
  })
})
