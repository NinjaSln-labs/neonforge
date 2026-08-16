// S3 renderer 接线场景（设计 §6 S3——卡渲染从 decisionContent 派生 + 方案卡/拒绝原因 UI）
// 场景：
//   1. 方案卡渲染 PlanProposal 三要素（文件清单含原因/关键假设/验证计划）
//   2. 拒绝原因收集（拒绝带 kind → 状态回退 + 模型收到方向）
//   3. 触发权切换：卡内容来自 decisionContent（pending 时唯一来源）
// 装配：MockBridge 工厂 + 场景装配器（T0 基建——旧基建 S3 迁移后本文件为新场景承载）
import { test, expect } from '@playwright/test'
import { installMockBridge, chunk, toolCall } from './mockBridge'
import { compose, goalConfirm, planPropose, startFromScratch } from './scenarios'
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

test('S3-3b：无 decisionContent 不弹卡——纯文本含标记但解析失败（C3 降级）不产生决策点', async ({
  page,
}) => {
  await installMockBridge(page, {
    project: 'none',
    script: compose(
      // 消息含【执行方案】标记但无合法文件行 → parsePlanProposal 返回 malformed → 无快照 → 卡不弹
      [[chunk.content('【执行方案】\n我先分析一下再动手。'), chunk.done()]],
    ),
  })
  await startFromScratch(page, '做个待办应用')
  // 无目标卡（goal 未提议——第一条消息不是目标确认）
  // 无方案卡（plan 解析失败——C3 降级：不产生决策点）
  await page.waitForTimeout(2500)
  await expect(page.getByRole('button', { name: '确认执行' })).toHaveCount(0)
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

// S4 完成证据对账场景（设计 §6 S4——已解决卡条件 = verifyCompletion 通过；证据不足不弹卡 + 回填引导）
// 装配：MockBridge + 轮次脚本（goal → plan → 执行 write（producedFiles 非空——resolution 卡渲染前提）→ 完成声明）
// 断言策略：verifyThenResolve 判定后引导 send 自动触发下一轮（~100ms）——「不弹卡」中间态窗口太窄——
// 用 evidence_missing 打点（timeline 捕获）+ chatCount（引导 send 确实发生）+ 最终弹卡 三重证明
// S4 场景 1a：证据不足（verification 空）→ 不弹卡 + evidence_missing 打点 + 引导 send 发生（无后续轮次——卡恒不出现）
test('S4-1a：证据不足 → 不弹已解决卡 + evidence_missing 打点 + 回填引导触发', async ({ page }) => {
  await installMockBridge(page, {
    project: 'none',
    capture: { chatCount: true },
    // extraInit 逃生舱：函数字段直接改 bridge（extra 经 JSON 序列化会丢函数——不能用）
    extraInit: `
      const tlogs = []
      window.__tlogs = tlogs
      bridge.timeline = { log: async (evt) => { tlogs.push(evt) } }
    `,
    script: compose(
      goalConfirm('完成待办应用'),
      planPropose(['/test/app.ts（核心）']),
      [[toolCall.write('/test/app.ts', 'x'), chunk.done()]], // 确认执行后写（producedFiles 非空）
      [
        [
          // 证据不足：verification 空（无验证证据行）→ verifyCompletion 纯逻辑 missing → 不弹卡
          chunk.content('【已达成】\n完成了。\n遗留问题：\n- 无'),
          chunk.done(),
        ],
      ],
      [
        [
          // 第二次证据不足声明（由第一次引导 send 触发）→ 引导护栏生效：不再自动 send（chatCount 停 5）
          chunk.content('【已达成】\n还是不够。\n遗留问题：\n- 无'),
          chunk.done(),
        ],
      ],
    ),
  })
  await startFromScratch(page, '做个待办应用')
  await expectVisible(page.getByRole('button', { name: '确认目标' }), 10000)
  await page.getByRole('button', { name: '确认目标' }).click()
  await expectVisible(page.getByRole('button', { name: '确认执行' }), 10000)
  await page.getByRole('button', { name: '确认执行' }).click()
  await expect(page.locator('.nf-toolcall--done')).toHaveCount(1, { timeout: 10000 })
  // 完成声明（证据不足）→ 已解决卡不出现（verifyCompletion ok=false——不变量 4 接线；脚本无后续轮次→结构性恒不出现）
  await page.waitForTimeout(2000)
  await expect(page.getByRole('button', { name: '已解决' })).toHaveCount(0)
  // evidence_missing 打点（ok:false + missing 含 verification）
  const tlogs = await page.evaluate(() => (window as unknown as { __tlogs: unknown[] }).__tlogs)
  const ev = tlogs.find((l) => (l as { type: string }).type === 'completion.evidence_missing') as
    { detail?: { ok?: boolean; missing?: string[] } } | undefined
  expect(ev).toBeTruthy()
  expect(ev?.detail?.ok).toBe(false)
  expect(ev?.detail?.missing).toContain('verification')
  // 引导护栏（S4 复审）：第一次不足声明触发 1 次引导 send（chatCount=5：goal/plan/write/不足/引导 send）；
  // 第二次不足声明（round5）后护栏生效不再 send——chatCount 停在 5（防回填死循环）
  expect(
    await page.evaluate(() => (window as unknown as { __nfChatCount: number }).__nfChatCount),
  ).toBe(5)
})

// S4 场景 1b：引导后模型重输出带证据声明 → 已解决卡出现（回填引导闭环）
test('S4-1b：回填引导 → 模型重输出带证据声明 → 已解决卡出现', async ({ page }) => {
  await installMockBridge(page, {
    project: 'none',
    script: compose(
      goalConfirm('完成待办应用'),
      planPropose(['/test/app.ts（核心）']),
      [[toolCall.write('/test/app.ts', 'x'), chunk.done()]],
      [
        [
          chunk.content('【已达成】\n完成了。\n遗留问题：\n- 无'), // 证据不足（第一轮）
          chunk.done(),
        ],
      ],
      [
        [
          // 引导 send 触发第二轮：带只读验证证据的完整声明 → verifyCompletion 通过 → 弹卡
          chunk.content('【已达成】\n完成。\n验证证据：\n- ls dist（通过）'),
          chunk.done(),
        ],
      ],
    ),
  })
  await startFromScratch(page, '做个待办应用')
  await expectVisible(page.getByRole('button', { name: '确认目标' }), 10000)
  await page.getByRole('button', { name: '确认目标' }).click()
  await expectVisible(page.getByRole('button', { name: '确认执行' }), 10000)
  await page.getByRole('button', { name: '确认执行' }).click()
  await expect(page.locator('.nf-toolcall--done')).toHaveCount(1, { timeout: 10000 })
  // 引导 → 模型重输出完整声明 → 已解决卡出现
  await expectVisible(page.getByRole('button', { name: '已解决' }), 15000)
})

// S4 场景 2：证据完整 + 系统复核通过 → 直接弹已解决卡（V1a mock 核验 ok:true——verify 调用计数锁定 V1a 生效）
test('S4-2：证据完整 + 系统复核通过 → 已解决卡出现（V1a 接线）', async ({ page }) => {
  await installMockBridge(page, {
    project: 'none',
    // extraInit 逃生舱：mock V1a 系统核验（extra 经 JSON 序列化丢函数——此处直接改 bridge）
    extraInit: `
      let verifyCount = 0
      window.__verifyCount = () => verifyCount
      bridge.completion = {
        verify: async (commands) => {
          verifyCount++
          return Object.fromEntries(commands.map((c) => [c, { ok: true, output: 'ok' }]))
        },
      }
    `,
    script: compose(
      goalConfirm('完成待办应用'),
      planPropose(['/test/app.ts（核心）']),
      [[toolCall.write('/test/app.ts', 'x'), chunk.done()]],
      [[chunk.content('【已达成】\n完成。\n验证证据：\n- ls dist（通过）'), chunk.done()]],
    ),
  })
  await startFromScratch(page, '做个待办应用')
  await expectVisible(page.getByRole('button', { name: '确认目标' }), 10000)
  await page.getByRole('button', { name: '确认目标' }).click()
  await expectVisible(page.getByRole('button', { name: '确认执行' }), 10000)
  await page.getByRole('button', { name: '确认执行' }).click()
  await expect(page.locator('.nf-toolcall--done')).toHaveCount(1, { timeout: 10000 })
  // 系统复核通过 → 已解决卡出现（不依赖引导）
  await expectVisible(page.getByRole('button', { name: '已解决' }), 15000)
  // V1a 真实生效：verify 被调用过（非纯逻辑路径）
  expect(
    await page.evaluate(() =>
      (window as unknown as { __verifyCount: () => number }).__verifyCount(),
    ),
  ).toBe(1)
})

// S4 场景 3：系统复核失败（模型自报 passed 被推翻）→ evidence_missing 打点 + 引导 → 重输出复核通过 → 卡出现
test('S4-3：系统复核失败推翻自报 → 不弹卡 + 引导 → 重输出复核通过 → 卡出现（V1a 拒绝侧）', async ({
  page,
}) => {
  await installMockBridge(page, {
    project: 'none',
    capture: { chatCount: true },
    // extraInit 逃生舱：timeline 捕获 + V1a mock（第一次复核失败、第二次通过——extra 经 JSON 序列化丢函数）
    extraInit: `
      const tlogs2 = []
      window.__tlogs2 = tlogs2
      bridge.timeline = { log: async (evt) => { tlogs2.push(evt) } }
      let verifyCount = 0
      window.__verifyCount2 = () => verifyCount
      bridge.completion = {
        verify: async (commands) => {
          verifyCount++
          const ok = verifyCount >= 2
          return Object.fromEntries(commands.map((c) => [c, { ok, output: ok ? 'ok' : '失败' }]))
        },
      }
    `,
    script: compose(
      goalConfirm('完成待办应用'),
      planPropose(['/test/app.ts（核心）']),
      [[toolCall.write('/test/app.ts', 'x'), chunk.done()]],
      [
        [
          // 自报 passed 但系统复核失败 → verifyCompletion missing → 不弹卡 + 引导
          chunk.content('【已达成】\n完成。\n验证证据：\n- ls dist（通过）'),
          chunk.done(),
        ],
      ],
      [
        [
          // 引导后重输出（再次自报）→ 第二次系统复核通过 → 弹卡
          chunk.content('【已达成】\n完成。\n验证证据：\n- ls dist（通过）'),
          chunk.done(),
        ],
      ],
    ),
  })
  await startFromScratch(page, '做个待办应用')
  await expectVisible(page.getByRole('button', { name: '确认目标' }), 10000)
  await page.getByRole('button', { name: '确认目标' }).click()
  await expectVisible(page.getByRole('button', { name: '确认执行' }), 10000)
  await page.getByRole('button', { name: '确认执行' }).click()
  await expect(page.locator('.nf-toolcall--done')).toHaveCount(1, { timeout: 10000 })
  // 引导后重输出 → 第二次复核通过 → 卡出现（第一次失败不弹卡的证据 = evidence_missing 打点）
  await expectVisible(page.getByRole('button', { name: '已解决' }), 15000)
  // evidence_missing 打点（第一次复核失败——missing 含 verification:ls dist）
  const tlogs = await page.evaluate(() => (window as unknown as { __tlogs2: unknown[] }).__tlogs2)
  const ev = tlogs.find((l) => (l as { type: string }).type === 'completion.evidence_missing') as
    { detail?: { ok?: boolean; missing?: string[] } } | undefined
  expect(ev).toBeTruthy()
  expect(ev?.detail?.ok).toBe(false)
  expect(ev?.detail?.missing).toContain('verification:ls dist')
  // 两次核验都发生（第一次失败 + 第二次通过——V1a 真实生效）
  expect(
    await page.evaluate(() =>
      (window as unknown as { __verifyCount2: () => number }).__verifyCount2(),
    ),
  ).toBe(2)
})
