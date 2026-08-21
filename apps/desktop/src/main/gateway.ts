// DeepSeekGateway：V1 = DeepSeek-only（A0 §1 裁决 D-C1）
// toDeepSeekParams 四档映射 / ModelRouter / ToolCallRepair / streamChat SSE
// 网络侧收敛在 Main Process（A0 §6 裁决 D-M8）；renderer 经 IPC 调用

export type ThinkingLevel = 'none' | 'basic' | 'medium' | 'high'
import { TEST_HOOKS } from './testHooks.js'

// 2026-08-07 T1 根因补强（regex-todo）：网关错误结构化透传——原 streamChat throw 文本
// `gateway: http-${status}` → ipc 文本 → renderer 正则抠状态码（文本重建=打地鼠）；
// 改为 GatewayHttpError 携带 status 结构化透传 + classifyGatewayError 在 ipc 层分类
// （分类结果 errorType 字段给 renderer——同 validateKey 'key-invalid'/'service-error' 结构化先例）
export type GatewayErrorType = 'key-invalid' | 'service' | 'unknown'

export class GatewayHttpError extends Error {
  constructor(public readonly status: number) {
    super(`gateway: http-${status}`) // 文本 message 保留——展示/日志兼容
    this.name = 'GatewayHttpError'
  }
}

export const classifyGatewayError = (e: unknown): GatewayErrorType => {
  if (e instanceof GatewayHttpError) return e.status === 401 ? 'key-invalid' : 'service'
  const msg = e instanceof Error ? e.message : ''
  if (msg.startsWith('gateway')) return 'service' // gateway: no-body 等我方网关层错误
  if (e instanceof DOMException && e.name === 'TimeoutError') return 'service' // AbortSignal.timeout(45000)
  if (e instanceof TypeError) return 'service' // fetch 网络错误（'fetch failed' 等）
  return 'unknown'
}

export interface DeepSeekThinkingParams {
  thinking: { type: 'enabled' | 'disabled' }
  reasoning_effort?: 'high' | 'max'
}

// A0 §2 Layer 2：ThinkingLevel 四档 → API 参数（裁决 D-C4，映射全量一次到位）
export function toDeepSeekParams(level: ThinkingLevel): DeepSeekThinkingParams {
  switch (level) {
    case 'none':
      return { thinking: { type: 'disabled' } }
    case 'basic':
      return { thinking: { type: 'enabled' } }
    case 'medium':
      return { thinking: { type: 'enabled' }, reasoning_effort: 'high' }
    case 'high':
      return { thinking: { type: 'enabled' }, reasoning_effort: 'max' }
  }
}

export type ModelID = 'deepseek-v4-flash' | 'deepseek-v4-pro'

// A0 §2 边界判定：ThinkingLevel=定义、ModelRouter=决策（返回完整 API 模型名）
// 2026-08-15 D7：route 签名去除六阶段残留 stageAgent（无调用方传值——dead parameter）
export class ModelRouter {
  route(task: { userRequestedPro?: boolean; thinking: ThinkingLevel }): ModelID {
    if (task.userRequestedPro) return 'deepseek-v4-pro'
    if (task.thinking === 'high') return 'deepseek-v4-pro'
    return 'deepseek-v4-flash'
  }
}

// A0 §2 边界判定：ToolRegistry 执行、Gateway 修复（4 轮）
export function toolCallRepair(raw: unknown, round: number = 0): unknown | null {
  if (round >= 4) return null // 4 轮上限
  try {
    if (typeof raw === 'string') return JSON.parse(raw)
    return raw
  } catch {
    // 截断/畸形：尝试补全最简修复（V1 基础实现）
    const s = String(raw)
    const fixed = s.replace(/,\s*}$/, '}').replace(/,\s*\]$/, ']')
    try {
      return JSON.parse(fixed)
    } catch {
      return null
    }
  }
}

// A0 §4 工具面：4 核心工具 + 6 LSP 工具定义（请求带 tools → 模型返回 tool_calls → ToolRegistry 执行）
// LSP 工具（ticket 12 真实语言服务器）：模型经 LSP 上下文回答问题（HANDOFF §3 第一优先——2026-08-02 接入模型）
// 参数设计：模型不知道行号——用 path + symbol（符号名）定位，LSP 侧文本扫描转 line/character（确定性零 token）
export const TOOL_DEFS = [
  {
    type: 'function',
    function: {
      name: 'read',
      description: '读取文件内容',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: '文件绝对路径' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write',
      description: '写入文件（需 L3 授权）',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit',
      description: '替换文件内容（需 L3 授权）',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, old: { type: 'string' }, new: { type: 'string' } },
        required: ['path', 'old', 'new'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'bash',
      description:
        '执行命令（需 L3 授权）——启动 dev server（vite / npm run dev / next dev 等）时**用动态端口**：让 vite 自动分配（默认递增）或 --port 0（系统分配）；5173/5175 是 NeonForge（本应用）自己的保留端口（宿主 dev server / 测试 server）——看到它们有服务是宿主本身——你的项目服务用**动态端口**，以起服务实际输出为准。起服务后读实际输出里的地址（如 Local: http://localhost:5174/）或 lsof/curl 确认实际端口，把真实地址告诉用户。',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command'],
      },
    },
  },
  // 2026-08-06 打开网页（用户「帮我打开」催 4 次）：用户说「帮我打开/打开网页」→ 用 open 工具在浏览器打开服务实际地址（无害操作自动放行）
  {
    type: 'function',
    function: {
      name: 'open',
      description: '打开网页（默认浏览器）——用户说「帮我打开」「打开网页」时调用，传入服务实际地址',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'http/https 地址（如 http://localhost:5174/）' },
        },
        required: ['url'],
      },
    },
  },
  // 2026-08-04 批量授权（用户「规划好文件一次性要授权，减少逐个授权打断」）：模型确认执行后把本次任务要写/改的文件清单一次性请求批准
  // 2026-08-07 无阶段重构 S5：语义更新——批量批准入口统一（不绑阶段）
  // 2026-08-08 改名（plan_approval → approve-files——plan 是六阶段遗留命名，实为「批量授权 1-N 文件」）+ 顺序澄清（确认执行后使用，非确认执行本身——坑 95）
  {
    type: 'function',
    function: {
      name: 'approve-files',
      description:
        '批量授权（1-N 文件）：用户**确认执行方案后**，把本次要写/改的文件清单一次性请求批量批准——批准后清单内文件 write/edit 自动放行（不再逐个问）。**确认执行后调用**（批准文件清单 ≠ 确认执行——动手前先等用户确认执行）；确认执行后调用一次（列出全部文件 + 各自原因）；中途有新文件要改，再调一次补充。',
      parameters: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: '一句话说明本次要做什么（如「黑屏修复：补 DOM 元素」）',
          },
          files: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string', description: '文件路径（绝对路径或项目内相对路径）' },
                reason: { type: 'string', description: '为什么新增/修改这个文件（一句话）' },
              },
              required: ['path', 'reason'],
            },
          },
        },
        required: ['summary', 'files'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search',
      description:
        '关键词搜索代码库（grep 模式——Layer2 CodeRAG 兜底）：找文件/函数/错误位置用，返回命中文件+行号+片段',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词（如 "greet 定义" 或 "TODO"）' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_definition',
      description: '查找符号（函数/变量/类）的定义位置——LSP 真实查询',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件绝对路径或项目根相对路径' },
          symbol: { type: 'string', description: '符号名（如 greet）——无需行号' },
        },
        required: ['path', 'symbol'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_references',
      description: '查找符号的全部引用位置——LSP 真实查询',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件绝对路径或项目根相对路径' },
          symbol: { type: 'string', description: '符号名' },
        },
        required: ['path', 'symbol'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_type_info',
      description: '获取符号的类型信息（hover）——LSP 真实查询',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件绝对路径或项目根相对路径' },
          symbol: { type: 'string', description: '符号名' },
        },
        required: ['path', 'symbol'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_diagnostics',
      description: '获取文件全部诊断（类型/语法错误）——LSP 真实查询',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: '文件绝对路径或项目根相对路径' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_imports',
      description: '提取文件 import 语句（本地扫描——零成本）',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: '文件绝对路径或项目根相对路径' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_call_chain',
      description: '获取文件符号结构（documentSymbol 降级）',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: '文件绝对路径或项目根相对路径' } },
        required: ['path'],
      },
    },
  },
  // 2026-08-06 环境单源（尽调调研 5 源驱动）；2026-08-07 无阶段重构 S2：check-env → check-capability
  // 能力检查（坑 83 能力模型——用户「能力才是要检测的东西」）：检测达成目标所需能力 → 支持/缺失状态——不绑开发阶段
  {
    type: 'function',
    function: {
      name: 'check-capability',
      description:
        '检查能力（目标达成前：确认完成目标所需能力就绪——runtime/依赖/工具链）。返回能力清单（平台原生 + 外部扩展 Status）、node 版本、node_modules 是否安装；能力缺失会列出缺什么。**动手产出/起服务前先调它确认能力**；缺失则告知用户并引导安装',
      parameters: {
        type: 'object',
        properties: { dir: { type: 'string', description: '项目目录绝对路径' } },
        required: ['dir'],
      },
    },
  },
  // 2026-08-06 设计层升级（服务生命周期独立——用户「白名单匹配不完」）：模型用服务工具管 dev server，不用 bash 起服务/curl 验证
  {
    type: 'function',
    function: {
      name: 'start-server',
      description:
        '启动开发服务器（NeonForge 管理进程——自动分配端口并记住地址）。**起服务/打开网页前用它**（用 bash 起服务会端口冲突/进程残留）；参数 dir=项目目录绝对路径，command 可选（npm run dev / npx vite 等，默认 vite）',
      parameters: {
        type: 'object',
        properties: {
          dir: { type: 'string', description: '项目目录绝对路径' },
          command: { type: 'string', description: '启动命令（可选，默认 npx vite）' },
        },
        required: ['dir'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check-server',
      description:
        '检查开发服务器状态——返回 运行中/地址/端口。**验证服务用它**；参数 dir=项目目录绝对路径',
      parameters: {
        type: 'object',
        properties: { dir: { type: 'string', description: '项目目录绝对路径' } },
        required: ['dir'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'stop-server',
      description: '停止开发服务器（只停 NeonForge 自己起的）——用完服务可停，释放资源',
      parameters: {
        type: 'object',
        properties: { dir: { type: 'string', description: '项目目录绝对路径' } },
        required: ['dir'],
      },
    },
  },
]

// 2026-08-21 ADR-007 provider 切换（成本优化）：DeepSeek 官方 → Command Code（OpenAI 兼容聚合代理，commandcode.ai）
// 上游模型名映射：内部档位 → Command Code 上游（deepseek/ 前缀）；切回官方只改 API_BASE + API_MODEL 两处
const API_BASE = 'https://api.commandcode.ai/provider/v1'
const API_MODEL: Record<ModelID, string> = {
  'deepseek-v4-flash': 'deepseek/deepseek-v4-flash',
  'deepseek-v4-pro': 'deepseek/deepseek-v4-pro',
}
function apiModel(id: ModelID): string {
  return API_MODEL[id]
}

export class DeepSeekGateway {
  private router = new ModelRouter()

  // 非流式：验证 Key 用（max_tokens 最小）
  async validateKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
    // 测试钩子：模拟断网/超时（不改系统网络——Q7 集中 TEST_HOOKS）
    if (TEST_HOOKS.forceNetworkError === '1') {
      return { ok: false, error: 'network' }
    }
    if (TEST_HOOKS.forceNetworkError === 'timeout') {
      return { ok: false, error: 'timeout' }
    }
    if (TEST_HOOKS.forceNetworkError === 'service') {
      return { ok: false, error: 'service-error' }
    }
    try {
      const res = await fetch(`${API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: apiModel('deepseek-v4-flash'),
          ...toDeepSeekParams('none'),
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(15000),
      })
      if (res.ok) return { ok: true }
      if (res.status === 401) return { ok: false, error: 'key-invalid' }
      if (res.status >= 500) return { ok: false, error: 'service-error' }
      return { ok: false, error: `http-${res.status}` }
    } catch (e) {
      return {
        ok: false,
        error: e instanceof DOMException && e.name === 'TimeoutError' ? 'timeout' : 'network',
      }
    }
  }

  // 流式 chat（SSE）：reasoning_content → content → tool_calls 状态机
  // 回调返回解析出的增量；V1 先透传文本流，tool_calls 解析留 04
  async streamChat(
    apiKey: string,
    opts: {
      model?: ModelID
      level?: ThinkingLevel
      messages: Array<{
        role: string
        content: string | null
        tool_calls?: unknown[]
        tool_call_id?: string
        reasoning_content?: string
      }>
      tools?: boolean
      // 2026-08-06 调研驱动（官方仓库 issue #1376 + 官方文档 + 实测三源交叉验证）：工具模式已是 thinking disabled（toDeepSeekParams('none')），
      // 此时 tool_choice: 'required' 可用（实测成功强制 tool_calls）——forceTool=true 强制模型必须调工具（不能只输出文本）——「只说不做」从 API 层根治
      forceTool?: boolean
      onDelta: (chunk: {
        type: 'reasoning' | 'content' | 'tool-call' | 'done'
        text?: string
        toolCall?: { name: string; args: Record<string, unknown> }
      }) => void
    },
  ): Promise<void> {
    const model = opts.model ?? this.router.route({ thinking: opts.level ?? 'basic' })
    console.log('[gateway] stream start model=' + model + ' tools=' + (opts.tools ?? false))
    const res = await fetch(`${API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: apiModel(model),
        // 工具调用模式禁用 thinking（DeepSeek thinking+tools 易陷入思考-工具循环——直接调工具快速收敛）
        ...toDeepSeekParams(opts.tools ? 'none' : (opts.level ?? 'basic')),
        messages: opts.messages,
        stream: true,
        ...(opts.tools
          ? { tools: TOOL_DEFS, tool_choice: opts.forceTool ? 'required' : 'auto' }
          : {}),
      }),
      signal: AbortSignal.timeout(45000),
    })
    console.log('[gateway] http', res.status)
    if (!res.ok) {
      const bodyText = await res.text().catch(() => '')
      console.log('[gateway] error body:', bodyText.slice(0, 500))
      // 2026-08-07 T1 根因补强：结构化状态码透传（ipc 层 classifyGatewayError 分类——不再靠文本 gateway: http-xxx 正则重建）
      throw new GatewayHttpError(res.status)
    }
    if (!res.body) throw new Error('gateway: no-body')

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const toolAcc: Array<{ name: string; arguments: string }> = []
    let toolStart = 0 // 工具调用收集开始时间

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // SSE 按行解析 data: {...}
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (payload === '[DONE]') {
          continue // 不在此处发 done——循环结束统一发（保证 tool-call 先于 done）
        }
        try {
          const json = JSON.parse(payload)
          const delta = json.choices?.[0]?.delta ?? {}
          if (delta.reasoning_content)
            opts.onDelta({ type: 'reasoning', text: delta.reasoning_content })
          if (delta.content) opts.onDelta({ type: 'content', text: delta.content })
          // tool_calls 增量（DeepSeek SSE：按 index 分片，arguments 为字符串增量）
          if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0
              const fn = tc.function ?? {}
              toolAcc[idx] ??= { name: '', arguments: '' }
              if (fn.name) toolAcc[idx].name += fn.name
              if (fn.arguments) toolAcc[idx].arguments += fn.arguments
            }
            // 模型已决定调工具——等 arguments 完整后发出（分片到达——半截 JSON 会解析失败）
            // 2026-08-04 体验修复：原 5s 超时对大 content write（几千字符 arguments 流式传输）误判截断 → 写入内容不完整（「代码被截断打散」根因）；提到 30s 且完整即发
            const named = toolAcc.filter((x) => x && x.name)
            if (named.length > 0) {
              if (toolStart === 0) toolStart = Date.now()
              const allComplete = named.every((x) => {
                try {
                  JSON.parse(x.arguments)
                  return true
                } catch {
                  return false
                }
              })
              if (allComplete) break
              if (Date.now() - toolStart > 30000) {
                console.log('[gateway] tool-call 超时截断（30s 防挂起）')
                break
              }
            }
          }
        } catch {
          /* 跳过半包 JSON */
        }
      }
    }
    // 收集到的工具调用 → 修复 → 逐个发出（A0 边界：Gateway 修复，ToolRegistry 执行）
    for (const acc of toolAcc) {
      if (!acc.name) continue
      const repaired = toolCallRepair(acc.arguments)
      if (repaired === null) {
        console.log('[gateway] tool-call repair failed:', acc.name, acc.arguments.slice(0, 80))
        continue
      }
      console.log('[gateway] tool-call emit:', acc.name, JSON.stringify(repaired).slice(0, 120))
      opts.onDelta({
        type: 'tool-call',
        toolCall: { name: acc.name, args: repaired as Record<string, unknown> },
      })
    }
    console.log('[gateway] stream done')
    opts.onDelta({ type: 'done' })
  }

  // 预热（ticket 09 / A0 §6 裁决 D-C7）：最小成本请求让服务端缓存 prefix KV
  // v4-flash + thinking=disabled + max_tokens=1；system 携带完整 prefix（KV 缓存前缀）+ 极简 user 保证请求合法
  async preheat(
    apiKey: string,
    prefix: string,
  ): Promise<{ ok: boolean; error?: string; ms: number }> {
    const start = Date.now()
    try {
      const res = await fetch(`${API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: apiModel('deepseek-v4-flash'),
          ...toDeepSeekParams('none'),
          messages: [
            { role: 'system', content: prefix },
            { role: 'user', content: '继续' },
          ],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(20000),
      })
      const ms = Date.now() - start
      if (res.ok) return { ok: true, ms }
      return { ok: false, error: `http-${res.status}`, ms }
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : 'network',
        ms: Date.now() - start,
      }
    }
  }

  // 压缩摘要（ticket 11 Compaction）：compactor 角色非流式——历史 → 紧凑摘要（thinking=none + v4-flash）
  async summarize(
    apiKey: string,
    history: Array<{ role: string; content: string | null }>,
  ): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
    try {
      const res = await fetch(`${API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: apiModel('deepseek-v4-flash'),
          ...toDeepSeekParams('none'),
          messages: [
            {
              role: 'system',
              content:
                '你是 NeonForge 对话压缩器。把以下对话历史压缩为紧凑中文摘要（保留：用户目标、已决策、已授权、已完成事项、关键约束、失败/待办；忽略寒暄与工具细节）。用「对话摘要：」开头，200 字内。',
            },
            ...history,
            { role: 'user', content: '请压缩以上对话为摘要。' },
          ],
          max_tokens: 400,
          stream: false,
        }),
        signal: AbortSignal.timeout(30000),
      })
      const j = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>
        error?: { message?: string }
      }
      if (!res.ok) return { ok: false, error: j.error?.message ?? `http-${res.status}` }
      const summary = j.choices?.[0]?.message?.content?.trim()
      if (!summary) return { ok: false, error: '压缩返回空摘要' }
      return { ok: true, summary }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'network' }
    }
  }
}

export const gateway = new DeepSeekGateway()
