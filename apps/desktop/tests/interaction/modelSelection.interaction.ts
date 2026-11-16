import { test, expect } from '@playwright/test'
import { installMockBridge } from './mockBridge'
import { enterWorkspace } from './scenarios'

// ADR-017：设置页模型选择（列表来自 IPC；显式选择持久化并刷新当前模型）
test('设置页：拉取模型列表并切换显式模型', async ({ page }) => {
  const h = await installMockBridge(page, {
    project: 'open',
    extraInit: `
      const modelCalls = []
      bridge.gateway.activeModel = async () => ({
        providerId: 'commandcode',
        providerLabel: 'Command Code',
        upstream: 'deepseek/deepseek-v4.1-flash',
        shortName: 'deepseek-v4.1-flash',
      })
      bridge.gateway.listModels = async () => ({
        ok: true,
        providerId: 'commandcode',
        models: ['deepseek/deepseek-v4.1-flash', 'gpt-4o'],
        resolved: { flash: 'deepseek/deepseek-v4.1-flash', pro: 'deepseek/deepseek-v4-pro' },
        source: 'list',
      })
      bridge.gateway.setModel = async (modelId, providerId) => {
        modelCalls.push({ modelId, providerId })
        return {
          ok: true,
          active: {
            providerId: 'commandcode',
            providerLabel: 'Command Code',
            upstream: modelId || 'deepseek/deepseek-v4.1-flash',
            shortName: modelId || 'deepseek-v4.1-flash',
          },
        }
      }
      Object.defineProperty(window, '__nfModelCalls', { get: () => modelCalls })
    `,
  })
  await enterWorkspace(page)
  await page.keyboard.press('Meta+,')
  const select = page.getByLabel('选择模型')
  await expect(select).toBeVisible({ timeout: 10000 })
  await expect(select.locator('option')).toHaveCount(3) // 自动 + 2 个模型
  await select.selectOption('gpt-4o')
  await expect
    .poll(async () => (await h.readCapture<unknown[]>('__nfModelCalls'))?.at(-1))
    .toEqual({
      modelId: 'gpt-4o',
    })
  await expect(select).toHaveValue('gpt-4o')
})
