// ticket 14 信任阶梯 · 授权执行模型（renderer 侧纯函数——等级/风险/影响/合并判定）
// L1 观察（read/search/LSP——无需授权）→ L2 建议（模型文本，无工具）→ L3 操作（write/edit/bash——逐项授权 + 快照）→ L4 委托（低危规则命中免确认，可撤销）
// 疲劳防护：同批多个低危文件操作合并授权；bash（高危命令）永远单独确认

import { isPathInsideRoot, normalizeComparePath } from '../domain/conversationState'
import type { TrustMode } from '../domain/trustMode'

export type { TrustMode } from '../domain/trustMode'

export type ToolRisk = 'none' | 'low' | 'high'

// 工具 → 风险等级：read/search/LSP 只读无需授权；write/edit 低危文件操作（写前快照可回滚）；bash 高危命令执行
export function toolRisk(name: string): ToolRisk {
  if (name === 'write' || name === 'edit') return 'low'
  if (name === 'bash') return 'high'
  return 'none'
}

// 工具 → 信任等级（授权模型映射）
export function toolLevel(name: string): 'L1' | 'L3' {
  return toolRisk(name) === 'none' ? 'L1' : 'L3'
}

// 授权卡文案：等级 + 影响（写哪个文件/执行什么命令）+ 提示（写前已备份可还原）
// 2026-08-03 v31 B1：去内部术语「L3」；v35：note 人类化（「快照 .nf-bak」→「备份原文件」——技术词隐藏）
export interface AuthHint {
  level: string // 如「需要授权 · 写入文件」
  impact: string // 影响目标（文件路径 / 命令截断）
  note: string // 备份/风险提示
}

export function buildAuthHint(name: string, args: Record<string, unknown>): AuthHint {
  if (name === 'write' || name === 'edit') {
    const file = String(args.path ?? '?')
    return { level: '需要授权 · 写入文件', impact: file, note: '会先备份原文件，之后可一键还原' }
  }
  if (name === 'bash') {
    const cmd = String(args.command ?? '').trim()
    // 2026-08-06 用户反馈「命令实际失败了但先让我授权，不确认是不是有问题」：授权卡命令截断 60 字符用户无法判断命令内容 →
    // 显示完整命令（用户要看到完整命令才能判断「干什么、是否可靠」）；note 加「看不懂/命令有问题可拒绝」判断引导
    return {
      level: '需要授权 · 执行命令',
      impact: cmd || '?',
      note: '这条命令会在你的电脑上运行——确认命令内容没问题再点允许；看不懂或命令看起来有问题的，点「拒绝」',
    }
  }
  return { level: '需要授权', impact: JSON.stringify(args).slice(0, 60), note: '' }
}

// 疲劳防护：同批多个待授权工具且全部低危 → 可合并授权（bash 高危永远单独确认）
export function canMergeApprove(calls: Array<{ name: string }>): boolean {
  if (calls.length < 2) return false
  return calls.every((c) => toolRisk(c.name) === 'low')
}

// ADR-015：信任模式自动授权判定（renderer 单源——main 执行边界只做二次校验，不重复判定模式）
export interface AutoApproveInput {
  mode: TrustMode
  name: string
  /** 已 trustPath 规范化的目标路径 */
  path: string
  planConfirmed: boolean
  /** 已确认方案派生的清单（绝对路径；比较前统一规范化） */
  plannedFiles: readonly string[]
  /** 任务信任（允许并记住/单次批准绑定文件）——用户显式授权，三种模式都放行 */
  trusted: boolean
  /** 项目根（可选）：提供时根外路径永不自动放行（ADR-015 / V2 信任模式：清单外/根外始终弹卡） */
  rootPath?: string | null
}

/** 计划清单包含判定（调用方必须传入与目标路径同一基准的绝对路径；只做精确规范化比较——
 * 相对干净路径的末段匹配会把 /tmp/game.js 误认为计划内 game.js，禁止用于授权判定）。 */
export function isInPlan(path: string, plannedFiles: readonly string[]): boolean {
  const p = normalizeComparePath(path)
  if (!p) return false
  return plannedFiles.some((raw) => normalizeComparePath(raw) === p)
}

const isFileTool = (name: string): boolean => name === 'write' || name === 'edit'

export function shouldAutoApproveTool(input: AutoApproveInput): boolean {
  // 任务信任只绑定文件路径（允许并记住/单次批准）——bash/MCP 不得借 args.path 搭车绕过授权。
  // ADR-015：用户显式绑定文件的授权优先于自动判定（三种模式都放行；根外路径单次批准后记住也尊重）。
  if (input.trusted && isFileTool(input.name)) return true
  // V2 信任模式硬边界：计划/委托判定下的根外路径永不自动放行（根外写入只能逐次授权）。
  // 2026-11-24 真机 root-out 剧本：方案列出 '../escaped.txt'，trustPath 绝对化后与清单精确相等，
  // standard/delegated 的 isInPlan 判定不区分根内外 → 自动批准把根外写入放行（与 V2 验收相悖）。
  if (input.rootPath && !isPathInsideRoot(input.path, input.rootPath)) return false
  if (input.mode === 'strict') return false
  const inPlan = input.planConfirmed && isInPlan(input.path, input.plannedFiles)
  if (input.mode === 'standard') return input.name === 'write' && inPlan
  if (input.mode === 'delegated') {
    return isFileTool(input.name) && inPlan
  }
  return false
}

/** 自动批准的来源：任务信任/标准方案放行 = auto；低危委托模式的文件自动批准 = delegate
 *（main 只对 delegate 做执行边界二次校验——委托模式下 write/edit 都走同一防线）。 */
export function autoApprovalSource(input: AutoApproveInput): 'auto' | 'delegate' | null {
  if (!shouldAutoApproveTool(input)) return null
  if (input.trusted) return 'auto'
  if (input.mode === 'delegated' && isFileTool(input.name)) return 'delegate'
  return 'auto'
}
