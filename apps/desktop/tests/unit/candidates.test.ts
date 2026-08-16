import { describe, it, expect } from 'vitest'
import { parseCandidates, stripCandidates, stripTags } from '../../src/renderer/candidates'

// 2026-08-05 方案 3：结构化候选按钮——模型候选 <candidates> 块解析/剥离纯函数
// 核心：候选从「序号解析」改为「文本点选」——消除模型对「序号→选项」的映射漂移（实测：选 1=射击被理解成建造）

describe('parseCandidates（候选块解析）', () => {
  it('正常块：每行一选项，去 - 前缀', () => {
    const c =
      '<candidates>\n- 射击游戏（打敌人那种）\n- 解谜游戏（动脑过关）\n- 建造游戏（搭积木）\n</candidates>'
    expect(parseCandidates(c)).toEqual([
      '射击游戏（打敌人那种）',
      '解谜游戏（动脑过关）',
      '建造游戏（搭积木）',
    ])
  })

  it('数字前缀也解析（1. / 1、 兼容）', () => {
    expect(parseCandidates('<candidates>\n1. 射击游戏\n2. 解谜游戏\n</candidates>')).toEqual([
      '射击游戏',
      '解谜游戏',
    ])
  })

  it('带引导文字包裹也能解析（块前后有正文）', () => {
    const c =
      '你对「设计」的理解，点选或回复序号：\n<candidates>\n- 射击\n- 建造\n</candidates>\n选好咱们继续。'
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

  it('流式未闭合（无 </candidates>）→ 容错解析到最后一个列表行（选项出现即渲染）', () => {
    expect(parseCandidates('<candidates>\n- 射击游戏\n- 解谜')).toEqual(['射击游戏', '解谜'])
  })

  // 2026-08-14 用户实测修复（timeline 0219a516）：模型漏闭合标签 → 容错解析到最后一个列表行
  it('未闭合块容错：解析到最后一个列表行（列表行后遇正文 = 块结束）', () => {
    const c =
      '<candidates>\n- 一把步枪就够，干脆利落（好上手）\n- 加一把狙击枪（更爽）\n- 随便，你来定\n\n关于目标：无限刷怪行不行？'
    expect(parseCandidates(c)).toEqual([
      '一把步枪就够，干脆利落（好上手）',
      '加一把狙击枪（更爽）',
      '随便，你来定',
    ])
  })

  it('块内纯文本行（非列表）也保留为选项', () => {
    expect(parseCandidates('<candidates>\n射击游戏（打敌人）\n建造游戏\n</candidates>')).toEqual([
      '射击游戏（打敌人）',
      '建造游戏',
    ])
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

  it('流式未闭合块 → 剥标记+列表行到结尾（不露标记杂音）', () => {
    expect(stripCandidates('你先确认：\n<candidates>\n- 射击游戏\n- 解谜')).toBe('你先确认：')
  })

  // 2026-08-14 用户实测修复：未闭合块后还有正文 → 正文必须保留（原实现整段吞掉——用户只看到半截话）
  it('未闭合块后正文保留（用户实测：候选漏闭合 + 块后「关于目标…」正文不被吞）', () => {
    const c =
      '最后补一个很小的点就能开工：\n<candidates>\n- 一把步枪就够\n- 加一把狙击枪\n- 随便，你来定\n\n关于目标：我先做成无限刷怪，行不行？'
    expect(stripCandidates(c)).toBe(
      '最后补一个很小的点就能开工：\n关于目标：我先做成无限刷怪，行不行？',
    )
  })

  it('只剥离候选块，正文不动', () => {
    expect(stripCandidates('正文 <candidates>\n- x\n</candidates> 还有正文')).toBe('正文  还有正文')
  })
})

describe('stripTags（通用去标签——展示层兜底）', () => {
  it('去掉模型自发尖括号标签、保留内容（<one-question> 实测）', () => {
    const c =
      '我发现有个事需要你确认：\n<one-question>\n现在用的是「鼠标拖动看视角」，你更想要哪种？\n</one-question>\n你回一个就行。'
    expect(stripTags(c)).toBe(
      '我发现有个事需要你确认：\n现在用的是「鼠标拖动看视角」，你更想要哪种？\n你回一个就行。',
    )
  })

  it('无标签 → 原样返回', () => {
    expect(stripTags('普通回复没有标签')).toBe('普通回复没有标签')
  })

  it('候选块已被前置移除时，剩余标签也能清（组合链路 stripCandidates + stripTags）', () => {
    const c =
      '选一个：\n<candidates>\n- 射击\n</candidates>\n<one-question>\n确认一下：是射击吗？\n</one-question>'
    expect(stripTags(stripCandidates(c))).toBe('选一个：\n确认一下：是射击吗？')
  })
})
