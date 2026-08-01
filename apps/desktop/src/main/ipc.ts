// IPC handlers：renderer 经 preload → 主进程 gateway/configStore/workspace
import { BrowserWindow, ipcMain } from 'electron'
import { gateway } from './gateway.js'
import { configStore } from './configStore.js'
import { workspace } from './workspace.js'
import { initTools, toolRegistry } from './tools.js'

export function registerIpc(): void {
  initTools()
  ipcMain.handle('config:has-key', () => configStore.hasValidKey())
  ipcMain.handle('config:get-key', () => configStore.getApiKey())
  ipcMain.handle('config:set-key', (_e, key: string) => configStore.setApiKey(key))
  ipcMain.handle('config:clear-key', () => configStore.clearApiKey())

  // 验证 Key（非流式，max_tokens=1）
  ipcMain.handle('gateway:validate', async (_e, apiKey: string) => {
    return gateway.validateKey(apiKey)
  })

  // 流式 chat：事件逐块推给 renderer（经 webContents.send）
  ipcMain.handle('gateway:stream-chat', async (event, opts: {
    apiKey: string
    level?: 'none' | 'basic' | 'medium' | 'high'
    messages: Array<{ role: string; content: string }>
  }) => {
    const send = (type: 'reasoning' | 'content' | 'done', text?: string) => {
      event.sender.send('gateway:stream-chunk', { type, text })
    }
    try {
      await gateway.streamChat(opts.apiKey, {
        level: opts.level ?? 'basic',
        messages: opts.messages,
        onDelta: (chunk) => send(chunk.type, chunk.text)
      })
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'gateway-error' }
    }
  })

  // ticket 03：打开项目 / 文件树 / 读文件
  ipcMain.handle('workspace:open-folder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return workspace.openFolder(win)
  })
  ipcMain.handle('workspace:list-dir', (_e, dirPath: string) => workspace.listDir(dirPath))
  ipcMain.handle('workspace:read-file', (_e, filePath: string) => workspace.readFile(filePath))
}
  // ticket 10：ToolRegistry（工具清单 + 执行分发——write/edit/bash 需 approved）
  ipcMain.handle('tools:list', () => toolRegistry.list())
  ipcMain.handle('tools:execute', (_e, opts: { name: string; args: Record<string, unknown>; approved?: boolean }) =>
    toolRegistry.execute(opts.name, opts.args ?? {}, { approved: opts.approved ?? false })
  )
