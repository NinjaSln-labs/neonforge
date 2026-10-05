// TurnToken VO（段3 §3 尾注例外＝标识型值对象）：复合 (delegationId, turnId)，不可变、只能过期不转移（V1）。
// turnId 仅委托内单调，全局可判定性由复合值承担，故比较必须两分量同时看（I-13 比较基准）。
export interface TurnToken {
  readonly delegationId: string
  readonly turnId: string
}

// 复核基准＝与当前在飞轮复合值比对，不等即过期；无在飞轮 ⇒ 一切旧令牌皆过期。
export function isExpired(token: TurnToken, inFlight: TurnToken | null): boolean {
  return (
    inFlight === null ||
    token.delegationId !== inFlight.delegationId ||
    token.turnId !== inFlight.turnId
  )
}
