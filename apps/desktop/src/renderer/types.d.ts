// renderer 侧 neonforge bridge 类型声明
export interface DirEntry {
  name: string
  path: string
  kind: 'file' | 'dir'
}

export interface ApiKeyStatusView {
  source: 'env' | 'file' | 'encrypted' | 'plaintext' | 'none'
  storedAt: string | null
  plaintextCopy: boolean
  rotateRecommended: boolean
}

export interface NeonForgeBridge {
  version: string
  config: {
    hasKey: () => Promise<boolean>
    getKey: () => Promise<string | null>
    getKeyStatus?: () => Promise<ApiKeyStatusView>
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
      /** env/file 来源时 searchKey 为脱敏 null（应用内保存不覆盖） */
      searchKeySource?: 'env' | 'file' | 'config' | 'none'
      keenableApiKey: string | null
      hasKeenableKey: boolean
      keenableApiKeySource?: 'env' | 'file' | 'config' | 'none'
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
        searchKeySource?: 'env' | 'file' | 'config' | 'none'
        keenableApiKey: string | null
        hasKeenableKey: boolean
        keenableApiKeySource?: 'env' | 'file' | 'config' | 'none'
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
      progressMode?: 'auto' | 'require-action' | 'require-advance'
      sessionId?: string
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
  }
  usage: {
    summary: (sessionId?: string) => Promise<{
      entries: number
      promptTokens: number
      completionTokens: number
      reasoningTokens: number
      totalTokens: number
      cost: number
      unknownCostEntries: number
      cacheHitRate: number | null
    }>
    export: () => Promise<{ ok: boolean; path?: string; error?: string }>
  }
  budget: {
    get: () => Promise<{
      settings: BudgetSettings
      summary: {
        entries: number
        promptTokens: number
        completionTokens: number
        reasoningTokens: number
        totalTokens: number
        cost: number
        unknownCostEntries: number
        cacheHitRate: number | null
      }
      state: { limit: number | null; spent: number; reached: boolean }
    }>
    set: (settings: BudgetSettings) => Promise<{
      ok: boolean
      error?: string
      settings?: BudgetSettings
      state?: { limit: number | null; spent: number; reached: boolean }
    }>
  }
  pricing: {
    get: () => Promise<PriceTableView>
    set: (table: PriceTableView) => Promise<{
      ok: boolean
      error?: string
      table?: PriceTableView
    }>
  }
  acceptance: {
    derive: (
      sessionId: string,
      verificationPlan: string[],
      source?: 'plan-verification' | 'user-dod' | 'manual',
    ) => Promise<AcceptanceRecord | null>
    list: (sessionId: string) => Promise<AcceptanceRecord | null>
    mark: (
      sessionId: string,
      itemId: string,
      status: 'passed' | 'failed' | 'waived',
      opts?: { evidenceRef?: string; manualReason?: string; reason?: string },
    ) => Promise<AcceptanceRecord | null>
    waive: (sessionId: string, itemId: string, reason: string) => Promise<AcceptanceRecord | null>
    applyEvidence: (sessionId: string, evidenceRefs: string[]) => Promise<AcceptanceRecord | null>
    evaluate: (sessionId: string) => Promise<GateResult | null>
    acceptEmpty: (sessionId: string) => Promise<AcceptanceRecord | null>
    clear: (sessionId: string) => Promise<void>
  }
  changeset: {
    list: (sessionId: string) => Promise<{
      id: string
      status: 'proposed' | 'reviewed' | 'applied' | 'reverted' | 'conflicted' | 'superseded'
      items: Array<{
        id: string
        path: string
        status: 'pending' | 'approved' | 'rejected' | 'applied' | 'reverted' | 'conflicted'
        baseHash: string | null
        afterHash: string | null
        snapshotRef: string | null
      }>
      createdAt: string
      updatedAt: string
    } | null>
    revert: (sessionId: string) => Promise<{
      ok: boolean
      reverted: string[]
      conflicted: string[]
      error?: string
    }>
    clear: (sessionId: string) => Promise<void>
  }
  queue: {
    list: (sessionId: string) => Promise<QueueState>
    enqueue: (sessionId: string, title: string) => Promise<QueueResult>
    start: (sessionId: string, entryId: string) => Promise<QueueResult>
    block: (sessionId: string, entryId: string, reason: string) => Promise<QueueResult>
    resume: (sessionId: string, entryId: string) => Promise<QueueResult>
    pause: (sessionId: string, entryId: string) => Promise<QueueResult>
    complete: (sessionId: string, entryId: string) => Promise<QueueResult>
    fail: (sessionId: string, entryId: string, reason: string) => Promise<QueueResult>
    cancel: (sessionId: string, entryId: string) => Promise<QueueResult>
    reorder: (sessionId: string, entryId: string, position: number) => Promise<QueueResult>
    clear: (sessionId: string) => Promise<void>
  }
  delivery: {
    applyDiff: (
      path: string,
      diff: string,
      approved?: boolean,
      sessionId?: string,
    ) => Promise<{ ok: boolean; file?: string; error?: string }>
    revertDiff: (path: string, sessionId?: string) => Promise<{ ok: boolean; error?: string }>
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
  // 2026-08-07 会话时间线（单会话所有步骤统一日志——用户/搭档/工具/授权/状态）
  timeline: {
    log: (evt: {
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
  extensions: {
    list: () => Promise<ExtensionInfo[]>
    toggle: (
      name: string,
      active: boolean,
    ) => Promise<{
      ok: boolean
      extension: ExtensionInfo | null
    }>
    authorize: (name: string) => Promise<{ ok: boolean; extension: ExtensionInfo | null }>
  }
  mcp: {
    config: () => Promise<{ path: string; servers: McpServerConfigView[] }>
    save: (servers: unknown) => Promise<{
      ok: boolean
      servers?: McpServerConfigView[]
      error?: string
    }>
    refresh: () => Promise<{ servers: McpServerStatus[]; configError?: string }>
    status: () => Promise<McpServerStatus[]>
  }
  git: {
    read: (
      action: 'status' | 'log' | 'diff' | 'branches',
      rootPath?: string,
      opts?: { path?: string; limit?: number },
    ) => Promise<{ ok: boolean; data?: unknown; error?: string }>
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
/** BC-14 验收记录（与 domain/acceptance.ts 保持结构一致） */
export interface AcceptanceRecord {
  id: string
  items: Array<{
    id: string
    label: string
    source: 'plan-verification' | 'user-dod' | 'manual'
    status: 'pending' | 'passed' | 'failed' | 'waived'
    evidenceRef?: string
    manualReason?: string
    waivedReason?: string
  }>
  createdAt: string
  updatedAt: string
}
export interface GateResult {
  verdict: 'passed' | 'failed' | 'incomplete' | 'passed-with-waivers'
  blocking: string[]
  waived: string[]
}
/** BC-11 队列条目（与 domain/taskQueue.ts 保持结构一致） */
export interface QueueEntry {
  id: string
  taskRef: string
  title: string
  status: 'queued' | 'running' | 'blocked' | 'paused' | 'completed' | 'failed' | 'cancelled'
  createdAt: string
  updatedAt: string
  blockReason?: string
  failReason?: string
}
export interface QueueState {
  entries: QueueEntry[]
}
export interface QueueResult {
  ok: boolean
  queue?: QueueState
  error?: string
}
/** BC-13 扩展视图（与 domain/extension.ts 保持结构一致） */
export interface ExtensionCapability {
  id: string
  name: string
  description: string
  risk: 'none' | 'low' | 'high'
}
export interface ExtensionInfo {
  id: string
  name: string
  version: string
  kind: 'builtin' | 'mcp' | 'git'
  status: 'registered' | 'active' | 'inactive' | 'failed'
  trust: 'builtin' | 'user-authorized' | 'untrusted'
  capabilities: ExtensionCapability[]
  active: boolean
  failureReason?: string
  authorizedAt?: string
}
export interface McpServerConfigView {
  name: string
  command: string
  args?: string[]
  cwd?: string
}
export interface McpServerStatus {
  name: string
  ok: boolean
  tools: Array<{ name: string; description?: string }>
  error?: string
}
/** BC-12 预算设置 */
export interface BudgetSettings {
  limitUsd: number | null
  pauseOnReach: boolean
}
/** BC-12 价格表（provider:model → 每百万 token 单价） */
export interface PriceTableView {
  version: string
  models: Record<
    string,
    { promptPerMillion: number; completionPerMillion: number; cacheHitPerMillion?: number }
  >
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
      source: 'core' | 'lsp' | 'extension'
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
  revert: (filePath: string, sessionId?: string) => Promise<{ ok: boolean; error?: string }>
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
