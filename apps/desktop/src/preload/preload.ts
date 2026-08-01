import { contextBridge, ipcRenderer } from 'electron'

// bridge：gateway + config + workspace（IPC 收敛，renderer 不直接碰 node/electron）
contextBridge.exposeInMainWorld('neonforge', {
  version: process.env.npm_package_version ?? '0.1.0',
  config: {
    hasKey: () => ipcRenderer.invoke('config:has-key'),
    getKey: () => ipcRenderer.invoke('config:get-key'),
    setKey: (key: string) => ipcRenderer.invoke('config:set-key', key),
    clearKey: () => ipcRenderer.invoke('config:clear-key')
  },
  gateway: {
    validate: (apiKey: string) => ipcRenderer.invoke('gateway:validate', apiKey),
    streamChat: (opts: { apiKey: string; level?: string; messages: Array<{ role: string; content: string }> }) =>
      ipcRenderer.invoke('gateway:stream-chat', opts),
    onStreamChunk: (cb: (chunk: { type: string; text?: string; toolCall?: { name: string; args: Record<string, unknown> } }) => void) => {
      const listener = (_e: unknown, chunk: { type: string; text?: string; toolCall?: { name: string; args: Record<string, unknown> } }) => cb(chunk)
      ipcRenderer.on('gateway:stream-chunk', listener)
      return () => ipcRenderer.removeListener('gateway:stream-chunk', listener)
    }
  },
  workspace: {
    openFolder: () => ipcRenderer.invoke('workspace:open-folder') as Promise<string | null>,
    listDir: (dirPath: string) =>
      ipcRenderer.invoke('workspace:list-dir', dirPath) as Promise<Array<{ name: string; path: string; kind: 'file' | 'dir' }>>,
    readFile: (filePath: string) =>
      ipcRenderer.invoke('workspace:read-file', filePath) as Promise<{ ok: true; content: string } | { ok: false; error: string }>,
    readNotebook: (rootPath: string | null) =>
      ipcRenderer.invoke('workspace:read-notebook', rootPath) as Promise<{ ok: true; content: string } | { ok: false; error: string } | null>
  },
  tools: {
    list: () => ipcRenderer.invoke('tools:list') as Promise<Array<{ name: string; source: 'core' | 'lsp'; requiresApproval: boolean }>>,
    execute: (opts: { name: string; args: Record<string, unknown>; approved?: boolean }) =>
      ipcRenderer.invoke('tools:execute', opts) as Promise<{ ok: boolean; data?: unknown; error?: string }>
  }
})
