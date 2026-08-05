import { describe, it, expect } from 'vitest'
import { parseCandidates, stripCandidates } from '../../src/renderer/candidates'

// 2026-08-05 方案 3：结构化候选按钮——模型候选 <candidates> 块解析/剥离纯函数
// 核心：候选从「序号解析」改为「文本点选」——消除模型对「序号→选项」的映射漂移（实测：选 1=射击被理解成建造）

describe('parseCandidates（候选块解析）', () => {
  it('正常块：每行一选项，去 - 前缀', () => {
    const c = '<candidates>\n- 射击游戏（打敌人那种）\n- 解谜游戏（动脑过关）\n- 建造游戏（搭积木）\n</candidates>'
    expect(parseCandidates(c)).toEqual(['射击游戏（打敌人那种）', '解谜游戏（动脑过关）', '建造游戏（搭积木）'])
  })

  it('数字前缀也解析（1. / 1、 兼容）', () => {
    expect(parseCandidates('<candidates>\n1. 射击游戏\n2. 解谜游戏\n</candidates>')).toEqual(['射击游戏', '解谜游戏'])
  })

  it('带引导文字包裹也能解析（块前后有正文）', () => {
    const c = '你对「设计」的理解，点选或回复序号：\n<candidates>\n- 射击\n- 建造\n</candidates>\n选好咱们继续。'
    expect(parseCandidates(c)).toEqual(['射击', '建造'])
  })

  it('大小写不敏感（<Candidates>）', () => {
    expect(parseCandidates('<Candidates>\n- a\n- b\n</Candidates>')).toEqual(['a', 'b'])
  })

  it('无候选块 → null', () => {
    expect(parseCandidates('普通回复没有候选')).toBeNull()
  })

  it('空块（无有效选项行）→ null', () => {
    expect(parseCandidates('<candidates>\n</candidates>')).toBeNull()
  })

  it('流式未闭合（无 </candidates>）→ null（等完整再渲染按钮）', () => {
    expect(parseCandidates('<candidates>\n- 射击游戏\n- 解谜')).toBeNull()
  })

  it('块内纯文本行（非列表）也保留为选项', () => {
    expect(parseCandidates('<candidates>\n射击游戏（打敌人）\n建造游戏\n</candidates>')).toEqual(['射击游戏（打敌人）', '建造游戏'])
  })
})

describe('stripCandidates（候选块剥离——展示层）', () => {
  it('剥离完整块，保留前后正文', () => {
    const c = '你先确认一下：\n<candidates>\n- 射击\n- 建造\n</candidates>\n选好继续。'
    expect(stripCandidates(c)).toBe('你先确认一下：\n选好继续。')
  })

  it('无候选块 → 原样返回', () => {
    expect(stripCandidates('普通回复')).toBe('普通回复')
  })

  it('流式未闭合块 → 从 <candidates> 剥离到结尾（不露标记杂音）', () => {
    expect(stripCandidates('你先确认：\n<candidates>\n- 射击游戏\n- 解谜')).toBe('你先确认：')
  })

  it('只剥离候选块，正文不动', () => {
    expect(stripCandidates('正文 <candidates>\n- x\n</candidates> 还有正文')).toBe('正文  还有正文')
  })
})
