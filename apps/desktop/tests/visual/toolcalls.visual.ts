import { test, expect } from '@playwright/test'
import { installMockBridge } from '../interaction/mockBridge'
import {
  compose,
  goalConfirm,
  planPropose,
  executeWrite,
  executeBash,
  enterWorkspace,
  sendChat,
} from '../interaction/scenarios'

// 工具卡片（真实执行 V1）：mock SSE 发 tool-call → 卡片渲染（read 自动✅ / bash 需授权🔒）
async function mockBridge(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    window.__emit = null
    window.neonforge = {
      version: 'test',
      config: {
        hasKey: async () => true,
        getKey: async () => 'test-key',
        setKey: async () => {},
        clearKey: async () => {},
      },
      workspace: {
        openFolder: async () => '/test',
        listDir: async () => [],
        readFile: async () => ({ ok: true, content: '// x' }),
        updateProjectTitle: async () => ({ ok: true }),
      },
      gateway: {
        validate: async () => ({ ok: true }),
        streamChat: async () => ({ ok: true }),
        onStreamChunk: (cb: (c: unknown) => void) => {
          window.__emit = cb
          return () => {}
        },
      },
      tools: {
        list: async () => [],
        execute: async (
          name: string,
          args: Record<string, unknown>,
          opts?: { approved?: boolean },
        ) => {
          if (name === 'read')
            return { ok: true, data: '{"name":"neonforge-desktop","version":"0.1.0"}' }
          if (name === 'write' && opts?.approved)
            return { ok: true, data: { file: '/test/notes.txt', snapshot: true } }
          return {
            ok: false,
            needApproval: true,
            error: `「${name}」需要授权（L3）——approved=true 后执行`,
          }
        },
        revert: async () => ({ ok: true }),
      },
    }
  })
}

test('工具卡片（read 自动执行 ✅）', async ({ page }) => {
  await mockBridge(page)
  await page.goto('http://localhost:5175/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await page.locator('.nf-chat__input textarea').fill('读取 package.json')
  await page.locator('.nf-chat__input textarea').press('Meta+Enter')
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    window.__emit({ type: 'reasoning', text: '需要读取 package.json' })
    window.__emit({
      type: 'tool-call',
      toolCall: { name: 'read', args: { path: '/test/package.json' } },
    })
    window.__emit({ type: 'done' })
  })
  await page.waitForTimeout(800)
  await expect(page.locator('.nf-toolcall')).toHaveCount(1)
  await expect(page.locator('.nf-toolcall')).toContainText('read')
  // 2026-08-05 体验反馈：read 结果精简为「已读取（N 字符）」（原展示代码内容——用户不想看）
  await expect(page.locator('.nf-toolcall')).toContainText('已读取')
  // 等续聊链完全结束（working false）再截图——消除全量跑的时序抖动
  await expect(page.locator('.nf-statusbar')).toContainText('就绪')
  await expect(page.locator('.nf-chat')).toHaveScreenshot('toolcall-read.png')
})

test('工具卡片（bash 需授权 🔒）', async ({ page }) => {
  // V1.5：确认卡门控走协议工具；bash 高危 → approval:'all'
  await installMockBridge(page, {
    project: 'open',
    approval: 'all',
    script: compose(
      goalConfirm('查看当前目录'),
      planPropose(['README.md（只读参考）']),
      executeBash('pwd && ls -la'),
    ),
    executeResults: {
      bash: { ok: true, data: '/test\n' },
    },
  })
  await enterWorkspace(page)
  await sendChat(page, '看看当前目录')
  await expect(page.getByRole('button', { name: '确认目标' })).toBeVisible({ timeout: 8000 })
  await page.getByRole('button', { name: '确认目标' }).click()
  await expect(page.getByRole('button', { name: '确认执行' })).toBeVisible({ timeout: 8000 })
  await page.getByRole('button', { name: '确认执行' }).click()
  const bashCard = page.locator('.nf-toolcall').filter({ hasText: 'bash' })
  await expect(bashCard).toHaveCount(1, { timeout: 8000 })
  await expect(bashCard).toContainText('需要授权')
  await expect(bashCard.locator('.nf-toolcall__approve')).toBeVisible()
  await expect(page.locator('.nf-statusbar')).toContainText('待你批准')
  await expect(page.locator('.nf-chat')).toHaveScreenshot('toolcall-bash-approval.png')
})

test('工具卡片（write 授权执行 → 可回滚 ↩️ → 已回滚）', async ({ page }) => {
  // 清单内 write 自动执行 → 直接出现回滚（V1.5 清单内自动；截图锁定 done+revert 态）
  await installMockBridge(page, {
    project: 'open',
    script: compose(
      goalConfirm('写一个 notes 文件'),
      planPropose(['/test/notes.txt（新建）']),
      executeWrite('/test/notes.txt', 'hello'),
    ),
  })
  await enterWorkspace(page)
  await sendChat(page, '帮我写一个 notes 文件')
  await expect(page.getByRole('button', { name: '确认目标' })).toBeVisible({ timeout: 8000 })
  await page.getByRole('button', { name: '确认目标' }).click()
  await expect(page.getByRole('button', { name: '确认执行' })).toBeVisible({ timeout: 8000 })
  await page.getByRole('button', { name: '确认执行' }).click()
  const writeCard = page.locator('.nf-toolcall').filter({ hasText: 'write' })
  await expect(writeCard).toHaveCount(1, { timeout: 10000 })
  await expect(writeCard).toContainText('已写入')
  await expect(writeCard.locator('.nf-toolcall__revert')).toBeVisible()
  // 等续聊链结束再截图——消除全量跑时序抖动（与 read 卡同构）
  await expect(page.locator('.nf-statusbar')).toContainText('就绪')
  await expect(page.locator('.nf-chat')).toHaveScreenshot('toolcall-write-revert.png')
  await writeCard.locator('.nf-toolcall__revert').click()
  await expect(writeCard).toContainText('已回滚', { timeout: 5000 })
})
