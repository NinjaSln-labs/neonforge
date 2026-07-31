// renderer 侧 neonforge bridge 类型声明
export interface DirEntry {
  name: string
  path: string
  kind: 'file' | 'dir'
}

export interface NeonForgeBridge {
  version: string
  config: {
    hasKey: () => Promise<boolean>
    getKey: () => Promise<string | null>
    setKey: (key: string) => Promise<void>
    clearKey: () => Promise<void>
  }
  gateway: {
    validate: (apiKey: string) => Promise<{ ok: boolean; error?: string }>
    streamChat: (opts: { apiKey: string; level?: string; messages: Array<{ role: string; content: string }> }) => Promise<{ ok: boolean; error?: string }>
    onStreamChunk: (cb: (chunk: { type: string; text?: string }) => void) => () => void
  }
  workspace: {
    openFolder: () => Promise<string | null>
    listDir: (dirPath: string) => Promise<DirEntry[]>
    readFile: (filePath: string) => Promise<{ ok: true; content: string } | { ok: false; error: string }>
  }
}

declare global {
  interface Window {
    neonforge: NeonForgeBridge
  }
}

export {}
