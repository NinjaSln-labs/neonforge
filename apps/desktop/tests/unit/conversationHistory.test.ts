// P1-05 阶段 4a：buildHistory 纯函数测试（工具轮回填/流式中消息过滤/reasoning_content）。
import { describe, expect, it } from 'vitest'
import type { Msg } from '../../src/renderer/ConversationPanel'
import { buildHistory } from '../../src/renderer/conversationHistory'

describe('buildHistory（对话历史构建）', () => {
  const messages: Msg[] = [
    { role: 'user', content: '看下文件', status: 'done' },
    {
      role: 'assistant',
      content: '',
      reasoning: '先读再改',
      status: 'done',
      toolCalls: [
        {
          name: 'read',
          args: { path: 'a.txt' },
          status: 'done',
          result: '摘要',
          rawResult: '完整内容',
        },
        { name: 'write', args: { path: 'b.txt' }, status: 'done' },
      ],
    },
    { role: 'assistant', content: '流式未完成', status: 'streaming' },
    { role: 'assistant', content: '改好了', reasoning: '收尾', status: 'done' },
  ]

  it('只保留 user + done assistant；工具轮带 tool_calls 与完整 rawResult', () => {
    const history = buildHistory(messages)
    expect(history.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'tool', 'assistant'])
    expect(history[0]).toEqual({ role: 'user', content: '看下文件' })

    const toolCall = history[1]
    expect(toolCall.reasoning_content).toBe('先读再改')
    expect(toolCall.content).toBeNull()
    expect(Array.isArray(toolCall.tool_calls)).toBe(true)
    const calls = toolCall.tool_calls as Array<{
      id: string
      function: { name: string; arguments: string }
    }>
    expect(calls.map((c) => c.function.name)).toEqual(['read', 'write'])
    expect(JSON.parse(calls[0].function.arguments)).toEqual({ path: 'a.txt' })

    expect(history[2]).toEqual({ role: 'tool', tool_call_id: calls[0].id, content: '完整内容' })
    expect(history[3]).toEqual({ role: 'tool', tool_call_id: calls[1].id, content: 'done' })
  })

  it('普通 assistant 消息保留 reasoning_content；流式中消息被过滤', () => {
    const history = buildHistory(messages)
    expect(history[4]).toEqual({ role: 'assistant', content: '改好了', reasoning_content: '收尾' })
    expect(history.some((m) => m.content === '流式未完成')).toBe(false)
  })
})
