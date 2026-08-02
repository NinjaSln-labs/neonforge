// 问题台账存储（ticket 06）：ProblemInstance 创建/持久化——断点续做基础（基线 §21 问题实例持久化）
import type { ProblemInstance } from './types'

export const PROBLEMS_KEY = 'nf-problems'
export const PROBLEMS_MAX = 20 // 台账上限（防膨胀）

// 发送消息 → 创建问题实例（title 截断 20 字；status 执行中；updatedAt 时分）
export function createProblem(text: string): ProblemInstance {
  const title = text.length > 20 ? text.slice(0, 20) + '…' : text
  const now = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  return { id: `p${Date.now()}`, title, status: 'executing', updatedAt: now }
}

// localStorage 加载（损坏数据忽略 → fallback）
export function loadProblems(fallback: ProblemInstance[] = []): ProblemInstance[] {
  try {
    const raw = localStorage.getItem(PROBLEMS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch { /* 损坏/不可用——忽略 */ }
  return fallback
}

// 持久化（上限截取——新问题在头部）
export function saveProblems(problems: ProblemInstance[]): void {
  try {
    localStorage.setItem(PROBLEMS_KEY, JSON.stringify(problems.slice(0, PROBLEMS_MAX)))
  } catch { /* 存储不可用——忽略（内存态仍工作） */ }
}
