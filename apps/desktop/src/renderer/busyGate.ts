export type BusyPending =
  'none' | 'goal' | 'plan' | 'resolution' | 'approval' | 'system_clarify' | string

/** ADR-013：busy 时是否排队（silent 与用户同排队；待授权仅非 silent 用户可直送） */
export function shouldQueueWhileBusy(opts: {
  working: boolean
  silent: boolean
  pending: BusyPending
}): boolean {
  if (!opts.working) return false
  // ADR-013：待授权时仅「非 silent 用户发送」直送；其余 busy 一律排队
  if (!opts.silent && opts.pending === 'approval') return false
  return true
}
