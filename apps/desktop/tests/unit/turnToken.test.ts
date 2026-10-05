import { describe, it, expect } from 'vitest'
import { isExpired, type TurnToken } from '../../src/domain/turn/TurnToken'
import { Turn } from '../../src/domain/turn/Turn'

const tok = (delegationId: string, turnId: string): TurnToken => ({ delegationId, turnId })
const start = (turnId: string, delegationId = 'd1') =>
  Turn.start(
    { delegationId, turnId, triggerSource: '用户输入', inputId: `in-${turnId}` },
    { inFlight: null, deniedPending: false },
  ).turn

describe('TurnToken 写前复核（C10／I-13 过期写入计数＝0）', () => {
  it('复合值比对：同值不过期，任一分量不等即过期；无在飞轮＝一律过期', () => {
    expect(isExpired(tok('d1', 't1'), tok('d1', 't1'))).toBe(false)
    expect(isExpired(tok('d1', 't1'), tok('d1', 't2'))).toBe(true)
    expect(isExpired(tok('d1', 't1'), tok('d2', 't1'))).toBe(true) // turnId 仅委托内单调
    expect(isExpired(tok('d1', 't1'), null)).toBe(true)
  })

  it('未过期写入放行 ⇒ 复核返真且过期计数读数＝0', () => {
    const t1 = start('t1')
    let written = 0
    if (t1.guardedWrite(t1.token)) written += 1
    expect([written, t1.expiredWriteCount]).toEqual([1, 0])
  })

  it('过期写入丢弃 ⇒ 计数 +1 且状态写入未发生', () => {
    const t1 = start('t1')
    t1.terminal('中止')
    const t2 = start('t2') // 在飞轮复合值已变更
    let written = 0
    if (t1.guardedWrite(t2.token)) written += 1
    expect(written).toBe(0)
    expect(t1.expiredWriteCount).toBe(1)
    expect(t1.terminalState).toBe('中止') // 被丢弃的写入不改聚合状态
  })

  it('多次过期写入逐次留证（计数器非一次性标志）', () => {
    const t1 = start('t1')
    const t2 = start('t2')
    t1.guardedWrite(t2.token)
    t1.guardedWrite(t2.token)
    expect(t1.expiredWriteCount).toBe(2)
    expect(t2.expiredWriteCount).toBe(0) // 计数按轮各自留证，不串轮
  })

  it('令牌由轮签发且不可变（复合值＝(delegationId, turnId)）', () => {
    const t1 = start('t1')
    expect(t1.token).toEqual({ delegationId: 'd1', turnId: 't1' })
    expect(Object.keys(t1.token).sort()).toEqual(['delegationId', 'turnId'])
  })
})
