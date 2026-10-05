// S1b Task 3：委托单中心 IPC 通道。
// 接缝＝registerDomainChannels(ipcMainLike, deps)——main 侧 wiring 单独可测，不Drag electron（ipc.ts 顶层 import
// electron/configStore，直连测会拖整张图；呈现侧仍按 S-1 禁写面，本文件属 wiring）。
import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerDomainChannels,
  type DomainChannel,
  type IpcMainLike,
} from '../../src/main/ipcDomain'
import { getRuntime, resetRuntime, type DomainRuntime } from '../../src/main/domainRuntime'
import { EvidenceItem } from '../../src/domain/evidence/EvidenceItem'
import { DomainError } from '../../src/domain/domainError'

type Handler = (evt: unknown, args: unknown) => unknown
type Channels = Record<DomainChannel, Handler>

/** 假注册表：收集 channel→handler，供直调（＝testHooks 直调 handler 的等价物，且不依赖 electron） */
function harness(depsOverride: Partial<{ abortStream: (id: string) => boolean }> = {}) {
  const handlers = {} as Channels
  const sent: Array<{ channel: string; payload: unknown }> = []
  const ipc: IpcMainLike = {
    handle: (channel, fn) => {
      handlers[channel] = fn as Handler
    },
  }
  const abortStream = depsOverride.abortStream ?? (() => false)
  registerDomainChannels(ipc, { runtime: getRuntime(), abortStream })
  const evt = { sender: { send: (c: string, p: unknown) => sent.push({ channel: c, payload: p }) } }
  return { handlers, evt, sent }
}

const call = <R>(h: Handler, evt: unknown, args: unknown): R => h(evt, args) as R

const codeOf = (fn: () => unknown): string | null => {
  try {
    fn()
    return null
  } catch (e) {
    return e instanceof DomainError ? e.code : 'other'
  }
}

const seedEvidence = (rt: DomainRuntime, evidenceId: string, delegationId: string) => {
  rt.evidence.save(
    EvidenceItem.record({ evidenceId, delegationId, type: '变更集', content: '-a\n+b' }),
  )
}

describe('委托单中心 IPC 通道（Task 3）', () => {
  let rt: DomainRuntime
  beforeEach(() => {
    resetRuntime()
    rt = getRuntime()
  })

  it('通道注册表＝契约面，且旧 timeline:log／timeline:query 不在（A2.5 已退役）', () => {
    const { handlers } = harness()
    expect(Object.keys(handlers).sort()).toEqual(
      [
        'decision:raise',
        'decision:resolve',
        'delegation:accept',
        'delegation:create',
        'delegation:list',
        'delegation:reject',
        'evidence:inspect',
        'evidence:list-by-delegation',
        'gateway:cancel-stream',
        'queue:pending',
        'timeline:query-by-delegation',
        'timeline:subscribe',
        'turn:start',
      ].sort(),
    )
  })

  it('delegation:create ⇒ 返 DTO＋入仓储＋落账 DelegationCreated', () => {
    const { handlers, evt } = harness()
    const res = call<{ delegationId: string; state: string }>(handlers['delegation:create'], evt, {
      delegationId: 'd1',
      intent: '把 Stop 做对',
    })
    expect(res).toEqual({ delegationId: 'd1', state: 'created' })
    expect(rt.delegations.findActive().map((d) => d.delegationId)).toEqual(['d1'])
    expect(rt.timeline.since(1).map((e) => e.type)).toEqual(['DelegationCreated'])
  })

  it('delegation:list ⇒ 纯对象投影（不跨 IPC 传聚合实例）', () => {
    const { handlers, evt } = harness()
    call(handlers['delegation:create'], evt, { delegationId: 'd1', intent: 'x' })
    const list = call<Array<Record<string, unknown>>>(handlers['delegation:list'], evt, {})
    expect(list).toEqual([{ delegationId: 'd1', intent: 'x', state: 'created', reopenCount: 0 }])
    expect(Object.getPrototypeOf(list[0]) === Object.prototype).toBe(true)
  })

  it('turn:start 空档 ⇒ TurnStarted＋InputAcknowledged（归宿＝开轮）', () => {
    const { handlers, evt } = harness()
    call(handlers['delegation:create'], evt, { delegationId: 'd1', intent: 'x' })
    const res = call<{ into: string }>(handlers['turn:start'], evt, {
      delegationId: 'd1',
      turnId: 't1',
      inputId: 'in1',
      triggerSource: '用户输入',
    })
    expect(res).toEqual({ into: 'turn', turnId: 't1' })
    expect(rt.timeline.since(1).map((e) => e.type)).toEqual([
      'DelegationCreated',
      'TurnStarted',
      'InputAcknowledged',
    ])
  })

  it('turn:start 在飞位占用 ⇒ 输入入队而非丢弃（C1 输者归宿），I-1 不外抛', () => {
    const { handlers, evt } = harness()
    call(handlers['delegation:create'], evt, { delegationId: 'd1', intent: 'x' })
    call(handlers['turn:start'], evt, {
      delegationId: 'd1',
      turnId: 't1',
      inputId: 'in1',
      triggerSource: '用户输入',
    })
    const res = call<{ into: string; itemId: string }>(handlers['turn:start'], evt, {
      delegationId: 'd1',
      turnId: 't2',
      inputId: 'in2',
      triggerSource: '用户输入',
    })
    expect(res.into).toBe('queue')
    expect(rt.timeline.since(1).map((e) => e.type)).toContain('InstructionQueued')
    const pending = call<Array<{ itemId: string }>>(handlers['queue:pending'], evt, {})
    expect(pending.map((i) => i.itemId)).toEqual([res.itemId])
  })

  it('decision:raise 缺归属 ⇒ I-3 拒且不生成；raise 成功 ⇒ 落 DecisionRaised', () => {
    const { handlers, evt } = harness()
    call(handlers['delegation:create'], evt, { delegationId: 'd1', intent: 'x' })
    expect(
      codeOf(() =>
        call(handlers['decision:raise'], evt, {
          decisionPointId: 'dp0',
          delegationId: 'd1',
          turnId: '',
          requestReason: { reason: '作用域外', operation: '读 etc/hosts', requestedBy: 'AI 提请' },
        }),
      ),
    ).toBe('I-3')
    expect(rt.decisionPoints.findById('dp0')).toBeUndefined()
    call(handlers['decision:raise'], evt, {
      decisionPointId: 'dp1',
      delegationId: 'd1',
      turnId: 't1',
      requestReason: { reason: '作用域外', operation: '读 etc/hosts', requestedBy: 'AI 提请' },
    })
    expect(rt.timeline.since(1).map((e) => e.type)).toContain('DecisionRaised')
  })

  it('decision:resolve 拒绝 ⇒ DecisionResolved＋DecisionDenied 同批；二次决议 ⇒ C2 幂等拒', () => {
    const { handlers, evt } = harness()
    call(handlers['delegation:create'], evt, { delegationId: 'd1', intent: 'x' })
    call(handlers['decision:raise'], evt, {
      decisionPointId: 'dp1',
      delegationId: 'd1',
      turnId: 't1',
      requestReason: { reason: '作用域外', operation: 'rm -rf', requestedBy: 'AI 提请' },
    })
    call(handlers['decision:resolve'], evt, {
      decisionPointId: 'dp1',
      value: '拒绝',
      reason: '不许删',
    })
    expect(rt.timeline.since(1).map((e) => e.type)).toContain('DecisionDenied')
    expect(
      codeOf(() =>
        call(handlers['decision:resolve'], evt, { decisionPointId: 'dp1', value: '批准' }),
      ),
    ).toBe('C2')
  })

  it('evidence:inspect ⇒ 落 EvidenceInspected 且首开标记 true→false（机制口 append，非直连 record）', () => {
    const { handlers, evt } = harness()
    seedEvidence(rt, 'e1', 'd1')
    const first = call<{ firstInspection: boolean }>(handlers['evidence:inspect'], evt, {
      evidenceId: 'e1',
    })
    const second = call<{ firstInspection: boolean }>(handlers['evidence:inspect'], evt, {
      evidenceId: 'e1',
    })
    expect([first.firstInspection, second.firstInspection]).toEqual([true, false])
    expect(
      rt.timeline.findByDelegation('d1').filter((e) => e.type === 'EvidenceInspected'),
    ).toHaveLength(2)
    const list = call<Array<{ evidenceId: string }>>(handlers['evidence:list-by-delegation'], evt, {
      delegationId: 'd1',
    })
    expect(list.map((e) => e.evidenceId)).toEqual(['e1'])
  })

  it('delegation:accept 非待核验态 ⇒ I-16 码；reject 同理（断违例码不断文案）', () => {
    const { handlers, evt } = harness()
    call(handlers['delegation:create'], evt, { delegationId: 'd1', intent: 'x' })
    expect(codeOf(() => call(handlers['delegation:accept'], evt, { delegationId: 'd1' }))).toBe(
      'I-16',
    )
    expect(codeOf(() => call(handlers['delegation:reject'], evt, { delegationId: 'd1' }))).toBe(
      'I-16',
    )
  })

  it('timeline:query-by-delegation 只回该委托；subscribe 把事件推给 sender（B4 只读分发跨进程面）', () => {
    const { handlers, evt, sent } = harness()
    call(handlers['delegation:create'], evt, { delegationId: 'd1', intent: 'x' })
    call(handlers['delegation:create'], evt, { delegationId: 'd2', intent: 'y' })
    const mine = call<Array<{ delegationId: string }>>(
      handlers['timeline:query-by-delegation'],
      evt,
      { delegationId: 'd1' },
    )
    expect(mine.map((e) => e.delegationId)).toEqual(['d1'])
    call(handlers['timeline:subscribe'], evt, {})
    call(handlers['delegation:create'], evt, { delegationId: 'd3', intent: 'z' })
    expect(sent.map((s) => s.channel)).toEqual(['timeline:event'])
    expect(sent[0].payload).toMatchObject({ type: 'DelegationCreated', delegationId: 'd3' })
  })

  it('gateway:cancel-stream ⇒ 转投 stream 生命周期所有者的 abort（Task 2 面）', () => {
    const seen: string[] = []
    const { handlers, evt } = harness({
      abortStream: (id) => {
        seen.push(id)
        return true
      },
    })
    const res = call<{ ok: boolean }>(handlers['gateway:cancel-stream'], evt, { streamId: 's1' })
    expect([res, seen]).toEqual([{ ok: true }, ['s1']])
  })
})
