import { contextBridge, ipcRenderer } from 'electron'

// 作用域条目形状（本文件内唯一源＝本别名；跨面唯一源在 `renderer/types.d.ts` 的 `ScopeEntryDTO`，
// preload 不 import 那个声明文件，故此处另立一处、两处词表须保持一致）。
type ScopeEntryArg = { kind: '仓库' | '目录' | '命令' | '网络'; pattern: string }

// 版本链元素（与 `renderer/types.d.ts` 的 `ScopeVersionDTO` 同形；preload 不 import 那个声明文件）
type ScopeVersionArg = { seq: number; entries: ScopeEntryArg[]; amendmentRef: string | null }

// D3（ADR-005）：PlannedFiles 契约载荷（main plannedFilesStore 最小契约）
interface PlannedFilesPayload {
  files: string[]
  approved: boolean
}

// bridge：gateway + config + workspace（IPC 收敛，renderer 不直接碰 node/electron）
contextBridge.exposeInMainWorld('neonforge', {
  version: process.env.npm_package_version ?? '0.1.0',
  config: {
    hasKey: () => ipcRenderer.invoke('config:has-key'),
    getKey: () => ipcRenderer.invoke('config:get-key'),
    getProvider: () => ipcRenderer.invoke('config:get-provider'),
    setKey: (key: string, providerId?: string, modelId?: string | null) =>
      ipcRenderer.invoke('config:set-key', key, providerId, modelId),
    clearKey: () => ipcRenderer.invoke('config:clear-key'),
    listProviders: () => ipcRenderer.invoke('config:list-providers'),
    getModel: () => ipcRenderer.invoke('config:get-model'),
    getWebAccess: () => ipcRenderer.invoke('config:get-web-access'),
    setWebAccess: (patch: {
      enabled?: boolean
      searchUrl?: string | null
      searchKey?: string | null
      keenableApiKey?: string | null
      keenablePublicTrial?: boolean
      probe?: boolean
    }) => ipcRenderer.invoke('config:set-web-access', patch),
  },
  gateway: {
    validate: (apiKey: string, providerId?: string, modelId?: string | null) =>
      ipcRenderer.invoke('gateway:validate', apiKey, providerId, modelId),
    activeModel: () =>
      ipcRenderer.invoke('gateway:active-model') as Promise<{
        providerId: string
        providerLabel: string
        upstream: string
        shortName: string
      }>,
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
    }) => ipcRenderer.invoke('gateway:stream-chat', opts),
    onStreamChunk: (
      cb: (chunk: {
        type: string
        text?: string
        toolCall?: { name: string; args: Record<string, unknown> }
      }) => void,
    ) => {
      const listener = (
        _e: unknown,
        chunk: {
          type: string
          text?: string
          toolCall?: { name: string; args: Record<string, unknown> }
        },
      ) => cb(chunk)
      ipcRenderer.on('gateway:stream-chunk', listener)
      return () => ipcRenderer.removeListener('gateway:stream-chunk', listener)
    },
    // S1b Task 4（E1）：流级取消——Stop 按钮经此转投 main，落到 Task 2 的 gateway.abort（streamId 面）。
    stop: (streamId: string) =>
      ipcRenderer.invoke('gateway:cancel-stream', { streamId }) as Promise<{ ok: boolean }>,
  },
  // S1b Task 4（详设 §7）：委托单中心领域通道——逐键对齐 ipcDomain 注册表（通道名即契约）。
  delegation: {
    create: (args: { delegationId?: string; intent: string; scopeEntries?: ScopeEntryArg[] }) =>
      ipcRenderer.invoke('delegation:create', args) as Promise<{
        delegationId: string
        state: string
      }>,
    list: () =>
      ipcRenderer.invoke('delegation:list') as Promise<
        Array<{ delegationId: string; intent: string; state: string; reopenCount: number }>
      >,
    accept: (delegationId: string) =>
      ipcRenderer.invoke('delegation:accept', { delegationId }) as Promise<{
        delegationId: string
        intent: string
        state: string
        reopenCount: number
      }>,
    reject: (delegationId: string, reason?: string) =>
      ipcRenderer.invoke('delegation:reject', { delegationId, reason }) as Promise<{
        delegationId: string
        intent: string
        state: string
        reopenCount: number
      }>,
  },
  turn: {
    start: (args: {
      delegationId: string
      turnId?: string
      inputId?: string
      triggerSource: '用户输入' | '系统恢复' | '队列准入'
    }) =>
      ipcRenderer.invoke('turn:start', args) as Promise<
        { into: 'turn'; turnId: string } | { into: 'queue'; itemId: string }
      >,
  },
  decision: {
    raise: (args: {
      decisionPointId?: string
      delegationId: string
      turnId: string
      requestReason: {
        reason: '作用域外' | '高影响清单命中' | '作用域修正'
        operation: string
        requestedBy: 'AI 提请' | '用户提请'
      }
    }) =>
      ipcRenderer.invoke('decision:raise', args) as Promise<{
        decisionPointId: string
        open: boolean
      }>,
    resolve: (args: { decisionPointId: string; value: string; reason?: string }) =>
      ipcRenderer.invoke('decision:resolve', args) as Promise<{ resolved: string | null }>,
  },
  // S2b Task 3：作用域两通道过桥（条目形状沿用本文件内联字面做法——preload 不 import renderer 声明文件）
  scope: {
    chain: (delegationId: string): Promise<ScopeVersionArg[]> =>
      ipcRenderer.invoke('scope:chain', { delegationId }),
    amend: (args: {
      delegationId: string
      decisionPointId: string
      entries: ScopeEntryArg[]
    }): Promise<{ version: number } | { rejected: true; why: string }> =>
      ipcRenderer.invoke('scope:amend', args),
  },
  evidence: {
    listByDelegation: (delegationId: string) =>
      ipcRenderer.invoke('evidence:list-by-delegation', { delegationId }) as Promise<
        Array<{
          evidenceId: string
          type: string
          delegationId: string
          payloadRef: string
          provenance: string
        }>
      >,
    inspect: (evidenceId: string) =>
      ipcRenderer.invoke('evidence:inspect', { evidenceId }) as Promise<{
        firstInspection: boolean
      }>,
  },
  queue: {
    pending: () =>
      ipcRenderer.invoke('queue:pending') as Promise<
        Array<{ itemId: string; delegationId: string; inputId: string; origin: string }>
      >,
  },
  timeline: {
    queryByDelegation: (delegationId: string) =>
      ipcRenderer.invoke('timeline:query-by-delegation', { delegationId }) as Promise<
        Array<{ seq: number; ts: string; type: string; delegationId: string; detail: unknown }>
      >,
    subscribe: () => ipcRenderer.invoke('timeline:subscribe') as Promise<{ subscribed: boolean }>,
    // B4 只读分发跨进程面：main 侧起转发后，本窗口经此收 'timeline:event'。
    onEvent: (
      cb: (e: {
        seq: number
        ts: string
        type: string
        delegationId: string
        detail: unknown
      }) => void,
    ) => {
      const listener = (
        _e: unknown,
        evt: { seq: number; ts: string; type: string; delegationId: string; detail: unknown },
      ) => cb(evt)
      ipcRenderer.on('timeline:event', listener)
      return () => ipcRenderer.removeListener('timeline:event', listener)
    },
  },
  delivery: {
    applyDiff: (path: string, diff: string, approved?: boolean) =>
      ipcRenderer.invoke('delivery:apply-diff', {
        path,
        diff,
        approved: approved ?? false,
      }) as Promise<{ ok: boolean; file?: string; error?: string }>,
    revertDiff: (path: string) =>
      ipcRenderer.invoke('delivery:revert-diff', { path }) as Promise<{
        ok: boolean
        error?: string
      }>,
  },
  // S4 完成对账 V1a：系统代跑只读验证命令（main 侧 fail-closed——非只读不执行）
  completion: {
    verify: (commands: string[], rootPath?: string | null) =>
      ipcRenderer.invoke('completion:verify', {
        commands,
        rootPath: rootPath ?? null,
      }) as Promise<Record<string, { ok: boolean; output?: string }>>,
  },
  workspace: {
    openFolder: () => ipcRenderer.invoke('workspace:open-folder') as Promise<string | null>,
    listDir: (dirPath: string) =>
      ipcRenderer.invoke('workspace:list-dir', dirPath) as Promise<
        Array<{ name: string; path: string; kind: 'file' | 'dir' }>
      >,
    readFile: (filePath: string) =>
      ipcRenderer.invoke('workspace:read-file', filePath) as Promise<
        { ok: true; content: string } | { ok: false; error: string }
      >,
    readNotebook: (rootPath: string | null) =>
      ipcRenderer.invoke('workspace:read-notebook', rootPath) as Promise<
        { ok: true; content: string } | { ok: false; error: string } | null
      >,
    initProject: (title: string) =>
      ipcRenderer.invoke('workspace:init-project', title) as Promise<
        { ok: true; path: string; title: string } | { ok: false; error: string }
      >,
    updateProjectTitle: (path: string, title: string) =>
      ipcRenderer.invoke('workspace:update-project-title', path, title) as Promise<{
        ok: boolean
        error?: string
      }>,
  },
  // 2026-08-04：对话日志（自动记录 + 导出）
  chatLog: {
    log: (entry: {
      ts: string
      role: 'user' | 'assistant'
      content?: string
      toolCalls?: Array<{ name: string; status?: string }>
      session?: string
    }) => ipcRenderer.invoke('chat:log', entry) as Promise<void>,
    export: () =>
      ipcRenderer.invoke('chat:export') as Promise<{ ok: boolean; path?: string; error?: string }>,
  },
  // A2.5（S1b）：旧 JSONL 会话时间线面退役——`timeline.log/query` 桥随 main 侧 handler 同批移除；
  // renderer 两处调用点皆 `timeline?.log?.()` 可选链，桥缺席＝静默 no-op，不产生未处理拒绝。
  tools: {
    list: () =>
      ipcRenderer.invoke('tools:list') as Promise<
        Array<{
          name: string
          source: 'core' | 'lsp'
          requiresApproval: boolean
          risk: 'none' | 'low' | 'high'
        }>
      >,
    execute: (
      name: string,
      args: Record<string, unknown>,
      opts?: { approved?: boolean; rootPath?: string; sessionId?: string },
    ) =>
      ipcRenderer.invoke('tools:execute', {
        name,
        args,
        approved: opts?.approved ?? false,
        rootPath: opts?.rootPath,
        sessionId: opts?.sessionId,
      }) as Promise<{
        ok: boolean
        data?: unknown
        error?: string
        needApproval?: boolean
        policy?: boolean
      }>,
    revert: (filePath: string) =>
      ipcRenderer.invoke('tools:revert', { path: filePath }) as Promise<{
        ok: boolean
        error?: string
      }>,
    // ticket 14 可撤销：停止当前活动命令（bash 高危——任何时刻可停）
    cancel: () => ipcRenderer.invoke('tools:cancel') as Promise<{ ok: boolean; error?: string }>,
  },
  // D3（ADR-005）：PlannedFiles 三件套契约（权威在 main——落盘 userData；取代 files-approved/-reset）
  plannedFiles: {
    load: () => ipcRenderer.invoke('planned-files:load') as Promise<PlannedFilesPayload>,
    add: (files: string[]) =>
      ipcRenderer.invoke('planned-files:add', files) as Promise<PlannedFilesPayload>,
    reset: () => ipcRenderer.invoke('planned-files:reset') as Promise<PlannedFilesPayload>,
  },
  // #6 真机 2026-08-31（复验轮）：方案确认布尔镜像——approve-files 硬序门（main 侧 planConfirmedRef）
  session: {
    setPlanConfirmed: (v: boolean) =>
      ipcRenderer.invoke('session:plan-confirmed', v) as Promise<void>,
  },
  context: {
    resolve: (files: string[]) =>
      ipcRenderer.invoke('context:resolve', { files }) as Promise<{
        fragments: Array<{ path: string; content: string; truncated: boolean }>
      }>,
  },
  rag: {
    search: (query: string) =>
      ipcRenderer.invoke('rag:search', { query }) as Promise<{
        hits: Array<{ path: string; line: number; snippet: string }>
        note?: string
      }>,
  },
  plugins: {
    list: () =>
      ipcRenderer.invoke('plugins:list') as Promise<
        Array<{ name: string; version: string; active: boolean }>
      >,
    toggle: (name: string, active: boolean) =>
      ipcRenderer.invoke('plugins:toggle', { name, active }) as Promise<boolean>,
  },
  preheat: {
    status: () =>
      ipcRenderer.invoke('preheat:status') as Promise<{
        plan: { shouldPreheat: boolean; why: string; actions: string[] }
        cache: {
          standardPrefix: string
          hash: string
          history: Array<{ hash: string; at: string; hit: boolean }>
        } | null
      }>,
  },
  compaction: {
    compact: (
      history: Array<{ role: string; content: string | null; reasoning_content?: string }>,
    ) =>
      ipcRenderer.invoke('compaction:compact', { history }) as Promise<
        | {
            ok: true
            summary: string
            kept: Array<{ role: string; content: string | null; reasoning_content?: string }>
          }
        | { ok: false; error: string }
      >,
  },
})
