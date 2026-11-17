// 问题台账存储（ticket 06）：ProblemInstance 创建/持久化——断点续做基础（基线 §21 问题实例持久化）
import type { ProblemInstance, ProblemSnapshot } from './types'

export const PROBLEMS_KEY = 'nf-problems'
export const PROBLEMS_MAX = 20 // 台账上限（防膨胀）

// 发送消息 → 创建问题实例（title 截断 20 字；status 执行中；updatedAt 时分；快照 goal=首句）
export function createProblem(text: string): ProblemInstance {
  const title = text.length > 20 ? text.slice(0, 20) + '…' : text
  const now = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  return {
    id: `p${Date.now()}`,
    title,
    status: 'executing',
    updatedAt: now,
    updatedAtIso: new Date().toISOString(),
    revision: 1,
    snapshot: { goal: text, decisions: [], authorized: [], pending: [] },
  }
}

// 更新问题快照（合并——保留已有字段，2026-08-02 断点续做深度增强）
export function updateProblemSnapshot(
  problem: ProblemInstance,
  patch: Partial<ProblemSnapshot>,
): ProblemInstance {
  const base = problem.snapshot ?? {
    goal: problem.title,
    decisions: [],
    authorized: [],
    pending: [],
  }
  return { ...problem, snapshot: { ...base, ...patch } }
}

// localStorage 加载（损坏数据忽略 → fallback；2026-08-15 Q9：旧版 authorized string[] 迁移为结构化 {tool, file}）
export function loadProblems(fallback: ProblemInstance[] = []): ProblemInstance[] {
  try {
    const raw = localStorage.getItem(PROBLEMS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed
          .filter((p) => !(p && typeof p === 'object' && 'deletedAt' in p && p.deletedAt))
          .map(migrateAuthorized)
      }
    }
  } catch {
    /* 损坏/不可用——忽略 */
  }
  return fallback
}

// 旧存档迁移：`[工具] 路径` 字符串 → { tool, file }（解析失败保留原文为 file）
function migrateAuthorized(p: ProblemInstance): ProblemInstance {
  const auth = (p.snapshot?.authorized ?? []) as Array<{ tool: string; file: string } | string>
  if (!Array.isArray(auth) || auth.length === 0) return p
  const migrated = auth.map((a) => {
    if (typeof a !== 'string') return a // 已是结构化
    const m = a.match(/^\[(.+?)\] (.+)$/)
    return m ? { tool: m[1], file: m[2] } : { tool: 'unknown', file: a }
  })
  return p.snapshot ? { ...p, snapshot: { ...p.snapshot, authorized: migrated } } : p
}

// 持久化（上限截取——新问题在头部）
export function saveProblems(problems: ProblemInstance[]): void {
  try {
    localStorage.setItem(PROBLEMS_KEY, JSON.stringify(problems.slice(0, PROBLEMS_MAX)))
  } catch {
    /* 存储不可用——忽略（内存态仍工作） */
  }
}

// ADR-018：main 为权威；localStorage 仅降级。main 不可用/测试 mock 缺失时回退本地。
export async function loadProblemsAuthoritative(
  fallback: ProblemInstance[] = [],
): Promise<ProblemInstance[]> {
  const api = typeof window === 'undefined' ? undefined : window.neonforge?.problems
  if (!api?.load) return fallback
  try {
    const result = await api.load()
    if (result.problems.length > 0) return result.problems
    if (fallback.length > 0) {
      await api.save(fallback)
      return fallback
    }
    return []
  } catch {
    return fallback
  }
}

export async function saveProblemsMain(problems: ProblemInstance[]): Promise<void> {
  try {
    await window.neonforge?.problems?.save?.(problems.slice(0, PROBLEMS_MAX))
  } catch {
    /* main 不可用——localStorage 仍保留 */
  }
}
