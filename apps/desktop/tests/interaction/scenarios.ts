// 场景装配器（测试域 DDD §9.3——T0 基建 2/3）
// 领域故事派生的标准场景：goal-clarify → goal-confirm → plan-propose → plan-approve → execute → complete → reconcile
// 每个步骤 = 一段轮次脚本（StreamChunk[][]——按 chat 轮次占位）；测试 = compose 装配 + 断言
// 用户动作（确认按钮/发送）穿插在测试体内——mock 只按轮次号发 chunk（与旧基建时序语义一致）
import { chunk, toolCall, type StreamChunk } from './mockBridge'

// ── 组装 ─────────────────────────────────────────────────────────────────

/** 把多个旅程步骤按顺序拼成一份轮次脚本（各步骤依次占轮次） */
export function compose(...segments: StreamChunk[][][]): StreamChunk[][] {
  return segments.flat()
}

// ── 旅程步骤（各返回一段轮次脚本）──────────────────────────────────────────

/** 澄清：模型提问 + <candidates> 结构化候选（1 轮） */
export function goalClarify(question: string, candidates: string[]): StreamChunk[][] {
  const block = candidates.length
    ? `\n\n<candidates>\n${candidates.map((c) => `- ${c}`).join('\n')}\n</candidates>\n\n你点选或者直接回复序号都行。`
    : ''
  return [[chunk.content(`${question}${block}`), chunk.done()]]
}

/** 目标确认：模型输出【目标确认：】标记（1 轮） */
export function goalConfirm(goal: string): StreamChunk[][] {
  return [[chunk.content(`好的。【目标确认：${goal}】`), chunk.done()]]
}

/** 方案提议：模型输出【执行方案】清单（1 轮；files 为清单内文件行） */
export function planPropose(files: string[], note = '等你确认。'): StreamChunk[][] {
  return [[chunk.content(`【执行方案】\n${files.map((f) => `- ${f}`).join('\n')}\n${note}`), chunk.done()]]
}

/** 方案提议 + 批量授权请求：执行方案后同轮请求 approve-files（1 轮） */
export function planProposeWithApproval(files: Array<{ path: string; reason: string }>): StreamChunk[][] {
  const lines = files.map((f) => `- ${f.path}`).join('\n')
  return [[chunk.content(`【执行方案】\n${lines}`), toolCall.approveFiles('第一批', files), chunk.done()]]
}

/** 执行：write 工具调用（1 轮——同一文件多次写可重复拼） */
export function executeWrite(path: string, content = 'x'): StreamChunk[][] {
  return [[toolCall.write(path, content), chunk.done()]]
}

/** 执行：bash 命令（1 轮） */
export function executeBash(command: string): StreamChunk[][] {
  return [[toolCall.bash(command), chunk.done()]]
}

/** 完成声明：模型纯文本收尾（1 轮） */
export function completeClaim(text: string): StreamChunk[][] {
  return [[chunk.content(text), chunk.done()]]
}

// ── 夹具（demo 注入——交付对账步骤的渲染数据）─────────────────────────────

export interface DeliveryFixture {
  status: 'draft' | 'delivered' | 'closed'
  summary: string
  artifacts: string[]
  acceptance: Array<{ label: string; done: boolean }>
  nextSteps: string[]
  diffs?: Array<{ path: string; diff: string }>
}

/** 已交付包（含一个行级 diff——对账/验收场景用） */
export function deliveredPackage(pkg: Partial<DeliveryFixture> = {}): DeliveryFixture {
  return {
    status: 'delivered',
    summary: '修复了 a.txt 中的拼写错误',
    artifacts: ['a.txt'],
    acceptance: [{ label: '拼写已修正', done: false }],
    nextSteps: ['重新运行验证'],
    diffs: [{ path: '/test/a.txt', diff: '--- a/a.txt\n+++ b/a.txt\n@@ -1,2 +1,2 @@\n-hello worl\n+hello world' }],
    ...pkg,
  }
}

// ── 入口动作（进入工作区/从零开始/发送——旅程的标准起手式）─────────────────

import type { Page } from '@playwright/test'
import { expectVisible } from '../helpers/assertions'

/** 打开已有项目（配合 project: 'open'） */
export async function enterWorkspace(page: Page): Promise<void> {
  await page.goto('http://localhost:5175/')
  await expectVisible(page.locator('.nf-start'))
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await page.waitForSelector('.nf-chat__input textarea', { timeout: 8000 })
}

/** 从零开始（配合 project: 'none'）；text 提供时先填启动页输入框再点「从零开始」按钮
 * 注意：用按钮而非 Enter——Enter 与应用内 50ms 自动发送存在竞态（目标卡可能先于首轮流式出现，
 * 导致点击确认目标时首轮尚未完成——forceTool 断言错位；按钮路径与旧测试（根因3）一致，确定性稳定） */
export async function startFromScratch(page: Page, text?: string): Promise<void> {
  await page.goto('http://localhost:5175/')
  await expectVisible(page.locator('.nf-start'))
  if (text !== undefined) {
    await page.locator('.nf-start__input').fill(text)
    await page.getByRole('button', { name: '从零开始' }).click()
  } else {
    await page.getByRole('button', { name: '从零开始' }).click()
  }
}

/** 对话输入并发送 */
export async function sendChat(page: Page, text: string): Promise<void> {
  const input = page.locator('.nf-chat__input textarea')
  await input.fill(text)
  await input.press('Meta+Enter')
}
