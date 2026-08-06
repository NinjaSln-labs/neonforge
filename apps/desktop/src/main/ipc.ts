// IPC handlers：renderer 经 preload → 主进程 gateway/configStore/workspace
import { app, BrowserWindow, ipcMain } from 'electron'
import { parseUnifiedDiff, applyDiffToFile, snapshot, revert } from './applyDiff.js'
import { gateway } from './gateway.js'
import { configStore } from './configStore.js'
import { workspace } from './workspace.js'
import { initTools, toolRegistry, revertToolFile, cancelActiveCommand, markPlanApproved } from './tools.js'
import { registerLspTools, lsp } from './lsp.js'
import { context } from './context.js'
import { codeRag } from './codeRag.js'
import { buildStandardPrefix, planPreheat, prefixCache, preheating } from './preheat.js'
import { initPlugins, pluginRegistry } from './pluginSystem.js'
import { compaction } from './compact.js'
import { appendChatLog, exportChatLog } from './chatLog.js'

export function registerIpc(): void {
  initTools()
  initPlugins() // 08：注册 5 内置插件（生命周期钩子）
  registerLspTools(toolRegistry)
  ipcMain.handle('config:has-key', () => configStore.hasValidKey())
  ipcMain.handle('config:get-key', () => configStore.getApiKey())
  ipcMain.handle('config:set-key', (_e, key: string) => configStore.setApiKey(key))
  ipcMain.handle('config:clear-key', () => configStore.clearApiKey())

  // 验证 Key（非流式，max_tokens=1）
  ipcMain.handle('gateway:validate', async (_e, apiKey: string) => {
    return gateway.validateKey(apiKey)
  })

  // 流式 chat：事件逐块推给 renderer（经 webContents.send）
  ipcMain.handle('gateway:stream-chat', async (event, opts: {
    apiKey: string
    level?: 'none' | 'basic' | 'medium' | 'high'
    tools?: boolean
    forceTool?: boolean
    messages: Array<{ role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string; reasoning_content?: string }>
  }) => {
    const send = (type: 'reasoning' | 'content' | 'tool-call' | 'done', text?: string, toolCall?: { name: string; args: Record<string, unknown> }) => {
      if (type === 'tool-call') console.log('[ipc] SEND tool-call:', toolCall?.name, JSON.stringify(toolCall?.args).slice(0, 80))
      if (type === 'done') console.log('[ipc] SEND done')
      // 干净对象（无 undefined 字段——contextBridge 结构化传输兼容）
      const payload: Record<string, unknown> = { type }
      if (text !== undefined) payload.text = text
      if (toolCall) payload.toolCall = toolCall
      event.sender.send('gateway:stream-chunk', payload)
    }
    try {
      await gateway.streamChat(opts.apiKey, {
        level: opts.level ?? 'basic',
        tools: opts.tools ?? false,
        forceTool: opts.forceTool ?? false,
        messages: opts.messages,
        onDelta: (chunk) => send(chunk.type, chunk.text, 'toolCall' in chunk ? chunk.toolCall : undefined)
      })
      return { ok: true }
    } catch (e) {
      console.log('[ipc] stream error:', e instanceof Error ? e.message : String(e))
      return { ok: false, error: e instanceof Error ? e.message : 'gateway-error' }
    }
  })

  // 05 交付包执行层：diff 应用（L3 授权）/ 快照回滚
  ipcMain.handle('delivery:apply-diff', (_e, opts: { path: string; diff: string; approved?: boolean }) => {
    if (!opts.approved) return { ok: false, error: '「applyDiff」需要授权（L3）——approved=true 后执行' }
    const changes = parseUnifiedDiff(opts.diff ?? '')
    if (changes.length === 0) return { ok: false, error: 'diff 解析为空——不支持该格式' }
    snapshot(opts.path)
    return applyDiffToFile(opts.path, changes)
  })
  ipcMain.handle('delivery:revert-diff', (_e, opts: { path: string }) => revert(opts.path))

  // ticket 03：打开项目 / 文件树 / 读文件（打开成功后自动连接 LSP——ticket 12 真实语言服务器）
  ipcMain.handle('workspace:open-folder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const root = await workspace.openFolder(win)
    if (root) {
      void lsp.connect(root).catch((e) => console.log('[lsp] connect failed:', e instanceof Error ? e.message : String(e)))
      // 09 预热：StandardPrefix + PrefixCache + 真实 API 预热（hash 变化且有 Key → 后台最小成本请求，不阻塞）
      try {
        const files = workspace.listDir(root).filter((e) => e.kind === 'file').map((e) => e.name)
        const prefix = buildStandardPrefix(root, files)
        const { hit } = prefixCache.ensure(prefix)
        const key = configStore.getApiKey()
        if (!hit && key) {
          void preheating.run(key, prefix, (k, p) => gateway.preheat(k, p)).catch((e) =>
            console.log('[preheat] run failed:', e instanceof Error ? e.message : String(e))
          )
        }
      } catch (e) { console.log('[preheat] build failed:', e instanceof Error ? e.message : String(e)) }
    }
    return root
  })
  // 09 预热：状态查询（plan + PrefixCache + PreheatingService——renderer 用量行显示）
  ipcMain.handle('preheat:status', () => ({
    plan: planPreheat(workspace.getCurrentRoot()),
    cache: prefixCache.get(),
    preheat: preheating.getStatus()
  }))
  ipcMain.handle('workspace:list-dir', (_e, dirPath: string) => workspace.listDir(dirPath))
  ipcMain.handle('workspace:read-file', (_e, filePath: string) => workspace.readFile(filePath))
  ipcMain.handle('workspace:read-notebook', (_e, rootPath: string | null) => workspace.readNotebook(rootPath))
  // ticket 07：0-1 项目初始化（从零开始 → 真实目录 + 骨架）
  // 2026-08-04 体验修复（用户「LSP 连接失败」）：0-1 项目也自动连接 LSP（原仅 open-folder 连接——从零开始项目 get_diagnostics 报「LSP 未连接」）
  ipcMain.handle('workspace:init-project', async (_e, title: string) => {
    const res = await workspace.initProject(title)
    if (res.ok && res.path) {
      void lsp.connect(res.path).catch((e) => console.log('[lsp] connect failed:', e instanceof Error ? e.message : String(e)))
    }
    return res
  })
  // 2026-08-04：需求确认后回写项目标题（README + package.json name——目录名不变）
  ipcMain.handle('workspace:update-project-title', (_e, p: string, title: string) => workspace.updateProjectTitle(p, title))
  // 2026-08-04：对话日志（自动记录 + 导出——用户反馈时可提供完整对话给 AI）
  ipcMain.handle('chat:log', (_e, entry: Parameters<typeof appendChatLog>[1]) => appendChatLog(app.getPath('userData'), entry))
  ipcMain.handle('chat:export', () => exportChatLog(app.getPath('userData')))
}
  // ticket 10：ToolRegistry（工具清单 + 执行分发——write/edit/bash 需 approved）
  ipcMain.handle('tools:list', () => toolRegistry.list())
  // 2026-08-04 规划级授权强制：renderer 批准 plan_approval 后通知 main（write/edit 放行）
  ipcMain.handle('tools:plan-approved', () => { markPlanApproved(); return { ok: true } })
  ipcMain.handle('tools:execute', async (_e, opts: { name: string; args: Record<string, unknown>; approved?: boolean; rootPath?: string }) => {
    const res = await toolRegistry.execute(opts.name, opts.args ?? {}, {
      approved: opts.approved ?? false,
      rootPath: opts.rootPath ?? workspace.getCurrentRoot() ?? undefined
    })
    // 2026-08-04 诊断日志（用户反馈「刚才出错了」无法追溯——工具执行结果落日志；定位后清理或降噪保留）
    // 2026-08-06 补充：记录命令/参数摘要（用户反馈「读取文件弹授权卡/起服务没弹卡」——需定位具体命令判定授权）
    const argSum = opts.name === 'bash' ? String(opts.args?.command ?? '').slice(0, 120) : JSON.stringify(opts.args ?? {}).slice(0, 120)
    console.log(`[ipc:tools] ${opts.name} approved=${opts.approved ?? false} args=${argSum} →`, JSON.stringify(res).slice(0, 300))
    return res
  })
  // 工具写文件回滚（write/edit 写前已快照 .nf-bak——回滚恢复原样）
  ipcMain.handle('tools:revert', (_e, opts: { path: string }) => revertToolFile(opts.path))
  // ticket 14 可撤销：任何时刻停止当前操作（bash 高危——cancelActiveCommand kill；无活动命令返回错误）
  ipcMain.handle('tools:cancel', () => cancelActiveCommand())
  // ticket 12 ContextEngine：@引用文件 → 精准上下文片段（注入对话）
  ipcMain.handle('context:resolve', (_e, opts: { files: string[] }) =>
    context.resolve(workspace.getCurrentRoot(), opts.files ?? [])
  )
  // ticket 12 Layer2：CodeRAG 关键词检索兜底（V1 降级——不建向量索引）
  ipcMain.handle('rag:search', (_e, opts: { query: string }) =>
    codeRag.search(workspace.getCurrentRoot(), opts.query)
  )
  // ticket 08：内置插件注册表（list/toggle——生命周期钩子）
  ipcMain.handle('plugins:list', () => pluginRegistry.list())
  ipcMain.handle('plugins:toggle', (_e, opts: { name: string; active: boolean }) =>
    pluginRegistry.setActive(opts.name, opts.active)
  )
  // ticket 11 Compaction：对话历史压缩（触发判定 + 真实摘要 compactor——Gateway.summarize）
  ipcMain.handle('compaction:compact', async (_e, opts: { history: Array<{ role: string; content: string | null }> }) => {
    const apiKey = configStore.getApiKey()
    if (!apiKey) return { ok: false, error: '无 API Key——无法压缩' }
    if (!compaction.shouldCompact(opts.history ?? [])) return { ok: false, error: '历史未达压缩阈值' }
    return compaction.compact(apiKey, (k, h) => gateway.summarize(k, h), opts.history ?? [])
  })
