// BC-02 授权域：信任模式预设（ADR-015 / GitHub #12）
// 三档是**用户可选的预设**，不是自动学习出来的信任分：
// - strict（谨慎）：所有写入/修改逐次授权；方案确认只推进决策点，不自动放行文件
// - standard（标准，默认）：方案确认后清单内 write 自动放行；edit 仍需逐次授权/任务信任
// - delegated（低危委托）：在 standard 基础上，清单内 edit 也自动放行；清单外/根外/bash 永不委托
// main 持久化（trustPolicyStore）与 renderer 判定单源（authModel）共用此枚举。
export const TRUST_MODES = ['strict', 'standard', 'delegated'] as const
export type TrustMode = (typeof TRUST_MODES)[number]
export const DEFAULT_TRUST_MODE: TrustMode = 'standard'

export function isTrustMode(value: unknown): value is TrustMode {
  return typeof value === 'string' && (TRUST_MODES as readonly string[]).includes(value)
}
