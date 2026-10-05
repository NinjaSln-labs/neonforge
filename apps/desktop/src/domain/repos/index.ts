import type { AppendInput, TimelineEvent } from '../timeline.js'
import type { EvidenceItem } from '../evidence/EvidenceItem.js'
import type { Delegation } from '../delegation/Delegation.js'
import type { DecisionPoint } from '../authorization/DecisionPoint.js'
import type { Scope } from '../authorization/Scope.js'
import type { InstructionQueue } from '../queue/InstructionQueue.js'
import type { Turn } from '../turn/Turn.js'

// 仓储面（详设 §3／段3 §7，S1 内存实现）。seq 单调与单写者由 TimelineLog 聚合维护，非仓储（M-02）。
// append＝唯一机制口（S-1）：追加与聚合状态写入同事务，失败⇒整事务回滚（§6 例外条款）。
export interface TimelineRepo {
  append(event: AppendInput, tx?: () => void): void
  since(seq: number): TimelineEvent[]
  findByDelegation(delegationId: string): TimelineEvent[]
  // 进程内只读订阅（§6：呈现/度量为只读消费者；无对外发布通道）。
  subscribe(listener: (event: TimelineEvent) => void): () => void
}

// 证据仓储（详设 §3／段3 §7）：findByIds→ValidClaimSpec；findByDelegation→AcceptanceSpec 限界。
export interface EvidenceRepo {
  save(item: EvidenceItem): void
  findByIds(ids: string[]): EvidenceItem[]
  findByDelegation(delegationId: string): EvidenceItem[]
  markFirstInspection(id: string): void
}

// 委托仓储（详设 §3／段3 §7）：findActive＝非归档非放弃（含已收尾，I-9 读侧）；listArchived 供归档面。
export interface DelegationRepo {
  save(d: Delegation): void
  findById(id: string): Delegation | undefined
  findActive(): Delegation[]
  listArchived(): Delegation[]
}

// 决策点仓储（详设 §3／段3 §7）：findOpenBy＝I-7/I-9 读侧（未决项按归属对取）。
export interface DecisionPointRepo {
  save(dp: DecisionPoint): void
  findById(id: string): DecisionPoint | undefined
  findOpenBy(delegationId: string, turnId: string): DecisionPoint[]
}

// 作用域仓储（详设 §3）：S1 写入面＝initial() 的 v1 链落存；appendVersion＝AmendScope 追加面→S2。
export interface ScopeRepo {
  save(scope: Scope): void
  findByDelegation(delegationId: string): Scope | undefined
}

// 指令队列仓储（详设 §3）：V1 单队列＝全局一个，仓储只持队列本体。
// 详设 §3 的 enqueue/pending/admit/markWithdrawn 面归 InstructionQueue 聚合（I-4 校验位置＝聚合，段3 §4）。
export interface InstructionQueueRepo {
  save(q: InstructionQueue): void
  find(): InstructionQueue | undefined
}

// 轮次仓储（详设 §3／段3 §7）：findInFlight＝I-1 读侧（全局 ≤1，终态轮退出在飞仍可溯）。
export interface TurnRepo {
  save(turn: Turn): void
  findInFlight(): Turn | null
  findByDelegation(delegationId: string): Turn[]
}
