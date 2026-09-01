// S3 renderer 接线场景（设计 §6 S3——卡渲染从 decisionContent 派生 + 方案卡/拒绝原因 UI）
// 场景：
//   1. 方案卡渲染 PlanProposal 三要素（文件清单含原因/关键假设/验证计划）
//   2. 拒绝原因收集（拒绝带 kind → 状态回退 + 模型收到方向）
//   3. 触发权切换：卡内容来自 decisionContent（pending 时唯一来源）
// 装配：MockBridge 工厂 + 场景装配器（T0 基建——旧基建 S3 迁移后本文件为新场景承载）
import { test, expect } from '@playwright/test'
import { installMockBridge, chunk, toolCall } from './mockBridge'
import {
  compose,
  goalConfirm,
  planPropose,
  planProposeWithApproval,
  startFromScratch,
  sendChat,
} from './scenarios'
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
    // D3 回归暴露的既有 flaky 修复：模型重提议延迟拉长（默认 50ms < Playwright 轮询间隔——
    // 「卡消失」窗口被压缩 → 断言等到的已是重提议后的卡；300ms 给消失窗口留足轮询时间）
    streamDelay: 300,
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

// D3（ADR-005）：PlannedFiles 权威下沉 main——恢复接线（load）+ 批准链（add）+ 任务边界重置（reset）
// 恢复窗口语义（ADR-005）：目标确认 = 任务边界（领域层清清单——铁律）——恢复价值窗口 = 未确认新目标前
// （刷新/重开同一会话）+ main 门控跨重启一致（syncPlanApprovedFromStore——L1 tools 门控测试承载）
test('D3-1：启动恢复接线——挂载时 planned-files:load 被调（main 权威→镜像）+ 主流程正常', async ({
  page,
}) => {
  await installMockBridge(page, {
    project: 'none',
    // main plannedFilesStore 持久化状态（模拟上次会话批准过——跨重启保留）
    plannedFiles: { files: ['/test/app.ts'], approved: true },
    // load/add 调用捕获（逃生舱——同作用域包装）
    extraInit: `
      window.__nfPlannedLoadCalls = 0
      window.__nfPlannedAddCalls = 0
      window.__nfPlannedAddArgs = []
      const origLoad = bridge.plannedFiles.load
      const origAdd = bridge.plannedFiles.add
      bridge.plannedFiles.load = async () => { window.__nfPlannedLoadCalls++; return origLoad() }
      bridge.plannedFiles.add = async (files) => { window.__nfPlannedAddCalls++; window.__nfPlannedAddArgs.push(files); return origAdd(files) }
    `,
    script: compose(
      goalConfirm('做一个待办应用'),
      planProposeWithApproval([{ path: '/test/app.ts', reason: '核心' }]),
      [toolCall.write('/test/app.ts'), chunk.done()],
    ),
  })
  await startFromScratch(page, '做个待办应用')
  // 主流程正常（目标确认 = 任务边界——恢复清单被领域层清空是正确语义；重新批准走 IPC）
  await expectVisible(page.getByRole('button', { name: '确认目标' }), 10000)
  await page.getByRole('button', { name: '确认目标' }).click()
  await expectVisible(page.getByRole('button', { name: '确认执行' }), 10000)
  await page.getByRole('button', { name: '确认执行' }).click()
  // 批准链走 IPC：planned-files:add 被调（main 权威同步——与 grantPlan 同清单）
  await expectVisible(page.getByRole('button', { name: '批准这批文件' }), 10000)
  await page.getByRole('button', { name: '批准这批文件' }).click()
  // 批准后写清单内文件 → 自动 done（无授权卡）——done 卡出现保证批准链已走完
  await expect(page.locator('.nf-toolcall--done')).toHaveCount(1, { timeout: 10000 })
  await expect(page.locator('.nf-toolcall--need-approval')).toHaveCount(0)
  // 恢复接线 + 批准链走 IPC：load 挂载时被调（main 权威→镜像——StrictMode 双挂载 ≥1）；
  // add 恰好一次（批准按钮单次点击 → 单次 add——main 权威同步）
  const counts = await page.evaluate(() => ({
    load: (window as unknown as { __nfPlannedLoadCalls?: number }).__nfPlannedLoadCalls ?? 0,
    add: (window as unknown as { __nfPlannedAddCalls?: number }).__nfPlannedAddCalls ?? 0,
  }))
  expect(counts.load).toBeGreaterThanOrEqual(1)
  expect(counts.add).toBe(1)
})

test('D3-2：任务边界重置——目标确认 → planned-files:reset 同步 main（批准事实不跨任务）', async ({
  page,
}) => {
  await installMockBridge(page, {
    project: 'none',
    // reset 调用捕获（逃生舱——同作用域包装）
    extraInit: `
      const origReset = bridge.plannedFiles.reset
      window.__nfPlannedResetCalls = 0
      bridge.plannedFiles.reset = async () => {
        window.__nfPlannedResetCalls++
        return origReset()
      }
    `,
    script: compose(goalConfirm('做一个待办应用'), planPropose(['/test/app.ts（核心）'])),
  })
  await startFromScratch(page, '做个待办应用')
  // 目标确认（goalSeq 0→1 = 任务边界 → ConversationPanel clearTrust → planned-files:reset 同步 main）
  await expectVisible(page.getByRole('button', { name: '确认目标' }), 10000)
  await page.getByRole('button', { name: '确认目标' }).click()
  // reset 已同步 main（权威清空——批准事实不跨任务；与既有 clearTrust→filesApprovedReset 语义一致）
  const resetCalls = await page.evaluate(
    () => (window as unknown as { __nfPlannedResetCalls?: number }).__nfPlannedResetCalls ?? 0,
  )
  expect(resetCalls).toBe(1)
  // 方案卡流程正常（重置后任务继续——新任务重新规划）
  await expectVisible(page.getByRole('button', { name: '确认执行' }), 10000)
})

// #7（ADR-006）：换目标重新确认——goal 已确认后模型输出新【目标确认】→ 仍弹目标卡
test('#7-1：goal 已确认后换目标 → 新【目标确认】弹目标卡 → 确认进入新任务', async ({ page }) => {
  await installMockBridge(page, {
    project: 'none',
    // streamDelay 拉长（同 S7-1）：方案卡先稳定完成、pending='plan' 就位后 sendChat——
    // 否则发消息时方案卡流式未完成 → 排队 → pending 未清 → chat3 到达时 pending 非 none → 不置卡
    streamDelay: 300,
    script: compose(
      goalConfirm('做一个待办应用'),
      planPropose(['/test/app.ts（核心）']),
      goalConfirm('换一个，做计算器'),
    ),
  })
  await startFromScratch(page, '做个待办应用')
  // 任务 1：确认目标 → 方案卡（goalConfirmed=true——然后用户换目标）
  await expectVisible(page.getByRole('button', { name: '确认目标' }), 10000)
  await page.getByRole('button', { name: '确认目标' }).click()
  await expectVisible(page.getByRole('button', { name: '确认执行' }), 10000)
  // 方案卡待确认时用户打字换目标 → 隐式 reject 旧方案（C2——新意图）→ 模型重提议目标
  await sendChat(page, '换个目标，做计算器')
  // #7 核心：goal 已确认（goalConfirmed=true）但新【目标确认】提议仍弹目标卡（ADR-006——换目标=新任务提议）
  await expectVisible(page.getByRole('button', { name: '确认目标' }), 15000)
  // 确认换目标 → 新任务边界（goalSeq 递增 = clearTrust/plannedFiles reset——用户确认 = 新任务开始）
  await page.getByRole('button', { name: '确认目标' }).click()
  // 确认后目标卡消失（新任务——不再弹同一卡），对话进入新任务流程（无遗漏卡）
  await expect(page.getByRole('button', { name: '确认目标' })).toHaveCount(0, { timeout: 10000 })
  await expect(page.getByRole('button', { name: '确认执行' })).toHaveCount(0) // 旧方案卡已 reject 消失——换目标后新任务重新提议
  await expectText(page.locator('.nf-statusbar'), '就绪', 8000)
})

// #7 误弹防御：goal 已确认后模型正常陈述（无【目标确认】标记）→ 不弹目标卡
test('#7-2：goal 已确认后模型正常推进（无标记）→ 不弹目标卡', async ({ page }) => {
  await installMockBridge(page, {
    project: 'none',
    script: compose(goalConfirm('做一个待办应用'), planPropose(['/test/app.ts（核心）'])),
    streamDelay: 300, // 拉长窗口——断言「不弹卡」需要足够检测间隔
  })
  await startFromScratch(page, '做个待办应用')
  await expectVisible(page.getByRole('button', { name: '确认目标' }), 10000)
  await page.getByRole('button', { name: '确认目标' }).click()
  // 正常流程：方案卡出现（goal 已确认——无【目标确认】标记 → 不弹目标卡——只走方案卡）
  await expectVisible(page.getByRole('button', { name: '确认执行' }), 10000)
  // 方案卡在（pending='plan'）——没有额外的目标卡（确认目标按钮 count=0）
  await expect(page.getByRole('button', { name: '确认目标' })).toHaveCount(0)
})

// V1.5 S2 A-017：同轮并存挂起（Spike-4 实证「同响应混合协议+普通工具」——deer-flow 兄弟调用丢弃语义）
// 协议工具与普通工具同轮到达：协议工具置 pending（弹确认卡等用户决策）→ 兄弟普通工具**挂起**
// （不执行、无授权卡——done + 引导文本「等确认后重试」）；确认后下一轮模型自然重试。
test('A-017-1：goal 协议工具与 read 同轮并存 → read 挂起不执行（无授权卡 + 结果引导重试）', async ({
  page,
}) => {
  await installMockBridge(page, {
    project: 'none',
    // 逃生舱：read execute 调用计数——断言 read 确实未执行（挂起=跳过副作用）
    extraInit: `
      let readExec = 0
      window.__readExec = () => readExec
      const origExec = bridge.tools.execute
      bridge.tools.execute = async (name, args, opts) => {
        if (name === 'read') readExec++
        return origExec(name, args, opts)
      }
    `,
    script: compose([
      // 同轮：propose_goal + read（Spike-4 实证形态——「先看文件再给目标」）
      [
        toolCall.proposeGoal('做一个待办应用', ['单用户本地使用']),
        toolCall.read('/test/app.ts'),
        chunk.done(),
      ],
    ]),
  })
  await startFromScratch(page, '做个待办应用')
  // 协议工具置 pending → 目标卡弹出
  await expectVisible(page.getByRole('button', { name: '确认目标' }), 10000)
  await expectText(page.locator('.nf-confirmcard'), '做一个待办应用', 5000)
  // 兄弟 read 挂起：不执行（无授权卡）——read 调用计数 0
  await expect(page.locator('.nf-toolcall--need-approval')).toHaveCount(0)
  await expect(
    await page.evaluate(() => (window as unknown as { __readExec: () => number }).__readExec()),
  ).toBe(0)
  // read 卡可见（done 状态——挂起结果文本引导模型等确认后重试）
  await expectText(page.locator('.nf-chat__list'), 'read 挂起', 5000)
  // 确认目标 → 卡消失（决策点走完——挂起不残留）
  await page.getByRole('button', { name: '确认目标' }).click()
  await expect(page.getByRole('button', { name: '确认目标' })).toHaveCount(0, { timeout: 10000 })
})

test('A-017-2：plan 协议工具与 write 同轮并存 → write 挂起（副作用工具同受挂起——不做白做）', async ({
  page,
}) => {
  await installMockBridge(page, {
    project: 'none',
    extraInit: `
      let writeExec = 0
      window.__writeExec = () => writeExec
      const origExec = bridge.tools.execute
      bridge.tools.execute = async (name, args, opts) => {
        if (name === 'write') writeExec++
        return origExec(name, args, opts)
      }
    `,
    script: compose(goalConfirm('做一个待办应用'), [
      // 同轮：propose_plan + write（goal 已确认——协议工具合法 pending:plan；write 是兄弟副作用）
      [
        toolCall.proposePlan('单文件落地首页', [{ path: '/test/app.ts', reason: '核心' }]),
        toolCall.write('/test/app.ts', 'x'),
        chunk.done(),
      ],
    ]),
  })
  await startFromScratch(page, '做个待办应用')
  await expectVisible(page.getByRole('button', { name: '确认目标' }), 10000)
  await page.getByRole('button', { name: '确认目标' }).click()
  // 协议工具置 pending → 方案卡弹出（三要素渲染）
  await expectVisible(page.getByRole('button', { name: '确认执行' }), 10000)
  await expectText(page.locator('.nf-confirmcard'), '/test/app.ts（核心）', 5000)
  // 兄弟 write 挂起：不执行（write 调用计数 0 + 无授权卡）
  await expect(
    await page.evaluate(() => (window as unknown as { __writeExec: () => number }).__writeExec()),
  ).toBe(0)
  await expect(page.locator('.nf-toolcall--need-approval')).toHaveCount(0)
  await expectText(page.locator('.nf-chat__list'), 'write 挂起', 5000)
  // 确认执行 → 挂起不残留
  await page.getByRole('button', { name: '确认执行' }).click()
  await expect(page.getByRole('button', { name: '确认执行' })).toHaveCount(0, { timeout: 10000 })
})

test('A-017-3：reject（乱序）协议工具与普通工具并存 → 普通工具不挂起（无决策点待确认——照常执行）', async ({
  page,
}) => {
  await installMockBridge(page, {
    project: 'none',
    extraInit: `
      let readExec = 0
      window.__readExec = () => readExec
      const origExec = bridge.tools.execute
      bridge.tools.execute = async (name, args, opts) => {
        if (name === 'read') readExec++
        return origExec(name, args, opts)
      }
    `,
    script: compose([
      // goal 未确认：propose_plan（reject——引导先 propose_goal）+ read（兄弟普通工具）
      [
        toolCall.proposePlan('单文件落地', [{ path: '/test/app.ts', reason: '核心' }]),
        toolCall.read('/test/app.ts'),
        chunk.done(),
      ],
    ]),
  })
  await startFromScratch(page, '做个待办应用')
  // 无目标卡（协议分支 reject——不置 pending）
  await expect(page.getByRole('button', { name: '确认目标' })).toHaveCount(0, { timeout: 10000 })
  // 协议工具 reject 文本回灌（引导先 propose_goal）
  await expectText(page.locator('.nf-chat__list'), 'propose_goal', 5000)
  // 兄弟 read 不挂起（reject 分支无决策点待确认——挂起标记只在 pending 分支置位）：
  // 照常执行（read 调用计数 1——只读在 goal 未确认时也放行；无授权卡）
  await expect(
    await page.evaluate(() => (window as unknown as { __readExec: () => number }).__readExec()),
  ).toBe(1)
  await expect(page.locator('.nf-toolcall--need-approval')).toHaveCount(0)
})

// V1.5 S2 Task 2.1：派生路径枚举断言（stage-spec r2 S2 DoD——工具路径 ↔ 文本路径字段级相等）
// 可执行判定（取代「行为一致」模糊表述）：goal 卡 statement/assumptions、plan 卡三要素
// （files/summary/assumptions）、resolution 卡 evidence+pendingQuestions——每条断言
// 「工具路径产出的 decisionContent 与文本路径字段级相等」（卡渲染组件零改动——同 decisionContent 派生）。
// 双通道并存断言：同一会话文本标记与工具调用先后出现 → 状态机无冲突（deriveDecisionPoint 现有优先级语义）。
test('V1.5-S2-1：goal 卡字段级相等——文本【目标确认】 vs 工具 propose_goal（statement/assumptions）', async ({
  page,
}) => {
  // 文本路径：消息含【目标确认：X】+ 关键假设 → goal 卡渲染 statement + assumptions
  await installMockBridge(page, {
    project: 'none',
    script: compose([
      [
        chunk.content(
          '好的。【目标确认：做一个待办清单应用】\n关键假设：\n- 用 React 实现\n- 数据存 localStorage',
        ),
        chunk.done(),
      ],
    ]),
  })
  await startFromScratch(page, '做个待办应用')
  await expectVisible(page.getByRole('button', { name: '确认目标' }), 10000)
  await expectText(page.locator('.nf-confirmcard'), '做一个待办清单应用', 5000)
  await expectText(page.locator('.nf-confirmcard'), '用 React 实现', 5000)
  await expectText(page.locator('.nf-confirmcard'), '数据存 localStorage', 5000)
})

test('V1.5-S2-1b：goal 卡字段级相等——工具 propose_goal 路径渲染 statement/assumptions 与文本路径一致', async ({
  page,
}) => {
  // 工具路径：propose_goal 调用（statement + assumptions）→ goal 卡渲染同字段
  await installMockBridge(page, {
    project: 'none',
    script: compose([
      [
        toolCall.proposeGoal('做一个待办清单应用', ['用 React 实现', '数据存 localStorage']),
        chunk.done(),
      ],
    ]),
  })
  await startFromScratch(page, '做个待办应用')
  await expectVisible(page.getByRole('button', { name: '确认目标' }), 10000)
  // 字段级相等：与文本路径（V1.5-S2-1）渲染完全一致（statement + assumptions 同内容）
  await expectText(page.locator('.nf-confirmcard'), '做一个待办清单应用', 5000)
  await expectText(page.locator('.nf-confirmcard'), '用 React 实现', 5000)
  await expectText(page.locator('.nf-confirmcard'), '数据存 localStorage', 5000)
})

test('V1.5-S2-2：plan 卡字段级相等——文本【执行方案】 vs 工具 propose_plan（files/summary/assumptions/verificationPlan）', async ({
  page,
}) => {
  // 文本路径：消息含【执行方案】块（文件清单/关键假设/验证计划）→ plan 卡三要素
  await installMockBridge(page, {
    project: 'none',
    script: compose(goalConfirm('做一个待办清单应用'), [
      [
        chunk.content(
          '【执行方案】\n- src/App.tsx（核心组件）\n- src/store.ts（状态管理）\n关键假设：\n- 使用 React 19\n- 不引入新依赖\n验证计划：\n- npx tsc --noEmit\n- npx vitest run',
        ),
        chunk.done(),
      ],
    ]),
  })
  await startFromScratch(page, '做个待办应用')
  await expectVisible(page.getByRole('button', { name: '确认目标' }), 10000)
  await page.getByRole('button', { name: '确认目标' }).click()
  await expectVisible(page.getByRole('button', { name: '确认执行' }), 10000)
  await expectText(page.locator('.nf-confirmcard'), 'src/App.tsx（核心组件）', 5000)
  await expectText(page.locator('.nf-confirmcard'), 'src/store.ts（状态管理）', 5000)
  await expectText(page.locator('.nf-confirmcard'), '使用 React 19', 5000)
  await expectText(page.locator('.nf-confirmcard'), '不引入新依赖', 5000)
  await expectText(page.locator('.nf-confirmcard'), 'npx tsc --noEmit', 5000)
  await expectText(page.locator('.nf-confirmcard'), 'npx vitest run', 5000)
})

test('V1.5-S2-2b：plan 卡字段级相等——工具 propose_plan 路径渲染三要素与文本路径一致', async ({
  page,
}) => {
  // 工具路径：propose_plan 调用（summary + files[{path,reason}] + assumptions + verification_plan）
  await installMockBridge(page, {
    project: 'none',
    script: compose(goalConfirm('做一个待办清单应用'), [
      [
        toolCall.proposePlan(
          '做一个待办清单应用',
          [
            { path: 'src/App.tsx', reason: '核心组件' },
            { path: 'src/store.ts', reason: '状态管理' },
          ],
          {
            assumptions: ['使用 React 19', '不引入新依赖'],
            verification_plan: ['npx tsc --noEmit', 'npx vitest run'],
          },
        ),
        chunk.done(),
      ],
    ]),
  })
  await startFromScratch(page, '做个待办应用')
  await expectVisible(page.getByRole('button', { name: '确认目标' }), 10000)
  await page.getByRole('button', { name: '确认目标' }).click()
  await expectVisible(page.getByRole('button', { name: '确认执行' }), 10000)
  // 字段级相等：与文本路径（V1.5-S2-2）渲染完全一致（files/summary/assumptions/verificationPlan）
  await expectText(page.locator('.nf-confirmcard'), 'src/App.tsx（核心组件）', 5000)
  await expectText(page.locator('.nf-confirmcard'), 'src/store.ts（状态管理）', 5000)
  await expectText(page.locator('.nf-confirmcard'), '使用 React 19', 5000)
  await expectText(page.locator('.nf-confirmcard'), '不引入新依赖', 5000)
  await expectText(page.locator('.nf-confirmcard'), 'npx tsc --noEmit', 5000)
  await expectText(page.locator('.nf-confirmcard'), 'npx vitest run', 5000)
})

test('V1.5-S2-3：resolution 卡字段级相等——文本【已达成】 vs 工具 report_completion（verification/pendingQuestions）', async ({
  page,
}) => {
  // 文本路径：消息含【已达成】块（验证证据/遗留问题）→ 已解决卡 evidence+pendingQuestions
  await installMockBridge(page, {
    project: 'none',
    script: compose(
      goalConfirm('完成待办应用'),
      planPropose(['/test/app.ts（核心）']),
      [[toolCall.write('/test/app.ts', 'x'), chunk.done()]],
      [
        [
          chunk.content(
            '【已达成】\n完成。\n验证证据：\n- ls dist（通过）\n遗留问题：\n- 移动端样式未验证',
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
  await expect(page.locator('.nf-toolcall--done')).toHaveCount(1, { timeout: 10000 })
  // 已解决卡出现（文本路径——验证证据可核验 → verifyThenResolve 通过）
  await expectVisible(page.getByRole('button', { name: '已解决' }), 15000)
  // 字段级相等（文本路径）：pendingQuestions 直接渲染断言（遗留问题——解决卡知情项）；
  // evidence.verification 经 verifyThenResolve 同一消费路径（字段映射 command/output/passed → 对账）——
  // 「已解决卡出现」即证据门通过（文本路径与工具路径消费同一 CompletionClaim 结构）
  await expectText(page.locator('.nf-confirmcard'), '移动端样式未验证', 5000)
})

test('V1.5-S2-3b：resolution 卡字段级相等——工具 report_completion 路径渲染与文本路径一致', async ({
  page,
}) => {
  // 工具路径：report_completion 调用（summary + verification[{command,output,passed}] + pending_questions）
  // 注意：verifyThenResolve 系统核验——mock V1a 复核通过（只读 ls 可代跑——默认 mock 核验 ok）
  await installMockBridge(page, {
    project: 'none',
    script: compose(
      goalConfirm('完成待办应用'),
      planPropose(['/test/app.ts（核心）']),
      [[toolCall.write('/test/app.ts', 'x'), chunk.done()]],
      [
        [
          toolCall.reportCompletion(
            '完成待办应用',
            [{ command: 'ls dist', output: 'app.js index.html', passed: true }],
            ['移动端样式未验证'],
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
  await expect(page.locator('.nf-toolcall--done')).toHaveCount(1, { timeout: 10000 })
  // 已解决卡出现（工具路径——verification 映射 evidence.verification → verifyThenResolve 通过）
  await expectVisible(page.getByRole('button', { name: '已解决' }), 15000)
  // 字段级相等：与文本路径（V1.5-S2-3）渲染完全一致（pendingQuestions 渲染；verification 经同一
  // verifyThenResolve 消费路径——工具映射 verification → evidence.verification 与文本解析结构对齐）
  await expectText(page.locator('.nf-confirmcard'), '移动端样式未验证', 5000)
})

test('V1.5-S2-4：双通道并存——同会话先文本标记后工具调用 → 状态机无冲突（deriveDecisionPoint 优先级）', async ({
  page,
}) => {
  // 同会话两通道先后出现：第一轮文本【目标确认】置 goal 卡（pending:goal）；
  // 用户确认后第二轮工具 propose_plan 置 plan 卡——决策点依次推进，无冲突
  await installMockBridge(page, {
    project: 'none',
    script: compose(
      // 文本通道：goal 提议
      [[chunk.content('好的。【目标确认：做一个待办应用】'), chunk.done()]],
      // 工具通道：plan 提议（goal 已确认——propose_plan 合法）
      [
        [
          toolCall.proposePlan('单文件落地', [{ path: '/test/app.ts', reason: '核心' }]),
          chunk.done(),
        ],
      ],
    ),
  })
  await startFromScratch(page, '做个待办应用')
  // 文本通道 goal 卡 → 确认
  await expectVisible(page.getByRole('button', { name: '确认目标' }), 10000)
  await page.getByRole('button', { name: '确认目标' }).click()
  // 工具通道 plan 卡（双通道并存——状态机无冲突，deriveDecisionPoint 优先级语义）
  await expectVisible(page.getByRole('button', { name: '确认执行' }), 10000)
  await expectText(page.locator('.nf-confirmcard'), '/test/app.ts（核心）', 5000)
  // 无残留冲突卡（目标卡已走完——不重复弹）
  await expect(page.getByRole('button', { name: '确认目标' })).toHaveCount(0)
  await page.getByRole('button', { name: '确认执行' }).click()
  await expect(page.getByRole('button', { name: '确认执行' })).toHaveCount(0, { timeout: 10000 })
})

test('V1.5-S2-4b：双通道并存（反序）——先工具后文本 → 状态机无冲突', async ({ page }) => {
  // 反序：第一轮工具 propose_goal 置 goal 卡；确认后第二轮文本【执行方案】置 plan 卡
  await installMockBridge(page, {
    project: 'none',
    script: compose(
      // 工具通道：goal 提议
      [[toolCall.proposeGoal('做一个待办应用'), chunk.done()]],
      // 文本通道：plan 提议（【执行方案】标记——goal 已确认）
      [[chunk.content('【执行方案】\n- /test/app.ts（核心）\n等你确认。'), chunk.done()]],
    ),
  })
  await startFromScratch(page, '做个待办应用')
  await expectVisible(page.getByRole('button', { name: '确认目标' }), 10000)
  await page.getByRole('button', { name: '确认目标' }).click()
  // 文本通道 plan 卡（反序并存——状态机无冲突）
  await expectVisible(page.getByRole('button', { name: '确认执行' }), 10000)
  await expectText(page.locator('.nf-confirmcard'), '/test/app.ts（核心）', 5000)
  await page.getByRole('button', { name: '确认执行' }).click()
  await expect(page.getByRole('button', { name: '确认执行' })).toHaveCount(0, { timeout: 10000 })
})

// V1.5 S2 Spec 轴（S2-Sp-3 补缺）：pending 冻结——工具路径置 pending 后状态机冻结
// （A0 §3.4「用户决策是下一状态唯一输入」——shouldStopContinuation 停续聊，模型不再自动调工具）；
// 用户确认后恢复（决策点走完——卡消失）。
test('V1.5-S2-5：工具路径 pending 冻结——propose_goal 置 pending 后模型停轮（不自动续聊）→ 确认后恢复', async ({
  page,
}) => {
  await installMockBridge(page, {
    project: 'none',
    capture: { chatCount: true },
    script: compose(
      // 工具路径 goal 提议 → pending:goal（冻结开始）
      [[toolCall.proposeGoal('做一个待办应用'), chunk.done()]],
    ),
  })
  await startFromScratch(page, '做个待办应用')
  // 目标卡弹出（工具路径 pending:goal）
  await expectVisible(page.getByRole('button', { name: '确认目标' }), 10000)
  // 冻结：pending 置位后模型不自动续聊（chatCount 停在 1——shouldStopContinuation 停；无第二轮 read 等）
  await page.waitForTimeout(1200)
  expect(
    await page.evaluate(() => (window as unknown as { __nfChatCount: number }).__nfChatCount),
  ).toBe(1)
  // 确认目标 → 冻结解除（卡消失——决策点走完）
  await page.getByRole('button', { name: '确认目标' }).click()
  await expect(page.getByRole('button', { name: '确认目标' })).toHaveCount(0, { timeout: 10000 })
})
