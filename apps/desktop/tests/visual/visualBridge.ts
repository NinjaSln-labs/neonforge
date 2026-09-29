import type { Page } from '@playwright/test'
import { installMockBridge, type MockBridgeOptions } from '../interaction/mockBridge'

/** L5 统一入口——禁止再手搓缺字段的 config mock */
export async function installVisualBridge(page: Page, opts: MockBridgeOptions = {}) {
  await installMockBridge(page, opts)
}
