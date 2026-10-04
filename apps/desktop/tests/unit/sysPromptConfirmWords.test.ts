// sysPrompt 与确认通道的契约校验（P2-4 演化版——ADR-018 C1/C2 落地）
// 历史：原版本把「提示词承诺的确认词 ⊆ isConfirmIntent 词表」做成机器校验——因为 ⑮ 曾用
// 「让用户确认「已解决」」的措辞引导打字，而词表缺位时用户按引导回复反而触发隐式拒绝
// （#6 真机 2026-08-30 实测）。那是**给第二条决策通道打补丁**。
// 2026-10-04 反转（product/00 §4.5 C2 ＋ ADR-018）：sysPrompt ⑳ 早已规定「确认只能通过界面
// 确认卡按钮完成——严禁要求用户『输入特定文字/暗号』来确认」，本测试改为**锁死 ⑳ 与措辞形态**：
// 提示词里不得再出现「确认「X」/回复「X」/回我「X」」这类把打字呈现为答复通道的引导。
import { describe, expect, it } from 'vitest'
import { buildSysHint } from '../../src/renderer/sysPrompt'

const sysPromptContent = buildSysHint('', '', '').content

describe('sysPrompt 不得把打字呈现为确认通道（ADR-018 C2 / §4.5）', () => {
  it('提示词中不存在「确认「X」/回复「X」/回我「X」」式打字引导', () => {
    const told = [...sysPromptContent.matchAll(/(?:确认|回复|回我)「([^」]{1,10})」/g)].map(
      (m) => m[1],
    )
    expect(told, `提示词把打字呈现为答复通道：${told.join('、')}`).toEqual([])
  })

  it('⑳ 确认通道唯一性条款在位（防被整段删掉后测试静默通过）', () => {
    expect(sysPromptContent).toContain('确认只能通过界面确认卡按钮完成')
    expect(sysPromptContent).toContain('严禁要求用户')
  })
})
