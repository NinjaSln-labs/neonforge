import type { InstructionQueue } from '../../queue/InstructionQueue.js'
import type { InstructionQueueRepo } from '../index.js'

// S1 内存实现：V1 单队列＝全局一个（段3 §3 queueId 行），仓储只持队列本体；
// 命令与读侧（enqueue/pending/admit/markWithdrawn）在 InstructionQueue 聚合面（I-4 校验位置＝聚合）。
export class InMemoryInstructionQueueRepo implements InstructionQueueRepo {
  private queue: InstructionQueue | undefined

  save(q: InstructionQueue): void {
    this.queue = q
  }

  find(): InstructionQueue | undefined {
    return this.queue
  }
}
