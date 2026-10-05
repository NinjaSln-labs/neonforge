import type { Turn } from '../../turn/Turn.js'
import type { TurnRepo } from '../index.js'

// S1 内存实现：findInFlight 全局 ≤1（终态轮退出在飞读侧，findByDelegation 仍可溯）。
export class InMemoryTurnRepo implements TurnRepo {
  private turns: Turn[] = []

  save(turn: Turn): void {
    if (!this.turns.includes(turn)) this.turns.push(turn)
  }

  findInFlight(): Turn | null {
    return this.turns.find((t) => t.inFlight) ?? null
  }

  findByDelegation(delegationId: string): Turn[] {
    return this.turns.filter((t) => t.delegationId === delegationId)
  }
}
