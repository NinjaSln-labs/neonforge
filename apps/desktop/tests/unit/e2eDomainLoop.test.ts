import { describe, it, expect } from 'vitest'
import { Delegation } from '../../src/domain/delegation/Delegation'
import { DecisionPoint, type RequestCause } from '../../src/domain/authorization/DecisionPoint'
import { Scope } from '../../src/domain/authorization/Scope'
import { HIGH_IMPACT_LIST } from '../../src/domain/authorization/highImpactList'
import { InstructionQueue } from '../../src/domain/queue/InstructionQueue'
import { Turn, type StartInput, type TriggerSource } from '../../src/domain/turn/Turn'
import { DomainError } from '../../src/domain/domainError'
import {
  applyChange,
  attachEvidenceCollector,
  type ApplyChangeDeps,
} from '../../src/domain/service/applyChange'
import type { Operation } from '../../src/domain/spec/requiresApproval'
import { deriveWaitingItems } from '../../src/domain/projection/waitingItems'
import { deriveFocus } from '../../src/domain/projection/focus'
import { InMemoryTimelineRepo } from '../../src/domain/repos/memory/timelineRepo'
import { InMemoryDelegationRepo } from '../../src/domain/repos/memory/delegationRepo'
import { InMemoryEvidenceRepo } from '../../src/domain/repos/memory/evidenceRepo'
import { InMemoryDecisionPointRepo } from '../../src/domain/repos/memory/decisionPointRepo'
import { InMemoryTurnRepo } from '../../src/domain/repos/memory/turnRepo'
import type { EventDraft } from '../../src/domain/timeline'

// Task 18＝S1a 域内出口：假网关 L1 端到端领域闭环（详设 §9 步1–5＋步7，E1 假轨）。
// 本文件即「装配面」：7 聚合＋7 内存仓储＋3 Spec＋2 服务＋2 投影全部在场，无真网关、无真 Key、无网络。
// 真网关 port／IPC／renderer／AbortController 流级取消＝S1b（plan §S1a 不含清单）。
interface GatewayLike {
  // 假网关只回确定产出（同输入同产出，无随机）
  nextChangeSet(delegationId: string, turnId: string): string
}

const fakeGateway = (changeSet: string): GatewayLike => ({ nextChangeSet: () => changeSet })

function createWorld(gateway: GatewayLike = fakeGateway('-old\n+new')) {
  const timeline = new InMemoryTimelineRepo()
  const delegations = new InMemoryDelegationRepo()
  const evidence = new InMemoryEvidenceRepo()
  const decisionPoints = new InMemoryDecisionPointRepo()
  const turns = new InMemoryTurnRepo()
  const queue = new InstructionQueue('q1')
  const scope = Scope.initial('d1', [{ kind: '目录', pattern: 'src/**' }])
  const changeSets = new Map<string, string>()
  const deps: ApplyChangeDeps = { timeline, evidence, scope, list: HIGH_IMPACT_LIST, changeSets }
  const collectorOff = attachEvidenceCollector(deps)

  let clock = 0
  const ts = () => new Date(Date.UTC(2026, 9, 5, 0, 0, clock++)).toISOString()
  const log = (draft: EventDraft, tx?: () => void): void => {
    // 草稿的 type↔detail 配对在聚合构造处已由判别联合钉住，展开只补 ts。
    timeline.append({ ts: ts(), ...draft }, tx)
  }

  let delegation: Delegation | undefined
  let dpSeq = 0
  const openDps: DecisionPoint[] = []
  const need = (): Delegation => {
    if (!delegation) throw new Error('端到端测：先 create 委托')
    return delegation
  }

  return {
    timeline,
    evidence,
    scope,
    turns,
    queue,
    deps,
    collectorOff,
    get delegation(): Delegation {
      return need()
    },
    create(intent: string, delegationId = 'd1'): Delegation {
      const created = Delegation.create(delegationId, intent)
      delegation = created.delegation
      log(created.event, () => delegations.save(created.delegation))
      return created.delegation
    },
    // §9 步2：用户输入开轮（I-1 拒方入队＝归宿入队非丢弃）
    start(turnId: string, triggerSource: TriggerSource = '用户输入'): Turn | 'queued' {
      const input: StartInput = {
        delegationId: 'd1',
        turnId,
        triggerSource,
        inputId: `in-${turnId}`,
      }
      const ctx = {
        inFlight: turns.findInFlight()?.token ?? null,
        deniedPending: need().awaitingUser,
      }
      try {
        const r = Turn.start(input, ctx)
        log(r.started)
        log(r.acknowledged, () => turns.save(r.turn))
        // C12：拒绝待决由「用户输入开轮成功」解除（I-15 可判定边界）
        if (input.triggerSource === '用户输入' && need().awaitingUser)
          need().resumeFromAwaitingUser()
        return r.turn
      } catch (e) {
        if (e instanceof DomainError && e.code === 'I-1') {
          const r = queue.submitInput({
            itemId: `q-${input.inputId}`,
            delegationId: input.delegationId,
            inputId: input.inputId,
            origin: 'StartTurn 忙转投',
          })
          log(r.queued)
          log(r.acknowledged)
          return 'queued'
        }
        throw e
      }
    },
    // §9 步2：产出变更经 AdmissionCheck，过闸⇒ChangeProduced＋（订阅）EvidenceRecorded
    produce(turnId: string, op: Operation): ReturnType<typeof applyChange> {
      return applyChange(
        {
          delegationId: 'd1',
          turnId,
          ts: ts(),
          changeSet: gateway.nextChangeSet('d1', turnId),
          op,
        },
        deps,
      )
    },
    // §9 步3：护栏①采点位
    raise(turnId: string, cause: RequestCause): DecisionPoint {
      const raised = DecisionPoint.raise({
        decisionPointId: `dp${++dpSeq}`,
        delegationId: 'd1',
        turnId,
        requestReason: {
          reason: cause,
          operation: '改写 git 历史（force push/reset --hard 类）',
          requestedBy: 'AI 提请',
        },
      })
      log(raised.raised, () => {
        decisionPoints.save(raised.decisionPoint)
        openDps.push(raised.decisionPoint)
      })
      return raised.decisionPoint
    },
    resolve(dp: DecisionPoint, value: '批准' | '拒绝' | '选项', reason?: string): void {
      for (const draft of dp.resolve(value, { reason })) log(draft)
      // 拒绝⇒推进权交还：DecisionDenied 事件驱动消费置拒绝待决标记（I-15）
      if (value === '拒绝') need().markAwaitingUser()
    },
    endTurn(turn: Turn, kind: '收口' | '中止' | '中断'): void {
      log(turn.terminal(kind))
    },
    admit(itemId: string, turnId: string): void {
      const draft = queue.admit(itemId, turnId)
      if (draft) log(draft)
    },
    claim(turnId: string): void {
      const refs = evidence.findByDelegation('d1').map((e) => e.evidenceId)
      log(need().claimCompletion({ claim: '已完成', turnId, evidenceRefs: refs }, evidence))
    },
    accept(): void {
      log(need().accept(evidence))
    },
    reject(reason: string): void {
      const pair = need().reject(reason)
      log(pair.rejected)
      log(pair.reopened)
    },
    waiting() {
      return deriveWaitingItems([need()], openDps, queue)
    },
    focus() {
      return deriveFocus(this.waiting())
    },
    types(): string[] {
      return timeline.since(1).map((e) => e.type)
    },
    seqs(): number[] {
      return timeline.since(1).map((e) => e.seq)
    },
  }
}

const inScopeOp: Operation = {
  category: '资源访问',
  entryKind: '目录',
  resource: 'src/a.ts',
  hits: null,
}
const highImpactOp: Operation = {
  ...inScopeOp,
  hits: '改写 git 历史（force push/reset --hard 类）',
}

// 违例码断言用：区分「被哪道不变量拦下」，防断言因先后次序而蒙对（I-15 与 I-1 都 throw DomainError）。
const codeOf = (fn: () => unknown): string | null => {
  try {
    fn()
    return null
  } catch (e) {
    return e instanceof DomainError ? e.code : 'other'
  }
}

describe('S1a 域内闭环：假网关 L1 端到端（E1 假轨／详设 §9）', () => {
  it('happy path：发起→推进→拍板→核验→收尾，事件按 seq 全序落账、终态已收尾', () => {
    const w = createWorld()
    w.create('把 src 下的旧日志清掉')
    const turn = w.start('t1')
    expect(w.produce('t1', inScopeOp)?.type).toBe('ChangeProduced')
    const dp = w.raise('t1', '作用域外')
    w.resolve(dp, '批准')
    w.claim('t1')
    w.accept()

    expect(w.types()).toEqual([
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
    expect(w.seqs()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]) // I-2 单调无重号无跳号
    expect(w.delegation.state).toBe('accepted')
    expect(w.delegation.reopenCount).toBe(0)
    const items = w.evidence.findByDelegation('d1')
    expect([items.length, items[0].type, items[0].provenance]).toEqual([1, '变更集', '系统采集'])
    expect(turn).toBeInstanceOf(Turn)
  })

  it('收尾后等待面收束：deriveWaitingItems 空集、deriveFocus 空（F3）', () => {
    const w = createWorld()
    w.create('x')
    w.start('t1')
    expect(w.waiting().map((i) => i.kind)).toEqual([]) // 推进中的委托无等待项
    w.produce('t1', inScopeOp)
    const dp = w.raise('t1', '高影响清单命中')
    expect(w.waiting().map((i) => i.kind)).toEqual(['待拍板']) // 未决⇒待拍板
    expect(w.focus()?.sourceId).toBe(dp.decisionPointId)
    w.resolve(dp, '批准')
    w.claim('t1')
    expect(w.waiting().map((i) => i.kind)).toEqual(['待核验'])
    w.accept()
    expect([w.waiting(), w.focus()]).toEqual([[], null])
  })

  it('I-7 无拍板不执行：须拍板操作在批准前副作用计数＝0，转 RaiseDecision 留痕', () => {
    const w = createWorld()
    w.create('x')
    w.start('t1')
    expect(w.produce('t1', highImpactOp)).toBeNull()
    expect(w.types()).toEqual(['DelegationCreated', 'TurnStarted', 'InputAcknowledged']) // 零变更/零证据
    expect(w.evidence.findByDelegation('d1')).toEqual([])
    const dp = w.raise('t1', '高影响清单命中')
    expect(w.types()).toContain('DecisionRaised')
    expect(dp.open).toBe(true)
  })

  it('C1 支路：忙时输入入队非丢弃，收口后按序准入开新轮', () => {
    const w = createWorld()
    w.create('x')
    const t1 = w.start('t1')
    expect(w.start('t2')).toBe('queued')
    expect(w.queue.pending().map((i) => i.inputId)).toEqual(['in-t2'])
    expect(w.waiting().map((i) => i.kind)).toEqual(['排队中']) // I-9 排队有归宿（可见位置）
    if (!(t1 instanceof Turn)) throw new Error('首输入应开轮成功')
    w.endTurn(t1, '收口')
    const t2 = w.start('t2', '队列准入')
    if (!(t2 instanceof Turn)) throw new Error('收口后队列准入应可开轮')
    const item = w.queue.pending()[0]
    w.admit(item.itemId, 't2')
    expect(w.types()).toEqual([
      'DelegationCreated',
      'TurnStarted',
      'InputAcknowledged',
      'InstructionQueued',
      'InputAcknowledged',
      'TurnEnded',
      'TurnStarted',
      'InputAcknowledged',
      'InstructionAdmitted',
    ])
    expect(w.queue.pending()).toEqual([])
  })

  it('C11 支路：验收拒绝挂原单重开（delegationId 不变、reopenCount+1、否定事实留痕）', () => {
    const w = createWorld()
    w.create('x')
    w.start('t1')
    w.produce('t1', inScopeOp)
    w.claim('t1')
    w.reject('证据不足以验收')
    expect(w.delegation.delegationId).toBe('d1')
    expect([w.delegation.state, w.delegation.reopenCount]).toEqual(['reopened', 1])
    expect(w.types().slice(-2)).toEqual(['DelegationRejected', 'DelegationReopened'])
  })

  it('I-15 闭环：拒绝待决期队列准入开轮被拒、用户输入开轮解除后恢复消费', () => {
    const w = createWorld()
    w.create('x')
    const t1 = w.start('t1')
    if (!(t1 instanceof Turn)) throw new Error('首输入应开轮成功')
    const dp = w.raise('t1', '作用域外')
    w.resolve(dp, '拒绝', '不要动我的仓库')
    expect(w.delegation.awaitingUser).toBe(true)
    w.endTurn(t1, '中止') // 先收口在飞轮，令拒绝待决守卫（I-15）成为唯一拦截者而非单飞（I-1）
    expect(codeOf(() => w.start('t2', '队列准入'))).toBe('I-15')
    const t2 = w.start('t2', '用户输入')
    if (!(t2 instanceof Turn)) throw new Error('解除拒绝待决须由用户输入开轮成功')
    expect(w.delegation.awaitingUser).toBe(false) // 解除＝用户输入开轮成功
    w.endTurn(t2, '收口')
    const t3 = w.start('t3', '队列准入') // 解除后队列恢复消费
    if (!(t3 instanceof Turn)) throw new Error('解除后队列准入源应可用')
    expect(w.types().slice(-5)).toEqual([
      'TurnStarted',
      'InputAcknowledged',
      'TurnEnded',
      'TurnStarted',
      'InputAcknowledged',
    ])
  })

  it('订阅面可退：collector 退订后不再采集证据（进程内只读分发生命周期）', () => {
    const w = createWorld(fakeGateway('a\nb'))
    w.create('x')
    w.start('t1')
    w.collectorOff()
    w.produce('t1', inScopeOp)
    expect(w.types()).toEqual([
      'DelegationCreated',
      'TurnStarted',
      'InputAcknowledged',
      'ChangeProduced',
    ])
    expect(w.evidence.findByDelegation('d1')).toEqual([])
  })
})
