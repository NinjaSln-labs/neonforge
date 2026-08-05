import { describe, it, expect } from 'vitest'
import { isActionPromise } from '../../src/renderer/ConversationPanel'

// 2026-08-05 体验反馈（用户「最后一条像卡住」——模型承诺行动但没调工具）：检测「说了要做但没动手」的回复
// 不限开发阶段——任何阶段说「先看/先读/先写」就该调工具；「确认/思考」类对话行为不触发

describe('isActionPromise（行动承诺检测）', () => {
  it('承诺 + 动作 → true（实测：「先打开服务端看看结构，再动手加」）', () => {
    expect(isActionPromise('好，那就加 AI 机器人。我先把服务端逻辑打开看看结构，再动手加。')).toBe(true)
  })

  it('「我先看下目录」→ true', () => {
    expect(isActionPromise('我先看下目录结构。')).toBe(true)
  })

  it('设计阶段「我先看看项目结构」→ true（不限于开发阶段——说了要看就该调 read）', () => {
    expect(isActionPromise('我先看看项目里现在有什么文件。')).toBe(true)
  })

  it('需求阶段「我先确认一下你的意思」→ false（确认是对话行为，不调工具）', () => {
    expect(isActionPromise('我先确认一下你的意思。')).toBe(false)
    expect(isActionPromise('我复述一下你的需求，你看对不对。')).toBe(false)
  })

  it('问句 → false（不是承诺）', () => {
    expect(isActionPromise('这样可以吗？')).toBe(false)
    expect(isActionPromise('你觉得要不要加一个机器人？')).toBe(false)
    expect(isActionPromise('你更想要哪种？')).toBe(false)
  })

  it('无动作承诺（纯陈述/确认）→ false', () => {
    expect(isActionPromise('好的，我明白了。')).toBe(false)
    expect(isActionPromise('游戏已经做好了，打开浏览器就能玩。')).toBe(false)
  })

  it('征求同意（…吧 结尾）→ false', () => {
    expect(isActionPromise('要不先做成单人的吧。')).toBe(false)
  })
})
