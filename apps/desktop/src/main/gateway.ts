// DeepSeekGateway 门面：Provider 注册表 + DeepSeek ModelProfile + OpenAI 兼容传输（ADR-010）
// 网络侧收敛在 Main Process（A0 §6 裁决 D-M8）；renderer 经 IPC 调用

import { TEST_HOOKS } from './testHooks.js'
// V1.5 S1 Task 1.3：协议工具接入模型工具面（schema 单源——domain/protocolTools.ts）
import { PROTOCOL_TOOL_DEFS } from '../domain/protocolTools.js'
import {
  type ModelID,
  type ModelTier,
  type ProviderId,
  type ThinkingLevel,
  DEEPSEEK_TOOL_CHOICE,
  filterDeepSeekModels,
  fallbackUpstream,
  getProvider,
  listModels,
  resolveFromList,
  resolveUpstreamModel,
  toDeepSeekParams,
  extractReasoningText,
  REASONING_FIELDS,
  postChatCompletions,
  classifyValidateResponse,
  classifyFetchError,
} from './providers/index.js'

export type { ModelID, ModelTier, ThinkingLevel, ProviderId }
export type { DeepSeekThinkingParams } from './providers/index.js'
export { toDeepSeekParams, extractReasoningText, REASONING_FIELDS }

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

// UAT 钩子缺口 #8：chat 路径故障注入（模块级一次性消耗——与 validateKey 的 NF_FORCE_NETWORK_ERROR 分立）
let chatErrorHookConsumed = false
/** @internal vitest 复位 */
export function resetChatErrorHookForTests(): void {
  chatErrorHookConsumed = false
}

function injectChatErrorHook(): void {
  // 运行时再读 env——vitest 可 stubEnv 而不必 resetModules；产品路径 TEST_HOOKS 已在启动时固化
  const mode =
    TEST_HOOKS.forceChatError ??
    (process.env.NF_FORCE_CHAT_ERROR as typeof TEST_HOOKS.forceChatError)
  if (!mode || chatErrorHookConsumed) return
  chatErrorHookConsumed = true
  console.log('[gateway] TEST_HOOK forceChatError=' + mode)
  if (mode === '400-once') throw new GatewayHttpError(400)
  if (mode === '503-once') throw new GatewayHttpError(503)
  if (mode === 'timeout-once') {
    const err = new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    throw err
  }
  if (mode === 'network-once') throw new TypeError('fetch failed')
}

/** 可瞬态重试：超时 / 5xx / 网络；400 单独限 1 次（见 streamChat） */
export function isTransientStreamError(e: unknown): boolean {
  if (e instanceof GatewayHttpError) return e.status >= 500 || e.status === 400
  if (e instanceof DOMException && e.name === 'TimeoutError') return true
  if (e instanceof TypeError) return true // fetch failed
  const msg = e instanceof Error ? e.message : ''
  return /aborted due to timeout|timed?\s*out/i.test(msg)
}

export const classifyGatewayError = (e: unknown): GatewayErrorType => {
  if (e instanceof GatewayHttpError) return e.status === 401 ? 'key-invalid' : 'service'
  const msg = e instanceof Error ? e.message : ''
  if (msg.startsWith('gateway')) return 'service' // gateway: no-body 等我方网关层错误
  if (e instanceof DOMException && e.name === 'TimeoutError') return 'service' // AbortSignal.timeout(stream)
  if (e instanceof TypeError) return 'service' // fetch 网络错误（'fetch failed' 等）
  return 'unknown'
}

// A0 §2：ThinkingLevel=定义、ModelRouter=档位；上游名 = /models DeepSeek 过滤 + fallback
export class ModelRouter {
  route(task: { userRequestedPro?: boolean; thinking: ThinkingLevel }): ModelTier {
    if (task.userRequestedPro) return 'pro'
    if (task.thinking === 'high') return 'pro'
    return 'flash'
  }
}

// A0 §2 边界判定：ToolRegistry 执行、Gateway 修复（4 轮）
// V1.5 S2 A-018：round 驱动渐进修复——parse 失败不再单次即弃（spike 附录 B 承诺「parse 失败
// 保留 rawArguments 重试 1 次」）。
// - 解析基态（任意 round）：原样 parse + 双重序列化剥层（crush 教训——args 被 JSON 字符串包裹时
//   parse 结果仍是 string → 再 parse 一层——spike-lib parseArguments 行为对齐）
// - round 0 失败：最简尾逗号补全（V1 基础实现）——不可补则明确 null（交给调用方 round 1 重试）
// - round 1+：杂质剥离（模型输出混入说明文本——提取首个 JSON 值到闭合括号）
// - round >= 4 放弃（上限不变——防死循环）
export function toolCallRepair(raw: unknown, round: number = 0): unknown | null {
  if (round >= 4) return null // 4 轮上限
  try {
    if (typeof raw === 'string') {
      const parsed = JSON.parse(raw)
      return typeof parsed === 'string' ? JSON.parse(parsed) : parsed
    }
    return raw
  } catch {
    const s = String(raw).trim()
    // round 0：截断/畸形最简补全（V1 基础实现）
    if (round === 0) {
      const fixed = s.replace(/,\s*}$/, '}').replace(/,\s*\]$/, ']')
      if (fixed === s) return null // 无尾逗号可修——明确失败，交给调用方 round 1 更强策略重试
      return toolCallRepair(fixed, round + 1)
    }
    // round 1+：杂质剥离——提取首个 JSON 值到闭合括号（模型输出混入说明文本——格式漂移兜底）
    const start = s.search(/[{[]/)
    const end = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'))
    if (start >= 0 && end > start) {
      const sub = s.slice(start, end + 1)
      if (sub !== s) return toolCallRepair(sub, round + 1)
    }
    return null
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
      description:
        '打开网页或项目内本地文件（默认浏览器）——用户说「帮我打开」时调用；http/https，或项目内相对路径/file://（如 index.html）',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description:
              'http/https，或项目内路径（index.html / file:///…/项目内/index.html）——项目外 file:// 会被拒',
          },
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
      name: 'web_search',
      description:
        '外网网页检索（须用户在设置开启「允许外网检索」）。查文档/报错/公开资料用；项目内代码用 search。未开启时不要调用。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '检索词' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_fetch',
      description:
        '拉取外网 URL 正文（须已开启外网检索）。读文档页/API 说明用；仅打开浏览器用 open。只支持 http/https。',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'http/https 地址' },
        },
        required: ['url'],
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
  // V1.5 S1 Task 1.3：协议工具（propose_goal/propose_plan/report_completion/ask_user——ADR-009
  // 模型主动产出决策内容的通道）。形状适配：domain ProtocolToolDef {name,description,parameters}
  // → OpenAI function tool {type:'function',function:{…}}（适配留在本文件——domain 层保持纯净）
  ...PROTOCOL_TOOL_DEFS.map((d) => ({
    type: 'function' as const,
    function: { name: d.name, description: d.description, parameters: d.parameters },
  })),
]

export class DeepSeekGateway {
  private router = new ModelRouter()
  /** provider → 已解析上游档位（validate/首次请求时灌入） */
  private resolvedModels = new Map<ProviderId, Record<ModelTier, string>>()

  /**
   * /models → DeepSeek 过滤；无列表时用 manualModelId；再无则 fallback（运行时兜底）。
   * validate 路径见 validateKey（无列表且无手填 → needs-model-id）。
   */
  async refreshModels(
    providerId: ProviderId,
    apiKey: string,
    manualModelId?: string | null,
  ): Promise<{ resolved: Record<ModelTier, string>; source: 'list' | 'manual' | 'fallback' }> {
    const { baseURL } = getProvider(providerId)
    let ids: string[] = []
    let listed = false
    try {
      ids = await listModels(baseURL, apiKey)
      listed = true
    } catch (e) {
      console.log('[gateway] /models failed:', e instanceof Error ? e.message : e)
    }
    const deepseek = filterDeepSeekModels(ids)
    let resolved: Record<ModelTier, string>
    let source: 'list' | 'manual' | 'fallback'
    if (deepseek.length > 0) {
      resolved = resolveFromList(providerId, ids)
      source = 'list'
    } else {
      const mid = manualModelId?.trim()
      if (mid) {
        resolved = { flash: mid, pro: mid }
        source = 'manual'
      } else {
        resolved = {
          flash: fallbackUpstream(providerId, 'flash'),
          pro: fallbackUpstream(providerId, 'pro'),
        }
        source = 'fallback'
      }
    }
    this.resolvedModels.set(providerId, resolved)
    console.log(
      '[gateway] models provider=' +
        providerId +
        ' source=' +
        source +
        ' listed=' +
        listed +
        ' flash=' +
        resolved.flash +
        ' pro=' +
        resolved.pro,
    )
    return { resolved, source }
  }

  private upstream(providerId: ProviderId, tier: ModelTier): string {
    return resolveUpstreamModel(providerId, tier, this.resolvedModels.get(providerId))
  }

  /** UI：接入方 + 实际上游模型（未刷列表时用 fallback；手填优先） */
  peekActiveModel(
    providerId: ProviderId,
    manualModelId?: string | null,
    tier: ModelTier = 'flash',
  ): { providerId: ProviderId; providerLabel: string; upstream: string; shortName: string } {
    const mid = manualModelId?.trim()
    const upstream = mid || this.upstream(providerId, tier)
    const leaf = upstream.includes('/') ? upstream.slice(upstream.lastIndexOf('/') + 1) : upstream
    return {
      providerId,
      providerLabel: getProvider(providerId).label,
      upstream,
      shortName: leaf,
    }
  }

  // 非流式：验证 Key——有 /models 自动挑；无列表须手填 modelId
  async validateKey(
    apiKey: string,
    providerId: ProviderId,
    modelId?: string | null,
  ): Promise<{
    ok: boolean
    error?: string
    suggestModelId?: string
    modelSource?: 'list' | 'manual' | 'fallback'
  }> {
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
      const { resolved, source } = await this.refreshModels(providerId, apiKey, modelId)
      if (source === 'fallback') {
        return {
          ok: false,
          error: 'needs-model-id',
          suggestModelId: fallbackUpstream(providerId, 'flash'),
        }
      }
      const { baseURL } = getProvider(providerId)
      const res = await postChatCompletions(
        baseURL,
        apiKey,
        {
          model: resolved.flash,
          ...toDeepSeekParams('none'),
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
        },
        15000,
      )
      const classified = await classifyValidateResponse(res)
      if (classified.ok) return { ok: true, modelSource: source }
      return classified
    } catch (e) {
      return { ok: false, error: classifyFetchError(e) }
    }
  }

  // 流式 chat（SSE）：reasoning_content → content → tool_calls 状态机
  // A-024：上游瞬态 http-400 → 恰好重试一次
  // 2026-09-28：超时/5xx/网络 → 最多再试 2 次（共 3 击）；中途已推 delta 则先 stream-reset 再重拉
  async streamChat(
    apiKey: string,
    opts: Parameters<DeepSeekGateway['streamChatOnce']>[1],
  ): Promise<void> {
    const maxAttempts = 3
    let attempt = 0
    while (attempt < maxAttempts) {
      attempt++
      let emitted = false
      try {
        return await this.streamChatOnce(apiKey, {
          ...opts,
          onDelta: (chunk) => {
            emitted = true
            opts.onDelta(chunk)
          },
        })
      } catch (e) {
        const is400 = e instanceof GatewayHttpError && e.status === 400
        const transient = isTransientStreamError(e)
        const canRetry = is400 ? attempt === 1 : transient && attempt < maxAttempts
        if (!canRetry) throw e
        const kind = is400
          ? 'http-400'
          : e instanceof DOMException && e.name === 'TimeoutError'
            ? 'timeout'
            : e instanceof GatewayHttpError
              ? `http-${e.status}`
              : 'network'
        console.log(`[gateway] ${kind} transient — retrying (${attempt}/${maxAttempts - 1})`)
        if (emitted) opts.onDelta({ type: 'stream-reset' })
        await new Promise((r) => setTimeout(r, 400 * attempt))
      }
    }
  }

  private async streamChatOnce(
    apiKey: string,
    opts: {
      providerId: ProviderId
      model?: ModelID
      /** 无 /models 时的手填上游 id */
      manualModelId?: string | null
      level?: ThinkingLevel
      messages: Array<{
        role: string
        content: string | null
        tool_calls?: unknown[]
        tool_call_id?: string
        reasoning_content?: string
      }>
      tools?: boolean
      // tool_choice 恒 auto（DeepSeek Profile）；forceTool 仅 timeline 取证，不进 API
      forceTool?: boolean
      onDelta: (chunk: {
        type: 'reasoning' | 'content' | 'tool-call' | 'done' | 'stream-reset'
        text?: string
        toolCall?: { name: string; args: Record<string, unknown> }
      }) => void
    },
  ): Promise<void> {
    const tier = opts.model ?? this.router.route({ thinking: opts.level ?? 'basic' })
    if (!this.resolvedModels.has(opts.providerId)) {
      await this.refreshModels(opts.providerId, apiKey, opts.manualModelId)
    }
    const upstream = this.upstream(opts.providerId, tier)
    const { baseURL } = getProvider(opts.providerId)
    console.log(
      '[gateway] stream start provider=' +
        opts.providerId +
        ' tier=' +
        tier +
        ' upstream=' +
        upstream +
        ' tools=' +
        (opts.tools ?? false),
    )
    injectChatErrorHook()
    const res = await postChatCompletions(
      baseURL,
      apiKey,
      {
        model: upstream,
        // 工具调用模式禁用 thinking（DeepSeek thinking+tools 易陷入思考-工具循环）
        ...toDeepSeekParams(opts.tools ? 'none' : (opts.level ?? 'basic')),
        messages: opts.messages,
        stream: true,
        ...(opts.tools ? { tools: TOOL_DEFS, tool_choice: DEEPSEEK_TOOL_CHOICE } : {}),
      },
      // 流式整段共用 AbortSignal——含读 body；批准后写产物常 >45s，过短会误报「服务暂时不可用」
      180000,
    )
    console.log('[gateway] http', res.status)
    if (!res.ok) {
      const bodyText = await res.text().catch(() => '')
      console.log('[gateway] error body:', bodyText.slice(0, 500))
      throw new GatewayHttpError(res.status)
    }
    if (!res.body) throw new Error('gateway: no-body')

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const toolAcc: Array<{ name: string; arguments: string }> = []
    let toolStart = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (payload === '[DONE]') {
          continue
        }
        try {
          const json = JSON.parse(payload)
          const delta = json.choices?.[0]?.delta ?? {}
          const reasoningText = extractReasoningText(delta)
          if (reasoningText) opts.onDelta({ type: 'reasoning', text: reasoningText })
          if (delta.content) opts.onDelta({ type: 'content', text: delta.content })
          if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0
              const fn = tc.function ?? {}
              toolAcc[idx] ??= { name: '', arguments: '' }
              if (fn.name) toolAcc[idx].name += fn.name
              if (fn.arguments) toolAcc[idx].arguments += fn.arguments
            }
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
    const emitToolCall = (name: string, args: unknown, viaRetry: boolean) => {
      console.log(
        `[gateway] tool-call ${viaRetry ? 'repaired (retry)' : 'emit'}:`,
        name,
        JSON.stringify(args).slice(0, 120),
      )
      opts.onDelta({
        type: 'tool-call',
        toolCall: { name, args: args as Record<string, unknown> },
      })
    }
    for (const acc of toolAcc) {
      if (!acc.name) continue
      const repaired = toolCallRepair(acc.arguments, 0)
      if (repaired === null) {
        const retried = toolCallRepair(acc.arguments, 1)
        if (retried === null) {
          console.log(
            '[gateway] tool-call repair failed (after retry):',
            acc.name,
            acc.arguments.slice(0, 80),
          )
          continue
        }
        emitToolCall(acc.name, retried, true)
        continue
      }
      emitToolCall(acc.name, repaired, false)
    }
    console.log('[gateway] stream done')
    opts.onDelta({ type: 'done' })
  }

  // 预热：flash 档 + thinking=disabled + max_tokens=1
  async preheat(
    apiKey: string,
    prefix: string,
    providerId: ProviderId,
    manualModelId?: string | null,
  ): Promise<{ ok: boolean; error?: string; ms: number }> {
    const start = Date.now()
    try {
      if (!this.resolvedModels.has(providerId)) {
        await this.refreshModels(providerId, apiKey, manualModelId)
      }
      const { baseURL } = getProvider(providerId)
      const res = await postChatCompletions(
        baseURL,
        apiKey,
        {
          model: this.upstream(providerId, 'flash'),
          ...toDeepSeekParams('none'),
          messages: [
            { role: 'system', content: prefix },
            { role: 'user', content: '继续' },
          ],
          max_tokens: 1,
        },
        20000,
      )
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

  // 压缩摘要：compactor 非流式——thinking=none + flash
  async summarize(
    apiKey: string,
    history: Array<{ role: string; content: string | null }>,
    providerId: ProviderId,
    manualModelId?: string | null,
  ): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
    try {
      if (!this.resolvedModels.has(providerId)) {
        await this.refreshModels(providerId, apiKey, manualModelId)
      }
      const { baseURL } = getProvider(providerId)
      const res = await postChatCompletions(
        baseURL,
        apiKey,
        {
          model: this.upstream(providerId, 'flash'),
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
        },
        30000,
      )
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
