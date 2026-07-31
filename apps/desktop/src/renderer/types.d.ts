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

// 交付包（ticket 05：产物 + 做了什么 + 验收对照 + 下一步 + 复跑）
export interface AcceptanceItem { label: string; done: boolean }
export interface DeliveryPackage {
  status: 'draft' | 'delivered' | 'closed'
  summary: string        // 做了什么（人话摘要）
  artifacts: string[]    // 产物清单
  acceptance: AcceptanceItem[] // 验收对照（对 DoD 逐项）
  nextSteps: string[]    // 下一步/指导（含超出数字能力部分）
  rerunLabel?: string    // 复跑入口文案
}
