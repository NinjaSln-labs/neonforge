import type { InstructionQueue } from '../../queue/InstructionQueue.js'
import type { InstructionQueueRepo } from '../index.js'

// S1 内存实现：V1 单队列＝全局一个（段3 §3 queueId 行），仓储只持队列本体；
// 命令与读侧（submitInput/pending/admit/markWithdrawn）在 InstructionQueue 聚合面（I-4 校验位置＝聚合，
// 段3 §7 v1.3／ADR-029 D2 正名：仓储面不挂命令名，本文件只存本体）。
export class InMemoryInstructionQueueRepo implements InstructionQueueRepo {
  private queue: InstructionQueue | undefined

  save(q: InstructionQueue): void {
    this.queue = q
  }

  find(): InstructionQueue | undefined {
    return this.queue
  }
}
