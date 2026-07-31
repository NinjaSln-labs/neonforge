// IPC handlers：renderer 经 preload → 主进程 gateway/configStore
import { ipcMain } from 'electron'
import { gateway } from './gateway.js'
import { configStore } from './configStore.js'

export function registerIpc(): void {
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
}
