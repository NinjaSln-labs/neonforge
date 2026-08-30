// sysPrompt 引导词与确认词表同步校验（P2-4 预防——双源失同步机器化）
// 背景：sysPrompt ⑮ 引导用户回「已解决」，但 isConfirmIntent 词表缺位 → resolution pending 期
// 用户按引导打字反而触发隐式拒绝（#6 真机 2026-08-30 实测）。本测试把「提示词承诺的确认词
// ⊆ 词表」变成机器校验：凡 sysPrompt 以「确认「X」/回复「X」/回我「X」」引导用户输入的词，
// 必须被 isConfirmIntent 判为确认语义。
import { describe, expect, it } from 'vitest'
import { buildSysHint } from '../../src/renderer/sysPrompt'
import { isConfirmIntent } from '../../src/domain/agentLoop.js'

const sysPromptContent = buildSysHint('', '', '').content

describe('sysPrompt 引导词 ⊆ isConfirmIntent 词表（P2-4 防再发）', () => {
  it('sysPrompt 引导用户输入的确认词必须通过 isConfirmIntent', () => {
    // 提取「确认「X」/回复「X」/回我「X」」形态的引导词（≤10 字——确认词量级）
    const told = [...sysPromptContent.matchAll(/(?:确认|回复|回我)「([^」]{1,10})」/g)].map(
      (m) => m[1],
    )
    expect(told.length).toBeGreaterThan(0) // 引导存在——防正则失配静默通过
    for (const w of told) {
      expect(isConfirmIntent(w), `sysPrompt 引导用户回复「${w}」但 isConfirmIntent 不认`).toBe(true)
    }
  })

  it('「已解决」（当前引导词）在词表——回归锁定', () => {
    expect(isConfirmIntent('已解决')).toBe(true)
    expect(isConfirmIntent('已解决，谢谢')).toBe(false) // 带后缀非精确词——按钮路径直发，不走词表（现状语义）
  })
})
