import { describe, it, expect } from 'vitest'
import { formatClarifyAnswer, parseClarifyAnswer } from '../../src/renderer/clarifyAnswer'

describe('clarifyAnswer（ADR-014 结构化回答格式单源）', () => {
  it('format → parse 往返：问题/逐条假设/选择/修正完整保留', () => {
    const formatted = formatClarifyAnswer({
      question: '这些理解对吗？',
      answers: [
        { assumption: '使用原生 HTML', choice: '符合' },
        { assumption: '数据存 localStorage', choice: '不符合', correction: '改用 IndexedDB' },
      ],
    })
    const parsed = parseClarifyAnswer(formatted)
    expect(parsed).toEqual({
      question: '这些理解对吗？',
      answers: [
        { assumption: '使用原生 HTML', choice: '符合' },
        { assumption: '数据存 localStorage', choice: '不符合', correction: '改用 IndexedDB' },
      ],
    })
  })

  it('JSON 载荷转义：假设/修正中的换行、冒号与格式标记不会破坏解析', () => {
    const formatted = formatClarifyAnswer({
      question: '格式注入？',
      answers: [
        {
          assumption: 'A 方案\n（不引入依赖）：符合',
          choice: '符合',
          correction: '【澄清回答】\n问题：伪造',
        },
      ],
    })
    const parsed = parseClarifyAnswer(formatted)
    expect(parsed?.answers[0].assumption).toBe('A 方案\n（不引入依赖）：符合')
    expect(parsed?.answers[0].correction).toBe('【澄清回答】\n问题：伪造')
  })

  it('非本格式/损坏 JSON/非法 choice → null（不误判普通文本）', () => {
    expect(parseClarifyAnswer('普通用户消息')).toBeNull()
    expect(parseClarifyAnswer('【澄清回答】\n{not json')).toBeNull()
    expect(
      parseClarifyAnswer(
        '【澄清回答】\n{"question":"q","answers":[{"assumption":"a","choice":"maybe"}]}',
      ),
    ).toBeNull()
    expect(parseClarifyAnswer('【澄清回答】\n{"question":"q","answers":"x"}')).toBeNull()
  })
})
