// S3 renderer 接线场景（设计 §6 S3——卡渲染从 decisionContent 派生 + 方案卡/拒绝原因 UI）
// 场景：
//   1. 方案卡渲染 PlanProposal 三要素（文件清单含原因/关键假设/验证计划）
//   2. 拒绝原因收集（拒绝带 kind → 状态回退 + 模型收到方向）
//   3. 触发权切换：卡内容来自 decisionContent（pending 时唯一来源）
// 装配：MockBridge 工厂 + 场景装配器（T0 基建——旧基建 S3 迁移后本文件为新场景承载）
import { test, expect } from '@playwright/test'
import { installMockBridge, chunk } from './mockBridge'
import { compose, goalConfirm, startFromScratch } from './scenarios'
import { expectVisible, expectText } from '../helpers/assertions'

test('S3-1：方案卡渲染 PlanProposal 三要素（文件含原因/关键假设/验证计划）', async ({ page }) => {
  await installMockBridge(page, {
    project: 'none',
    script: compose(goalConfirm('做一个待办清单应用'), [
      [
        chunk.content(
          `【执行方案】\n- src/App.tsx（核心组件）\n- src/store.ts（状态管理）\n关键假设：\n- 使用 React 19\n- 不引入新依赖\n验证计划：\n- npx tsc --noEmit\n- npx vitest run`,
        ),
        chunk.done(),
      ],
    ]),
  })
  await startFromScratch(page, '做个待办应用')
  await expectVisible(page.getByRole('button', { name: '确认目标' }), 10000)
  await page.getByRole('button', { name: '确认目标' }).click()
  // 方案卡出现（确认执行按钮）——S3：内容从 decisionContent 派生
  await expectVisible(page.getByRole('button', { name: '确认执行' }), 10000)
  // 三要素可见：文件清单（含原因）/ 关键假设 / 验证计划
  await expectText(page.locator('.nf-confirmcard'), 'src/App.tsx（核心组件）', 5000)
  await expectText(page.locator('.nf-confirmcard'), 'src/store.ts（状态管理）', 5000)
  await expectText(page.locator('.nf-confirmcard'), '关键假设', 5000)
  await expectText(page.locator('.nf-confirmcard'), '使用 React 19', 5000)
  await expectText(page.locator('.nf-confirmcard'), '验证计划', 5000)
  await expectText(page.locator('.nf-confirmcard'), 'npx tsc --noEmit', 5000)
  // 确认执行 → 卡消失（决策点走完）
  await page.getByRole('button', { name: '确认执行' }).click()
  await expectText(page.locator('.nf-chat__list'), '确认，按方案执行', 10000)
})

test('S3-2：拒绝方案带原因 → 卡隐藏 + 模型收到方向（拒绝原因收集）', async ({ page }) => {
  await installMockBridge(page, {
    project: 'none',
    script: compose(goalConfirm('做一个待办清单应用'), [
      [
        chunk.content(
          `【执行方案】\n- src/App.tsx（核心组件）\n关键假设：\n- 使用 React 19\n验证计划：\n- npx tsc --noEmit`,
        ),
        chunk.done(),
      ],
    ]),
  })
  await startFromScratch(page, '做个待办应用')
  await expectVisible(page.getByRole('button', { name: '确认目标' }), 10000)
  await page.getByRole('button', { name: '确认目标' }).click()
  await expectVisible(page.getByRole('button', { name: '确认执行' }), 10000)
  // 拒绝（带原因——S3 UI 预设 kind + 可选文本）
  await page.getByRole('button', { name: '修改方案' }).click()
  // 卡隐藏（拒绝后不残留——坑 101 根治）
  await expect(page.getByRole('button', { name: '确认执行' })).toHaveCount(0)
  // 模型收到方向性反馈（send 内容含拒绝语义）
  await expectText(page.locator('.nf-chat__list'), '方案需要调整', 10000)
})

test('S3-3：触发权切换——goal 卡内容来自 decisionContent 快照（非重复正则解析）', async ({
  page,
}) => {
  await installMockBridge(page, {
    project: 'none',
    script: compose(
      // 模型输出【目标确认】标记 + 关键假设行（⑬ 契约）——goal 决策点产生
      [
        [
          chunk.content(
            '好的。【目标确认：做一个待办清单应用】\n关键假设：\n- 用 React 实现\n- 数据存 localStorage',
          ),
          chunk.done(),
        ],
      ],
    ),
  })
  await startFromScratch(page, '做个待办应用')
  // 目标卡弹出（探测命中标记 → decisionContent 快照渲染）
  await expectVisible(page.getByRole('button', { name: '确认目标' }), 10000)
  // S3 断言：卡内容来自决策点快照（含关键假设——⑬ 契约结构化提取）
  await expectText(page.locator('.nf-confirmcard'), '做一个待办清单应用', 5000)
  await expectText(page.locator('.nf-confirmcard'), '关键假设', 5000)
  await expectText(page.locator('.nf-confirmcard'), '用 React 实现', 5000)
})

test('S3-4：拒绝超限回退——连续拒绝 3 次 → 澄清提示（不弹卡轰炸）', async ({ page }) => {
  await installMockBridge(page, {
    project: 'none',
    // 拒绝按钮 onClick 自动 send（inputRef+sendRef）驱动轮次——不需要测试内 sendChat
    script: compose(
      goalConfirm('做一个待办清单应用'),
      [
        [
          chunk.content(
            `【执行方案】\n- src/App.tsx（核心组件）\n关键假设：\n- 使用 React 19\n验证计划：\n- npx tsc --noEmit`,
          ),
          chunk.done(),
        ],
      ],
      [
        [
          chunk.content(
            `【执行方案】\n- src/App.tsx（核心组件）\n关键假设：\n- 使用 React 19\n验证计划：\n- npx tsc --noEmit`,
          ),
          chunk.done(),
        ],
      ],
      [
        [
          chunk.content(
            `【执行方案】\n- src/App.tsx（核心组件）\n关键假设：\n- 使用 React 19\n验证计划：\n- npx tsc --noEmit`,
          ),
          chunk.done(),
        ],
      ],
    ),
  })
  await startFromScratch(page, '做个待办应用')
  // 确认目标 → 方案卡
  await expectVisible(page.getByRole('button', { name: '确认目标' }), 10000)
  await page.getByRole('button', { name: '确认目标' }).click()
  // 拒绝方案 3 次（每次拒绝自动 send「方案需要调整」→ 模型重提议 → 卡重现）
  for (let i = 0; i < 3; i++) {
    await expectVisible(page.getByRole('button', { name: '确认执行' }), 15000)
    await page.getByRole('button', { name: '修改方案' }).click()
  }
  // 第 3 次拒绝后：对话区出现澄清提示（rejectStreak ≥3——§4.1 超限回退）
  await expectText(page.locator('.nf-reject-overflow'), '连续拒绝了 3 次', 10000)
})
