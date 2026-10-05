import { TimelineLog } from '../../timeline.js'
import type { AppendInput, TimelineEvent } from '../../timeline.js'
import type { TimelineRepo } from '../index.js'

// S1 内存实现：单线程；append 为唯一写者口，同事务失败回滚（详设 §3/§6）。
export class InMemoryTimelineRepo implements TimelineRepo {
  private log = new TimelineLog()

  append(event: AppendInput, tx?: () => void): void {
    const snap = this.log.lastSeq()
    this.log.record(event)
    try {
      tx?.()
    } catch (err) {
      this.log.rollbackTo(snap)
      throw err
    }
  }

  since(seq: number): TimelineEvent[] {
    return this.log.since(seq)
  }

  findByDelegation(delegationId: string): TimelineEvent[] {
    return this.log.findByDelegation(delegationId)
  }
}
