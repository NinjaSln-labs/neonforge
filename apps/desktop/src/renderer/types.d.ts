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
    streamChat: (opts: { apiKey: string; level?: string; tools?: boolean; messages: Array<{ role: string; content: string }> }) => Promise<{ ok: boolean; error?: string }>
    onStreamChunk: (cb: (chunk: { type: string; text?: string; toolCall?: { name: string; args: Record<string, unknown> } }) => void) => () => void
  }
  workspace: {
    openFolder: () => Promise<string | null>
    listDir: (dirPath: string) => Promise<DirEntry[]>
    readFile: (filePath: string) => Promise<{ ok: true; content: string } | { ok: false; error: string }>
    readNotebook: (rootPath: string | null) => Promise<{ ok: true; content: string } | { ok: false; error: string } | null>
  }
  tools: NeonForgeTools
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

// 问题台账（ticket 06：问题 = 一等公民——7 态状态机 + 断点续做 + 复开）
export type ProblemStatus = 'understanding' | 'awaiting-plan' | 'executing' | 'awaiting-input' | 'delivered' | 'closed' | 'failed-recoverable'
export interface ProblemInstance {
  id: string
  title: string          // 用户的问题（第一句话）
  status: ProblemStatus
  updatedAt: string      // 最近活动时间
}

// ToolRegistry（ticket 10）：renderer 侧工具接口
export interface NeonForgeTools {
  list: () => Promise<Array<{ name: string; source: 'core' | 'lsp'; requiresApproval: boolean }>>
  execute: (name: string, args: Record<string, unknown>, opts?: { approved?: boolean }) => Promise<{ ok: boolean; data?: unknown; error?: string }>
}
