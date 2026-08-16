// 完成声明解析（S2——设计 §3.3 + §8.1 C ⑮）
// 结构化解析【已达成】块：
//   【已达成】
//   声明文本（summary）
//   验证证据：
//   - 命令（结果）
//   遗留问题：
//   - 问题行
// → CompletionClaim（summary + evidence.verification[command/output/passed] + evidence.diffs + evidence.pendingQuestions）
// 无【已达成】标记 → null（不产生完成声明——对账不触发）
// 容错：命令行与说明混排——只取命令形态行；结果判定（通过/失败）→ passed 字段
// 纯逻辑无 React 依赖——L1 可测。

import type { CompletionClaim, VerificationItem } from './conversationState.js'

/**
 * 结构化解析【已达成】块 → CompletionClaim；无标记 → null。
 * - verification：验证证据行（命令形态）——「- npm test（全部通过）」→ { command: 'npm test', passed: true }
 * - pendingQuestions：遗留问题行
 * - diffs：模型自报 diff 对账点（S2 保持空数组——V1b 由系统从 planned/produced 派生，非模型自述）
 */
export function parseCompletionClaim(text: string): CompletionClaim | null {
  const block = text.match(/【已达成】([\s\S]*?)(?:【|$)/)
  if (!block) return null
  const region = block[1]

  const lines = region.split('\n').map((l) => l.trim()).filter(Boolean)
  const summaryParts: string[] = []
  const verification: VerificationItem[] = []
  const pendingQuestions: string[] = []
  let section: 'summary' | 'verification' | 'questions' = 'summary'

  for (const line of lines) {
    if (/^验证证据[:：]/.test(line)) {
      section = 'verification'
      continue
    }
    if (/^遗留问题[:：]/.test(line)) {
      section = 'questions'
      continue
    }
    const item = line.match(/^[-•]\s*(.+)$/)
    if (section === 'summary') {
      if (!item) summaryParts.push(line) // 声明文本（可能多行）
    } else if (section === 'verification') {
      if (item) verification.push(parseVerificationItem(item[1].trim()))
    } else if (section === 'questions') {
      if (item) pendingQuestions.push(item[1].trim())
    }
  }

  return {
    summary: summaryParts.join(' ').trim(),
    evidence: { verification, diffs: [], pendingQuestions },
  }
}

/** 验证行解析：「npx vitest run（全部通过）」→ { command, passed: true }；「npm run build 失败」→ passed: false */
function parseVerificationItem(line: string): VerificationItem {
  const passed = /通过|成功|通过|ok|OK|0 错误|0 error|all pass|passed/i.test(line) && !/失败|error|报错/.test(line)
  const failed = /失败|报错|error/i.test(line)
  // 去结果尾巴：取命令主体（去括号注释）
  const command = line.replace(/\s*[（(](?:全部通过|通过|成功|失败|报错|0 错误|0 error)[）)]\s*$/i, '').trim()
  return {
    command: command || line,
    passed: failed ? false : passed ? true : undefined,
  }
}
