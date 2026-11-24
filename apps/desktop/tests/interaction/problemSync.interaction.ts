import { test, expect } from '@playwright/test'
import { installMockBridge } from './mockBridge'
import { enterWorkspace } from './scenarios'

// ADR-018：设置页问题台账同步——目录选择/立即同步/关闭；口令来源只读展示（值不进 UI）
test('设置页：问题台账同步目录与立即同步', async ({ page }) => {
  const h = await installMockBridge(page, {
    project: 'open',
    extraInit: `
      const syncCalls = []
      let status = {
        deviceId: 'device-test',
        folder: null,
        lastSyncAt: null,
        snapshotPath: '',
        passphraseSource: 'env',
      }
      const withFolder = (folder) => ({
        ...status,
        folder,
        snapshotPath: folder ? '/tmp/nf-sync/neonforge-problem-ledger.sync' : '',
      })
      bridge.problems = {
        load: async () => ({ problems: [] }),
        save: async (problems) => ({ ok: true, problems }),
        syncStatus: async () => status,
        chooseSyncFolder: async () => {
          syncCalls.push('choose')
          status = withFolder('/tmp/nf-sync')
          return { ok: true, status }
        },
        setSyncFolder: async (folder) => {
          syncCalls.push('set:' + String(folder))
          status = withFolder(folder)
          return { ok: true, status }
        },
        syncNow: async () => {
          syncCalls.push('sync')
          status = { ...status, lastSyncAt: '2026-11-17T10:00:00.000Z' }
          // ADR-018：合并结果随结果返回——工作区必须以此刷新内存态（审计 P1 防陈旧覆盖）
          return {
            ok: true,
            total: 3,
            conflicts: 1,
            localOnly: 1,
            remoteOnly: 1,
            problems: [
              {
                id: 'remote-winner',
                title: '远端合并赢家',
                status: 'closed',
                updatedAt: '10:30',
                updatedAtIso: '2026-11-17T10:30:00.000Z',
                revision: 3,
                snapshot: { goal: '同步赢家', decisions: [], authorized: [], pending: [] },
              },
            ],
          }
        },
      }
      Object.defineProperty(window, '__nfSyncCalls', { get: () => syncCalls })
      Object.defineProperty(window, '__nfSavedProblems', {
        get: () => JSON.parse(localStorage.getItem('nf-problems') || '[]'),
      })
    `,
  })
  await enterWorkspace(page)
  await page.keyboard.press('Meta+,')
  await expect(page.getByText('问题台账同步')).toBeVisible({ timeout: 10000 })
  await expect(page.getByText('口令来源：环境变量')).toBeVisible()

  await page.getByRole('button', { name: '选择同步目录' }).click()
  await expect(page.getByText('目录：/tmp/nf-sync')).toBeVisible()
  await expect
    .poll(async () => (await h.readCapture<unknown[]>('__nfSyncCalls'))?.at(-1))
    .toBe('choose')

  await page.getByRole('button', { name: '立即同步' }).click()
  await expect(page.getByText(/同步完成：3 条/)).toBeVisible()
  await expect(page.getByText(/上次同步：/)).toBeVisible()
  // 审计 P1：同步结果回到工作区内存态（问题台账面板显示远端合并赢家；localStorage 缓存同步刷新）
  await expect(page.getByText('远端合并赢家')).toBeVisible()
  await expect
    .poll(async () => {
      const saved = await h.readCapture<Array<{ id: string }>>('__nfSavedProblems')
      return saved?.some((p) => p.id === 'remote-winner')
    })
    .toBe(true)
  await expect
    .poll(async () => (await h.readCapture<unknown[]>('__nfSyncCalls'))?.at(-1))
    .toBe('sync')

  await page.getByRole('button', { name: '关闭同步' }).click()
  await expect(page.getByText(/目录：未选择/)).toBeVisible()
  await expect
    .poll(async () => (await h.readCapture<unknown[]>('__nfSyncCalls'))?.at(-1))
    .toBe('set:null')
})
