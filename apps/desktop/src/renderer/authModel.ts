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
    return { level: '需要授权 · 执行命令', impact: cmd || '?', note: '这条命令会在你的电脑上运行——确认命令内容没问题再点允许；看不懂或命令看起来有问题的，点「拒绝」' }
  }
  return { level: '需要授权', impact: JSON.stringify(args).slice(0, 60), note: '' }
}

// 疲劳防护：同批多个待授权工具且全部低危 → 可合并授权（bash 高危永远单独确认）
export function canMergeApprove(calls: Array<{ name: string }>): boolean {
  if (calls.length < 2) return false
  return calls.every((c) => toolRisk(c.name) === 'low')
}
