/** 系统对模型的注入文案——不得进任何用户通道（气泡/输入框/message_sent/chatLog） */
const SYSTEM_NUDGE_RE = /^(系统提示：|【系统提示·非用户发言】|【系统对账·非用户发言】)/

export function isSystemNudgeText(text: string): boolean {
  return SYSTEM_NUDGE_RE.test(text.trim())
}

/** 时间线分类——查问题用 */
export function systemNudgeKind(text: string): 'prompt' | 'protocol' | 'evidence' | 'guidance' {
  const t = text.trim()
  if (t.startsWith('【系统对账')) return 'evidence'
  if (t.startsWith('【系统提示')) return 'protocol'
  if (t.startsWith('系统提示：')) return 'prompt'
  return 'guidance'
}
