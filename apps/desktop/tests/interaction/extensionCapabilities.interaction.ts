import { test, expect } from '@playwright/test'
import { installMockBridge } from './mockBridge'
import { enterWorkspace } from './scenarios'

// ADR-017：设置页扩展能力明细（名称 + 风险），不再只显示数量
test('设置页：扩展条目展示能力名称与风险', async ({ page }) => {
  await installMockBridge(page, {
    project: 'open',
    extraInit: `
      bridge.extensions = {
        list: async () => [{
          id: 'mcp:fs',
          name: 'mcp:fs',
          version: '1.0.0',
          kind: 'mcp',
          status: 'active',
          trust: 'user-authorized',
          capabilities: [{ id: 'read_file', name: 'read', description: '读取文件', risk: 'high' }],
          capabilityDigest: 'read_file:high',
          createdAt: '2026-11-17T00:00:00.000Z',
          updatedAt: '2026-11-17T00:00:00.000Z',
          active: true,
        }],
      }
    `,
  })
  await enterWorkspace(page)
  await page.keyboard.press('Meta+,')
  await expect(page.getByText(/mcp:fs/)).toBeVisible({ timeout: 10000 })
  await expect(page.getByText(/能力：read\(high\)/)).toBeVisible()
})
