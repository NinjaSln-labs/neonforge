import { contextBridge, ipcRenderer } from 'electron'

// D3（ADR-005）：PlannedFiles 契约载荷（main plannedFilesStore 最小契约）
interface PlannedFilesPayload {
  files: string[]
  approved: boolean
}

// BC-02 权限规则载荷（main permissionRulesStore；空 specifier = 该工具全部参数）
interface PermissionRuleView {
  action: 'allow' | 'deny' | 'ask'
  tool: string
  specifier: string
}

// bridge：gateway + config + workspace（IPC 收敛，renderer 不直接碰 node/electron）
contextBridge.exposeInMainWorld('neonforge', {
  version: process.env.npm_package_version ?? '0.1.0',
  config: {
    hasKey: () => ipcRenderer.invoke('config:has-key'),
    getKey: () => ipcRenderer.invoke('config:get-key'),
    getKeyStatus: () =>
      ipcRenderer.invoke('config:key-status') as Promise<{
        source: 'env' | 'file' | 'encrypted' | 'plaintext' | 'none'
        storedAt: string | null
        plaintextCopy: boolean
        rotateRecommended: boolean
      }>,
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
    listModels: (providerId?: string) =>
      ipcRenderer.invoke('gateway:list-models', { providerId }) as Promise<{
        ok: boolean
        providerId?: string
        models?: string[]
        resolved?: { flash: string; pro: string }
        source?: 'list' | 'manual' | 'fallback'
        error?: string
      }>,
    setModel: (modelId: string | null, providerId?: string) =>
      ipcRenderer.invoke('gateway:set-model', { modelId, providerId }) as Promise<{
        ok: boolean
        error?: string
        active?: {
          providerId: string
          providerLabel: string
          upstream: string
          shortName: string
        }
      }>,
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
  usage: {
    summary: (sessionId?: string) => ipcRenderer.invoke('usage:summary', sessionId),
    export: () =>
      ipcRenderer.invoke('usage:export') as Promise<{
        ok: boolean
        path?: string
        error?: string
      }>,
  },
  budget: {
    get: () =>
      ipcRenderer.invoke('budget:get') as Promise<{
        settings: { limitUsd: number | null; pauseOnReach: boolean }
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
      }>,
    set: (settings: unknown) =>
      ipcRenderer.invoke('budget:set', settings) as Promise<{
        ok: boolean
        error?: string
        settings?: { limitUsd: number | null; pauseOnReach: boolean }
        state?: { limit: number | null; spent: number; reached: boolean }
      }>,
  },
  pricing: {
    get: () =>
      ipcRenderer.invoke('pricing:get') as Promise<{
        version: string
        models: Record<
          string,
          { promptPerMillion: number; completionPerMillion: number; cacheHitPerMillion?: number }
        >
      }>,
    set: (table: unknown) =>
      ipcRenderer.invoke('pricing:set', table) as Promise<{
        ok: boolean
        error?: string
        table?: {
          version: string
          models: Record<string, { promptPerMillion: number; completionPerMillion: number }>
        }
      }>,
  },
  acceptance: {
    derive: (
      sessionId: string,
      verificationPlan: string[],
      source?: 'plan-verification' | 'user-dod' | 'manual',
    ) => ipcRenderer.invoke('acceptance:derive', { sessionId, verificationPlan, source }),
    list: (sessionId: string) => ipcRenderer.invoke('acceptance:list', sessionId),
    mark: (
      sessionId: string,
      itemId: string,
      status: 'passed' | 'failed' | 'waived',
      opts?: { evidenceRef?: string; manualReason?: string; reason?: string },
    ) => ipcRenderer.invoke('acceptance:mark', { sessionId, itemId, status, ...opts }),
    waive: (sessionId: string, itemId: string, reason: string) =>
      ipcRenderer.invoke('acceptance:waive', { sessionId, itemId, reason }),
    applyEvidence: (sessionId: string, evidenceRefs: string[]) =>
      ipcRenderer.invoke('acceptance:apply-evidence', { sessionId, evidenceRefs }),
    evaluate: (sessionId: string) => ipcRenderer.invoke('acceptance:evaluate', sessionId),
    acceptEmpty: (sessionId: string) => ipcRenderer.invoke('acceptance:accept-empty', sessionId),
    clear: (sessionId: string) => ipcRenderer.invoke('acceptance:clear', sessionId),
  },
  changeset: {
    list: (sessionId: string) => ipcRenderer.invoke('changeset:list', sessionId),
    revert: (sessionId: string) =>
      ipcRenderer.invoke('changeset:revert', sessionId) as Promise<{
        ok: boolean
        reverted: string[]
        conflicted: string[]
        error?: string
      }>,
    clear: (sessionId: string) => ipcRenderer.invoke('changeset:clear', sessionId),
  },
  queue: {
    list: (sessionId: string) => ipcRenderer.invoke('queue:list', sessionId),
    enqueue: (sessionId: string, title: string) =>
      ipcRenderer.invoke('queue:enqueue', { sessionId, title }),
    start: (sessionId: string, entryId: string) =>
      ipcRenderer.invoke('queue:start', { sessionId, entryId }),
    block: (sessionId: string, entryId: string, reason: string) =>
      ipcRenderer.invoke('queue:block', { sessionId, entryId, reason }),
    resume: (sessionId: string, entryId: string) =>
      ipcRenderer.invoke('queue:resume', { sessionId, entryId }),
    pause: (sessionId: string, entryId: string) =>
      ipcRenderer.invoke('queue:pause', { sessionId, entryId }),
    complete: (sessionId: string, entryId: string) =>
      ipcRenderer.invoke('queue:complete', { sessionId, entryId }),
    fail: (sessionId: string, entryId: string, reason: string) =>
      ipcRenderer.invoke('queue:fail', { sessionId, entryId, reason }),
    cancel: (sessionId: string, entryId: string) =>
      ipcRenderer.invoke('queue:cancel', { sessionId, entryId }),
    reorder: (sessionId: string, entryId: string, position: number) =>
      ipcRenderer.invoke('queue:reorder', { sessionId, entryId, position }),
    clear: (sessionId: string) => ipcRenderer.invoke('queue:clear', sessionId),
  },
  delivery: {
    applyDiff: (
      path: string,
      diff: string,
      approved?: boolean,
      sessionId?: string,
      rootPath?: string,
    ) =>
      ipcRenderer.invoke('delivery:apply-diff', {
        path,
        diff,
        approved: approved ?? false,
        sessionId,
        rootPath,
      }) as Promise<{ ok: boolean; file?: string; error?: string }>,
    revertDiff: (path: string, sessionId?: string, rootPath?: string) =>
      ipcRenderer.invoke('delivery:revert-diff', { path, sessionId, rootPath }) as Promise<{
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
          source: 'core' | 'lsp' | 'extension'
          requiresApproval: boolean
          risk: 'none' | 'low' | 'high'
        }>
      >,
    execute: (
      name: string,
      args: Record<string, unknown>,
      opts?: {
        approved?: boolean
        approvalSource?: 'user' | 'auto' | 'delegate'
        rootPath?: string
        sessionId?: string
      },
    ) =>
      ipcRenderer.invoke('tools:execute', {
        name,
        args,
        approved: opts?.approved ?? false,
        approvalSource: opts?.approvalSource,
        rootPath: opts?.rootPath,
        sessionId: opts?.sessionId,
      }) as Promise<{
        ok: boolean
        data?: unknown
        error?: string
        needApproval?: boolean
        policy?: boolean
      }>,
    revert: (filePath: string, sessionId?: string) =>
      ipcRenderer.invoke('tools:revert', { path: filePath, sessionId }) as Promise<{
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
    // ADR-015：方案确认同步（planConfirmed——不改变 approve-files 的 approved 事实）
    addPlan: (files: string[]) =>
      ipcRenderer.invoke('planned-files:sync-plan', files) as Promise<
        PlannedFilesPayload & { planConfirmed: boolean }
      >,
    reset: () => ipcRenderer.invoke('planned-files:reset') as Promise<PlannedFilesPayload>,
  },
  // BC-02 信任模式（ADR-015：三档预设——authority 在 main userData；trustPolicyStore）
  trust: {
    get: () => ipcRenderer.invoke('trust:get') as Promise<'strict' | 'standard' | 'delegated'>,
    set: (mode: 'strict' | 'standard' | 'delegated') =>
      ipcRenderer.invoke('trust:set', { mode }) as Promise<{
        ok: boolean
        mode: 'strict' | 'standard' | 'delegated'
        error?: string
      }>,
  },
  // BC-02 权限规则（authority 在 main userData；deny > allow > ask）
  permissions: {
    list: () => ipcRenderer.invoke('permissions:list') as Promise<PermissionRuleView[]>,
    set: (rules: PermissionRuleView[]) =>
      ipcRenderer.invoke('permissions:set', { rules }) as Promise<{
        ok: boolean
        rules: PermissionRuleView[]
        error?: string
      }>,
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
  extensions: {
    list: () =>
      ipcRenderer.invoke('extensions:list') as Promise<
        Array<{
          id: string
          name: string
          version: string
          kind: 'builtin' | 'mcp' | 'git'
          status: 'registered' | 'active' | 'inactive' | 'failed'
          trust: 'builtin' | 'user-authorized' | 'untrusted'
          capabilities: Array<{
            id: string
            name: string
            description: string
            risk: 'none' | 'low' | 'high'
          }>
          active: boolean
          failureReason?: string
        }>
      >,
    toggle: (name: string, active: boolean) =>
      ipcRenderer.invoke('extensions:toggle', { name, active }),
    authorize: (name: string) => ipcRenderer.invoke('extensions:authorize', name),
  },
  mcp: {
    config: () =>
      ipcRenderer.invoke('mcp:config') as Promise<{
        path: string
        servers: Array<{ name: string; command: string; args?: string[]; cwd?: string }>
      }>,
    save: (servers: unknown) => ipcRenderer.invoke('mcp:save', servers),
    refresh: () =>
      ipcRenderer.invoke('mcp:refresh') as Promise<{
        servers: Array<{
          name: string
          ok: boolean
          tools: Array<{ name: string; description?: string }>
          error?: string
        }>
        configError?: string
      }>,
    status: () =>
      ipcRenderer.invoke('mcp:status') as Promise<
        Array<{ name: string; ok: boolean; tools: Array<{ name: string }>; error?: string }>
      >,
  },
  git: {
    read: (
      action: 'status' | 'log' | 'diff' | 'branches',
      rootPath?: string,
      opts?: { path?: string; limit?: number },
    ) =>
      ipcRenderer.invoke('git:read', { action, rootPath, ...opts }) as Promise<{
        ok: boolean
        data?: unknown
        error?: string
      }>,
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
