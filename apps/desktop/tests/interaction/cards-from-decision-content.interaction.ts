// S3 renderer 接线场景（设计 §6 S3——卡渲染从 decisionContent 派生 + 方案卡/拒绝原因 UI）
// 场景：
//   1. 方案卡渲染 PlanProposal 三要素（文件清单含原因/关键假设/验证计划）
//   2. 拒绝原因收集（拒绝带 kind → 状态回退 + 模型收到方向）
//   3. 触发权切换：卡内容来自 decisionContent（pending 时唯一来源）
// 装配：MockBridge 工厂 + 场景装配器（T0 基建——旧基建 S3 迁移后本文件为新场景承载）
import { test, expect } from '@playwright/test'
import { installMockBridge, chunk, toolCall } from './mockBridge'
import { compose, goalConfirm, planPropose, startFromScratch, sendChat } from './scenarios'
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

// S5 推进保障场景（设计 §6 S5 + §8.1 B 331——结构化提议/证据算推进——StuckDetector 不打断；纯文本承诺仍 escalate）
test('S5-1：结构化提议算推进——确认执行后模型连续输出【执行方案】修正不被打断（StuckDetector 对齐）', async ({
  page,
}) => {
  await installMockBridge(page, {
    project: 'none',
    script: compose(
      goalConfirm('做一个待办应用'),
      planPropose(['/test/app.ts（核心）']),
      // 确认执行后：模型不调工具，连续两轮输出结构化提议（方案修正——S5 推进维度）
      [
        [
          chunk.content(
            '【执行方案】\n- /test/app.ts（核心）\n- /test/store.ts（状态）\n修正一下。',
          ),
          chunk.done(),
        ],
        [
          chunk.content(
            '【执行方案】\n- /test/app.ts（核心）\n- /test/store.ts（状态）\n- /test/api.ts（接口）\n再补一个。',
          ),
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
  // 第一轮结构化提议（无工具）→ 不 escalate（用户手动催下一轮——sendChat 驱动）
  await page.waitForTimeout(2000)
  await expect(page.locator('.nf-chat__list')).not.toContainText('没有产出改动')
  await sendChat(page, '继续')
  // 第二轮提议 → 仍不 escalate（proposed 推进——停滞计数重置）
  await page.waitForTimeout(3000)
  await expect(page.locator('.nf-chat__list')).not.toContainText('没有产出改动')
  await expect(page.locator('.nf-chat__list')).not.toContainText('连续几轮')
})

test('S5-2：纯文本承诺不算推进——确认执行后模型连续 2 轮「马上改」→ escalate（只说不做保留——坑 79）', async ({
  page,
}) => {
  await installMockBridge(page, {
    project: 'none',
    // escalate 走 silent send（消息不渲染到对话）——断言用 timeline stuck.escalated 打点
    extraInit: `
      const tlogs5 = []
      window.__tlogs5 = tlogs5
      bridge.timeline = { log: async (evt) => { tlogs5.push(evt) } }
    `,
    script: compose(
      goalConfirm('做一个待办应用'),
      planPropose(['/test/app.ts（核心）']),
      // 确认执行后：模型只输出纯文本承诺（无结构化提议/无工具）——「只说不做」
      [
        [chunk.content('我马上就去改，稍等一下。'), chunk.done()],
        [chunk.content('这就动手，别急。'), chunk.done()],
      ],
    ),
  })
  await startFromScratch(page, '做个待办应用')
  await expectVisible(page.getByRole('button', { name: '确认目标' }), 10000)
  await page.getByRole('button', { name: '确认目标' }).click()
  await expectVisible(page.getByRole('button', { name: '确认执行' }), 10000)
  await page.getByRole('button', { name: '确认执行' }).click()
  // 第一轮纯文本承诺 → 停滞计数累积（不 escalate——首轮 no-progress）
  await page.waitForTimeout(2000)
  await expect(page.locator('.nf-chat__list')).not.toContainText('没有产出改动')
  await sendChat(page, '继续')
  // 第二轮承诺 → escalate（连续 2 轮无推进——stuck.escalated 打点；silent send 不渲染对话文本）
  await expect
    .poll(
      async () =>
        (
          await page.evaluate(
            () => (window as unknown as { __tlogs5: Array<{ type: string }> }).__tlogs5,
          )
        ).filter((l) => l.type === 'stuck.escalated').length,
      { timeout: 10000 },
    )
    .toBe(1)
})

// S6 门控双维场景（设计 §6 S6 + 拍板 3——curl localhost 自动放行/外网 ask；main preApproval 同步放行）
test('S6-1：curl localhost GET 自动放行（拍板 3——main preApproval 同步——无授权卡）', async ({
  page,
}) => {
  await installMockBridge(page, {
    project: 'none',
    script: compose(goalConfirm('做一个待办应用'), planPropose(['/test/app.ts（核心）']), [
      [toolCall.bash('curl -s http://localhost:5188/'), chunk.done()],
    ]),
  })
  await startFromScratch(page, '做个待办应用')
  await expectVisible(page.getByRole('button', { name: '确认目标' }), 10000)
  await page.getByRole('button', { name: '确认目标' }).click()
  await expectVisible(page.getByRole('button', { name: '确认执行' }), 10000)
  await page.getByRole('button', { name: '确认执行' }).click()
  // curl localhost（network-read + localhost）→ 自动放行（done 无授权卡）
  await expect(page.locator('.nf-toolcall--done')).toHaveCount(1, { timeout: 10000 })
  await expect(page.locator('.nf-toolcall--need-approval')).toHaveCount(0)
})

test('S6-2：外网 curl GET → ask 弹授权卡（拍板 3——安全默认——需用户批准）', async ({ page }) => {
  await installMockBridge(page, {
    project: 'none',
    // main preApproval 模拟（L1 tools.test.ts 已锁 isReadOnlyBash 外网 false——此处 UI 层验证 ask 路径）
    executeResults: {
      bash: {
        ok: false,
        needApproval: true,
        error: '「bash」需要授权（L3）——approved=true 后执行',
      },
    },
    script: compose(goalConfirm('做一个待办应用'), planPropose(['/test/app.ts（核心）']), [
      [toolCall.bash('curl -s https://example.com'), chunk.done()],
    ]),
  })
  await startFromScratch(page, '做个待办应用')
  await expectVisible(page.getByRole('button', { name: '确认目标' }), 10000)
  await page.getByRole('button', { name: '确认目标' }).click()
  await expectVisible(page.getByRole('button', { name: '确认执行' }), 10000)
  await page.getByRole('button', { name: '确认执行' }).click()
  // 外网 curl（network-read 非 localhost）→ ask（need-approval 授权卡——安全默认）
  await expect(page.locator('.nf-toolcall--need-approval')).toHaveCount(1, { timeout: 10000 })
})

// S7（A0 审校 P1-5 接入——设计 §3.4 C2）：pending 期用户自由文本 = 隐式拒绝当前决策点
test('S7-1：方案卡待确认时用户直接打字 → 卡消失 + 模型收到新意图（隐式 reject——C2）', async ({
  page,
}) => {
  await installMockBridge(page, {
    project: 'none',
    script: compose(
      goalConfirm('做一个待办应用'),
      // 方案确认前用户打字（pending='plan' 期间）→ 隐式 reject → 模型重提议方案
      planPropose(['/test/app.ts（核心）']),
      planPropose(['/test/store.ts（状态）']),
    ),
  })
  await startFromScratch(page, '做个待办应用')
  await expectVisible(page.getByRole('button', { name: '确认目标' }), 10000)
  await page.getByRole('button', { name: '确认目标' }).click()
  // 方案卡出现（pending='plan'）
  await expectVisible(page.getByRole('button', { name: '确认执行' }), 10000)
  // pending 期用户直接打字（不点按钮）——隐式 reject（C2——direction + 新意图文本）
  await sendChat(page, '换个思路，做桌面版')
  // 卡消失（隐式拒绝——pending 清除 + dcKind 清）
  await expect(page.getByRole('button', { name: '确认执行' })).toHaveCount(0, { timeout: 10000 })
  // 模型下一轮重提议（chat4 消费第二个 planPropose）→ 方案卡重现
  await expectVisible(page.getByRole('button', { name: '确认执行' }), 15000)
  await expectText(page.locator('.nf-chat__list'), '/test/store.ts（状态）', 5000)
})

// S7（C2 完善——e2e-0to1 场景 B 暴露）：pending 期确认文本 → 自动确认（等价点按钮）
test('S7-2：方案卡待确认时用户打字「行，按这个方案来」→ 自动确认（不弹拒绝——确认文本分流）', async ({
  page,
}) => {
  await installMockBridge(page, {
    project: 'none',
    script: compose(
      goalConfirm('做一个待办应用'),
      planPropose(['/test/app.ts（核心）']),
      // 自动确认后模型继续（写文件——清单内放行）
      [[toolCall.write('/test/app.ts', 'x'), chunk.done()]],
    ),
  })
  await startFromScratch(page, '做个待办应用')
  await expectVisible(page.getByRole('button', { name: '确认目标' }), 10000)
  await page.getByRole('button', { name: '确认目标' }).click()
  await expectVisible(page.getByRole('button', { name: '确认执行' }), 10000)
  // 确认文本（非按钮）——自动确认方案（等价点「确认执行」）
  await sendChat(page, '行，按这个方案来，你写吧')
  // 方案自动确认 → 模型继续写（清单内放行——done）
  await expect(page.locator('.nf-toolcall--done')).toHaveCount(1, { timeout: 10000 })
  await expect(page.locator('.nf-toolcall--need-approval')).toHaveCount(0)
})

test('S7-3：授权卡待批时用户打字「批准」→ 自动批准（approval 文本批准——明确批准词）', async ({
  page,
}) => {
  await installMockBridge(page, {
    project: 'none',
    // bash 需授权（approval 卡）
    executeResults: {
      bash: {
        ok: false,
        needApproval: true,
        error: '「bash」需要授权（L3）——approved=true 后执行',
      },
    },
    script: compose(goalConfirm('做一个待办应用'), planPropose(['/test/app.ts（核心）']), [
      [toolCall.bash('npm install three'), chunk.done()],
    ]),
  })
  await startFromScratch(page, '做个待办应用')
  await expectVisible(page.getByRole('button', { name: '确认目标' }), 10000)
  await page.getByRole('button', { name: '确认目标' }).click()
  await expectVisible(page.getByRole('button', { name: '确认执行' }), 10000)
  await page.getByRole('button', { name: '确认执行' }).click()
  // bash 授权卡出现
  await expect(page.locator('.nf-toolcall--need-approval')).toHaveCount(1, { timeout: 10000 })
  // 用户打字「批准」→ 自动批准（approval 文本确认）
  await sendChat(page, '批准')
  await expect(page.locator('.nf-toolcall--need-approval')).toHaveCount(0, { timeout: 10000 })
})
