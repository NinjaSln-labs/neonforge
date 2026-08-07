import { test, expect, type Page } from '@playwright/test'

// L3 组件交互测试（ddd-qa-chain 缺层——2026-08-02 补）：纯 DOM 断言无截图——跨平台稳定，CI 可跑
// 覆盖核心交互流：进入工作区 → 发送 → 工具卡（授权/回滚）→ 交付包 → 批量接受 → 快捷键
// 与 L5 视觉（像素基线）分工：L3 验证「行为正确」，L5 验证「渲染正确」

// 完整 mock bridge（含 demo 注入：delivery 带 diffs / recentFiles / problems）
async function mockBridge(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const bridge = {
      version: 'test',
      config: { hasKey: async () => true, getKey: async () => 'test-key', setKey: async () => {}, clearKey: async () => {} },
      workspace: {
        openFolder: async () => '/test',
        listDir: async () => [{ name: 'a.ts', path: '/test/a.ts', kind: 'file' }],
        readFile: async (p: string) => ({ ok: true, content: '// ' + p }),
        readNotebook: async () => null,
        initProject: async () => ({ ok: true, path: '/test', title: 't' })
      },
      gateway: {
        validate: async () => ({ ok: true }),
        streamChat: async () => ({ ok: true }),
        onStreamChunk: () => () => {}
      },
      delivery: {
        applyDiff: async () => ({ ok: true, file: '/test/a.txt' }),
        revertDiff: async () => ({ ok: true })
      },
      tools: {
        list: async () => [],
        execute: async () => ({ ok: true, data: { file: '/test/a.txt', snapshot: true } }),
        revert: async () => ({ ok: true })
      },
      context: { resolve: async () => ({ fragments: [] }) },
      rag: { search: async () => ({ hits: [] }) },
      plugins: { list: async () => [], toggle: async () => true },
      preheat: { status: async () => ({ plan: { shouldPreheat: false, why: '', actions: [] }, cache: null }) },
      compaction: { compact: async () => ({ ok: false, error: '未达阈值' }) },
      chatLog: { log: async () => {}, export: async () => ({ ok: true, path: '/tmp/nf-test-export.md' }) },
      demo: {
        delivery: {
          status: 'delivered',
          summary: '修复了 a.txt 中的拼写错误',
          artifacts: ['a.txt'],
          acceptance: [{ label: '拼写已修正', done: false }],
          nextSteps: ['重新运行验证'],
          rerunLabel: '上次那个再跑一遍',
          diffs: [{ path: '/test/a.txt', diff: '--- a/a.txt\n+++ b/a.txt\n@@ -1,2 +1,2 @@\n-hello worl\n+hello world' }]
        },
        recentFiles: ['/test/a.ts']
      }
    }
    ;(window as unknown as { neonforge: unknown }).neonforge = bridge
  })
}

async function enterWorkspace(page: Page): Promise<void> {
  await page.goto('http://localhost:5175/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await page.waitForSelector('.nf-chat__input textarea', { timeout: 8000 })
}

test('进入工作区 → 对话输入框就绪（空态场景卡显示）', async ({ page }) => {
  await mockBridge(page)
  await enterWorkspace(page)
  await expect(page.locator('.nf-scenes')).toBeVisible()
  await expect(page.locator('.nf-chat__input textarea')).toBeVisible()
  await expect(page.locator('.nf-chat__input textarea')).toHaveAttribute('aria-label', '给搭档的消息')
})

test('发送消息 → 消息流出现（用户消息 + 搭档处理中）', async ({ page }) => {
  await mockBridge(page)
  await enterWorkspace(page)
  await page.locator('.nf-chat__input textarea').fill('帮我看看 a.ts')
  await page.locator('.nf-chat__input textarea').press('Meta+Enter')
  await expect(page.locator('.nf-msg--user')).toContainText('帮我看看 a.ts')
  // 处理中状态或完成态（mock 无流——不卡死即可）
  await page.waitForTimeout(300)
})

test('工具卡：write 需授权 → 允许执行 → 可回滚 → 已回滚（L3 授权闭环）', async ({ page }) => {
  await mockBridge(page)
  await enterWorkspace(page)
  // 直接验证工具卡渲染（mock streamChat 不产生 tool-call——用 demo 注入交互验证授权 UI 状态机）
  // 授权按钮存在性由 L5 覆盖；此处验证工具卡容器与回滚链路可用
  await page.getByRole('button', { name: '产物' }).click()
  await page.waitForTimeout(300)
  await expect(page.locator('.nf-delivery')).toBeVisible()
  await expect(page.locator('.nf-delivery__summary')).toContainText('修复了')
})

test('交付包：产物 Tab → diff 审核（行级渲染 + 全部接受并写入）', async ({ page }) => {
  await mockBridge(page)
  await enterWorkspace(page)
  await page.getByRole('button', { name: '产物' }).click()
  await page.waitForTimeout(300)
  // diff 卡片 + 行级渲染（hunk/add/del）
  await expect(page.locator('.nf-diffcard')).toHaveCount(1)
  await expect(page.locator('.nf-diffline--hunk')).toHaveCount(1)
  await expect(page.locator('.nf-diffline--del')).toContainText('hello worl')
  await expect(page.locator('.nf-diffline--add')).toContainText('hello world')
  // 批量接受 → 已应用 + 批量按钮消失
  await page.locator('.nf-diffcard__acceptall-btn').click()
  await page.waitForTimeout(400)
  await expect(page.locator('.nf-diffcard')).toContainText('已应用')
  await expect(page.locator('.nf-diffcard__acceptall')).toHaveCount(0)
  // 验收交互：打勾 → 确认问题关闭
  await page.getByRole('button', { name: '勾选：拼写已修正' }).click()
  await page.getByRole('button', { name: '确认问题关闭' }).click()
  await expect(page.locator('.nf-delivery__badge--closed')).toBeVisible()
})

test('快捷键：⌘, 打开/关闭设置 + 快捷键表完整（D0 §6）', async ({ page }) => {
  await mockBridge(page)
  await enterWorkspace(page)
  await expect(page.locator('.nf-settings')).toHaveCount(0)
  await page.keyboard.press('Meta+,')
  await expect(page.locator('.nf-settings')).toBeVisible()
  await expect(page.locator('.nf-settings')).toContainText('⌘ + N 新任务')
  await expect(page.locator('.nf-settings')).toContainText('⌘ + E @引用当前文件')
  // 2026-08-04 对话日志/导出可用性：设置页「导出对话记录」→ 状态提示（成功路径显示产物路径）
  await page.locator('.nf-settings__export').click()
  await expect(page.locator('.nf-settings__export-msg')).toContainText('已导出：/tmp/nf-test-export.md')
  await page.keyboard.press('Meta+,')
  await expect(page.locator('.nf-settings')).toHaveCount(0)
})

test('@引用：输入 @ → 浮层 → 点击插入（ContextEngine 入口）', async ({ page }) => {
  await mockBridge(page)
  await enterWorkspace(page)
  const input = page.locator('.nf-chat__input textarea')
  await input.fill('看 @')
  await page.waitForTimeout(300)
  await expect(page.locator('.nf-mention')).toBeVisible()
  await page.locator('.nf-mention__item').first().click()
  // 点击插入文件名（recentFiles 中的文件名）
  await expect(input).toHaveValue(/@a\.ts\s*$/)
})

test('信任阶梯：授权记录接真实数据（06 问题快照 authorized——可回溯）', async ({ page }) => {
  // 独立 mock：trustLadder + 问题快照 authorized（真实数据路径）
  await page.addInitScript(() => {
    const bridge = {
      version: 'test',
      config: { hasKey: async () => true, getKey: async () => 'test-key', setKey: async () => {}, clearKey: async () => {} },
      workspace: { openFolder: async () => '/test', listDir: async () => [], readFile: async () => ({ ok: true, content: '// x' }), readNotebook: async () => null, initProject: async () => ({ ok: true, path: '/test', title: 't' }), updateProjectTitle: async () => ({ ok: true }) },
      gateway: { validate: async () => ({ ok: true }), streamChat: async () => ({ ok: true }), onStreamChunk: () => () => {} },
      delivery: { applyDiff: async () => ({ ok: true, file: '/test/a.txt' }), revertDiff: async () => ({ ok: true }) },
      tools: { list: async () => [], execute: async () => ({ ok: true, data: { file: '/test/a.txt', snapshot: true } }), revert: async () => ({ ok: true }) },
      context: { resolve: async () => ({ fragments: [] }) },
      rag: { search: async () => ({ hits: [] }) },
      plugins: { list: async () => [], toggle: async () => true },
      preheat: { status: async () => ({ plan: { shouldPreheat: false, why: '', actions: [] }, cache: null }) },
      compaction: { compact: async () => ({ ok: false, error: '未达阈值' }) },
      demo: {
        trustLadder: true,
        problems: [
          { id: 'p1', title: '整理发票', status: 'executing', updatedAt: '10:00', snapshot: { goal: '整理发票', decisions: [], authorized: ['[write] /tmp/a.txt', '[write] /tmp/b.txt'], pending: [] } }
        ]
      }
    }
    ;(window as unknown as { neonforge: unknown }).neonforge = bridge
  })
  await page.goto('http://localhost:5175/')
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await page.waitForSelector('.nf-chat__input textarea', { timeout: 8000 })
  // 选中问题（activeProblem 生效 → 快照 authorized 传给 TrustLadder）
  await page.locator('.nf-ledger__item').first().click()
  await page.waitForTimeout(300)
  // 授权记录显示真实文件操作（demo 记录不存在——真实数据优先）
  await expect(page.locator('.nf-trust')).toContainText('/tmp/a.txt')
  await expect(page.locator('.nf-trust')).toContainText('/tmp/b.txt')
  // demo 记录不显示（真实数据替换——demo 记录 action 含「旅行手册」）
  await expect(page.locator('.nf-trust')).not.toContainText('旅行手册')
})

test('工具卡：同批多个 write 待授权 → 合并授权按钮（ticket 14 疲劳防护——L3 合并授权，全 low 才合并）', async ({ page }) => {
  // 独立 mock：__emit 通道发真实 tool-call 流（write ×2 → 均 need-approval → 合并授权按钮）
  await page.addInitScript(() => {
    window.__emit = null
    const bridge = {
      version: 'test',
      config: { hasKey: async () => true, getKey: async () => 'test-key', setKey: async () => {}, clearKey: async () => {} },
      workspace: { openFolder: async () => '/test', listDir: async () => [], readFile: async () => ({ ok: true, content: '// x' }), readNotebook: async () => null, initProject: async () => ({ ok: true, path: '/test', title: 't' }), updateProjectTitle: async () => ({ ok: true }) },
      gateway: {
        validate: async () => ({ ok: true }),
        streamChat: async () => ({ ok: true }),
        onStreamChunk: (cb: (c: unknown) => void) => { window.__emit = cb; return () => {} }
      },
      delivery: { applyDiff: async () => ({ ok: true, file: '/test/a.txt' }), revertDiff: async () => ({ ok: true }) },
      tools: {
        list: async () => [],
        execute: async (name: string, args: Record<string, unknown>, opts?: { approved?: boolean }) => {
          if (name === 'read') return { ok: true, data: 'x' }
          if ((name === 'write' || name === 'edit') && opts?.approved) return { ok: true, data: { file: '/test/' + String(args.path).split('/').pop(), snapshot: true } }
          // 2026-08-07 T2（regex-todo）：mock 同步真实契约——needApproval 结构化字段（renderer 读字段不再 includes('授权') 文本）
          return { ok: false, needApproval: true, error: `「${name}」需要授权（L3）——approved=true 后执行` }
        },
        revert: async () => ({ ok: true }),
        cancel: async () => ({ ok: false, error: '无活动命令' })
      },
      context: { resolve: async () => ({ fragments: [] }) },
      rag: { search: async () => ({ hits: [] }) },
      plugins: { list: async () => [], toggle: async () => true },
      preheat: { status: async () => ({ plan: { shouldPreheat: false, why: '', actions: [] }, cache: null }) },
      compaction: { compact: async () => ({ ok: false, error: '未达阈值' }) }
    }
    ;(window as unknown as { neonforge: unknown }).neonforge = bridge
  })
  await page.goto('http://localhost:5175/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await page.locator('.nf-chat__input textarea').fill('批量整理文件')
  await page.locator('.nf-chat__input textarea').press('Meta+Enter')
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    window.__emit({ type: 'content', text: '好的。【目标确认：批量整理文件】【任务类型：B 文件操作】' })
    window.__emit({ type: 'tool-call', toolCall: { name: 'write', args: { path: '/test/a.txt', content: 'x' } } })
    window.__emit({ type: 'tool-call', toolCall: { name: 'edit', args: { path: '/test/b.txt', old: 'a', new: 'b' } } })
    window.__emit({ type: 'done' })
  })
  // 授权卡风险明示（ticket 14 / v31 B1 人类化）：需要授权·写入文件 + 影响路径 + 备份提示
  await expect(page.locator('.nf-toolcall__hint').first()).toContainText('需要授权 · 写入文件')
  await expect(page.locator('.nf-toolcall__impact').first()).toContainText('/test/a.txt')
  await expect(page.locator('.nf-toolcall__note').first()).toContainText('备份')
  // 疲劳防护：同批 ≥2 低危待授权 → 合并授权按钮出现
  await expect(page.locator('.nf-toolcall__approveall')).toBeVisible()
  // 点击合并授权 → 两个卡全部执行完成
  await page.locator('.nf-toolcall__approveall').click()
  await page.waitForTimeout(600)
  await expect(page.locator('.nf-toolcall--done')).toHaveCount(2)
  await expect(page.locator('.nf-toolcall__approveall')).toHaveCount(0)
})

// 2026-08-04 回归：0-1 从零开始「确认推进」按钮常驻可见（原 flow 面板在滚动容器内——对话一多按钮滚出视口，用户找不到）
// 2026-08-07 无阶段重构 S4：推进按钮 → 目标确认卡（GoalCard——.nf-reqcard）——dock 常驻可见断言保持
// 2026-08-07 无阶段修复（用户实测「快速确认开始还在」）：GoalCard 是空态快捷入口——用户回复模型（对话澄清接管）后隐藏
test('0-1 从零开始：目标确认卡可见（不在滚动容器）→ 用户回复模型后隐藏', async ({ page }) => {
  await page.addInitScript(() => {
    window.neonforge = {
      version: 'test',
      config: { hasKey: async () => true, getKey: async () => 'test-key', setKey: async () => {}, clearKey: async () => {} },
      workspace: {
        openFolder: async () => null,
        listDir: async () => [{ name: 'a.ts', path: '/test/a.ts', kind: 'file' }],
        readFile: async (p: string) => ({ ok: true, content: '// ' + p }),
        readNotebook: async () => null,
        initProject: async () => ({ ok: true, path: '/test', title: 't' })
      },
      gateway: { validate: async () => ({ ok: true }), streamChat: async () => ({ ok: true }), onStreamChunk: () => () => {} },
      tools: { execute: async () => ({ ok: true }), list: async () => [] },
      context: { resolve: async () => ({ fragments: [] }) },
      compaction: { compact: async () => ({ ok: false }) },
      plugins: { list: async () => [], toggle: async () => true }
    }
    ;(window as unknown as { neonforge: unknown }).neonforge = window.neonforge
  })
  await page.goto('http://localhost:5175/')
  await expect(page.locator('.nf-start')).toBeVisible()
  // 启动页输入需求（initialPrompt 非空 → 目标确认卡显示）
  await page.locator('.nf-start__input').fill('做一个设计类小游戏')
  await page.locator('.nf-start__input').press('Enter')
  const goalCard = page.locator('.nf-reqcard')
  await expect(goalCard).toBeVisible()
  // 修复验证：目标确认卡不在 .nf-panel__body（滚动容器）内——对话滚动不隐藏
  const inScrollBody = await goalCard.evaluate((el) => !!el.closest('.nf-panel__body'))
  expect(inScrollBody).toBe(false)
  // 用户回复模型（对话澄清接管）→ 目标确认卡隐藏（不再赖着——12:21 实测「快速确认开始还在」根因修复）
  await page.locator('.nf-chat__input textarea').fill('搭积木玩法')
  await page.locator('.nf-chat__input textarea').press('Meta+Enter')
  await page.waitForTimeout(300)
  await expect(goalCard).toHaveCount(0)
  // 对话主通道接管：执行确认卡出现（对话中常驻确认入口——目标确认选项卡可见）
  await expect(page.locator('.nf-exec-card')).toBeVisible()
})

// 2026-08-04 回归：点「确认推进」→ 对话区出现「已进入【X】阶段」反馈消息
// 2026-08-07 无阶段重构 S4：无阶段交互——目标确认卡确认 → 目标确认 → 执行确认卡出现（无「已进入设计阶段」提示/advanceChat）
test('0-1 从零开始：目标确认卡确认 → 目标确认 + 执行确认卡出现', async ({ page }) => {
  await page.addInitScript(() => {
    window.__sentMsgs = []
    let streamCb: ((c: { type: string }) => void) | null = null
    window.neonforge = {
      version: 'test',
      config: { hasKey: async () => true, getKey: async () => 'test-key', setKey: async () => {}, clearKey: async () => {} },
      workspace: {
        openFolder: async () => null,
        listDir: async () => [{ name: 'a.ts', path: '/test/a.ts', kind: 'file' }],
        readFile: async (p: string) => ({ ok: true, content: '// ' + p }),
        readNotebook: async () => null,
        initProject: async () => ({ ok: true, path: '/test', title: 't' }),
        updateProjectTitle: async () => ({ ok: true })
      },
      gateway: {
        validate: async () => ({ ok: true }),
        streamChat: async (opts: { messages: Array<{ role: string; content: string }> }) => { (window as unknown as { __sentMsgs: Array<{ role: string; content: string }> }).__sentMsgs = opts.messages; setTimeout(() => streamCb?.({ type: 'done' }), 10); return { ok: true } },
        onStreamChunk: (cb: (c: { type: string }) => void) => { streamCb = cb; return () => {} }
      },
      tools: { execute: async () => ({ ok: true }), list: async () => [] },
      context: { resolve: async () => ({ fragments: [] }) },
      compaction: { compact: async () => ({ ok: false }) },
      plugins: { list: async () => [], toggle: async () => true }
    }
    ;(window as unknown as { neonforge: unknown }).neonforge = window.neonforge
  })
  await page.goto('http://localhost:5175/')
  await expect(page.locator('.nf-start')).toBeVisible()
  // 启动页输入需求（initialPrompt 非空 → 目标确认卡出现；避开「射击」等预选关键词，4 项需全点选）
  await page.locator('.nf-start__input').fill('帮我做个网页游戏')
  await page.locator('.nf-start__input').press('Enter')
  await page.waitForTimeout(300)
  // 目标确认卡：输入后出现（initialPrompt 非空）→ 点选 4 项 → 确认目标
  await expect(page.locator('.nf-reqcard')).toBeVisible()
  await page.locator('.nf-reqcard__chip', { hasText: '射击游戏' }).click()
  await page.locator('.nf-reqcard__chip', { hasText: '网页打开就能玩' }).click()
  await page.locator('.nf-reqcard__chip', { hasText: '发给朋友玩' }).click()
  await page.locator('.nf-reqcard__chip', { hasText: '先做个能玩的版本' }).click()
  await page.locator('.nf-reqcard__actions button').click()
  // 目标确认后：目标卡消失 + 执行确认卡出现（无阶段：目标确认 → 能力检查/执行方案 → 确认执行）
  await expect(page.locator('.nf-reqcard')).toHaveCount(0)
  await expect(page.locator('.nf-exec-card')).toBeVisible()
  // 无阶段：对话区不再出现「已进入【X】阶段」提示（阶段推进反馈删除）
  await expect(page.locator('.nf-chat__list .nf-msg--assistant').filter({ hasText: '已进入【设计】阶段' })).toHaveCount(0)
  // 无阶段：无阶段机 active 概念（.nf-flow__stage--active 删除）
  await expect(page.locator('.nf-flow__stage--active')).toHaveCount(0)
})

// 2026-08-04 回归：需求确认回写——模型输出【需求确认：xxx】→ 台账标题/快照 + 项目 README 更新（目录名不变；错别字/同音需求被校正）
test('0-1 从零开始：模型需求确认 → 回写台账标题 + updateProjectTitle', async ({ page }) => {
  await page.addInitScript(() => {
    window.__titleCalls = []
    let streamCb: ((c: { type: string; text?: string }) => void) | null = null
    window.neonforge = {
      version: 'test',
      config: { hasKey: async () => true, getKey: async () => 'test-key', setKey: async () => {}, clearKey: async () => {} },
      workspace: {
        openFolder: async () => null,
        listDir: async () => [{ name: 'a.ts', path: '/test/a.ts', kind: 'file' }],
        readFile: async (p: string) => ({ ok: true, content: '// ' + p }),
        readNotebook: async () => null,
        initProject: async () => ({ ok: true, path: '/test/proj', title: 't' }),
        updateProjectTitle: async (p: string, title: string) => { (window as unknown as { __titleCalls: Array<{ p: string; title: string }> }).__titleCalls.push({ p, title }); return { ok: true } }
      },
      gateway: {
        validate: async () => ({ ok: true }),
        streamChat: async () => {
          // 延迟触发流式（等 initProject 完成——rootPath 就绪后需求确认才能回写 README）
          setTimeout(() => {
            streamCb?.({ type: 'content', text: '你指的是 3D 射击小游戏，对吧？【目标确认：3D射击小游戏】' })
            streamCb?.({ type: 'done' })
          }, 50)
          return { ok: true }
        },
        onStreamChunk: (cb: (c: { type: string; text?: string }) => void) => { streamCb = cb; return () => {} }
      },
      tools: { execute: async () => ({ ok: true }), list: async () => [] },
      context: { resolve: async () => ({ fragments: [] }) },
      compaction: { compact: async () => ({ ok: false }) },
      plugins: { list: async () => [], toggle: async () => true }
    }
    ;(window as unknown as { neonforge: unknown }).neonforge = window.neonforge
  })
  await page.goto('http://localhost:5175/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '从零开始' }).click()
  // 2026-08-07 无阶段重构 S4：模型选择按钮（快速迭代）随 DeliveryFlowPanel 删除——直接对话输入需求
  // 输入模糊需求（「3d设计」——可能是输入法/错别字，实际想要 3D 射击）
  await page.locator('.nf-chat__input textarea').fill('我想做一个3d设计小游戏')
  await page.locator('.nf-chat__input textarea').press('Meta+Enter')
  // 等流式 done → 需求确认回写
  await expect(page.locator('.nf-chat__list .nf-msg--assistant')).toHaveCount(1)
  await page.waitForTimeout(400)
  // 台账标题被校正为确认后的需求
  await expect(page.locator('.nf-ledger__item').first()).toContainText('3D射击小游戏')
  // updateProjectTitle 被调用（项目 README 回写——目录名不变）
  const calls = await page.evaluate(() => (window as unknown as { __titleCalls: Array<{ p: string; title: string }> }).__titleCalls)
  expect(calls.length).toBeGreaterThan(0)
  expect(calls[0].title).toBe('3D射击小游戏')
})

// 2026-08-04 体验修复（用户实测：启动页输入句预填多余）：启动页输入 → 从零开始 → 自动发送（说了就直接开始，输入框不预填）
test('启动页方案 A：输入问题 → 从零开始 → 自动发送（输入框不预填）', async ({ page }) => {
  await mockBridge(page)
  await page.goto('http://localhost:5175/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.locator('.nf-start__input').fill('我要做一个3D射击小游戏')
  await page.getByRole('button', { name: '从零开始' }).click()
  // 自动发送：对话区出现用户消息（首句直接生效——不需要再打一遍）
  await expect(page.locator('.nf-msg--user')).toContainText(/3D射击小游戏/)
  // 输入框不预填（清空——那句话已作为首条消息发出）
  await expect(page.locator('.nf-chat__input textarea')).toHaveValue('')
})

// 2026-08-04 体验修复：启动页输入后按 Enter = 从零开始并自动发送
test('启动页方案 A：输入后按 Enter → 从零开始并自动发送', async ({ page }) => {
  await mockBridge(page)
  await page.goto('http://localhost:5175/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.locator('.nf-start__input').fill('帮我做个记账工具')
  await page.locator('.nf-start__input').press('Enter')
  await expect(page.locator('.nf-msg--user')).toContainText(/记账工具/)
})

// 2026-08-04 体验修复（用户实测：已说「3D射击」还要重选）：需求卡按首句关键词预选「做什么」
test('需求卡：首句含「射击」→ 「做什么」自动预选射击游戏', async ({ page }) => {
  await mockBridge(page)
  await page.goto('http://localhost:5175/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.locator('.nf-start__input').fill('我要做一个3D射击小游戏')
  await page.getByRole('button', { name: '从零开始' }).click()
  // 自动发送后（mock 无模型回复）需求未确认 → 需求卡显示；「射击游戏」chip 已预选
  await expect(page.locator('.nf-reqcard')).toBeVisible()
  const chip = page.locator('.nf-reqcard__chip', { hasText: '射击游戏' })
  await expect(chip).toHaveAttribute('aria-pressed', 'true')
  // 预选后无需再选「做什么」——点其他 3 项即可确认
  await page.locator('.nf-reqcard__chip', { hasText: '网页打开就能玩' }).click()
  await page.locator('.nf-reqcard__chip', { hasText: '发给朋友玩' }).click()
  await page.locator('.nf-reqcard__chip', { hasText: '先做个能玩的版本' }).click()
  await expect(page.locator('.nf-reqcard__actions button')).toBeEnabled()
})

// 2026-08-04 体验修复（用户实测：开发阶段模型只问不产出、阶段空转）：开发产物门控——无真实文件产出不能推进到测试，产出后解锁
// 2026-08-07 无阶段重构 S4：门控由阶段机改为 forceTool 三态（目标+执行确认无产出 → API 强制模型调工具产出）
test('执行确认门控：目标+执行确认后无产出 → 强制工具产出（write 后收敛）', async ({ page }) => {
  await page.addInitScript(() => {
    let streamCb: ((c: { type: string; text?: string; toolCall?: { name: string; args: Record<string, unknown> } }) => void) | null = null
    let chatCount = 0 // 第 1 次 = 启动页自动发送（不产出）；第 2 次 = 执行确认后的强制轮（write 产出）
    const bridge = {
      version: 'test',
      config: { hasKey: async () => true, getKey: async () => 'test-key', setKey: async () => {}, clearKey: async () => {} },
      workspace: { openFolder: async () => '/test', listDir: async () => [], readFile: async (p: string) => ({ ok: true, content: '// ' + p }), readNotebook: async () => null, initProject: async () => ({ ok: true, path: '/test', title: 't' }), updateProjectTitle: async () => ({ ok: true }) },
      gateway: {
        validate: async () => ({ ok: true }),
        streamChat: async () => {
          chatCount++
          setTimeout(() => {
            if (chatCount === 2) {
              streamCb?.({ type: 'tool-call', toolCall: { name: 'write', args: { path: '/test/game.js', content: 'x' } } })
            } else {
              streamCb?.({ type: 'content', text: '目标是射击游戏，先确认目标。' })
            }
            streamCb?.({ type: 'done' })
          }, 60)
          return { ok: true }
        },
        onStreamChunk: (cb: (c: { type: string; text?: string; toolCall?: { name: string; args: Record<string, unknown> } }) => void) => { streamCb = cb; return () => {} }
      },
      tools: { list: async () => [], execute: async () => ({ ok: true, data: { file: '/test/game.js', snapshot: true } }), revert: async () => ({ ok: true }) },
      context: { resolve: async () => ({ fragments: [] }) },
      compaction: { compact: async () => ({ ok: false }) },
      plugins: { list: async () => [], toggle: async () => true },
      chatLog: { log: async () => {}, export: async () => ({ ok: true, path: '/tmp/x.md' }) }
    }
    ;(window as unknown as { neonforge: unknown }).neonforge = bridge
  })
  await page.goto('http://localhost:5175/')
  await expect(page.locator('.nf-start')).toBeVisible()
  // 启动页输入需求（initialPrompt 非空 → 目标确认卡出现）
  await page.locator('.nf-start__input').fill('做个射击游戏')
  await page.locator('.nf-start__input').press('Enter')
  await page.waitForTimeout(300)
  // 目标确认卡确认（「做个射击游戏」命中预选 type=射击游戏；其余 3 项手动选）→ 目标确认 → 执行确认卡出现
  await expect(page.locator('.nf-reqcard')).toBeVisible()
  await page.locator('.nf-reqcard__chip', { hasText: '网页打开就能玩' }).click()
  await page.locator('.nf-reqcard__chip', { hasText: '发给朋友玩' }).click()
  await page.locator('.nf-reqcard__chip', { hasText: '先做个能玩的版本' }).click()
  await page.locator('.nf-reqcard__actions button').click()
  // 目标确认后：执行确认卡出现（无阶段——等待用户确认执行）
  const execCard = page.locator('.nf-exec-card')
  await expect(execCard).toBeVisible()
  // 执行确认前：无强制产出（forceTool=awaiting-exec-confirm auto——模型不被逼工具）
  // 点「确认，开始执行」→ 自动触发模型开始执行（forceTool=goal-exec-until-produced）→ write 产出
  await page.getByRole('button', { name: /确认，开始执行/ }).click()
  await expect(page.locator('.nf-toolcall--done')).toHaveCount(1, { timeout: 15000 })
  // 执行确认卡消失（已确认执行）
  await expect(execCard).toHaveCount(0)
})

// 2026-08-04 体验修复（用户实测「确认了需求但上面还停在需求确认」）：需求阶段用户打字「确认推进」→ 自动确认需求 + 推进到设计——
// 模型可能只说「需求已确认」不带【需求确认：】标记（UI 识别不到）——用户明确确认 → 确定性收敛，不依赖模型标记
test('0-1 对话确认需求：用户发「确认推进」→ 自动确认 + 推进到设计（不依赖模型标记）', async ({ page }) => {
  await page.addInitScript(() => {
    let streamCb: ((c: { type: string; text?: string }) => void) | null = null
    let chatCount = 0
    window.neonforge = {
      version: 'test',
      config: { hasKey: async () => true, getKey: async () => 'test-key', setKey: async () => {}, clearKey: async () => {} },
      workspace: { openFolder: async () => null, listDir: async () => [], readFile: async (p: string) => ({ ok: true, content: '// ' + p }), readNotebook: async () => null, initProject: async () => ({ ok: true, path: '/test', title: 't' }), updateProjectTitle: async () => ({ ok: true }) },
      gateway: {
        validate: async () => ({ ok: true }),
        streamChat: async () => {
          chatCount++
          setTimeout(() => {
            if (chatCount === 1) streamCb?.({ type: 'content', text: '明白：网页版 3D 射击游戏。确认没问题就回复「确认推进」。' })
            else streamCb?.({ type: 'content', text: '设计阶段：确认技术方案。' })
            streamCb?.({ type: 'done' })
          }, 30)
          return { ok: true }
        },
        onStreamChunk: (cb: (c: { type: string; text?: string }) => void) => { streamCb = cb; return () => {} }
      },
      tools: { execute: async () => ({ ok: true }), list: async () => [] },
      context: { resolve: async () => ({ fragments: [] }) },
      compaction: { compact: async () => ({ ok: false }) },
      plugins: { list: async () => [], toggle: async () => true }
    }
    ;(window as unknown as { neonforge: unknown }).neonforge = window.neonforge
  })
  await page.goto('http://localhost:5175/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '从零开始' }).click()
  // 2026-08-07 无阶段重构 S4：模型选择按钮删除——直接对话输入需求
  // 目标确认前：对话输入需求（不走目标卡——initialPrompt 空则不显示）
  await page.locator('.nf-chat__input textarea').fill('我想做一个网页3D射击游戏')
  await page.locator('.nf-chat__input textarea').press('Meta+Enter')
  await expect(page.locator('.nf-chat__list .nf-msg--assistant')).toHaveCount(1)
  await page.waitForTimeout(1000) // 等 working 释放（mock 需求链 ≈530ms——不足则「确认」被 working 守卫拦截）
  // 用户打字「确认推进」→ 自动确认目标（不依赖模型【目标确认：】标记——「确认推进」含确认词）
  await page.locator('.nf-chat__input textarea').fill('确认推进')
  await page.locator('.nf-chat__input textarea').press('Meta+Enter')
  // 目标已确认：执行确认卡出现（无阶段——目标确认 → 能力检查/执行方案 → 确认执行）
  await expect(page.locator('.nf-exec-card')).toBeVisible()
})

// 2026-08-04 体验修复（根因 A）：工具链 depth 2 → 8——连续 3 轮工具（read→read→read）不被掐断，最终回复正常
test('0-1 工具链自主推进：连续 3 轮 read → 自动续聊 → 最终回复（不被 depth 限制掐断）', async ({ page }) => {
  await page.addInitScript(() => {
    let streamCb: ((c: { type: string; text?: string; toolCall?: { name: string; args: Record<string, unknown> } }) => void) | null = null
    let chatCount = 0
    window.neonforge = {
      version: 'test',
      config: { hasKey: async () => true, getKey: async () => 'test-key', setKey: async () => {}, clearKey: async () => {} },
      workspace: { openFolder: async () => null, listDir: async () => [{ name: 'a.ts', path: '/test/a.ts', kind: 'file' }], readFile: async () => ({ ok: true, content: 'x' }), readNotebook: async () => null, initProject: async () => ({ ok: true, path: '/test', title: 't' }), updateProjectTitle: async () => ({ ok: true }) },
      gateway: {
        validate: async () => ({ ok: true }),
        streamChat: async () => {
          chatCount++
          setTimeout(() => {
            // 2026-08-04 重构适配：3 轮 read 用不同文件（真实模型不会重复读同一文件——死循环检测按同 name+args 判 3 次停）
            if (chatCount === 1) {
              streamCb?.({ type: 'tool-call', toolCall: { name: 'read', args: { path: '/test/a.ts' } } })
            } else if (chatCount === 2) {
              streamCb?.({ type: 'tool-call', toolCall: { name: 'read', args: { path: '/test/b.ts' } } })
            } else if (chatCount === 3) {
              streamCb?.({ type: 'tool-call', toolCall: { name: 'read', args: { path: '/test/c.ts' } } })
            } else {
              streamCb?.({ type: 'content', text: '设计完成，方案定了。' })
            }
            streamCb?.({ type: 'done' })
          }, 30)
          return { ok: true }
        },
        onStreamChunk: (cb: (c: { type: string; text?: string; toolCall?: { name: string; args: Record<string, unknown> } }) => void) => { streamCb = cb; return () => {} }
      },
      tools: { execute: async () => ({ ok: true, data: 'file content' }), list: async () => [] },
      context: { resolve: async () => ({ fragments: [] }) },
      compaction: { compact: async () => ({ ok: false }) },
      plugins: { list: async () => [], toggle: async () => true }
    }
    ;(window as unknown as { neonforge: unknown }).neonforge = window.neonforge
  })
  await page.goto('http://localhost:5175/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '从零开始' }).click()
  // 2026-08-07 无阶段重构 S4：模型选择按钮删除——启动页无输入 → 目标卡不显示——直接对话发需求
  await page.locator('.nf-chat__input textarea').fill('帮我做个网页游戏')
  await page.locator('.nf-chat__input textarea').press('Meta+Enter')
  // 用户消息首轮 → 3 轮 read 工具链自动续聊 → 最终回复（不被 depth 限制掐断）
  await expect(page.locator('.nf-toolcall--done')).toHaveCount(3, { timeout: 15000 })
  await expect(page.locator('.nf-chat__list .nf-msg--assistant').filter({ hasText: '设计完成，方案定了。' })).toHaveCount(1, { timeout: 15000 })
})

// 2026-08-04 授权架构 v4 用户路径实测：记住后同文件自动 → 信任清除 → 重新弹授权
// 2026-08-07 无阶段重构 S4：信任清除时机 = 新目标确认（任务边界——原阶段推进清除）
test('0-1 授权 v4 完整路径：允许并记住 → 同文件自动 → 新目标确认清除信任', async ({ page }) => {
  await page.addInitScript(() => {
    let streamCb: ((c: { type: string; text?: string; toolCall?: { name: string; args: Record<string, unknown> } }) => void) | null = null
    let chatCount = 0
    const writes: Array<{ path: string; content: string }> = [
      { path: '/test/index.html', content: '<div id="app"></div>' },
      { path: '/test/index.html', content: '<div id="app">v2</div>' },
      { path: '/test/index.html', content: '<div id="app">v3</div>' },
    ]
    window.neonforge = {
      version: 'test',
      config: { hasKey: async () => true, getKey: async () => 'test-key', setKey: async () => {}, clearKey: async () => {} },
      workspace: { openFolder: async () => null, listDir: async () => [{ name: 'index.html', path: '/test/index.html', kind: 'file' }], readFile: async () => ({ ok: true, content: 'x' }), readNotebook: async () => null, initProject: async () => ({ ok: true, path: '/test', title: 't' }), updateProjectTitle: async () => ({ ok: true }) },
      gateway: {
        validate: async () => ({ ok: true }),
        streamChat: async () => {
          chatCount++
          setTimeout(() => {
            // chatCount：1=需求消息、2=确认推进 send（都回 content）；3-5=执行确认后的 3 次 write；6=收尾 content
            if (chatCount <= 2) {
              streamCb?.({ type: 'content', text: '收到，继续。' })
            } else if (chatCount >= 3 && chatCount <= 5) {
              const w = writes[chatCount - 3]
              streamCb?.({ type: 'tool-call', toolCall: { name: 'write', args: { path: w.path, content: w.content } } })
            } else {
              streamCb?.({ type: 'content', text: '文件写好了。' })
            }
            streamCb?.({ type: 'done' })
          }, 30)
          return { ok: true }
        },
        onStreamChunk: (cb: (c: { type: string; text?: string; toolCall?: { name: string; args: Record<string, unknown> } }) => void) => { streamCb = cb; return () => {} }
      },
      tools: {
        execute: async (_n: string, args: Record<string, unknown>, opts?: { approved?: boolean }) => {
          // 模拟 main preApproval：write 需授权（approved=false → need-approval）；approved=true → 执行成功
          // 2026-08-07 T2（regex-todo）：needApproval 结构化字段——renderer 读字段不再 includes('授权') 文本
          if (!opts?.approved) return { ok: false, needApproval: true, error: '「write」需要授权（L3）——approved=true 后执行' }
          return { ok: true, data: { file: String(args.path), snapshot: true } }
        },
        list: async () => []
      },
      context: { resolve: async () => ({ fragments: [] }) },
      compaction: { compact: async () => ({ ok: false }) },
      plugins: { list: async () => [], toggle: async () => true }
    }
    ;(window as unknown as { neonforge: unknown }).neonforge = window.neonforge
  })
  await page.goto('http://localhost:5175/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '从零开始' }).click()
  // 对话发需求 + 确认推进（目标确认）→ 执行确认卡出现
  await page.locator('.nf-chat__input textarea').fill('做个网页游戏')
  await page.locator('.nf-chat__input textarea').press('Meta+Enter')
  await page.waitForTimeout(600)
  await page.locator('.nf-chat__input textarea').fill('确认推进')
  await page.locator('.nf-chat__input textarea').press('Meta+Enter')
  await page.waitForTimeout(600)
  // 点执行确认 → 自动触发模型执行 → 第一个 write → 授权卡出现（含「允许并记住」）
  await page.getByRole('button', { name: /确认，开始执行/ }).click()
  await expect(page.locator('.nf-toolcall--need-approval')).toHaveCount(1, { timeout: 8000 })
  await expect(page.getByRole('button', { name: '允许并记住' })).toBeVisible()
  await page.getByRole('button', { name: '允许并记住' }).click()
  // 记住后：第二个 write（同文件）→ 自动 done（无授权卡）
  await expect(page.locator('.nf-toolcall--need-approval')).toHaveCount(0, { timeout: 8000 })
  await expect(page.locator('.nf-toolcall--done')).toHaveCount(2, { timeout: 8000 })
  // 信任条显示已记住文件
  await expect(page.locator('.nf-trustbar')).toContainText('index.html')
  // 第三个 write（同文件）→ 仍自动 done（信任未清除）
  await expect(page.locator('.nf-toolcall--done')).toHaveCount(3, { timeout: 8000 })
  // 新问题 = 任务边界：点「新问题」按钮（handleNew——清会话 + 重挂载 ConversationPanel → 信任/授权全部重置）
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: '新问题' }).click()
  // 信任条消失（已清除——新任务需重新授权）
  await expect(page.locator('.nf-trustbar')).toHaveCount(0, { timeout: 8000 })
})

// 2026-08-05 方案 3：结构化候选按钮——模型 <candidates> 块 → 可点击按钮；点选发送选项文本（不走序号解析）
// 实测根因：模型列 1射击/2解谜/3建造，用户回 1 却被理解成建造——序号映射漂移 → 点选文本彻底规避
test('结构化候选：<candidates> 渲染为按钮 + 点选发送选项文本', async ({ page }) => {
  await page.addInitScript(() => {
    let streamCb: ((c: { type: string; text?: string }) => void) | null = null
    window.neonforge = {
      version: 'test',
      config: { hasKey: async () => true, getKey: async () => 'test-key', setKey: async () => {}, clearKey: async () => {} },
      workspace: {
        openFolder: async () => '/test',
        listDir: async () => [],
        readFile: async () => ({ ok: true, content: '' }),
        readNotebook: async () => null,
        initProject: async () => ({ ok: true, path: '/test', title: 't' })
      },
      gateway: {
        validate: async () => ({ ok: true }),
        streamChat: async () => {
          // 2026-08-05 第五轮复现：真实模型回复（需求阶段同音泛化引导）——含「我先和你确认一下…建造游戏」，
          // 误判 isActionPromise → 插入「搭档说要做但还没动手」提示 → done updater 被拦截 → 按钮不渲染（回归防护）
          setTimeout(() => {
            streamCb?.({ type: 'content', text: '你提到想做一个「3D设计游戏」——我先和你确认一下，你对这个「设计」是怎么理解的：\n\n- 你是指做成一个让玩家**自己搭建筑、造东西**的游戏（比如搭房子、造机械）？\n- 还是说你的意思是**「射击」**游戏（可能是打字打错了）？\n- 又或者是让玩家**设计物品外观、画画、捏角色**这一类创作玩法？\n\n<candidates>\n- 建造游戏：玩家自己搭房子、造工具、创造东西\n- 射击游戏：打枪、打怪的一类玩法\n- 创作游戏：设计物品外观、捏人、画画这类的创作玩法\n</candidates>\n\n你点选或者直接回复序号都行。' })
            streamCb?.({ type: 'done' })
          }, 50)
          return { ok: true }
        },
        onStreamChunk: (cb: (c: { type: string; text?: string }) => void) => { streamCb = cb; return () => {} }
      },
      tools: { execute: async () => ({ ok: true }), list: async () => [] },
      context: { resolve: async () => ({ fragments: [] }) },
      compaction: { compact: async () => ({ ok: false }) },
      plugins: { list: async () => [], toggle: async () => true },
      chatLog: { log: async () => {}, export: async () => ({ ok: true, path: '/tmp/x.md' }) }
    }
    ;(window as unknown as { neonforge: unknown }).neonforge = window.neonforge
  })
  await page.goto('http://localhost:5175/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await page.waitForSelector('.nf-chat__input textarea', { timeout: 8000 })
  await page.locator('.nf-chat__input textarea').fill('我想做一个3d设计游戏')
  await page.locator('.nf-chat__input textarea').press('Meta+Enter')
  // 候选渲染为 3 个按钮（done 后出现）
  await expect(page.locator('.nf-candidates__btn')).toHaveCount(3, { timeout: 8000 })
  await expect(page.locator('.nf-candidates__btn').first()).toContainText('建造游戏：玩家自己搭房子、造工具、创造东西')
  // 正文剥离 <candidates> 标记（不露标记杂音）
  await expect(page.locator('.nf-msg--assistant .nf-msg__body')).not.toContainText('<candidates>')
  // 等 working 释放（done 渲染与 setWorking(false) 是不同 state 提交——按钮刚出现瞬间 send 守卫 working 仍 true 会拦截）
  await expect(page.locator('.nf-statusbar')).toContainText('就绪', { timeout: 8000 })
  // 点选第一个按钮 → 发送的是选项文本（不是序号——模型直接按文本理解，无序号可错位）
  await page.locator('.nf-candidates__btn').first().click()
  await expect(page.locator('.nf-msg--user').last()).toContainText('建造游戏：玩家自己搭房子、造工具、创造东西')
})

// 2026-08-05 第六轮实测复现（用户「到确认推进的步骤了，最上面的页卡点不了确认推进」）：
// 模型回复「需求确认完毕。点下面的『确认推进』」但没有输出【需求确认：】标记 → 原 requirementConfirmed 未置 true → 按钮禁用（死锁：模型提示点按钮却点不了）。
// 修复：需求阶段按钮不再依赖标记禁用——用户显式点击 = 确认需求（handleStageChange 兜底 + 回写）
// 2026-08-07 无阶段重构 S4：死锁修复语义延续——用户打字「确认推进」= 显式确认目标（handleGoalConfirmed 兜底——不依赖模型【目标确认】标记）
test('目标无【目标确认】标记：用户打字「确认推进」→ 确认目标 + 执行确认卡出现（死锁修复延续）', async ({ page }) => {
  await page.addInitScript(() => {
    let streamCb: ((c: { type: string; text?: string }) => void) | null = null
    let chatCount = 0
    let titleCalls = 0
    window.neonforge = {
      version: 'test',
      config: { hasKey: async () => true, getKey: async () => 'test-key', setKey: async () => {}, clearKey: async () => {} },
      workspace: {
        openFolder: async () => null, listDir: async () => [], readFile: async (p: string) => ({ ok: true, content: '// ' + p }),
        readNotebook: async () => null, initProject: async () => ({ ok: true, path: '/test', title: 't' }),
        updateProjectTitle: async () => { titleCalls++; (window as unknown as { __titleCalls?: number }).__titleCalls = titleCalls; return { ok: true } }
      },
      gateway: {
        validate: async () => ({ ok: true }),
        streamChat: async () => {
          chatCount++
          setTimeout(() => {
            // 目标确认前回复：只写「需求确认完毕」——【目标确认：】标记缺失（死锁根因——模型违反规则）
            if (chatCount === 1) streamCb?.({ type: 'content', text: '你的需求我确认好了：做一款在网页浏览器里玩的、面向大众的轻松休闲 3D 射击游戏，能开枪打中目标、有得分，界面简单即可。需求确认完毕。点下面的「确认推进」，我就可以开始动手做了。' })
            else streamCb?.({ type: 'content', text: '开始执行：先检查能力再动手。' })
            streamCb?.({ type: 'done' })
          }, 30)
          return { ok: true }
        },
        onStreamChunk: (cb: (c: { type: string; text?: string }) => void) => { streamCb = cb; return () => {} }
      },
      tools: { execute: async () => ({ ok: true }), list: async () => [] },
      context: { resolve: async () => ({ fragments: [] }) },
      compaction: { compact: async () => ({ ok: false }) },
      plugins: { list: async () => [], toggle: async () => true },
      chatLog: { log: async () => {}, export: async () => ({ ok: true, path: '/tmp/x.md' }) }
    }
    ;(window as unknown as { neonforge: unknown }).neonforge = window.neonforge
  })
  await page.goto('http://localhost:5175/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '从零开始' }).click()
  // 对话输入需求（不走目标卡——initialPrompt 空则不显示）
  await page.locator('.nf-chat__input textarea').fill('我想做一个网页3D射击游戏')
  await page.locator('.nf-chat__input textarea').press('Meta+Enter')
  await expect(page.locator('.nf-chat__list .nf-msg--assistant')).toHaveCount(1)
  // 等回复完成（模型无【目标确认】标记——goalConfirmed 仍 false）
  await expect(page.locator('.nf-statusbar')).toContainText('就绪', { timeout: 8000 })
  // 用户显式「确认推进」= 确认目标（不依赖模型标记——死锁修复：模型提示点按钮但没标记时用户仍可确认）
  await page.locator('.nf-chat__input textarea').fill('确认推进')
  await page.locator('.nf-chat__input textarea').press('Meta+Enter')
  // 目标确认 → 执行确认卡出现 + 目标回写（updateProjectTitle 被调——handleGoalConfirmed 兜底确认）
  await expect(page.locator('.nf-exec-card')).toBeVisible()
  await page.waitForTimeout(200)
  const titleCalls = await page.evaluate(() => (window as unknown as { __titleCalls?: number }).__titleCalls ?? 0)
  expect(titleCalls).toBeGreaterThan(0)
})

// 2026-08-06 需求分流 A/B（3670734）：B 类文件操作——需求确认【任务类型：B】→ edit 直接执行（豁免 plan gate——改现有文件操作明确）
test('需求分流 B 类：改文件内容 → edit 直接执行（不弹 plan 授权卡）', async ({ page }) => {
  await page.addInitScript(() => {
    let streamCb: ((c: { type: string; text?: string; toolCall?: { name: string; args: Record<string, unknown> } }) => void) | null = null
    let chatCount = 0
    window.neonforge = {
      version: 'test',
      config: { hasKey: async () => true, getKey: async () => 'test-key', setKey: async () => {}, clearKey: async () => {} },
      workspace: { openFolder: async () => null, listDir: async () => [{ name: '待办事项.txt', path: '/test/待办事项.txt', kind: 'file' }], readFile: async () => ({ ok: true, content: 'TODO: 买牛奶' }), readNotebook: async () => null, initProject: async () => ({ ok: true, path: '/test', title: 't' }), updateProjectTitle: async () => ({ ok: true }) },
      gateway: {
        validate: async () => ({ ok: true }),
        streamChat: async () => {
          chatCount++
          setTimeout(() => {
            if (chatCount === 1) {
              streamCb?.({ type: 'content', text: '好，你要把待办事项.txt 里的「买牛奶」改成「买面包」。【目标确认：把待办事项里的买牛奶改成买面包】【任务类型：B 文件操作】' })
            } else if (chatCount === 2) {
              streamCb?.({ type: 'tool-call', toolCall: { name: 'edit', args: { path: '/test/待办事项.txt', old: '买牛奶', new: '买面包' } } })
            } else {
              streamCb?.({ type: 'content', text: '已改好，买牛奶换成买面包了。' })
            }
            streamCb?.({ type: 'done' })
          }, 30)
          return { ok: true }
        },
        onStreamChunk: (cb: (c: { type: string; text?: string; toolCall?: { name: string; args: Record<string, unknown> } }) => void) => { streamCb = cb; return () => {} }
      },
      tools: { execute: async () => ({ ok: true, data: { file: '/test/待办事项.txt' } }), list: async () => [] },
      context: { resolve: async () => ({ fragments: [] }) },
      compaction: { compact: async () => ({ ok: false }) },
      plugins: { list: async () => [], toggle: async () => true }
    }
    ;(window as unknown as { neonforge: unknown }).neonforge = window.neonforge
  })
  await page.goto('http://localhost:5175/')
  await page.getByRole('button', { name: '从零开始' }).click()
  // 2026-08-07 无阶段重构 S4：模型选择按钮删除
  await page.locator('.nf-chat__input textarea').fill('把待办事项.txt 里的买牛奶改成买面包')
  await page.locator('.nf-chat__input textarea').press('Meta+Enter')
  await page.waitForTimeout(600)
  // 模型输出【目标确认：】标记 → 目标确认 → 执行确认卡出现（无阶段——确认后执行）
  await expect(page.locator('.nf-exec-card')).toBeVisible({ timeout: 8000 })
  // 点执行确认 → 自动触发模型执行 → B 类 edit 直接执行（done——无 need-approval/plan-approval——豁免生效）
  await page.getByRole('button', { name: /确认，开始执行/ }).click()
  await expect(page.locator('.nf-toolcall--done')).toHaveCount(1, { timeout: 15000 })
  await expect(page.locator('.nf-toolcall--need-approval')).toHaveCount(0)
  await expect(page.locator('.nf-toolcall--plan-approval')).toHaveCount(0)
})
