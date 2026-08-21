import { describe, it, expect } from 'vitest'
import { extractReasoningText, REASONING_FIELDS } from '../../src/main/gateway'

// 2026-08-21 ADR-007/provider 兼容（A-012）：reasoning 字段多源提取——thinking 内容可能出现在
// reasoning_content（DeepSeek 官方/llama.cpp）或 reasoning（Command Code 等 OpenAI 兼容端点）或 reasoning_text；
// 取第一个非空（对齐 pi/DSH `["reasoning_content","reasoning","reasoning_text"]` 归一——openai-completions.js L349-362）

describe('extractReasoningText（SSE delta 多源提取）', () => {
  it('字段顺序：reasoning_content > reasoning > reasoning_text', () => {
    expect(REASONING_FIELDS).toEqual(['reasoning_content', 'reasoning', 'reasoning_text'])
  })

  it('DeepSeek 官方字段（reasoning_content）', () => {
    expect(extractReasoningText({ reasoning_content: '思考中' })).toBe('思考中')
  })

  it('Command Code 字段（reasoning）——官方字段缺失时取第二个', () => {
    expect(extractReasoningText({ reasoning: 'thinking text' })).toBe('thinking text')
  })

  it('reasoning_text 兜底', () => {
    expect(extractReasoningText({ reasoning_text: 'rt' })).toBe('rt')
  })

  it('多字段并存取第一个非空（chutes.ai 双字段同内容场景）', () => {
    expect(extractReasoningText({ reasoning_content: 'a', reasoning: 'b' })).toBe('a')
  })

  it('空字符串字段跳过（非空才取）', () => {
    expect(extractReasoningText({ reasoning_content: '', reasoning: 'b' })).toBe('b')
  })

  it('无任何字段 → undefined（不误发 reasoning 回调）', () => {
    expect(extractReasoningText({ content: '正文' })).toBeUndefined()
    expect(extractReasoningText({})).toBeUndefined()
  })

  it('非字符串值跳过（delta 防御——畸形载荷）', () => {
    expect(extractReasoningText({ reasoning: 123, reasoning_text: 'ok' })).toBe('ok')
  })
})
