import { describe, it, expect, beforeEach } from 'vitest'
import {
  serializeMessages,
  saveSession,
  loadSession,
  clearSession,
  SESSION_KEY,
  SESSION_MAX,
} from '../../src/renderer/sessionStore'

function stubLocalStorage(): void {
  const store = new Map<string, string>()
  ;(globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v)
    },
    removeItem: (k: string) => {
      store.delete(k)
    },
    clear: () => {
      store.clear()
    },
  }
}

const DONE_MSG = {
  role: 'assistant' as const,
  content: '已处理',
  reasoning: '思考',
  status: 'done' as const,
}

describe('sessionStore（断点续做——会话持久化）', () => {
  beforeEach(() => stubLocalStorage())

  it('serializeMessages：过滤半截 streaming（只存完整）', () => {
    const msgs = [
      { role: 'user' as const, content: '帮我整理发票' },
      { role: 'assistant' as const, content: '', status: 'streaming' as const }, // 半截——丢弃
      DONE_MSG,
    ]
    const out = serializeMessages(msgs)
    expect(out).toHaveLength(2)
    expect(out[0].role).toBe('user')
    expect(out[1].content).toBe('已处理')
  })

  it('serializeMessages：toolCalls 仅完整状态', () => {
    const msgs = [
      DONE_MSG,
      {
        role: 'assistant' as const,
        content: '',
        status: 'done' as const,
        toolCalls: [
          { name: 'write', args: {}, status: 'done' as const, result: 'ok', file: '/x.ts' },
          { name: 'bash', args: {}, status: 'pending' as const }, // 半截——丢弃
        ],
      },
    ]
    const out = serializeMessages(msgs)
    const calls = out[1].toolCalls ?? []
    expect(calls).toHaveLength(1)
    expect(calls[0].name).toBe('write')
  })

  it('saveSession → loadSession 往返', () => {
    saveSession([
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '收到' },
    ])
    const loaded = loadSession()
    expect(loaded).toHaveLength(2)
    expect(loaded?.[1].content).toBe('收到')
  })

  it('clearSession 清空 → loadSession null', () => {
    saveSession([{ role: 'user', content: 'x' }])
    clearSession()
    expect(loadSession()).toBeNull()
  })

  it('loadSession：损坏 JSON → null（不崩）', () => {
    ;(globalThis as Record<string, unknown>).localStorage.setItem(SESSION_KEY, 'not-json')
    expect(loadSession()).toBeNull()
  })

  it('serializeMessages：超过上限 → 截取末尾', () => {
    const msgs = Array.from({ length: SESSION_MAX + 10 }, (_, i) => ({
      role: 'user' as const,
      content: `msg ${i}`,
    }))
    const out = serializeMessages(msgs)
    expect(out).toHaveLength(SESSION_MAX)
    expect(out[0].content).toBe('msg 10') // 保留最新
  })
})

// S3 spec TDD 网格：会话持久化 decisionContent（§8.2 E——断点续做决策点内容不丢）
describe('sessionStore decisionContent 序列化（S3——§8.2 E）', () => {
  beforeEach(() => stubLocalStorage())

  const PLAN_CONTENT: Record<string, unknown> = {
    kind: 'plan',
    since: '2026-08-16T00:00:00.000Z',
    proposal: {
      summary: '重构入口',
      files: [
        { path: 'src/main.ts', reason: '核心逻辑' },
        { path: 'src/utils.ts', reason: '工具函数' },
      ],
      assumptions: ['使用 ESM'],
      verificationPlan: ['npx tsc --noEmit'],
    },
  }

  it('serializeMessages：保留 decisionContent 字段（PlanProposal 结构完整）', () => {
    const msgs = [
      {
        role: 'assistant' as const,
        content: '【执行方案】\n- src/main.ts（核心逻辑）',
        status: 'done' as const,
        decisionContent: PLAN_CONTENT,
      },
    ]
    const out = serializeMessages(msgs)
    expect(out[0].decisionContent).toEqual(PLAN_CONTENT)
    expect(out[0].decisionContent?.proposal?.files).toHaveLength(2)
  })

  it('saveSession → loadSession 往返：decisionContent 不丢（goal 决策点）', () => {
    const goalContent: Record<string, unknown> = {
      kind: 'goal',
      since: '2026-08-16T00:00:00.000Z',
      proposal: { statement: '做一个待办清单应用', assumptions: ['用 React'] },
    }
    saveSession([
      {
        role: 'assistant',
        content: '【目标确认：做一个待办清单应用】',
        decisionContent: goalContent,
      },
    ])
    const loaded = loadSession()
    expect(loaded?.[0].decisionContent).toEqual(goalContent)
  })

  it('loadSession：无 decisionContent 的旧存档兼容（undefined 不报错）', () => {
    saveSession([{ role: 'assistant', content: '旧消息' }])
    const loaded = loadSession()
    expect(loaded?.[0].decisionContent).toBeUndefined()
  })
})
