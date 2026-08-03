// ticket 14 信任阶梯 · 授权执行模型（renderer 侧纯函数——等级/风险/影响/合并判定）
// L1 观察（read/search/LSP——无需授权）→ L2 建议（模型文本，无工具）→ L3 操作（write/edit/bash——逐项授权 + 快照）→ L4 委托（低危规则命中免确认，可撤销）
// 疲劳防护：同批多个低危文件操作合并授权；bash（高危命令）永远单独确认

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

// 授权卡文案：等级 + 影响（写哪个文件/执行什么命令）+ 快照提示（写前已备份可回滚）
// 2026-08-03 v31 B1 审计修复：非技术用户优先——去掉内部信任等级术语「L3」（V1 主受众不懂），用人类语言「需要授权 · 操作」
export interface AuthHint {
  level: string // 如「需要授权 · 写入文件」
  impact: string // 影响目标（文件路径 / 命令截断）
  note: string // 快照/风险提示
}

export function buildAuthHint(name: string, args: Record<string, unknown>): AuthHint {
  if (name === 'write' || name === 'edit') {
    const file = String(args.path ?? '?')
    return { level: '需要授权 · 写入文件', impact: file, note: '写前自动快照备份 .nf-bak——可一键回滚' }
  }
  if (name === 'bash') {
    const cmd = String(args.command ?? '').trim()
    return { level: '需要授权 · 执行命令', impact: cmd.length > 60 ? cmd.slice(0, 60) + '…' : cmd || '?', note: '本机进程执行——授权即同意运行该命令' }
  }
  return { level: '需要授权', impact: JSON.stringify(args).slice(0, 60), note: '' }
}

// 疲劳防护：同批多个待授权工具且全部低危 → 可合并授权（bash 高危永远单独确认）
export function canMergeApprove(calls: Array<{ name: string }>): boolean {
  if (calls.length < 2) return false
  return calls.every((c) => toolRisk(c.name) === 'low')
}
