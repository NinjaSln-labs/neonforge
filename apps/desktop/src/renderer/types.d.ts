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
    streamChat: (opts: { apiKey: string; level?: string; tools?: boolean; forceTool?: boolean; messages: Array<{ role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string; reasoning_content?: string }> }) => Promise<{ ok: boolean; error?: string; errorType?: 'key-invalid' | 'service' | 'unknown' }>
    onStreamChunk: (cb: (chunk: { type: string; text?: string; toolCall?: { name: string; args: Record<string, unknown> } }) => void) => () => void
  }
  delivery: {
    applyDiff: (path: string, diff: string, approved?: boolean) => Promise<{ ok: boolean; file?: string; error?: string }>
    revertDiff: (path: string) => Promise<{ ok: boolean; error?: string }>
  },
  workspace: {
    openFolder: () => Promise<string | null>
    listDir: (dirPath: string) => Promise<DirEntry[]>
    readFile: (filePath: string) => Promise<{ ok: true; content: string } | { ok: false; error: string }>
    readNotebook: (rootPath: string | null) => Promise<{ ok: true; content: string } | { ok: false; error: string } | null>
    initProject: (title: string) => Promise<{ ok: true; path: string; title: string } | { ok: false; error: string }>
    updateProjectTitle: (path: string, title: string) => Promise<{ ok: boolean; error?: string }>
  }
  chatLog: {
    log: (entry: { ts: string; role: 'user' | 'assistant'; content?: string; toolCalls?: Array<{ name: string; status: string }>; error?: string }) => Promise<void>
    export: () => Promise<{ ok: boolean; path?: string; error?: string }>
  }
  // 2026-08-07 会话时间线（单会话所有步骤统一日志——用户/搭档/工具/授权/状态）
  timeline: {
    log: (evt: { session?: string; type: string; role?: 'user' | 'assistant' | 'system' | 'tool'; detail?: Record<string, unknown> }) => Promise<void>
  }
  tools: NeonForgeTools
  context: {
    resolve: (files: string[]) => Promise<{ fragments: Array<{ path: string; content: string; truncated: boolean }> }>
  }
  rag: {
    search: (query: string) => Promise<{ hits: Array<{ path: string; line: number; snippet: string }>; note?: string }>
  }
  plugins: {
    list: () => Promise<Array<{ name: string; version: string; active: boolean }>>
    toggle: (name: string, active: boolean) => Promise<boolean>
  }
  preheat: {
    status: () => Promise<{ plan: { shouldPreheat: boolean; why: string; actions: string[] }; cache: { standardPrefix: string; hash: string; history: Array<{ hash: string; at: string; hit: boolean }> } | null }>
  }
  compaction: {
    compact: (history: Array<{ role: string; content: string | null }>) => Promise<{ ok: true; summary: string; kept: Array<{ role: string; content: string | null }> } | { ok: false; error: string }>
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
  rerunPrompt?: string   // 复跑时重新发送的请求（= 用户原始需求）
  diffs?: { path: string; diff: string }[] // 开发者视图：待审核/已应用的 diff（05 执行层 A）
}

// 问题台账（ticket 06：问题 = 一等公民——7 态状态机 + 断点续做 + 复开）
export type ProblemStatus = 'understanding' | 'awaiting-plan' | 'executing' | 'awaiting-input' | 'delivered' | 'closed' | 'failed-recoverable'
// 会话级状态快照（基线 §21 断点续做深度——目标/已决策/已授权/待办；2026-08-02 增强）
export interface ProblemSnapshot {
  goal: string          // 目标（用户问题第一句）
  decisions: string[]   // 已确认决策
  authorized: string[]  // 已授权操作
  pending: string[]     // 待办/待确认
}
export interface ProblemInstance {
  id: string
  title: string          // 用户的问题（第一句话）
  status: ProblemStatus
  updatedAt: string      // 最近活动时间
  snapshot?: ProblemSnapshot // 断点续做快照（可选——旧数据兼容）
}

// ToolRegistry（ticket 10/14）：renderer 侧工具接口（risk：none=L1 观察 / low=L3 文件操作 / high=L3 命令执行）
export interface NeonForgeTools {
  list: () => Promise<Array<{ name: string; source: 'core' | 'lsp'; requiresApproval: boolean; risk: 'none' | 'low' | 'high' }>>
  execute: (name: string, args: Record<string, unknown>, opts?: { approved?: boolean; rootPath?: string }) => Promise<{ ok: boolean; data?: { file?: string; snapshot?: boolean } | unknown; error?: string; needApproval?: boolean }>
  revert: (filePath: string) => Promise<{ ok: boolean; error?: string }>
  // ticket 14 可撤销：停止当前活动命令（bash 高危——任何时刻可停，不卡死）
  cancel: () => Promise<{ ok: boolean; error?: string }>
  // 2026-08-04 规划级授权强制：plan_approval 批准后通知 main（write/edit 放行）
  planApproved: () => Promise<{ ok: boolean }>
}
