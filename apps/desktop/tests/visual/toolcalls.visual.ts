import { test, expect } from '@playwright/test'

// 工具卡片（真实执行 V1）：mock SSE 发 tool-call → 卡片渲染（read 自动✅ / bash 需授权🔒）
async function mockBridge(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    window.__emit = null
    window.neonforge = {
      version: 'test',
      config: { hasKey: async () => true, getKey: async () => 'test-key', setKey: async () => {}, clearKey: async () => {} },
      workspace: { openFolder: async () => '/test', listDir: async () => [], readFile: async () => ({ ok: true, content: '// x' }) },
      gateway: {
        validate: async () => ({ ok: true }),
        streamChat: async () => ({ ok: true }),
        onStreamChunk: (cb: (c: unknown) => void) => { window.__emit = cb; return () => {} }
      },
      tools: {
        list: async () => [],
        execute: async (name: string, args: Record<string, unknown>, opts?: { approved?: boolean }) => {
          if (name === 'read') return { ok: true, data: '{"name":"neonforge-desktop","version":"0.1.0"}' }
          if (name === 'write' && opts?.approved) return { ok: true, data: { file: '/test/notes.txt', snapshot: true } }
          return { ok: false, error: `「${name}」需要授权（L3）——approved=true 后执行` }
        },
        revert: async () => ({ ok: true })
      }
    }
  })
}

test('工具卡片（read 自动执行 ✅）', async ({ page }) => {
  await mockBridge(page)
  await page.goto('http://localhost:5174/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await page.locator('.nf-chat__input textarea').fill('读取 package.json')
  await page.locator('.nf-chat__input textarea').press('Meta+Enter')
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    window.__emit({ type: 'reasoning', text: '需要读取 package.json' })
    window.__emit({ type: 'tool-call', toolCall: { name: 'read', args: { path: '/test/package.json' } } })
    window.__emit({ type: 'done' })
  })
  await page.waitForTimeout(800)
  await expect(page.locator('.nf-toolcall')).toHaveCount(1)
  await expect(page.locator('.nf-toolcall')).toContainText('read')
  await expect(page.locator('.nf-toolcall')).toContainText('neonforge-desktop')
  // 等续聊链完全结束（working false）再截图——消除全量跑的时序抖动
  await expect(page.locator('.nf-statusbar')).toContainText('就绪')
  await expect(page.locator('.nf-chat')).toHaveScreenshot('toolcall-read.png')
})

test('工具卡片（bash 需授权 🔒）', async ({ page }) => {
  await mockBridge(page)
  await page.goto('http://localhost:5174/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await page.locator('.nf-chat__input textarea').fill('看看当前目录')
  await page.locator('.nf-chat__input textarea').press('Meta+Enter')
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    window.__emit({ type: 'reasoning', text: '需要查看目录' })
    window.__emit({ type: 'tool-call', toolCall: { name: 'bash', args: { command: 'pwd && ls -la' } } })
    window.__emit({ type: 'done' })
  })
  await page.waitForTimeout(800)
  await expect(page.locator('.nf-toolcall')).toHaveCount(1)
  await expect(page.locator('.nf-toolcall')).toContainText('bash')
  await expect(page.locator('.nf-toolcall')).toContainText('需要授权')
  // 等授权卡完整渲染（need-approval → 「允许执行」按钮出现）再截图——消除过渡态时序抖动（基线固化为完整状态）
  await expect(page.locator('.nf-toolcall__approve')).toBeVisible()
  // 等续聊链完全结束（working false → 状态栏就绪）再截图——对齐 read 测试加固，消除全量跑残余时序抖动（坑 18）
  await expect(page.locator('.nf-statusbar')).toContainText('就绪')
  await expect(page.locator('.nf-chat')).toHaveScreenshot('toolcall-bash-approval.png')
})

test('工具卡片（write 授权执行 → 可回滚 ↩️ → 已回滚）', async ({ page }) => {
  await mockBridge(page)
  await page.goto('http://localhost:5174/')
  await expect(page.locator('.nf-start')).toBeVisible()
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await page.locator('.nf-chat__input textarea').fill('帮我写一个 notes 文件')
  await page.locator('.nf-chat__input textarea').press('Meta+Enter')
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    window.__emit({ type: 'reasoning', text: '需要写入文件' })
    window.__emit({ type: 'tool-call', toolCall: { name: 'write', args: { path: '/test/notes.txt', content: 'hello' } } })
    window.__emit({ type: 'done' })
  })
  await page.waitForTimeout(800)
  await expect(page.locator('.nf-toolcall')).toContainText('write')
  await expect(page.locator('.nf-toolcall')).toContainText('需要授权')
  // 授权执行 → done + 回滚按钮
  await page.locator('.nf-toolcall__approve').click()
  await page.waitForTimeout(500)
  await expect(page.locator('.nf-toolcall--done')).toHaveCount(1)
  await expect(page.locator('.nf-toolcall__revert')).toBeVisible()
  await expect(page.locator('.nf-chat')).toHaveScreenshot('toolcall-write-revert.png')
  // 回滚 → 已回滚状态
  await page.locator('.nf-toolcall__revert').click()
  await page.waitForTimeout(300)
  await expect(page.locator('.nf-toolcall')).toContainText('已回滚')
})
