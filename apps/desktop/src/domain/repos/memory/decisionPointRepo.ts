import type { DecisionPoint } from '../../authorization/DecisionPoint.js'
import type { DecisionPointRepo } from '../index.js'

// S1 内存实现：findOpenBy＝该归属对 (delegationId, turnId) 下的未决项（已决项退出读侧）。
export class InMemoryDecisionPointRepo implements DecisionPointRepo {
  private byId = new Map<string, DecisionPoint>()

  save(dp: DecisionPoint): void {
    this.byId.set(dp.decisionPointId, dp)
  }

  findById(id: string): DecisionPoint | undefined {
    return this.byId.get(id)
  }

  findOpenBy(delegationId: string, turnId: string): DecisionPoint[] {
    return [...this.byId.values()].filter(
      (dp) => dp.open && dp.delegationId === delegationId && dp.turnId === turnId,
    )
  }
}
