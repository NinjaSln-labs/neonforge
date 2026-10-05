import type { AppendInput, TimelineEvent } from '../timeline.js'

// 仓储面（详设 §3／段3 §7，S1 内存实现）。seq 单调与单写者由 TimelineLog 聚合维护，非仓储（M-02）。
// append＝唯一机制口（S-1）：追加与聚合状态写入同事务，失败⇒整事务回滚（§6 例外条款）。
export interface TimelineRepo {
  append(event: AppendInput, tx?: () => void): void
  since(seq: number): TimelineEvent[]
  findByDelegation(delegationId: string): TimelineEvent[]
  // 进程内只读订阅（§6：呈现/度量为只读消费者；无对外发布通道）。
  subscribe(listener: (event: TimelineEvent) => void): () => void
}
