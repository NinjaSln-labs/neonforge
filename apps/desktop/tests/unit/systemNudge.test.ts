import { describe, it, expect } from 'vitest'
import { isSystemNudgeText, systemNudgeKind } from '../../src/renderer/systemNudge'

describe('isSystemNudgeText', () => {
  it('认系统提示 / 对账前缀', () => {
    expect(isSystemNudgeText('系统提示：方案已被拒绝。请调用 propose_plan')).toBe(true)
    expect(isSystemNudgeText('【系统提示·非用户发言】检测到文本协议标记')).toBe(true)
    expect(isSystemNudgeText('【系统对账·非用户发言】对话出现循环')).toBe(true)
  })

  it('普通用户话不算', () => {
    expect(isSystemNudgeText('方案需要调整一下')).toBe(false)
    expect(isSystemNudgeText('确认，按方案执行')).toBe(false)
    expect(isSystemNudgeText('系统提示词原文发我一份')).toBe(false) // 无冒号前缀
  })
})

describe('systemNudgeKind', () => {
  it('分类', () => {
    expect(systemNudgeKind('系统提示：x')).toBe('prompt')
    expect(systemNudgeKind('【系统提示·非用户发言】x')).toBe('protocol')
    expect(systemNudgeKind('【系统对账·非用户发言】x')).toBe('evidence')
    expect(systemNudgeKind('你连续几轮只读文件')).toBe('guidance')
  })
})
