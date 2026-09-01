import { describe, it, expect } from 'vitest'
import { toolCallRepair } from '../../src/main/gateway'

// V1.5 S2 A-018：parse 失败保留 rawArguments 重试 1 次（stage-spec 附录 B S0 结论 6/7——
// 「parse 失败重试 1 次」承诺落地）。toolCallRepair 的 round 参数驱动渐进修复：
// - 解析基态（任意 round）：原样 parse + 双重序列化剥层（crush 教训——args 被 JSON 字符串包裹）
// - round 0：最简尾逗号补全（V1 基础实现——原行为）；不可补则 null → 调用方 round 1 重试
// - round 1+：杂质剥离（说明文本混入——提取首个 JSON 值到闭合括号）
// - round >= 4：null（防死循环——上限不变）

describe('toolCallRepair（V1.5 S2 A-018——round 驱动渐进修复）', () => {
  it('合法 JSON 字符串 → 原样 parse（round 0 即成功——不改变既有行为）', () => {
    expect(toolCallRepair('{"a":1}')).toEqual({ a: 1 })
  })

  it('非字符串原样返回（round 0 即成功）', () => {
    expect(toolCallRepair({ a: 1 })).toEqual({ a: 1 })
  })

  it('双重序列化（JSON 字符串包裹 args——crush 教训）→ 基态剥层成功（spike-lib parseArguments 对齐）', () => {
    const double = JSON.stringify({ statement: '做一个待办应用', assumptions: ['本地'] })
    expect(toolCallRepair(double)).toEqual({
      statement: '做一个待办应用',
      assumptions: ['本地'],
    })
  })

  it('尾逗号截断 → round 0 补全成功（V1 基础实现保留）', () => {
    expect(toolCallRepair('{"a":1,}')).toEqual({ a: 1 })
  })

  it('畸形且无尾逗号 → round 0 明确失败（null——交给调用方以 round 1 更强策略重试）', () => {
    expect(toolCallRepair('{"a":1 "b":2}')).toBeNull()
  })

  it('杂质剥离：模型输出混入说明文本 → round 1 提取首个 JSON 值到闭合括号（retry 救回核心）', () => {
    const noisy =
      '好的，方案如下：{"files":[{"path":"index.html","reason":"新建首页"}],"summary":"首页"}（等你确认）'
    expect(toolCallRepair(noisy, 1)).toEqual({
      files: [{ path: 'index.html', reason: '新建首页' }],
      summary: '首页',
    })
  })

  it('首尾空白 + 换行 → 基态直接 parse 成功（合法 JSON——不触发重试）', () => {
    expect(toolCallRepair('\n  {"a":1}  \n')).toEqual({ a: 1 })
  })

  it('round 已达上限（>=4）→ null（防死循环）', () => {
    expect(toolCallRepair('{broken', 4)).toBeNull()
  })

  it('畸形且 round 1 剥离也失败 → null（retry 后仍失败——最终放弃）', () => {
    expect(toolCallRepair('{ totally not json ', 1)).toBeNull()
  })
})
