import { contextBridge, ipcRenderer } from 'electron'

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
    setKey: (key: string) => ipcRenderer.invoke('config:set-key', key),
    clearKey: () => ipcRenderer.invoke('config:clear-key'),
  },
  gateway: {
    validate: (apiKey: string) => ipcRenderer.invoke('gateway:validate', apiKey),
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
  // 2026-08-07 会话时间线（单会话所有步骤统一日志——用户/搭档/工具/授权/状态——分析一步到位）
  timeline: {
    log: (evt: {
      session?: string
      type: string
      role?: 'user' | 'assistant' | 'system' | 'tool'
      detail?: Record<string, unknown>
    }) => ipcRenderer.invoke('timeline:log', evt) as Promise<void>,
    // 2026-08-15 DDD 重建：时间线查询（通用接入——调试/分析）
    query: (filter: {
      session?: string
      type?: string | string[]
      from?: string
      to?: string
      limit?: number
    }) =>
      ipcRenderer.invoke('timeline:query', filter) as Promise<
        Array<{
          ts: string
          seq: number
          session: string
          type: string
          role?: string
          detail: Record<string, unknown>
        }>
      >,
  },
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
