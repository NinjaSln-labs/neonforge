// Preheating（ticket 09）：StandardPrefix 构建 + PrefixCache——首请求命中率优化（A0 §5 预算 5-10K tokens）
// 边界：Preheating=预热候选/前缀维护（纯本地，不消耗 API）；真实 API 预热（gateway.preheat）待 Key 接入
import { createHash } from 'node:crypto'
import { TOOL_DEFS } from './gateway.js'

export interface PreheatPlan {
  shouldPreheat: boolean
  why: string
  actions: string[]
}

// 打开项目时评估预热候选（触发点：workspace.openFolder）
export function planPreheat(rootPath: string | null): PreheatPlan {
  if (!rootPath) return { shouldPreheat: false, why: '无项目', actions: [] }
  return {
    shouldPreheat: true,
    why: `项目已打开（${rootPath}）——首请求前预热`,
    actions: [
      '构建 StandardPrefix（system 叙述 + 工具定义 + 文件树摘要）',
      'PrefixCache hash 检测（hash 变才重建）',
      'V1 真实 API 预热（prewarm 请求）待 Key 校验后接入'
    ]
  }
}

// ---------- StandardPrefix（确定性前缀，零 token 成本构建） ----------

export interface StandardPrefix {
  text: string
  hash: string
  tokens: number // 估算（A0 §5「5-10K」预算）
  builtAt: string
}

const SYS_NARRATIVE = '你是 NeonForge 搭档——帮用户解决当前的问题（一切能被数字工具解决的）。' +
  '流程：理解问题 → 给出方案/执行 → 交付结果。工具调用一次一个，执行完看结果再决定；' +
  '找不到文件就告诉用户；写操作前说明影响。'

// 构建标准前缀：system 叙述 + 工具定义 + 项目文件树摘要
export function buildStandardPrefix(rootPath: string, files: string[]): StandardPrefix {
  const toolNames = TOOL_DEFS.map((t) => t.function.name).join('、')
  const toolNotes = TOOL_DEFS.map((t) => `- ${t.function.name}：${t.function.description}`).join('\n')
  const treeSummary = files.length > 0
    ? files.slice(0, 30).join('\n') + (files.length > 30 ? `\n…（共 ${files.length} 个文件）` : '')
    : '（空目录）'
  const text = [
    SYS_NARRATIVE,
    `当前项目：${rootPath}`,
    '【可用工具】',
    toolNotes,
    '【项目文件（摘要）】',
    treeSummary,
    `工具名列表：${toolNames}`
  ].join('\n\n')
  return {
    text,
    hash: sha16(text),
    tokens: estimateTokens(text),
    builtAt: new Date().toISOString()
  }
}

// token 粗略估算（中文 ~1.5 字/token、英文 ~4 字符/token——取字符数 / 2.5 近似）
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2.5)
}

function sha16(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}

// ---------- PrefixCache（Append-Only 前缀维护 + hash 检测） ----------

export interface PrefixCacheState {
  standardPrefix: string
  hash: string
  history: Array<{ hash: string; at: string; hit: boolean }>
}

const HISTORY_MAX = 20

export class PrefixCache {
  private state: PrefixCacheState | null = null

  get(): PrefixCacheState | null { return this.state }

  // hash 相同 → 命中（不重建）；不同 → 重建前缀（append-only 记录）
  ensure(prefix: StandardPrefix): { hit: boolean; state: PrefixCacheState } {
    const hit = this.state?.hash === prefix.hash
    const entry = { hash: prefix.hash, at: new Date().toISOString(), hit }
    this.state = hit && this.state
      ? { ...this.state, history: [...this.state.history, entry].slice(-HISTORY_MAX) }
      : { standardPrefix: prefix.text, hash: prefix.hash, history: [...(this.state?.history ?? []), entry].slice(-HISTORY_MAX) }
    return { hit, state: this.state }
  }
}

export const prefixCache = new PrefixCache()

// ---------- PreheatingService（真实 API 预热——ticket 09 / D-C7） ----------

export interface PreheatEvent { type: 'started' | 'completed' | 'failed'; at: string; ms?: number }

export interface PreheatStatus {
  status: 'idle' | 'preheating' | 'ready' | 'failed'
  lastMs?: number
  lastError?: string
  events: PreheatEvent[]
}

const EVENTS_MAX = 20

export class PreheatingService {
  private status: PreheatStatus = { status: 'idle', events: [] }

  getStatus(): PreheatStatus { return this.status }

  // 触发预热（防并发；成功/失败更新状态；失败降级不阻塞——A0 §6）
  async run(
    apiKey: string,
    prefix: StandardPrefix,
    preheatFn: (key: string, prefixText: string) => Promise<{ ok: boolean; error?: string; ms: number }>
  ): Promise<PreheatStatus> {
    if (this.status.status === 'preheating') return this.status // 并发防护
    this.status = {
      status: 'preheating',
      events: [...this.status.events, { type: 'started' as const, at: new Date().toISOString() }].slice(-EVENTS_MAX)
    }
    const r = await preheatFn(apiKey, prefix.text)
    this.status = r.ok
      ? {
          status: 'ready',
          lastMs: r.ms,
          events: [...this.status.events, { type: 'completed' as const, at: new Date().toISOString(), ms: r.ms }].slice(-EVENTS_MAX)
        }
      : {
          status: 'failed',
          lastMs: r.ms,
          lastError: r.error,
          events: [...this.status.events, { type: 'failed' as const, at: new Date().toISOString(), ms: r.ms }].slice(-EVENTS_MAX)
        }
    return this.status
  }
}

export const preheating = new PreheatingService()
