// S1b Task 8（stage-spec E2）：happy path 端到端双轨（发起→推进→拍板→核验→收尾）。
// 经 IPC 通道 handler 直调（registerDomainChannels），走 §9 九事件全序——确定性、无 Electron、无网络。
// 双轨：假网关（默认，本文件）；真网关（需 NF_* Key，无则记 blocked——本文件真轨见 describe.skip 说明）。
import { describe, it, expect, afterEach } from 'vitest'
import {
  registerDomainChannels,
  type DomainChannel,
  type IpcMainLike,
} from '../../src/main/ipcDomain'
import {
  getRuntime,
  resetRuntime,
  fakeGateway,
  type GatewayLike,
} from '../../src/main/domainRuntime'

type Handler = (evt: unknown, args: unknown) => unknown
type Channels = Record<DomainChannel, Handler>

function boot(gateway?: GatewayLike) {
  const handlers = {} as Channels
  const ipc: IpcMainLike = {
    handle: (channel, fn) => {
      handlers[channel] = fn as Handler
    },
  }
  resetRuntime()
  const rt = getRuntime(gateway ? { gateway } : undefined)
  registerDomainChannels(ipc, { runtime: rt, abortStream: () => false })
  const evt = { sender: { send: () => {} } }
  return { handlers, evt, rt }
}

const call = <R>(h: Handler, args: unknown, evt: unknown): R => h(evt, args) as R

describe('S1b Task 8：happy path 端到端（假网关轨 E2）', () => {
  afterEach(() => resetRuntime())

  it('发起→推进→拍板→核验→收尾：§9 九事件全序落账，终态 accepted', () => {
    const { handlers, evt, rt } = boot(fakeGateway('-old\n+new'))
    // 1 发起
    call(
      handlers['delegation:create'],
      {
        delegationId: 'd1',
        intent: '把 src 下的旧日志清掉',
        scopeEntries: [{ kind: '目录', pattern: 'src/**' }],
      },
      evt,
    )
    // 2 推进：用户输入开轮 → produce（作用域内 ⇒ ChangeProduced＋EvidenceRecorded）
    call(
      handlers['turn:start'],
      {
        delegationId: 'd1',
        turnId: 't1',
        inputId: 'in1',
        triggerSource: '用户输入',
      },
      evt,
    )
    const produced = call<{ produced: boolean }>(
      handlers['change:produce'],
      {
        delegationId: 'd1',
        turnId: 't1',
        changeSet: '-old\n+new',
        op: { category: '资源访问', entryKind: '目录', resource: 'src/a.ts', hits: null },
      },
      evt,
    )
    expect(produced.produced).toBe(true)
    // 3 拍板：raise→resolve（批准）
    call(
      handlers['decision:raise'],
      {
        decisionPointId: 'dp1',
        delegationId: 'd1',
        turnId: 't1',
        requestReason: { reason: '作用域外', operation: '读 etc/hosts', requestedBy: 'AI 提请' },
      },
      evt,
    )
    call(handlers['decision:resolve'], { decisionPointId: 'dp1', value: '批准' }, evt)
    // 4 核验：claimer 经聚合 claimCompletion（此时有证据）
    const evidence = call<Array<{ evidenceId: string }>>(
      handlers['evidence:list-by-delegation'],
      { delegationId: 'd1' },
      evt,
    )
    expect(evidence.length).toBeGreaterThan(0)
    const d = rt.delegations.findById('d1')!
    rt.log(
      d.claimCompletion(
        { claim: '已完成', turnId: 't1', evidenceRefs: evidence.map((e) => e.evidenceId) },
        rt.evidence,
      ),
    )
    rt.delegations.save(d)
    // 5 收尾
    call(handlers['delegation:accept'], { delegationId: 'd1' }, evt)

    expect(rt.timeline.since(1).map((e) => e.type)).toEqual([
      'DelegationCreated',
      'TurnStarted',
      'InputAcknowledged',
      'ChangeProduced',
      'EvidenceRecorded',
      'DecisionRaised',
      'DecisionResolved',
      'CompletionClaimed',
      'DelegationAccepted',
    ])
    expect(rt.timeline.since(1).map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(rt.delegations.findById('d1')!.state).toBe('accepted')
  })

  it('作用域外操作 ⇒ 未过闸零副作用，须转拍板（I-7）', () => {
    const { handlers, evt, rt } = boot(fakeGateway())
    call(
      handlers['delegation:create'],
      {
        delegationId: 'd1',
        intent: 'x',
        scopeEntries: [{ kind: '目录', pattern: 'src/**' }],
      },
      evt,
    )
    call(
      handlers['turn:start'],
      {
        delegationId: 'd1',
        turnId: 't1',
        inputId: 'in1',
        triggerSource: '用户输入',
      },
      evt,
    )
    const r = call<{ produced: boolean }>(
      handlers['change:produce'],
      {
        delegationId: 'd1',
        turnId: 't1',
        changeSet: 'x',
        op: { category: '资源访问', entryKind: '目录', resource: '/etc/hosts', hits: null },
      },
      evt,
    )
    expect(r.produced).toBe(false)
    expect(rt.timeline.since(1).map((e) => e.type)).toEqual([
      'DelegationCreated',
      'TurnStarted',
      'InputAcknowledged',
    ])
  })
})

// 真网关轨（E2 双轨另一半）：需 NF_* Key 且工具执行链接入（S1 缺口——见交接登记）。
// 无 Key 环境记 blocked，不判红不预绿（stage-spec E2 G5 式）。
describe.skip('S1b Task 8：happy path 真网关轨（需 NF_* Key + 工具执行链，S1 缺口）', () => {
  it('真流的 write/edit → diff → 变更集（待工具执行链落地）', () => {
    // 缺工具执行链：真变更集来自 write/edit 的 diff，非 streamChat 的文本流。
    // 本轨登记为 S1 实现缺口，S2+ 工具执行链接入后补。
    expect(true).toBe(true)
  })
})
