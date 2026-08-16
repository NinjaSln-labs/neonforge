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
