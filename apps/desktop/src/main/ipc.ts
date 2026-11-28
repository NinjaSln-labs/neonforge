// IPC handlers：renderer 经 preload → 主进程 gateway/configStore/workspace
import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import {
  parseUnifiedDiff,
  applyDiffToFile,
  snapshot,
  revert,
  cleanupSnapshots,
} from './applyDiff.js'
import { gateway, classifyGatewayError } from './gateway.js'
import { configStore } from './configStore.js'
import { isProviderId, listProviders, normalizeModelId } from './providers/index.js'
import { workspace } from './workspace.js'
import {
  initTools,
  toolRegistry,
  revertToolFile,
  cancelActiveCommand,
  syncPlanApprovedFromStore,
  syncPlanConfirmed,
  resolveDeliveryTarget,
} from './tools.js'
import { getPlannedFilesStore } from './plannedFilesStore.instance.js'
import { getPermissionRulesStore } from './permissionRulesStore.instance.js'
import { getTrustPolicyStore } from './trustPolicyStore.instance.js'
import { registerLspTools, lsp, isLspServerAvailable } from './lsp.js'
import { context } from './context.js'
import { codeRag } from './codeRag.js'
import { buildStandardPrefix, planPreheat, prefixCache, preheating } from './preheat.js'
import { initPlugins, pluginRegistry, setPluginTimelineSink } from './pluginSystem.js'
import { compaction } from './compact.js'
import { appendChatLog, exportChatLog } from './chatLog.js'
import { logTimeline, timelineLogger } from './timelineLogger.js'
import { runVerificationCommands } from './verification.js'
import { createUsageEntry, evaluateBudget, summarizeUsage } from '../domain/usageLedger.js'
import { getBudgetStore } from './budgetStore.instance.js'
import { getPriceStore } from './priceStore.instance.js'
import { getUsageStore } from './usageStore.instance.js'
import { getAcceptanceStore } from './acceptanceStore.instance.js'
import { getProblemLedgerStore } from './problemLedgerStore.instance.js'
import type { AcceptanceSource } from '../domain/acceptance.js'
import { getChangeSetService } from './changeSetService.instance.js'
import { getTaskQueueStore } from './taskQueueStore.instance.js'
import { getMcpManager } from './mcpManager.instance.js'
import { gitRead } from './gitBridge.js'
import { IPC_SCHEMAS, validateIpc } from './ipcSchema.js'

export function registerIpc(): void {
  initTools()
  // BC-13：扩展生命周期事件进时间线（无会话归属——默认日期日志）
  setPluginTimelineSink((event) =>
    logTimeline({ type: event.type, role: event.role ?? 'system', detail: event.detail }),
  )
  initPlugins() // 08：注册 5 内置插件（生命周期钩子）
  registerLspTools(toolRegistry)
  // BC-02：权限规则跨重启恢复（deny > allow > ask；IPC 保存后同步 registry）
  toolRegistry.setRules(getPermissionRulesStore().load())
  // BC-12：预算按自然月累计（周期预算语义；usage 台账本身保留全部历史）
  const currentPeriodSummary = () => {
    const prefix = new Date().toISOString().slice(0, 7) // YYYY-MM
    return summarizeUsage(
      getUsageStore()
        .load()
        .filter((e) => e.at.startsWith(prefix)),
    )
  }
  // BC-12：预算阈值提醒去重（每进程周期；budget:set 重置）
  const budgetNotified = new Set<string>()
  // D3（ADR-005）：启动恢复——write 门控布尔镜像从 store 同步（批准事实跨重启；renderer 挂载时另经 planned-files:load 恢复清单）
  syncPlanApprovedFromStore()
  // 2026-11-15 审查修复：env/凭据文件来源的 Web Key 不回传 renderer——
  // 设置页只回填本地可编辑值；来源用 source 字段标注（避免整表单保存把 env 值加密落盘）。
  const webAccessView = (w: ReturnType<typeof configStore.getWebAccess>) => ({
    enabled: w.enabled,
    probeOk: w.probeOk,
    builtinProvider: w.builtinProvider,
    searchUrl: w.searchUrl,
    hasSearchKey: w.hasSearchKey,
    searchKey: w.searchKeySource === 'config' ? w.searchKey : null,
    searchKeySource: w.searchKeySource,
    keenableApiKey: w.keenableApiKeySource === 'config' ? w.keenableApiKey : null,
    hasKeenableKey: w.hasKeenableKey,
    keenableApiKeySource: w.keenableApiKeySource,
    keenablePublicTrial: w.keenablePublicTrial,
  })
  ipcMain.handle('config:has-key', () => configStore.hasValidKey())
  // 2026-11-24 审计：移除 config:get-key（明文 Key 不进 renderer）；renderer 只用 has-key / key-status
  ipcMain.handle('config:key-status', () => configStore.getApiKeyStatus())
  ipcMain.handle('config:get-provider', () => configStore.getProviderId())
  ipcMain.handle('config:get-model', () => configStore.getModelId())
  ipcMain.handle(
    'config:set-key',
    (_e, key: string, providerId?: string, modelId?: string | null) => {
      const valid = validateIpc({ key, providerId, modelId }, IPC_SCHEMAS.apiKeySet)
      if (!valid.ok) throw new Error(`参数校验失败（config:set-key）：${valid.error}`)
      return configStore.setApiKey(
        key,
        isProviderId(providerId) ? providerId : configStore.getProviderId(),
        modelId,
      )
    },
  )
  ipcMain.handle('config:clear-key', () => configStore.clearApiKey())
  ipcMain.handle('config:list-providers', () => listProviders())
  ipcMain.handle('config:get-web-access', () => webAccessView(configStore.getWebAccess()))
  ipcMain.handle(
    'config:set-web-access',
    async (
      _e,
      patch: {
        enabled?: boolean
        searchUrl?: string | null
        searchKey?: string | null
        keenableApiKey?: string | null
        keenablePublicTrial?: boolean
        /** true = 开启时跑探测；有覆盖 URL 时跳过 */
        probe?: boolean
      },
    ) => {
      // P1-04：web 探测 URL/密钥载荷入口校验（非法结构不进入 probe/落盘）
      const valid = validateIpc(patch, IPC_SCHEMAS.webAccessPatch)
      if (!valid.ok) {
        return {
          ok: false,
          error: `参数校验失败（config:set-web-access）：${valid.error}`,
          config: webAccessView(configStore.getWebAccess()),
        }
      }
      const cur = configStore.getWebAccess()
      const nextEnabled = patch.enabled ?? cur.enabled
      const nextUrl =
        patch.searchUrl !== undefined ? patch.searchUrl?.trim() || null : cur.searchUrl
      let probeOk = cur.probeOk
      if (patch.enabled === false) {
        probeOk = false
      } else if (nextEnabled && (patch.probe || patch.enabled === true)) {
        let builtinProvider: 'ddg' | 'keenable' | null | undefined
        if (nextUrl) {
          probeOk = true // 有覆盖端点——跳过内置探测
          builtinProvider = null
        } else {
          const { probeWebAccess } = await import('./webTools.js')
          const keenKey =
            patch.keenableApiKey !== undefined ? patch.keenableApiKey : cur.keenableApiKey
          const r = await probeWebAccess(undefined, { keenableApiKey: keenKey })
          probeOk = r.ok
          builtinProvider = r.provider ?? null
          if (!r.ok) {
            configStore.setWebAccess({
              enabled: false,
              probeOk: false,
              builtinProvider: null,
              searchUrl: patch.searchUrl,
              searchKey: patch.searchKey,
              keenableApiKey: patch.keenableApiKey,
              keenablePublicTrial: patch.keenablePublicTrial,
            })
            return {
              ok: false,
              error: r.error ?? '外网探测失败',
              config: webAccessView(configStore.getWebAccess()),
            }
          }
        }
        const config = configStore.setWebAccess({
          enabled: nextEnabled,
          probeOk,
          builtinProvider,
          searchUrl: patch.searchUrl,
          searchKey: patch.searchKey,
          keenableApiKey: patch.keenableApiKey,
          keenablePublicTrial: patch.keenablePublicTrial,
        })
        return { ok: true, config: webAccessView(config) }
      }
      const config = configStore.setWebAccess({
        enabled: nextEnabled,
        probeOk,
        searchUrl: patch.searchUrl,
        searchKey: patch.searchKey,
        keenableApiKey: patch.keenableApiKey,
        keenablePublicTrial: patch.keenablePublicTrial,
      })
      return { ok: true, config: webAccessView(config) }
    },
  )

  // 验证 Key——无 /models 时须带 modelId
  ipcMain.handle(
    'gateway:validate',
    async (_e, apiKey: string, providerId?: string, modelId?: string | null) => {
      const valid = validateIpc({ apiKey, providerId, modelId }, IPC_SCHEMAS.gatewayValidate)
      if (!valid.ok) return { ok: false, error: `参数校验失败（gateway:validate）：${valid.error}` }
      const id = isProviderId(providerId) ? providerId : configStore.getProviderId()
      return gateway.validateKey(apiKey, id, modelId ?? configStore.getModelId())
    },
  )

  // 当前模型展示（状态栏）——已缓存列表或 fallback / 手填
  ipcMain.handle('gateway:active-model', () => {
    const id = configStore.getProviderId()
    return gateway.peekActiveModel(id, configStore.getModelId(), 'flash')
  })

  // ADR-017：模型列表/切换（使用已保存 Key；失败保留上次可用列表由 renderer 决定）
  ipcMain.handle('gateway:list-models', async (_e, opts: { providerId?: string } = {}) => {
    const valid = validateIpc(opts, IPC_SCHEMAS.gatewayListModels)
    if (!valid.ok) return { ok: false, error: `参数校验失败：${valid.error}` }
    const id = isProviderId(opts.providerId) ? opts.providerId : configStore.getProviderId()
    const apiKey = configStore.getApiKey()
    if (!apiKey) return { ok: false, error: 'no-key' }
    try {
      const r = await gateway.refreshModels(id, apiKey, configStore.getModelId())
      return {
        ok: true,
        providerId: id,
        models: r.available,
        resolved: r.resolved,
        source: r.source,
      }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'network' }
    }
  })

  ipcMain.handle(
    'gateway:set-model',
    async (_e, opts: { providerId?: string; modelId: string | null }) => {
      const valid = validateIpc(opts, IPC_SCHEMAS.gatewaySetModel)
      if (!valid.ok) return { ok: false, error: `参数校验失败：${valid.error}` }
      const id = isProviderId(opts.providerId) ? opts.providerId : configStore.getProviderId()
      const modelId = normalizeModelId(opts.modelId)
      if (opts.modelId !== null && !modelId) return { ok: false, error: 'invalid-model' }
      await configStore.setModelSelection(modelId, id)
      return { ok: true, active: gateway.peekActiveModel(id, configStore.getModelId(), 'flash') }
    },
  )

  // ADR-018：问题台账 main 权威 + 同步目录（凭据仅环境变量/文件，不在配置中存值）
  ipcMain.handle('problems:load', () => getProblemLedgerStore().load())
  ipcMain.handle('problems:save', (_e, opts: { problems: unknown[] }) => {
    const valid = validateIpc(opts, IPC_SCHEMAS.problemsSave)
    if (!valid.ok) return { ok: false, problems: [], error: `参数校验失败：${valid.error}` }
    return getProblemLedgerStore().save(opts.problems as never)
  })
  ipcMain.handle('problems:sync-status', () => getProblemLedgerStore().status())
  ipcMain.handle('problems:set-sync-folder', (_e, opts: { folder: string | null }) => {
    const valid = validateIpc(opts, IPC_SCHEMAS.problemsSyncFolder)
    if (!valid.ok) return { ok: false, error: `参数校验失败：${valid.error}` }
    return getProblemLedgerStore().setSyncFolder(opts.folder)
  })
  ipcMain.handle('problems:choose-sync-folder', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const options: OpenDialogOptions = { properties: ['openDirectory', 'createDirectory'] }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true }
    return getProblemLedgerStore().setSyncFolder(result.filePaths[0])
  })
  ipcMain.handle('problems:sync-now', () => getProblemLedgerStore().syncNow())

  // 流式 chat：事件逐块推给 renderer（经 webContents.send）
  ipcMain.handle(
    'gateway:stream-chat',
    async (
      event,
      opts: {
        // 旧客户端兼容字段（renderer 已不再传入）；main 以 configStore 的当前 Key 为准
        apiKey?: string
        level?: 'none' | 'basic' | 'medium' | 'high'
        tools?: boolean
        // 2026-11-28 审计：forceTool / progressMode 曾用于 gateway 参数，但 gateway 内零读取
        // （推进判定在 renderer 侧 decideProgressGuarantee 完成）——保留载荷字段仅为 IPC 契约兼容，
        // main 不再转译给 gateway。
        forceTool?: boolean
        progressMode?: 'auto' | 'require-action' | 'require-advance'
        messages: Array<{
          role: string
          content: string | null
          tool_calls?: unknown[]
          tool_call_id?: string
          reasoning_content?: string
        }>
        sessionId?: string
      },
    ) => {
      // P1-04：入口契约校验（renderer/preload/main 漂移或非法载荷 → 明确失败，不进入下游）
      const valid = validateIpc(opts, IPC_SCHEMAS.streamChat)
      if (!valid.ok) {
        return { ok: false, error: `参数校验失败：${valid.error}`, errorType: 'unknown' as const }
      }
      const send = (
        type: 'reasoning' | 'content' | 'tool-call' | 'done' | 'stream-reset',
        text?: string,
        toolCall?: { name: string; args: Record<string, unknown> },
      ) => {
        if (type === 'tool-call')
          console.log(
            '[ipc] SEND tool-call:',
            toolCall?.name,
            JSON.stringify(toolCall?.args).slice(0, 80),
          )
        if (type === 'done') console.log('[ipc] SEND done')
        if (type === 'stream-reset') console.log('[ipc] SEND stream-reset (retry)')
        // 干净对象（无 undefined 字段——contextBridge 结构化传输兼容）
        const payload: Record<string, unknown> = { type }
        if (text !== undefined) payload.text = text
        if (toolCall) payload.toolCall = toolCall
        event.sender.send('gateway:stream-chunk', payload)
      }
      try {
        // 2026-11-24 审计：Key 只在 main 内读取（env/凭据文件/加密存储）——renderer 载荷中的 Key 不采信
        const apiKey = configStore.getApiKey()
        if (!apiKey) {
          return { ok: false, error: '未配置可用 Key', errorType: 'key-invalid' as const }
        }
        await gateway.streamChat(apiKey, {
          providerId: configStore.getProviderId(),
          manualModelId: configStore.getModelId(),
          level: opts.level ?? 'basic',
          tools: opts.tools ?? false,
          messages: opts.messages,
          onDelta: (chunk) =>
            send(chunk.type, chunk.text, 'toolCall' in chunk ? chunk.toolCall : undefined),
          // BC-12：Provider 真实 usage → 本机用量台账（不含内容；sessionId 由 renderer 传入）
          onUsage: (u) => {
            const at = new Date().toISOString()
            const entry = createUsageEntry(
              {
                id: `usage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                at,
                provider: u.providerId,
                model: u.model,
                promptTokens: u.promptTokens,
                completionTokens: u.completionTokens,
                reasoningTokens: u.reasoningTokens,
                cacheHitTokens: u.cacheHitTokens,
                cacheMissTokens: u.cacheMissTokens,
                sessionId: opts.sessionId,
              },
              getPriceStore().load(),
            )
            getUsageStore().record(entry)
            logTimeline({
              session: opts.sessionId,
              type: 'usage.recorded',
              role: 'system',
              detail: {
                provider: entry.provider,
                model: entry.model,
                tokens: entry.promptTokens + entry.completionTokens + entry.reasoningTokens,
                cost: entry.cost,
              },
            })
            // 预算提醒：达到阈值 → 事件一次；默认不硬中断（pauseOnReach 由 renderer 在安全点检查）
            const settings = getBudgetStore().load()
            if (settings.limitUsd !== null) {
              const state = evaluateBudget(currentPeriodSummary(), settings.limitUsd)
              const key = `global:${settings.limitUsd}`
              if (state.reached && !budgetNotified.has(key)) {
                budgetNotified.add(key)
                logTimeline({
                  session: opts.sessionId,
                  type: 'usage.budget_threshold_reached',
                  role: 'system',
                  detail: { limit: settings.limitUsd, spent: state.spent },
                })
              }
            }
          },
        })
        return { ok: true }
      } catch (e) {
        console.log('[ipc] stream error:', e instanceof Error ? e.message : String(e))
        // 2026-08-07 T1 根因补强：结构化 errorType 分类透传（renderer 读字段——不再 includes('5')/正则抠文本）
        return {
          ok: false,
          error: e instanceof Error ? e.message : 'gateway-error',
          errorType: classifyGatewayError(e),
        }
      }
    },
  )

  // BC-12 用量与成本：查询汇总 / 脱敏导出 / 预算
  ipcMain.handle('usage:summary', (_e, sessionId?: string) => {
    if (sessionId !== undefined) {
      const valid = validateIpc(sessionId, IPC_SCHEMAS.sessionId)
      if (!valid.ok) throw new Error(`参数校验失败（usage:summary）：${valid.error}`)
    }
    return getUsageStore().summary(sessionId)
  })
  ipcMain.handle('usage:export', () => getUsageStore().exportCsv())
  const budgetSnapshot = () => {
    const settings = getBudgetStore().load()
    const summary = currentPeriodSummary()
    return { settings, summary, state: evaluateBudget(summary, settings.limitUsd) }
  }
  ipcMain.handle('budget:get', () => budgetSnapshot())
  ipcMain.handle('pricing:get', () => getPriceStore().load())
  ipcMain.handle('pricing:set', (_e, input: unknown) => {
    try {
      return { ok: true, table: getPriceStore().save(input), ...budgetSnapshot() }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })
  ipcMain.handle('budget:set', (_e, input: unknown) => {
    try {
      const settings = getBudgetStore().save(input)
      budgetNotified.clear()
      return { ok: true, ...budgetSnapshot(), settings }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  // BC-14 验收与质量门禁
  ipcMain.handle(
    'acceptance:derive',
    (_e, opts: { sessionId: string; verificationPlan?: string[]; source?: AcceptanceSource }) => {
      const valid = validateIpc(opts, IPC_SCHEMAS.acceptanceDerive)
      if (!valid.ok) return null
      return getAcceptanceStore().derive(
        opts.sessionId,
        opts.verificationPlan ?? [],
        opts.source ?? 'plan-verification',
      )
    },
  )
  ipcMain.handle('acceptance:list', (_e, sessionId: string) => {
    const valid = validateIpc(sessionId, IPC_SCHEMAS.sessionId)
    return valid.ok ? getAcceptanceStore().get(sessionId) : null
  })
  ipcMain.handle(
    'acceptance:mark',
    (
      _e,
      opts: {
        sessionId: string
        itemId: string
        status: 'passed' | 'failed' | 'waived'
        evidenceRef?: string
        manualReason?: string
        reason?: string
      },
    ) => {
      const valid = validateIpc(opts, IPC_SCHEMAS.acceptanceMark)
      if (!valid.ok) return null
      return getAcceptanceStore().mark(opts.sessionId, opts.itemId, opts.status, {
        evidenceRef: opts.evidenceRef,
        manualReason: opts.manualReason,
        reason: opts.reason,
      })
    },
  )
  ipcMain.handle(
    'acceptance:waive',
    (_e, opts: { sessionId: string; itemId: string; reason: string }) => {
      const valid = validateIpc(opts, IPC_SCHEMAS.acceptanceWaive)
      if (!valid.ok) return null
      return getAcceptanceStore().mark(opts.sessionId, opts.itemId, 'waived', {
        reason: opts.reason,
      })
    },
  )
  ipcMain.handle(
    'acceptance:apply-evidence',
    (_e, opts: { sessionId: string; evidenceRefs: string[] }) => {
      const valid = validateIpc(opts, IPC_SCHEMAS.acceptanceEvidence)
      if (!valid.ok) return null
      return getAcceptanceStore().applyEvidence(opts.sessionId, opts.evidenceRefs ?? [])
    },
  )
  ipcMain.handle('acceptance:evaluate', (_e, sessionId: string) => {
    const valid = validateIpc(sessionId, IPC_SCHEMAS.sessionId)
    return valid.ok ? getAcceptanceStore().evaluate(sessionId) : null
  })
  ipcMain.handle('acceptance:accept-empty', (_e, sessionId: string) => {
    const valid = validateIpc(sessionId, IPC_SCHEMAS.sessionId)
    return valid.ok ? getAcceptanceStore().acceptEmpty(sessionId) : null
  })
  ipcMain.handle('acceptance:clear', (_e, sessionId: string) => {
    const valid = validateIpc(sessionId, IPC_SCHEMAS.sessionId)
    if (valid.ok) getAcceptanceStore().clear(sessionId)
  })

  // BC-11 任务编排：队列命令（每命令返回 {ok, queue|error}）
  const queueSafe = (fn: () => unknown) => {
    try {
      return { ok: true, queue: fn() }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }
  // P1-04：队列命令入口校验（sessionId/entryId/position 结构——非法载荷不进入队列存储）
  const queueInvalid = (error: string) => ({
    ok: false as const,
    error: `参数校验失败：${error}`,
  })
  ipcMain.handle('queue:list', (_e, sessionId: string) => {
    const valid = validateIpc(sessionId, IPC_SCHEMAS.sessionId)
    return valid.ok ? getTaskQueueStore().list(sessionId) : { entries: [] }
  })
  ipcMain.handle('queue:enqueue', (_e, opts: { sessionId: string; title: string }) => {
    const valid = validateIpc(opts, IPC_SCHEMAS.queueEnqueue)
    return valid.ok
      ? queueSafe(() => getTaskQueueStore().enqueue(opts.sessionId, opts.title))
      : queueInvalid(valid.error)
  })
  ipcMain.handle('queue:start', (_e, opts: { sessionId: string; entryId: string }) => {
    const valid = validateIpc(opts, IPC_SCHEMAS.queueEntry)
    return valid.ok
      ? queueSafe(() => getTaskQueueStore().start(opts.sessionId, opts.entryId))
      : queueInvalid(valid.error)
  })
  ipcMain.handle(
    'queue:block',
    (_e, opts: { sessionId: string; entryId: string; reason: string }) => {
      const valid = validateIpc(opts, IPC_SCHEMAS.queueEntryReason)
      return valid.ok
        ? queueSafe(() => getTaskQueueStore().block(opts.sessionId, opts.entryId, opts.reason))
        : queueInvalid(valid.error)
    },
  )
  ipcMain.handle('queue:resume', (_e, opts: { sessionId: string; entryId: string }) => {
    const valid = validateIpc(opts, IPC_SCHEMAS.queueEntry)
    return valid.ok
      ? queueSafe(() => getTaskQueueStore().resume(opts.sessionId, opts.entryId))
      : queueInvalid(valid.error)
  })
  ipcMain.handle('queue:pause', (_e, opts: { sessionId: string; entryId: string }) => {
    const valid = validateIpc(opts, IPC_SCHEMAS.queueEntry)
    return valid.ok
      ? queueSafe(() => getTaskQueueStore().pause(opts.sessionId, opts.entryId))
      : queueInvalid(valid.error)
  })
  ipcMain.handle('queue:complete', (_e, opts: { sessionId: string; entryId: string }) => {
    const valid = validateIpc(opts, IPC_SCHEMAS.queueEntry)
    return valid.ok
      ? queueSafe(() => getTaskQueueStore().complete(opts.sessionId, opts.entryId))
      : queueInvalid(valid.error)
  })
  ipcMain.handle(
    'queue:fail',
    (_e, opts: { sessionId: string; entryId: string; reason: string }) => {
      const valid = validateIpc(opts, IPC_SCHEMAS.queueEntryReason)
      return valid.ok
        ? queueSafe(() => getTaskQueueStore().fail(opts.sessionId, opts.entryId, opts.reason))
        : queueInvalid(valid.error)
    },
  )
  ipcMain.handle('queue:cancel', (_e, opts: { sessionId: string; entryId: string }) => {
    const valid = validateIpc(opts, IPC_SCHEMAS.queueEntry)
    return valid.ok
      ? queueSafe(() => getTaskQueueStore().cancel(opts.sessionId, opts.entryId))
      : queueInvalid(valid.error)
  })
  ipcMain.handle(
    'queue:reorder',
    (_e, opts: { sessionId: string; entryId: string; position: number }) => {
      const valid = validateIpc(opts, IPC_SCHEMAS.queueReorder)
      return valid.ok
        ? queueSafe(() => getTaskQueueStore().reorder(opts.sessionId, opts.entryId, opts.position))
        : queueInvalid(valid.error)
    },
  )
  ipcMain.handle('queue:clear', (_e, sessionId: string) => {
    const valid = validateIpc(sessionId, IPC_SCHEMAS.sessionId)
    if (valid.ok) getTaskQueueStore().clear(sessionId)
  })

  // 05 交付包执行层：diff 应用（L3 授权）/ 快照回滚
  ipcMain.handle(
    'delivery:apply-diff',
    async (
      _e,
      opts: {
        path: string
        diff: string
        approved?: boolean
        sessionId?: string
        rootPath?: string
      },
    ) => {
      // P1-04：diff 应用是写路径——先校验结构，再判授权
      const valid = validateIpc(opts, IPC_SCHEMAS.deliveryApplyDiff)
      if (!valid.ok) return { ok: false, error: `参数校验失败：${valid.error}` }
      if (!opts.approved)
        return { ok: false, error: '「applyDiff」需要授权（L3）——approved=true 后执行' }
      // 2026-11-17 审查修复：交付 diff 也必须过沙箱 realpath——不得只凭 renderer approved 写任意路径
      const target = await resolveDeliveryTarget(opts.path, opts.rootPath)
      if (!target.ok) return { ok: false, error: target.error }
      const changes = parseUnifiedDiff(opts.diff ?? '')
      if (changes.length === 0) return { ok: false, error: 'diff 解析为空——不支持该格式' }
      // 写前捕获原内容（快照失败也不能把已存在文件误判为新建——回滚删文件的破坏性错误）
      let preWrite: { content: string | null } | undefined
      try {
        preWrite = { content: readFileSync(target.target, 'utf-8') }
      } catch {
        preWrite = undefined
      }
      snapshot(target.target)
      const r = applyDiffToFile(target.target, changes)
      if (r.ok) {
        try {
          getChangeSetService().recordMutation(opts.sessionId ?? 'default', target.target, preWrite)
        } catch {
          /* 变更集记录失败不影响应用结果 */
        }
      }
      return r
    },
  )
  ipcMain.handle(
    'delivery:revert-diff',
    async (_e, opts: { path: string; sessionId?: string; rootPath?: string }) => {
      const valid = validateIpc(opts, IPC_SCHEMAS.deliveryRevertDiff)
      if (!valid.ok) return { ok: false, error: `参数校验失败：${valid.error}` }
      const target = await resolveDeliveryTarget(opts.path, opts.rootPath)
      if (!target.ok) return { ok: false, error: target.error }
      const r = revert(target.target)
      if (r.ok) {
        try {
          getChangeSetService().recordRevert(opts.sessionId ?? 'default', target.target)
        } catch {
          /* 变更集状态同步失败不影响回滚结果 */
        }
      }
      return r
    },
  )

  // BC-10 变更与版本：查询/整集回滚/清理
  ipcMain.handle('changeset:list', (_e, sessionId: string) => {
    const valid = validateIpc(sessionId, IPC_SCHEMAS.sessionId)
    return valid.ok ? getChangeSetService().list(sessionId) : null
  })
  ipcMain.handle('changeset:revert', (_e, sessionId: string) => {
    const valid = validateIpc(sessionId, IPC_SCHEMAS.sessionId)
    return valid.ok
      ? getChangeSetService().revert(sessionId)
      : { ok: false, reverted: [], conflicted: [], error: '缺少 sessionId' }
  })
  ipcMain.handle('changeset:clear', (_e, sessionId: string) => {
    const valid = validateIpc(sessionId, IPC_SCHEMAS.sessionId)
    if (valid.ok) getChangeSetService().clear(sessionId)
  })

  // ticket 03：打开项目 / 文件树 / 读文件（打开成功后自动连接 LSP——ticket 12 真实语言服务器）
  ipcMain.handle('workspace:open-folder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const root = await workspace.openFolder(win)
    if (root) {
      // 2026-11-28 审计（D-3）：LSP 服务器未随包分发时不再静默吞错——记时间线事件，
      // 让「LSP 不可用」在可观测面上可见（原实现只有 main 控制台一行日志）。
      if (isLspServerAvailable()) {
        void lsp.connect(root).catch((e) => {
          const msg = e instanceof Error ? e.message : String(e)
          console.log('[lsp] connect failed:', msg)
          logTimeline({
            session: root,
            type: 'capability.checked',
            role: 'system',
            detail: { capabilities: [], missing: false, lsp: 'failed', error: msg },
          })
        })
      } else {
        logTimeline({
          session: root,
          type: 'capability.checked',
          role: 'system',
          detail: { capabilities: [], missing: false, lsp: 'missing' },
        })
      }
      // 09 预热：StandardPrefix + PrefixCache + 真实 API 预热（hash 变化且有 Key → 后台最小成本请求，不阻塞）
      try {
        const files = workspace
          .listDir(root)
          .filter((e) => e.kind === 'file')
          .map((e) => e.name)
        const prefix = buildStandardPrefix(root, files)
        const { hit } = prefixCache.ensure(prefix)
        const key = configStore.getApiKey()
        if (!hit && key) {
          const providerId = configStore.getProviderId()
          void preheating
            .run(key, prefix, (k, p) => gateway.preheat(k, p, providerId, configStore.getModelId()))
            .catch((e) =>
              console.log('[preheat] run failed:', e instanceof Error ? e.message : String(e)),
            )
        }
      } catch (e) {
        console.log('[preheat] build failed:', e instanceof Error ? e.message : String(e))
      }
    }
    return root
  })
  // 09 预热：状态查询（plan + PrefixCache + PreheatingService——renderer 用量行显示）
  ipcMain.handle('preheat:status', () => ({
    plan: planPreheat(workspace.getCurrentRoot()),
    cache: prefixCache.get(),
    preheat: preheating.getStatus(),
  }))
  ipcMain.handle('workspace:list-dir', (_e, dirPath: string) => {
    const valid = validateIpc(dirPath, IPC_SCHEMAS.workspacePath)
    return valid.ok ? workspace.listDir(dirPath) : []
  })
  ipcMain.handle('workspace:read-file', (_e, filePath: string) => {
    const valid = validateIpc(filePath, IPC_SCHEMAS.workspacePath)
    return valid.ok ? workspace.readFile(filePath) : { ok: false, error: valid.error }
  })
  ipcMain.handle('workspace:read-notebook', (_e, rootPath: string | null) => {
    const valid = validateIpc(rootPath, IPC_SCHEMAS.notebookRoot)
    return valid.ok ? workspace.readNotebook(rootPath) : null
  })
  // ticket 07：0-1 项目初始化（从零开始 → 真实目录 + 骨架）
  // 2026-08-04 体验修复（用户「LSP 连接失败」）：0-1 项目也自动连接 LSP（原仅 open-folder 连接——从零开始项目 get_diagnostics 报「LSP 未连接」）
  ipcMain.handle('workspace:init-project', async (_e, title: string) => {
    const valid = validateIpc(title, IPC_SCHEMAS.workspaceTitle)
    if (!valid.ok) return { ok: false as const, error: `参数校验失败：${valid.error}` }
    const res = await workspace.initProject(title)
    if (res.ok && res.path) {
      if (isLspServerAvailable()) {
        void lsp.connect(res.path).catch((e) => {
          const msg = e instanceof Error ? e.message : String(e)
          console.log('[lsp] connect failed:', msg)
          logTimeline({
            session: res.path,
            type: 'capability.checked',
            role: 'system',
            detail: { capabilities: [], missing: false, lsp: 'failed', error: msg },
          })
        })
      } else {
        logTimeline({
          session: res.path,
          type: 'capability.checked',
          role: 'system',
          detail: { capabilities: [], missing: false, lsp: 'missing' },
        })
      }
    }
    return res
  })
  // 2026-08-04：需求确认后回写项目标题（README + package.json name——目录名不变）
  ipcMain.handle('workspace:update-project-title', (_e, p: string, title: string) => {
    const valid = validateIpc({ path: p, title }, IPC_SCHEMAS.workspaceUpdateTitle)
    return valid.ok
      ? workspace.updateProjectTitle(p, title)
      : { ok: false, error: `参数校验失败：${valid.error}` }
  })
  // 2026-08-04：对话日志（自动记录 + 导出——用户反馈时可提供完整对话给 AI）
  ipcMain.handle('chat:log', (_e, entry: Parameters<typeof appendChatLog>[1]) => {
    const valid = validateIpc(entry, IPC_SCHEMAS.chatLogEntry)
    if (!valid.ok) return
    return appendChatLog(app.getPath('userData'), entry)
  })
  ipcMain.handle('chat:export', () => exportChatLog(app.getPath('userData')))
  // 2026-08-07 会话时间线（单会话所有步骤统一日志——用户/搭档/工具/授权/状态）
  ipcMain.handle('timeline:log', (_e, evt: Parameters<typeof logTimeline>[0]) => {
    const valid = validateIpc(evt, IPC_SCHEMAS.timelineLogEvent)
    if (!valid.ok) return
    return logTimeline(evt)
  })
  // 2026-08-15 DDD 重建：时间线查询（通用接入 A3——append 之外补 read）
  ipcMain.handle(
    'timeline:query',
    (
      _e,
      filter: {
        session?: string
        type?: string | string[]
        from?: string
        to?: string
        limit?: number
      },
    ) => {
      const valid = validateIpc(filter, IPC_SCHEMAS.timelineQuery)
      if (!valid.ok) return []
      return timelineLogger.query({ ...filter, type: filter.type as never })
    },
  )
}
// ticket 10：ToolRegistry（工具清单 + 执行分发——write/edit/bash 需 approved）
ipcMain.handle('tools:list', () => toolRegistry.list())
// D3（ADR-005）：PlannedFiles 权威 = main plannedFilesStore（落盘 userData——批准事实跨重启）——
// 三件套契约取代 tools:files-approved/-reset（renderer 写走这里；main write 门控布尔镜像随之同步）
ipcMain.handle('planned-files:load', () => getPlannedFilesStore().load())
ipcMain.handle('planned-files:add', (_e, files: string[]) => {
  const valid = validateIpc(files, IPC_SCHEMAS.fileList)
  if (!valid.ok) return getPlannedFilesStore().load()
  const data = getPlannedFilesStore().add(files)
  syncPlanApprovedFromStore()
  return data
})
// ADR-015：方案确认同步清单——只记录 planConfirmed（委托边界依据），不置 approve-files 的 approved 镜像
ipcMain.handle('planned-files:sync-plan', (_e, files: string[]) => {
  const valid = validateIpc(files, IPC_SCHEMAS.fileList)
  if (!valid.ok) return getPlannedFilesStore().loadPlan()
  return getPlannedFilesStore().addPlan(files)
})
// 2026-08-15 D2：任务边界重置同步 main——新目标确认（clearTrust）时 main filesApprovedRef 必须复位
// （原只重置 renderer 侧 → main write 规划门控跨任务恒放行——第二道防线失效）
// #6 真机 2026-08-31（复验轮）：方案确认镜像——renderer confirm('plan') 同步（approve-files 硬序门）
ipcMain.handle('session:plan-confirmed', (_e, v: boolean) => {
  const valid = validateIpc(v, { type: 'boolean' })
  if (!valid.ok) return
  syncPlanConfirmed(v)
})
ipcMain.handle('planned-files:reset', () => {
  const data = getPlannedFilesStore().reset()
  syncPlanApprovedFromStore()
  // UAT #6：任务边界清理写前快照（.nf-bak）——回滚语义随任务终结，备份不再残留工作区
  try {
    cleanupSnapshots()
  } catch {
    /* 清理失败不影响边界重置 */
  }
  return data
})

// BC-02 权限规则（userData/config/permission-rules.json）：规则引擎跨重启保留
ipcMain.handle('permissions:list', () => {
  // 以磁盘为源重新加载并同步 registry——返回的就是执行侧实际生效规则
  const rules = getPermissionRulesStore().load()
  toolRegistry.setRules(rules)
  return rules
})
ipcMain.handle('permissions:set', (_e, input: unknown) => {
  const valid = validateIpc(input, IPC_SCHEMAS.permissionsSet)
  if (!valid.ok) {
    return {
      ok: false,
      error: `参数校验失败（permissions:set）：${valid.error}`,
      rules: getPermissionRulesStore().load(),
    }
  }
  try {
    const rules = getPermissionRulesStore().save((input as { rules: unknown }).rules)
    toolRegistry.setRules(rules)
    return { ok: true, rules }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      rules: getPermissionRulesStore().load(),
    }
  }
})
// BC-02 信任模式（ADR-015：三档预设——main 持久化；renderer 广播由 useTrustPolicy 承担）
ipcMain.handle('trust:get', () => getTrustPolicyStore().load())
ipcMain.handle('trust:set', (_e, input: unknown) => {
  const valid = validateIpc(input, IPC_SCHEMAS.trustSet)
  if (!valid.ok) {
    return {
      ok: false,
      error: `参数校验失败（trust:set）：${valid.error}`,
      mode: getTrustPolicyStore().load(),
    }
  }
  try {
    const mode = getTrustPolicyStore().save((input as { mode: unknown }).mode)
    return { ok: true, mode }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      mode: getTrustPolicyStore().load(),
    }
  }
})
ipcMain.handle(
  'tools:execute',
  async (
    _e,
    opts: {
      name: string
      args: Record<string, unknown>
      approved?: boolean
      approvalSource?: 'user' | 'auto' | 'delegate'
      rootPath?: string
      sessionId?: string
    },
  ) => {
    const valid = validateIpc(opts, IPC_SCHEMAS.toolsExecute)
    if (!valid.ok) return { ok: false, error: `参数校验失败：${valid.error}` }
    const res = await toolRegistry.execute(opts.name, opts.args ?? {}, {
      approved: opts.approved ?? false,
      approvalSource: opts.approvalSource,
      rootPath: opts.rootPath ?? workspace.getCurrentRoot() ?? undefined,
      sessionId: opts.sessionId,
    })
    // 2026-08-04 诊断日志（用户反馈「刚才出错了」无法追溯——工具执行结果落日志；定位后清理或降噪保留）
    // 2026-08-06 补充：记录命令/参数摘要（用户反馈「读取文件弹授权卡/起服务没弹卡」——需定位具体命令判定授权）
    const argSum =
      opts.name === 'bash'
        ? String(opts.args?.command ?? '').slice(0, 120)
        : JSON.stringify(opts.args ?? {}).slice(0, 120)
    console.log(
      `[ipc:tools] ${opts.name} approved=${opts.approved ?? false} args=${argSum} →`,
      JSON.stringify(res).slice(0, 300),
    )
    return res
  },
)
// 工具写文件回滚（write/edit 写前已快照 .nf-bak——回滚恢复原样）
ipcMain.handle('tools:revert', (_e, opts: { path: string; sessionId?: string }) => {
  const valid = validateIpc(opts, IPC_SCHEMAS.toolsRevert)
  if (!valid.ok) return { ok: false, error: `参数校验失败：${valid.error}` }
  const r = revertToolFile(opts.path)
  if (r.ok && opts.sessionId) getChangeSetService().recordRevert(opts.sessionId, opts.path)
  return r
})
// ticket 14 可撤销：任何时刻停止当前操作（bash 高危——cancelActiveCommand kill；无活动命令返回错误）
ipcMain.handle('tools:cancel', () => cancelActiveCommand())
// ticket 12 ContextEngine：@引用文件 → 精准上下文片段（注入对话）
ipcMain.handle('context:resolve', (_e, opts: { files: string[] }) => {
  const valid = validateIpc(opts, IPC_SCHEMAS.contextResolve)
  if (!valid.ok) return { fragments: [] }
  return context.resolve(workspace.getCurrentRoot(), opts.files)
})
// ticket 12 Layer2：CodeRAG 关键词检索兜底（V1 降级——不建向量索引）
ipcMain.handle('rag:search', (_e, opts: { query: string }) => {
  const valid = validateIpc(opts, IPC_SCHEMAS.ragSearch)
  if (!valid.ok) return []
  return codeRag.search(workspace.getCurrentRoot(), opts.query)
})
// ticket 08：内置插件注册表（list/toggle——生命周期钩子）
ipcMain.handle('plugins:list', () => pluginRegistry.list())
ipcMain.handle('plugins:toggle', (_e, opts: { name: string; active: boolean }) => {
  const valid = validateIpc(opts, IPC_SCHEMAS.pluginToggle)
  return valid.ok ? pluginRegistry.setActive(opts.name, opts.active) : false
})
// BC-13 扩展与集成：扩展视图（kind/trust/capabilities）+ 第三方授权 + MCP 配置/刷新 + Git 只读
ipcMain.handle('extensions:list', () => pluginRegistry.listExtensions())
ipcMain.handle('extensions:toggle', (_e, opts: { name: string; active: boolean }) => {
  const ok = pluginRegistry.setActive(opts.name, opts.active)
  return { ok, extension: pluginRegistry.getExtension(opts.name) }
})
ipcMain.handle('extensions:authorize', (_e, name: string) => ({
  ok: pluginRegistry.authorize(name),
  extension: pluginRegistry.getExtension(name),
}))
ipcMain.handle('mcp:config', () => {
  const manager = getMcpManager()
  const loaded = manager.configPath()
  return { path: loaded, servers: manager.listServers() }
})
ipcMain.handle('mcp:save', (_e, input: unknown) => getMcpManager().saveConfig(input))
ipcMain.handle('mcp:refresh', () => getMcpManager().refresh())
ipcMain.handle('mcp:status', () => getMcpManager().status())
ipcMain.handle(
  'git:read',
  async (_e, opts: { action: string; rootPath?: string; path?: string; limit?: number }) => {
    try {
      const root = opts?.rootPath || workspace.getCurrentRoot() || ''
      return {
        ok: true,
        data: await gitRead(opts?.action ?? 'status', root, {
          path: opts?.path,
          limit: opts?.limit,
        }),
      }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  },
)
// ticket 11 Compaction：对话历史压缩（触发判定 + 真实摘要 compactor——Gateway.summarize）
ipcMain.handle(
  'compaction:compact',
  async (_e, opts: { history: Array<{ role: string; content: string | null }> }) => {
    const apiKey = configStore.getApiKey()
    if (!apiKey) return { ok: false, error: '无 API Key——无法压缩' }
    if (!compaction.shouldCompact(opts.history ?? []))
      return { ok: false, error: '历史未达压缩阈值' }
    const providerId = configStore.getProviderId()
    return compaction.compact(
      apiKey,
      (k, h) => gateway.summarize(k, h, providerId, configStore.getModelId()),
      opts.history ?? [],
    )
  },
)
// S4 完成对账 V1a：系统代跑只读验证命令（fail-closed——非只读不执行；超时/截断护栏见 verification.ts）
// V1b+：顺带核对计划清单文件的存在性（bash 等非 write/edit 途径产出也认定已产出——
// 2026-11-24 真机：bash 创建计划内文件后 diff 恒 planned-not-produced → 已解决卡不可达）
ipcMain.handle(
  'completion:verify',
  async (_e, opts: { commands: string[]; rootPath?: string | null; files?: string[] }) => {
    const valid = validateIpc(opts, IPC_SCHEMAS.completionVerify)
    if (!valid.ok) return { results: {}, existing: [] }
    const results = await runVerificationCommands(opts.commands, {
      cwd: opts.rootPath ?? undefined,
    })
    const existing: string[] = []
    for (const f of opts.files ?? []) {
      try {
        if (existsSync(f)) existing.push(f)
      } catch {
        /* 路径异常按不存在处理 */
      }
    }
    return { results, existing }
  },
)
