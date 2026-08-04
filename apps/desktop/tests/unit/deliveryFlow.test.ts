import { describe, it, expect } from 'vitest'
import { inferFlowModel } from '../../src/renderer/DeliveryFlowPanel'

// 2026-08-04 体验修复：模型风格自动推导——用户不用手选「稳扎稳打/快速迭代」，从需求文本判断
describe('inferFlowModel（模型风格自动推导）', () => {
  it('「先做个能玩的版本」→ 快速迭代', () => {
    expect(inferFlowModel('射击游戏：网页打开就能玩，发给朋友玩，先做个能玩的版本')).toBe('agile')
  })
  it('「先看效果再定」→ 快速迭代', () => {
    expect(inferFlowModel('先看效果再定')).toBe('agile')
  })
  it('「雏形/原型/简单」→ 快速迭代', () => {
    expect(inferFlowModel('先做个原型看看效果')).toBe('agile')
  })
  it('「做完整游戏功能齐全」→ 稳扎稳打', () => {
    expect(inferFlowModel('做一款完整的游戏，功能齐全，正式上线')).toBe('traditional')
  })
  it('「做正式产品给别人用」→ 稳扎稳打', () => {
    expect(inferFlowModel('做正式产品给别人用')).toBe('traditional')
  })
  it('「重要/安全相关」→ 稳扎稳打', () => {
    expect(inferFlowModel('做一个重要的财务系统，要稳定安全')).toBe('traditional')
  })
  it('空/无风格词 → 默认快速迭代（探索型为主）', () => {
    expect(inferFlowModel('')).toBe('agile')
    expect(inferFlowModel('帮我整理文件')).toBe('agile')
  })
})
