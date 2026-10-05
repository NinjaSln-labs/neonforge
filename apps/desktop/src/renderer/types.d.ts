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
    getProvider: () => Promise<string>
    setKey: (key: string, providerId?: string, modelId?: string | null) => Promise<void>
    clearKey: () => Promise<void>
    getModel?: () => Promise<string | null>
    getWebAccess?: () => Promise<{
      enabled: boolean
      probeOk: boolean
      builtinProvider: 'ddg' | 'keenable' | null
      searchUrl: string | null
      hasSearchKey: boolean
      searchKey: string | null
      keenableApiKey: string | null
      hasKeenableKey: boolean
      keenablePublicTrial: boolean
    }>
    setWebAccess?: (patch: {
      enabled?: boolean
      searchUrl?: string | null
      searchKey?: string | null
      keenableApiKey?: string | null
      keenablePublicTrial?: boolean
      probe?: boolean
    }) => Promise<{
      ok: boolean
      error?: string
      config: {
        enabled: boolean
        probeOk: boolean
        builtinProvider: 'ddg' | 'keenable' | null
        searchUrl: string | null
        hasSearchKey: boolean
        searchKey: string | null
        keenableApiKey: string | null
        hasKeenableKey: boolean
        keenablePublicTrial: boolean
      }
    }>
    listProviders: () => Promise<
      Array<{
        id: string
        label: string
        howToGetKey: { zh: string; en: string }
        docsUrl?: string
      }>
    >
  }
  gateway: {
    validate: (
      apiKey: string,
      providerId?: string,
      modelId?: string | null,
    ) => Promise<{
      ok: boolean
      error?: string
      suggestModelId?: string
      modelSource?: 'list' | 'manual' | 'fallback'
    }>
    activeModel?: () => Promise<{
      providerId: string
      providerLabel: string
      upstream: string
      shortName: string
    }>
    streamChat: (opts: {
      apiKey: string
      level?: string
      tools?: boolean
      forceTool?: boolean
      messages: Array<{
        role: string
        content: string | null
        tool_calls?: unknown[]
        tool_call_id?: string
        reasoning_content?: string
      }>
    }) => Promise<{
      ok: boolean
      error?: string
      errorType?: 'key-invalid' | 'service' | 'unknown'
    }>
    onStreamChunk: (
      cb: (chunk: {
        type: string
        text?: string
        toolCall?: { name: string; args: Record<string, unknown> }
      }) => void,
    ) => () => void
    // S1b Task 4（E1）：流级取消——Stop 经此转投 main gateway:cancel-stream。
    stop: (streamId: string) => Promise<{ ok: boolean }>
  }
  // S1b Task 4（详设 §7）：委托单中心领域桥——逐键对齐 ipcDomain 通道注册表。
  delegation: {
    create: (args: {
      delegationId?: string
      intent: string
      scopeEntries?: Array<{ kind: '仓库' | '目录' | '命令' | '网络'; pattern: string }>
    }) => Promise<{ delegationId: string; state: string }>
    list: () => Promise<
      Array<{ delegationId: string; intent: string; state: string; reopenCount: number }>
    >
    accept: (
      delegationId: string,
    ) => Promise<{ delegationId: string; intent: string; state: string; reopenCount: number }>
    reject: (
      delegationId: string,
      reason?: string,
    ) => Promise<{ delegationId: string; intent: string; state: string; reopenCount: number }>
  }
  turn: {
    start: (args: {
      delegationId: string
      turnId?: string
      inputId?: string
      triggerSource: '用户输入' | '系统恢复' | '队列准入'
    }) => Promise<{ into: 'turn'; turnId: string } | { into: 'queue'; itemId: string }>
  }
  decision: {
    raise: (args: {
      decisionPointId: string
      delegationId: string
      turnId: string
      requestReason: {
        reason: '作用域外' | '高影响清单命中' | '作用域修正'
        operation: string
        requestedBy: 'AI 提请' | '用户提请'
      }
    }) => Promise<{ decisionPointId: string; open: boolean }>
    resolve: (args: {
      decisionPointId: string
      value: string
      reason?: string
    }) => Promise<{ resolved: string | null }>
  }
  evidence: {
    listByDelegation: (delegationId: string) => Promise<
      Array<{
        evidenceId: string
        type: string
        delegationId: string
        payloadRef: string
        provenance: string
      }>
    >
    inspect: (evidenceId: string) => Promise<{ firstInspection: boolean }>
  }
  queue: {
    pending: () => Promise<
      Array<{ itemId: string; delegationId: string; inputId: string; origin: string }>
    >
  }
  delivery: {
    applyDiff: (
      path: string,
      diff: string,
      approved?: boolean,
    ) => Promise<{ ok: boolean; file?: string; error?: string }>
    revertDiff: (path: string) => Promise<{ ok: boolean; error?: string }>
  }
  // S4 完成对账 V1a：系统代跑只读验证命令（可选——旧 mock/降级环境无则走纯逻辑判定）
  completion?: {
    verify: (
      commands: string[],
      rootPath?: string | null,
    ) => Promise<Record<string, { ok: boolean; output?: string }>>
  }
  workspace: {
    openFolder: () => Promise<string | null>
    listDir: (dirPath: string) => Promise<DirEntry[]>
    readFile: (
      filePath: string,
    ) => Promise<{ ok: true; content: string } | { ok: false; error: string }>
    readNotebook: (
      rootPath: string | null,
    ) => Promise<{ ok: true; content: string } | { ok: false; error: string } | null>
    initProject: (
      title: string,
    ) => Promise<{ ok: true; path: string; title: string } | { ok: false; error: string }>
    updateProjectTitle: (path: string, title: string) => Promise<{ ok: boolean; error?: string }>
  }
  chatLog: {
    log: (entry: {
      ts: string
      role: 'user' | 'assistant'
      content?: string
      toolCalls?: Array<{ name: string; status?: string }>
      error?: string
      session?: string
    }) => Promise<void>
    export: () => Promise<{ ok: boolean; path?: string; error?: string }>
  }
  // S1b Task 4（详设 §7／B4）：委托单中心时间线读面——queryByDelegation＋跨进程只读订阅。
  // 旧 JSONL `log` 面已退役（A2.5），仅留**可选**声明给两处归档调用点（ConversationPanel:582／
  // MainWorkspace:164，皆 `timeline?.log?.()`），随 A2.2 归档批整体 `git rm`，本声明同批删。
  timeline: {
    queryByDelegation: (
      delegationId: string,
    ) => Promise<
      Array<{ seq: number; ts: string; type: string; delegationId: string; detail: unknown }>
    >
    subscribe: () => Promise<{ subscribed: boolean }>
    onEvent: (
      cb: (e: {
        seq: number
        ts: string
        type: string
        delegationId: string
        detail: unknown
      }) => void,
    ) => () => void
    log?: (evt: {
      session?: string
      type: string
      role?: 'user' | 'assistant' | 'system' | 'tool'
      detail?: Record<string, unknown>
    }) => Promise<void>
  }
  tools: NeonForgeTools
  plannedFiles: PlannedFilesApi // D3（ADR-005）：PlannedFiles 契约——权威在 main
  // #6 真机 2026-08-31（复验轮）：方案确认镜像——approve-files 硬序门
  session: {
    setPlanConfirmed: (v: boolean) => Promise<void>
  }
  context: {
    resolve: (
      files: string[],
    ) => Promise<{ fragments: Array<{ path: string; content: string; truncated: boolean }> }>
  }
  rag: {
    search: (
      query: string,
    ) => Promise<{ hits: Array<{ path: string; line: number; snippet: string }>; note?: string }>
  }
  plugins: {
    list: () => Promise<Array<{ name: string; version: string; active: boolean }>>
    toggle: (name: string, active: boolean) => Promise<boolean>
  }
  preheat: {
    status: () => Promise<{
      plan: { shouldPreheat: boolean; why: string; actions: string[] }
      cache: {
        standardPrefix: string
        hash: string
        history: Array<{ hash: string; at: string; hit: boolean }>
      } | null
    }>
  }
  compaction: {
    compact: (
      history: Array<{ role: string; content: string | null; reasoning_content?: string }>,
    ) => Promise<
      | {
          ok: true
          summary: string
          kept: Array<{ role: string; content: string | null; reasoning_content?: string }>
        }
      | { ok: false; error: string }
    >
  }
}

declare global {
  interface Window {
    neonforge: NeonForgeBridge
  }
}

export {}

// 交付包（ticket 05：产物 + 做了什么 + 验收对照 + 下一步 + 复跑）
export interface AcceptanceItem {
  label: string
  done: boolean
}
export interface DeliveryPackage {
  status: 'draft' | 'delivered' | 'closed'
  summary: string // 做了什么（人话摘要）
  artifacts: string[] // 产物清单
  acceptance: AcceptanceItem[] // 验收对照（对 DoD 逐项）
  nextSteps: string[] // 下一步/指导（含超出数字能力部分）
  rerunLabel?: string // 复跑入口文案
  rerunPrompt?: string // 复跑时重新发送的请求（= 用户原始需求）
  diffs?: { path: string; diff: string }[] // 开发者视图：待审核/已应用的 diff（05 执行层 A）
}

// 问题台账（ticket 06：问题 = 一等公民——7 态状态机 + 断点续做 + 复开）
export type ProblemStatus =
  | 'understanding'
  | 'awaiting-plan'
  | 'executing'
  | 'awaiting-input'
  | 'delivered'
  | 'closed'
  | 'failed-recoverable'
// 会话级状态快照（基线 §21 断点续做深度——目标/已决策/已授权/待办；2026-08-02 增强）
export interface ProblemSnapshot {
  goal: string // 目标（用户问题第一句）
  decisions: string[] // 已确认决策
  authorized: Array<{ tool: string; file: string }> // 已授权操作（2026-08-15 Q9 结构化——原 `[工具] 路径` 字符串拼接协议；旧存档 string[] 由 problemStore 迁移）
  pending: string[] // 待办/待确认
}
export interface ProblemInstance {
  id: string
  title: string // 用户的问题（第一句话）
  status: ProblemStatus
  updatedAt: string // 最近活动时间
  snapshot?: ProblemSnapshot // 断点续做快照（可选——旧数据兼容）
}

// ToolRegistry（ticket 10/14）：renderer 侧工具接口（risk：none=L1 观察 / low=L3 文件操作 / high=L3 命令执行）
// 测试/演示注入通道（2026-08-15 Q10 类型化——仅测试 mock bridge 存在；产品运行时无 demo 字段）
export interface DemoBridge {
  delivery?: DeliveryPackage
  problems?: ProblemInstance[]
  recentFiles?: string[]
  digitalDelivery?: boolean
  trustLadder?: boolean
  dodAlign?: boolean
  compactHistory?: number
  onDeliver?: (pkg: DeliveryPackage) => void
}

export interface NeonForgeTools {
  list: () => Promise<
    Array<{
      name: string
      source: 'core' | 'lsp'
      requiresApproval: boolean
      risk: 'none' | 'low' | 'high'
    }>
  >
  execute: (
    name: string,
    args: Record<string, unknown>,
    opts?: { approved?: boolean; rootPath?: string; sessionId?: string },
  ) => Promise<{
    ok: boolean
    data?: { file?: string; snapshot?: boolean } | unknown
    error?: string
    needApproval?: boolean
    policy?: boolean
  }>
  revert: (filePath: string) => Promise<{ ok: boolean; error?: string }>
  // ticket 14 可撤销：停止当前活动命令（bash 高危——任何时刻可停，不卡死）
  cancel: () => Promise<{ ok: boolean; error?: string }>
}

// D3（ADR-005）：PlannedFiles 契约——权威在 main（落盘 userData——批准事实跨重启）；
// renderer 保留镜像（同步渲染/判定），写操作经此同步 main（取代 files-approved/-reset）
interface PlannedFilesApi {
  load: () => Promise<{ files: string[]; approved: boolean }>
  add: (files: string[]) => Promise<{ files: string[]; approved: boolean }>
  reset: () => Promise<{ files: string[]; approved: boolean }>
}
