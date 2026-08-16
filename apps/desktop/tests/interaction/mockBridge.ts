// MockBridge 工厂（测试域 DDD §9.3——T0 基建 1/3）
// 消除 L3 旧基建「27 个测试 27 份重复 mock」：参数化构造 =
//   状态预设（project/files/demo）+ 模型行为脚本（按 chat 轮次出 chunk 的表）+ 捕获通道（chatCount/sentMsgs/forceTool/approved/title）
// 特异行为逃生舱：extraInit / executeSource——与 bridge 同一作用域的源片段（旧 mock 中个别
// 带闭包状态的行为，如 O2 capCalls/__setCapData，以最小源片段保留，不做通用化）
// 注：addInitScript 只接受可序列化数据与源码字符串——闭包变量不过桥（Playwright 限制），故脚本一律数据化。
import type { Page } from '@playwright/test'
import type { DirEntry } from '../../src/renderer/types'

// ── 流 chunk（模型行为的最小单位）─────────────────────────────────────────

export type StreamChunk =
  | { type: 'content'; text: string }
  | { type: 'tool-call'; toolCall: { name: string; args: Record<string, unknown> } }
  | { type: 'done' }

export const chunk = {
  content: (text: string): StreamChunk => ({ type: 'content', text }),
  tool: (name: string, args: Record<string, unknown> = {}): StreamChunk => ({
    type: 'tool-call',
    toolCall: { name, args },
  }),
  done: (): StreamChunk => ({ type: 'done' }),
}

// 常用工具调用（减少测试样板）
export const toolCall = {
  write: (path: string, content = 'x'): StreamChunk => chunk.tool('write', { path, content }),
  edit: (path: string, oldText: string, newText: string): StreamChunk =>
    chunk.tool('edit', { path, old: oldText, new: newText }),
  read: (path: string): StreamChunk => chunk.tool('read', { path }),
  bash: (command: string): StreamChunk => chunk.tool('bash', { command }),
  approveFiles: (summary: string, files: Array<{ path: string; reason: string }>): StreamChunk =>
    chunk.tool('approve-files', { summary, files }),
  checkCapability: (dir = '/test'): StreamChunk => chunk.tool('check-capability', { dir }),
}

// 模型语义块（测试域 §2——与领域术语对齐的标记文本）
export const goalConfirmText = (goal: string) => `好的。【目标确认：${goal}】`
export const planProposeText = (files: string[]) =>
  `【执行方案】\n${files.map((f) => `- ${f}`).join('\n')}`

// ── 工厂参数 ──────────────────────────────────────────────────────────────

export interface MockBridgeOptions {
  /** 项目状态预设：'open' = openFolder 返回 /test（启动页可「打开已有项目」）；'none' = null（从零开始） */
  project?: 'open' | 'none'
  /** listDir 返回的文件表（默认 []） */
  files?: DirEntry[]
  /** readFile 按路径返回内容（默认 '// ' + path） */
  fileContents?: Record<string, string>
  /** demo 注入（delivery/recentFiles/problems/trustLadder——纯数据） */
  demo?: Record<string, unknown>
  /** D3：plannedFiles 初始状态（main 权威 mock——load 返回；默认空清单未批准） */
  plannedFiles?: { files: string[]; approved: boolean }
  /** 模型行为脚本：按 chat 轮次（1-based）出 chunk 的轮次表 */
  script?: StreamChunk[][]
  /** 轮次表之外的轮次回复（默认静默） */
  defaultRound?: StreamChunk[]
  /** 每轮流式延迟（ms——等 initProject/流式消息先就绪的时序保险；默认 50 与旧 mock 一致——目标确认→方案→执行的点击时序稳定） */
  streamDelay?: number
  /** 手动推流模式：onStreamChunk 挂到 window.__emit，测试用 handle.emit() 逐轮推 */
  manualEmit?: boolean
  /** 授权模拟：'write-edit' = write/edit 需 approved（默认），'all' = 全部工具需 approved */
  approval?: 'none' | 'write-edit' | 'all'
  /** 按工具名的 execute 返回值覆盖（如 read → { ok: true, data: 'x' }） */
  executeResults?: Record<string, unknown>
  /** 捕获通道开关（handle.* 读取） */
  capture?: {
    chatCount?: boolean // window.__nfChatCount（getter）
    sentMsgs?: boolean // window.__nfSentMsgs（每次 streamChat 的 messages）
    forceToolCalls?: boolean // window.__nfForceToolCalls（每次 streamChat 的 forceTool）
    approvedFlags?: boolean // window.__nfApprovedFlags（write/edit 的 approved 标记）
    titleCalls?: boolean // window.__nfTitleCalls（updateProjectTitle 调用记录）
  }
  /** 逃生舱：与 bridge 同作用域的附加源（可声明闭包状态、定义捕获 getter、改 bridge 字段） */
  extraInit?: string
  /** 逃生舱：替换 tools.execute 实现（同作用域——可引用 extraInit 声明的状态） */
  executeSource?: string
  /** 附加 bridge 字段（如 timeline/rag 特化——纯数据） */
  extra?: Record<string, unknown>
}

export interface MockBridgeHandle {
  /** 手动推流（manualEmit: true 时）——按序推一轮 chunk */
  emit(chunks: StreamChunk[]): Promise<void>
  chatCount(): Promise<number>
  sentMessages(): Promise<Array<{ role: string; content: string }>>
  forceToolCalls(): Promise<boolean[]>
  approvedFlags(): Promise<boolean[]>
  titleCalls(): Promise<Array<{ p: string; title: string }>>
  /** 读任意捕获值（含 escape hatch 自定义的 window.__*） */
  readCapture<T>(name: string): Promise<T | undefined>
}

// ── 实现 ──────────────────────────────────────────────────────────────────

/** 序列化 spec（addInitScript arg 与源码共用） */
interface Spec {
  project: 'open' | 'none'
  files: DirEntry[]
  fileContents: Record<string, string>
  demo: Record<string, unknown> | null
  plannedFiles: { files: string[]; approved: boolean }
  rounds: StreamChunk[][]
  defaultRound: StreamChunk[]
  streamDelay: number
  manualEmit: boolean
  approval: 'none' | 'write-edit' | 'all'
  executeResults: Record<string, unknown>
  capture: {
    chatCount: boolean
    sentMsgs: boolean
    forceToolCalls: boolean
    approvedFlags: boolean
    titleCalls: boolean
  }
}

export async function installMockBridge(
  page: Page,
  opts: MockBridgeOptions = {},
): Promise<MockBridgeHandle> {
  const spec: Spec = {
    project: opts.project ?? 'open',
    files: opts.files ?? [],
    fileContents: opts.fileContents ?? {},
    demo: opts.demo ?? null,
    plannedFiles: opts.plannedFiles ?? { files: [], approved: false },
    rounds: opts.script ?? [],
    defaultRound: opts.defaultRound ?? [],
    streamDelay: opts.streamDelay ?? 50,
    manualEmit: opts.manualEmit ?? false,
    approval: opts.approval ?? 'write-edit',
    executeResults: opts.executeResults ?? {},
    capture: {
      chatCount: opts.capture?.chatCount ?? false,
      sentMsgs: opts.capture?.sentMsgs ?? false,
      forceToolCalls: opts.capture?.forceToolCalls ?? false,
      approvedFlags: opts.capture?.approvedFlags ?? false,
      titleCalls: opts.capture?.titleCalls ?? false,
    },
  }

  const source = buildInitSource(spec, opts)
  await page.addInitScript(source)

  return {
    emit: (chunks) =>
      page.evaluate((cs) => {
        const emit = (window as unknown as { __emit?: (c: StreamChunk) => void }).__emit
        if (!emit) throw new Error('manualEmit 未就绪——需 installMockBridge({ manualEmit: true })')
        for (const c of cs) emit(c)
      }, chunks),
    chatCount: () => read<number>('__nfChatCount', page),
    sentMessages: () => read<Array<{ role: string; content: string }>>('__nfSentMsgs', page),
    forceToolCalls: () => read<boolean[]>('__nfForceToolCalls', page),
    approvedFlags: () => read<boolean[]>('__nfApprovedFlags', page),
    titleCalls: () => read<Array<{ p: string; title: string }>>('__nfTitleCalls', page),
    readCapture: <T>(name: string) => read<T>(name, page),
  }
}

function read<T>(name: string, page: Page): Promise<T | undefined> {
  return page.evaluate(
    (n) => (window as unknown as Record<string, unknown>)[n] as T | undefined,
    name,
  )
}

/** 生成 addInitScript 源码：spec 数据内联 + 逃生舱片段同作用域追加 */
function buildInitSource(spec: Spec, opts: MockBridgeOptions): string {
  const json = (v: unknown) => JSON.stringify(v)
  const needApprovalCond =
    spec.approval === 'none'
      ? 'false'
      : spec.approval === 'all'
        ? 'true'
        : `(name === 'write' || name === 'edit')`

  return `
(() => {
  const chatCountRef = { n: 0 }
  const sentMsgs = []
  const forceToolCalls = []
  const approvedFlags = []
  const titleCalls = []
  const cbRef = { cb: null }

  const executeImpl = ${
    opts.executeSource ??
    `
    async (name, args, opts) => {
      if (${needApprovalCond} && !(opts && opts.approved)) {
        return { ok: false, needApproval: true, error: '「' + name + '」需要授权（L3）——approved=true 后执行' }
      }
      if ((name === 'write' || name === 'edit') && ${json(spec.capture.approvedFlags)}) approvedFlags.push(!!(opts && opts.approved))
      const result = ${json(spec.executeResults)}[name]
      if (result !== undefined) return result
      if (name === 'write' || name === 'edit') return { ok: true, data: { file: '/test/' + String((args && args.path) || '').split('/').pop(), snapshot: true } }
      if (name === 'read') return { ok: true, data: 'x' }
      return { ok: true, data: {} }
    }`
  }

  const bridge = {
    version: 'test',
    config: {
      hasKey: async () => true,
      getKey: async () => 'test-key',
      setKey: async () => {},
      clearKey: async () => {},
    },
    workspace: {
      openFolder: async () => ${json(spec.project === 'none' ? null : '/test')},
      listDir: async () => ${json(spec.files)},
      readFile: async (p) => {
        const overrides = ${json(spec.fileContents)}
        return { ok: true, content: overrides[p] !== undefined ? overrides[p] : '// ' + p }
      },
      readNotebook: async () => null,
      initProject: async (title) => ({ ok: true, path: '/test', title }),
      updateProjectTitle: async (p, title) => {
        if (${json(spec.capture.titleCalls)}) titleCalls.push({ p, title })
        return { ok: true }
      },
    },
    gateway: {
      validate: async () => ({ ok: true }),
      streamChat: async (opts = {}) => {
        chatCountRef.n++
        if (${json(spec.capture.sentMsgs)}) { sentMsgs.length = 0; sentMsgs.push.apply(sentMsgs, opts.messages || []) }
        if (${json(spec.capture.forceToolCalls)}) forceToolCalls.push(!!opts.forceTool)
        const rounds = ${json(spec.rounds)}
        const round = rounds[chatCountRef.n - 1] || ${json(spec.defaultRound)}
        if (round && round.length) {
          setTimeout(() => { for (const c of round) if (cbRef.cb) cbRef.cb(c) }, ${json(spec.streamDelay)})
        }
        return { ok: true }
      },
      onStreamChunk: (cb) => {
        cbRef.cb = cb
        if (${json(spec.manualEmit)}) window.__emit = cb
        return () => { cbRef.cb = null }
      },
    },
    delivery: {
      applyDiff: async () => ({ ok: true, file: '/test/a.txt' }),
      revertDiff: async () => ({ ok: true }),
    },
    tools: {
      list: async () => [],
      execute: executeImpl,
      revert: async () => ({ ok: true }),
      cancel: async () => ({ ok: false, error: '无活动命令' }),
    },
    // D3（ADR-005）：PlannedFiles 三件套契约（main 权威 mock——内存态；恢复场景经 plannedFiles 选项预置）
    plannedFiles: (() => {
      const state = { files: ${json(spec.plannedFiles.files)}, approved: ${json(spec.plannedFiles.approved)} }
      return {
        load: async () => ({ files: state.files, approved: state.approved }),
        add: async (files) => {
          state.files = [...new Set([...state.files, ...(files || [])])]
          state.approved = true
          return { files: state.files, approved: state.approved }
        },
        reset: async () => {
          state.files = []
          state.approved = false
          return { files: state.files, approved: state.approved }
        },
      }
    })(),
    context: { resolve: async () => ({ fragments: [] }) },
    rag: { search: async () => ({ hits: [] }) },
    plugins: { list: async () => [], toggle: async () => true },
    preheat: { status: async () => ({ plan: { shouldPreheat: false, why: '', actions: [] }, cache: null }) },
    compaction: { compact: async () => ({ ok: false, error: '未达阈值' }) },
    chatLog: { log: async () => {}, export: async () => ({ ok: true, path: '/tmp/nf-test-export.md' }) },
    timeline: { log: async () => {} },
    ${opts.extra ? `...${json(opts.extra)},` : ''}
    ${spec.demo ? `demo: ${json(spec.demo)},` : ''}
  }

  ${opts.extraInit ?? ''}

  window.neonforge = bridge
  if (${json(spec.capture.chatCount)}) Object.defineProperty(window, '__nfChatCount', { get: () => chatCountRef.n })
  if (${json(spec.capture.sentMsgs)}) window.__nfSentMsgs = sentMsgs
  if (${json(spec.capture.forceToolCalls)}) window.__nfForceToolCalls = forceToolCalls
  if (${json(spec.capture.approvedFlags)}) window.__nfApprovedFlags = approvedFlags
  if (${json(spec.capture.titleCalls)}) window.__nfTitleCalls = titleCalls
})()
`
}
