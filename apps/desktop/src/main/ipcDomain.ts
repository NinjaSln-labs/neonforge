// 委托单中心 IPC 通道（详设 §7 IPC 面／stage-spec F1 的 main 侧）。
// 接缝＝registerDomainChannels(ipcMainLike, deps)：ipc.ts 顶层 import electron/configStore，直连会让 L1 测拖整张图；
// 本模块只依赖领域树＋注入的 runtime/abort，故 wiring 可单测、ipc.ts 只负责把真 ipcMain 递进来（S-1 射程＝main wiring 持聚合，承 ADR-029 后的 §7 分工）。
// 每命令＝先调聚合/Spec/服务，再由 rt.log 经 TimelineRepo.append 唯一机制口落账（同事务），最后回 DTO。
import { randomUUID } from 'node:crypto'
import { Delegation } from '../domain/delegation/Delegation.js'
import {
  DecisionPoint,
  type RaiseInput,
  type ResolutionValue,
} from '../domain/authorization/DecisionPoint.js'
import { Scope, type ScopeEntry } from '../domain/authorization/Scope.js'
import { InstructionQueue } from '../domain/queue/InstructionQueue.js'
import { Turn, type TriggerSource } from '../domain/turn/Turn.js'
import type { Operation } from '../domain/spec/requiresApproval.js'
import type { DomainRuntime } from './domainRuntime.js'

export type DomainChannel =
  | 'delegation:create'
  | 'delegation:list'
  | 'delegation:accept'
  | 'delegation:reject'
  | 'turn:start'
  | 'change:produce'
  | 'decision:raise'
  | 'decision:resolve'
  | 'evidence:list-by-delegation'
  | 'evidence:inspect'
  | 'queue:pending'
  | 'timeline:query-by-delegation'
  | 'timeline:subscribe'
  | 'gateway:cancel-stream'
  | 'scope:chain'
  | 'scope:amend'

export interface IpcEventLike {
  sender: {
    send(channel: string, payload: unknown): void
    once?(event: string, listener: () => void): void
  }
}

export interface IpcMainLike {
  // args 取 unknown＝IPC 载荷是外来 JSON，本模块每个 handler 自行收窄形参（信任边界校验）；
  // 用 never 会让真 ipcMain（listener 收 ...args:any[]）不可赋值。
  handle(channel: DomainChannel, fn: (evt: IpcEventLike, args: unknown) => unknown): void
}

export interface DomainChannelDeps {
  runtime: DomainRuntime
  /** Task 2 的流级取消面（stream 生命周期所有者持有表，本处只转投） */
  abortStream: (streamId: string) => boolean
}

export function registerDomainChannels(ipc: IpcMainLike, deps: DomainChannelDeps): void {
  const rt = deps.runtime

  // 呈现传来的 id 属信任边界：查无此物＝接线级错误（非领域违例，不占不变量码）。
  const needDelegation = (delegationId: string): Delegation => {
    const d = rt.delegations.findById(delegationId)
    if (!d) throw new Error(`未知委托：${delegationId}`)
    return d
  }
  const needQueue = (): InstructionQueue => {
    const existing = rt.queue.find()
    if (existing) return existing
    const created = new InstructionQueue('q1') // V1 全局单队列（段3 §3）
    rt.queue.save(created)
    return created
  }
  const delegationDto = (d: Delegation) => ({
    delegationId: d.delegationId,
    intent: d.intent,
    state: d.state,
    reopenCount: d.reopenCount,
  })

  ipc.handle('delegation:create', (_evt, args) => {
    const a = args as {
      delegationId?: string
      intent: string
      scopeEntries?: Parameters<typeof Scope.initial>[1]
    }
    const delegationId = a.delegationId ?? randomUUID()
    const { delegation, event } = Delegation.create(delegationId, a.intent)
    if (a.scopeEntries) rt.scopes.save(Scope.initial(delegationId, a.scopeEntries))
    rt.log(event) // 草稿先落账再返（同事务）
    rt.delegations.save(delegation)
    return { delegationId: delegation.delegationId, state: delegation.state }
  })

  ipc.handle('delegation:list', () => rt.delegations.findActive().map(delegationDto))

  ipc.handle('delegation:accept', (_evt, args) => {
    const d = needDelegation((args as { delegationId: string }).delegationId)
    rt.log(d.accept(rt.evidence)) // I-16∧AcceptanceSpec 的判定在聚合内（C13）
    rt.delegations.save(d)
    return delegationDto(d)
  })

  ipc.handle('delegation:reject', (_evt, args) => {
    const a = args as { delegationId: string; reason?: string }
    const d = needDelegation(a.delegationId)
    const { rejected, reopened } = d.reject(a.reason)
    rt.log(rejected)
    rt.log(reopened) // I-14 重开挂原单，两条同批
    rt.delegations.save(d)
    return delegationDto(d)
  })

  // §9 步2＋C1：在飞位被占 ⇒ 输入入队（有归宿），不外抛、不静默丢（原则1）。
  ipc.handle('turn:start', (_evt, args) => {
    const a = args as {
      delegationId: string
      turnId?: string
      inputId?: string
      triggerSource: TriggerSource
    }
    const d = needDelegation(a.delegationId)
    const turnId = a.turnId ?? randomUUID()
    const inputId = a.inputId ?? `in-${turnId}`
    try {
      const r = Turn.start(
        { delegationId: a.delegationId, turnId, triggerSource: a.triggerSource, inputId },
        { inFlight: rt.turns.findInFlight()?.token ?? null, deniedPending: d.awaitingUser },
      )
      rt.log(r.started)
      rt.log(r.acknowledged, () => rt.turns.save(r.turn))
      if (a.triggerSource === '用户输入' && d.awaitingUser) d.resumeFromAwaitingUser() // C12 解除边界
      rt.delegations.save(d)
      return { into: 'turn' as const, turnId }
    } catch (e) {
      if (e instanceof Error && 'code' in e && (e as { code?: string }).code === 'I-1') {
        const q = needQueue()
        const r = q.submitInput({
          itemId: `q-${inputId}`,
          delegationId: a.delegationId,
          inputId,
          origin: 'StartTurn 忙转投',
        })
        rt.log(r.queued)
        rt.log(r.acknowledged)
        rt.queue.save(q)
        return { into: 'queue' as const, itemId: r.item.itemId }
      }
      throw e
    }
  })

  // §9 步2 产物推进：未过 AdmissionCheck ⇒ 返 {produced:false}（调用方转 decision:raise），零副作用。
  ipc.handle('change:produce', (_evt, args) => {
    const a = args as { delegationId: string; turnId: string; changeSet: string; op: Operation }
    const draft = rt.produce(a)
    return draft
      ? { produced: true, changeSetRef: (draft.detail as { changeSetRef: string }).changeSetRef }
      : { produced: false }
  })

  ipc.handle('decision:raise', (_evt, args) => {
    const a = args as RaiseInput
    // I-3 缺归属⇒抛且不生成（C2 面）；id 由 main 侧生成（详设 §7）——漏给呈现侧＝ScopePanel 自己在渲染层造 id。
    const { decisionPoint, raised } = DecisionPoint.raise({
      ...a,
      decisionPointId: a.decisionPointId ?? randomUUID(),
    })
    rt.log(raised, () => rt.decisionPoints.save(decisionPoint))
    return { decisionPointId: decisionPoint.decisionPointId, open: decisionPoint.open }
  })

  ipc.handle('decision:resolve', (_evt, args) => {
    const a = args as { decisionPointId: string; value: ResolutionValue; reason?: string }
    const dp = rt.decisionPoints.findById(a.decisionPointId)
    if (!dp) throw new Error(`未知决策点：${a.decisionPointId}`)
    for (const draft of dp.resolve(a.value, { reason: a.reason })) rt.log(draft)
    // I-15：DecisionDenied 事件驱动消费 ⇒ 拒绝待决标记（可判定边界＝至下一次用户输入开轮成功）
    if (a.value === '拒绝') needDelegation(dp.delegationId).markAwaitingUser()
    rt.decisionPoints.save(dp)
    return { resolved: dp.resolution?.value ?? null }
  })

  ipc.handle('evidence:list-by-delegation', (_evt, args) =>
    rt.evidence.findByDelegation((args as { delegationId: string }).delegationId).map((e) => ({
      evidenceId: e.evidenceId,
      type: e.type,
      delegationId: e.delegationId,
      payloadRef: e.payloadRef.ptr,
      provenance: e.provenance,
    })),
  )

  // inspect 经机制口落 EvidenceInspected＝S-1 的唯一例外（呈现只读，写入由 main 侧接线代持）。
  ipc.handle('evidence:inspect', (_evt, args) => {
    const evidenceId = (args as { evidenceId: string }).evidenceId
    const [item] = rt.evidence.findByIds([evidenceId])
    if (!item) throw new Error(`未知证据：${evidenceId}`)
    const firstInspection = item.inspect() // 过程指标②：首次计入、重复不计
    rt.evidence.save(item)
    rt.log({
      type: 'EvidenceInspected',
      delegationId: item.delegationId,
      detail: {
        evidenceId: item.evidenceId,
        delegationId: item.delegationId,
        inspectAction: 'open',
        firstInspection,
      },
    })
    return { firstInspection }
  })

  ipc.handle('queue:pending', () =>
    needQueue()
      .pending()
      .map((i) => ({
        itemId: i.itemId,
        delegationId: i.delegationId,
        inputId: i.inputId,
        origin: i.origin,
      })),
  )

  ipc.handle('timeline:query-by-delegation', (_evt, args) =>
    rt.timeline.findByDelegation((args as { delegationId: string }).delegationId).map((e) => ({
      seq: e.seq,
      ts: e.ts,
      type: e.type,
      delegationId: e.delegationId,
      detail: e.detail,
    })),
  )

  // B4 只读分发的跨进程面：订阅＝把进程内事件转推该窗口（对外发布仍为 0——只发给本机 renderer）。
  ipc.handle('timeline:subscribe', (evt) => {
    const off = rt.timeline.subscribe((e) =>
      evt.sender.send('timeline:event', {
        seq: e.seq,
        ts: e.ts,
        type: e.type,
        delegationId: e.delegationId,
        detail: e.detail,
      }),
    )
    evt.sender.once?.('destroyed', off) // 窗口销毁即退订（假注册表无 once＝跳过）
    return { subscribed: true }
  })

  ipc.handle('gateway:cancel-stream', (_evt, args) => ({
    ok: deps.abortStream((args as { streamId: string }).streamId),
  }))

  // DTO 用 { ...e } 摊平＝不把冻结引用递给 renderer（桥侧本就 JSON 序列化，摊平是显式意图）。
  ipc.handle('scope:chain', (_evt, args) => {
    const { delegationId } = args as { delegationId: string }
    const scope = rt.scopes.findByDelegation(delegationId)
    if (!scope) throw new Error(`未知委托：${delegationId}`)
    return scope.chain.map((v) => ({
      seq: v.seq,
      entries: v.entries.map((e) => ({ ...e })),
      amendmentRef: v.amendmentRef,
    }))
  })

  // 唯一机制口＝rt.amendScope（聚合写入与 append 同事务）；拒绝理由不进 timeline，只回呈现侧。
  ipc.handle('scope:amend', (_evt, args) => {
    const a = args as {
      delegationId: string
      decisionPointId: string
      entries: Array<{ kind: string; pattern: string }>
    }
    const KINDS = ['仓库', '目录', '命令', '网络'] as const
    for (const e of a.entries ?? []) {
      if (!KINDS.includes(e.kind as (typeof KINDS)[number]) || typeof e.pattern !== 'string')
        throw new Error(`entries 形状非法：${JSON.stringify(e)}`)
    }
    const out = rt.amendScope({ ...a, entries: a.entries as ScopeEntry[] })
    return out
      ? { version: out.version }
      : { rejected: true as const, why: '无已批准的作用域修正决议，或该决议已产过版本' }
  })
}
