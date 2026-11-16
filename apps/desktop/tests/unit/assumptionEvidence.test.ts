import { describe, it, expect } from 'vitest'
import { sanitizeAssumptionSources } from '../../src/renderer/assumptionEvidence'

describe('assumptionEvidence（ADR-014 来源制裁）', () => {
  it('无证据的 user_choice/clarification → 降级 model_inference（模型自报来源不可信）', () => {
    const out = sanitizeAssumptionSources(
      [
        { text: '使用 PostgreSQL', source: 'user_choice' },
        { text: '单页应用', source: 'clarification' },
        { text: '模型推断', source: 'model_inference' },
      ],
      { clarified: new Set(), chosen: new Set() },
    )
    expect(out).toEqual([
      { text: '使用 PostgreSQL', source: 'model_inference' },
      { text: '单页应用', source: 'model_inference' },
      { text: '模型推断', source: 'model_inference' },
    ])
  })

  it('真实发生过的澄清/点选证据命中 → 保留来源（支持首尾空白归一）', () => {
    const out = sanitizeAssumptionSources(
      [
        { text: '使用 PostgreSQL', source: 'user_choice' },
        { text: '单页应用', source: 'clarification' },
      ],
      {
        clarified: new Set(['单页应用']),
        chosen: new Set(['使用 PostgreSQL']),
      },
    )
    expect(out).toEqual([
      { text: '使用 PostgreSQL', source: 'user_choice' },
      { text: '单页应用', source: 'clarification' },
    ])
  })

  it('来源证据只对对应类型生效：clarification 证据不能洗白 user_choice', () => {
    const out = sanitizeAssumptionSources([{ text: '同一文本', source: 'user_choice' }], {
      clarified: new Set(['同一文本']),
      chosen: new Set(),
    })
    expect(out[0].source).toBe('model_inference')
  })
})
