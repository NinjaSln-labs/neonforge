// BC-06 问题台账：同步协议与合并（ADR-018 / GitHub #15）。
// 纯函数：无 IO；main 存储与加密传输分别位于 problemLedgerStore / problemSyncCrypto。
export const PROBLEM_LEDGER_SCHEMA = 1
export const PROBLEMS_MAX = 20
export const PROBLEM_STATUSES = [
  'understanding',
  'awaiting-plan',
  'executing',
  'awaiting-input',
  'delivered',
  'closed',
  'failed-recoverable',
] as const

export type LedgerProblemStatus = (typeof PROBLEM_STATUSES)[number]

export interface LedgerProblemSnapshot {
  goal: string
  decisions: string[]
  authorized: Array<{ tool: string; file: string }>
  pending: string[]
}

export interface LedgerProblem {
  id: string
  title: string
  status: LedgerProblemStatus
  /** UI 展示时间（旧格式，可能是 HH:MM） */
  updatedAt: string
  /** 同步排序优先使用的 ISO 时间；旧数据缺失时回退 updatedAt */
  updatedAtIso?: string
  revision?: number
  deletedAt?: string
  snapshot?: LedgerProblemSnapshot
}

export interface ProblemLedgerPayload {
  schemaVersion: 1
  deviceId: string
  exportedAt: string
  problems: LedgerProblem[]
}

export interface MergeConflict {
  id: string
  localRevision: number
  remoteRevision: number
  winner: 'local' | 'remote'
}

export interface MergeResult {
  problems: LedgerProblem[]
  conflicts: MergeConflict[]
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    : []
}

function normalizeSnapshot(value: unknown): LedgerProblemSnapshot | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  const authorized = Array.isArray(raw.authorized)
    ? raw.authorized
        .map((a) => {
          if (!a || typeof a !== 'object') return null
          const item = a as Record<string, unknown>
          const tool = asString(item.tool)
          const file = asString(item.file)
          return tool && file ? { tool, file } : null
        })
        .filter((a): a is { tool: string; file: string } => a !== null)
    : []
  return {
    goal: asString(raw.goal) ?? '',
    decisions: asStringArray(raw.decisions),
    authorized,
    pending: asStringArray(raw.pending),
  }
}

function normalizeOne(value: unknown): LedgerProblem | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const id = asString(raw.id)
  const title = asString(raw.title)
  const status = asString(raw.status)
  const updatedAt = asString(raw.updatedAt)
  if (!id || !title || !status || !updatedAt) return null
  if (!(PROBLEM_STATUSES as readonly string[]).includes(status)) return null
  const revision =
    typeof raw.revision === 'number' && Number.isFinite(raw.revision) && raw.revision >= 0
      ? Math.floor(raw.revision)
      : 0
  const updatedAtIso = asString(raw.updatedAtIso) ?? undefined
  const deletedAt = asString(raw.deletedAt) ?? undefined
  return {
    id,
    title,
    status: status as LedgerProblemStatus,
    updatedAt,
    ...(updatedAtIso ? { updatedAtIso } : {}),
    revision,
    ...(deletedAt ? { deletedAt } : {}),
    ...(normalizeSnapshot(raw.snapshot) ? { snapshot: normalizeSnapshot(raw.snapshot) } : {}),
  }
}

/** 白名单规范化；损坏项跳过；按活动/更新时间倒序，活动条目上限 20。 */
export function normalizeProblemLedger(input: unknown): LedgerProblem[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const normalized: LedgerProblem[] = []
  for (const value of input) {
    const problem = normalizeOne(value)
    if (!problem || seen.has(problem.id)) continue
    seen.add(problem.id)
    normalized.push(problem)
  }
  return sortProblems(normalized).slice(0, PROBLEMS_MAX)
}

function timeValue(problem: LedgerProblem): string {
  return problem.updatedAtIso ?? problem.updatedAt
}

function revisionOf(problem: LedgerProblem): number {
  return problem.revision ?? 0
}

/** 语义字段比较：属性顺序/可选字段有无不影响冲突判定。 */
function sameContent(a: LedgerProblem, b: LedgerProblem): boolean {
  return (
    a.title === b.title &&
    a.status === b.status &&
    timeValue(a) === timeValue(b) &&
    revisionOf(a) === revisionOf(b) &&
    (a.deletedAt ?? '') === (b.deletedAt ?? '') &&
    JSON.stringify(a.snapshot ?? null) === JSON.stringify(b.snapshot ?? null)
  )
}

/** 活动条目（UI 使用；tombstone 不显示）。 */
export function activeProblems(problems: readonly LedgerProblem[]): LedgerProblem[] {
  return sortProblems(problems.filter((p) => !p.deletedAt)).slice(0, PROBLEMS_MAX)
}

export function sortProblems(problems: readonly LedgerProblem[]): LedgerProblem[] {
  return [...problems].sort((a, b) => {
    const live = Number(Boolean(a.deletedAt)) - Number(Boolean(b.deletedAt))
    if (live !== 0) return live // 活动条目优先，tombstone 排后
    const byRevision = revisionOf(b) - revisionOf(a)
    if (byRevision !== 0) return byRevision
    const byTime = timeValue(b).localeCompare(timeValue(a))
    if (byTime !== 0) return byTime
    return a.id.localeCompare(b.id)
  })
}

function winner(
  local: LedgerProblem | undefined,
  remote: LedgerProblem | undefined,
  localDeviceId: string,
  remoteDeviceId: string,
): 'local' | 'remote' {
  if (!local) return 'remote'
  if (!remote) return 'local'
  // 删除是终态：任一侧 tombstone 优先，防旧编辑复活
  if (local.deletedAt || remote.deletedAt) {
    if (local.deletedAt && !remote.deletedAt) return 'local'
    if (remote.deletedAt && !local.deletedAt) return 'remote'
    return timeValue(remote).localeCompare(timeValue(local)) > 0 ||
      revisionOf(remote) > revisionOf(local)
      ? 'remote'
      : 'local'
  }
  const byRevision = revisionOf(local) - revisionOf(remote)
  if (byRevision !== 0) return byRevision > 0 ? 'local' : 'remote'
  const byTime = timeValue(local).localeCompare(timeValue(remote))
  if (byTime !== 0) return byTime > 0 ? 'local' : 'remote'
  return localDeviceId.localeCompare(remoteDeviceId) >= 0 ? 'local' : 'remote'
}

/**
 * 确定性合并：id 对齐；revision 高者胜 → updatedAt 晚者胜 → deviceId 字典序大者胜。
 * 删除终态优先（不允许被旧编辑复活）；结果活动条目 ≤20。
 */
export function mergeProblemLedgers(
  local: readonly LedgerProblem[],
  remote: readonly LedgerProblem[],
  localDeviceId: string,
  remoteDeviceId: string,
): MergeResult {
  const byId = new Map<string, { local?: LedgerProblem; remote?: LedgerProblem }>()
  for (const p of local) byId.set(p.id, { ...(byId.get(p.id) ?? {}), local: p })
  for (const p of remote) byId.set(p.id, { ...(byId.get(p.id) ?? {}), remote: p })
  const problems: LedgerProblem[] = []
  const conflicts: MergeConflict[] = []
  for (const [id, pair] of byId) {
    const source = winner(pair.local, pair.remote, localDeviceId, remoteDeviceId)
    const chosen = source === 'local' ? pair.local : pair.remote
    if (!chosen) continue
    problems.push(chosen)
    if (pair.local && pair.remote) {
      const localRevision = revisionOf(pair.local)
      const remoteRevision = revisionOf(pair.remote)
      if (!sameContent(pair.local, pair.remote)) {
        conflicts.push({ id, localRevision, remoteRevision, winner: source })
      }
    }
  }
  const sorted = sortProblems(problems)
  const active = sorted.filter((p) => !p.deletedAt).slice(0, PROBLEMS_MAX)
  const tombstones = sorted.filter((p) => p.deletedAt)
  return { problems: [...active, ...tombstones], conflicts }
}
