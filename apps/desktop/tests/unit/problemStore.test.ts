import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createProblem, loadProblems, saveProblems, PROBLEMS_KEY, PROBLEMS_MAX } from '../../src/renderer/problemStore'

// localStorage 在 node 环境不存在——vitest jsdom/happy-dom 才提供；用 stub 模拟
function stubLocalStorage(): void {
  const store = new Map<string, string>()
  ;(globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => { store.clear() }
  }
}

describe('problemStore（问题台账——创建/持久化）', () => {
  beforeEach(() => stubLocalStorage())

  it('createProblem：标题截断 20 字 + status 执行中', () => {
    const p = createProblem('帮我整理 Downloads 里的发票和合同文件并分类归档到对应文件夹')
    expect(p.status).toBe('executing')
    expect(p.title.length).toBeLessThanOrEqual(21) // 20 + …
    expect(p.title.endsWith('…')).toBe(true)
    expect(p.id).toMatch(/^p\d+$/)
    expect(p.updatedAt).toBeTruthy()
  })

  it('saveProblems → loadProblems 往返（持久化）', () => {
    const p = createProblem('做一个旅行手册网页')
    saveProblems([p])
    const loaded = loadProblems()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].title).toBe('做一个旅行手册网页')
    expect(loaded[0].status).toBe('executing')
  })

  it('loadProblems：空存储 → fallback', () => {
    expect(loadProblems()).toEqual([])
    expect(loadProblems([{ id: 'x', title: 't', status: 'closed', updatedAt: '10:00' }])).toHaveLength(1)
  })

  it('loadProblems：损坏 JSON → fallback（不崩）', () => {
    (globalThis as Record<string, unknown>).localStorage.setItem(PROBLEMS_KEY, '{broken')
    expect(loadProblems()).toEqual([])
  })

  it('saveProblems：超过上限 → 截取前 N（新问题在头部）', () => {
    const many = Array.from({ length: PROBLEMS_MAX + 5 }, (_, i) => createProblem(`问题 ${i}`))
    saveProblems(many)
    const loaded = loadProblems()
    expect(loaded).toHaveLength(PROBLEMS_MAX)
  })
})
