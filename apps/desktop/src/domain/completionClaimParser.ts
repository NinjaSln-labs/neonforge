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

  const lines = region
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
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
      if (item) {
        // #6 真机 2026-08-30（P1-1b）：「- 无」（sysPrompt ⑮ 规定的空遗留格式）被当成名为「无」的 pending question
        // → 对账永久拒绝。空遗留标记不入清单
        const q = item[1].trim()
        if (!/^(无|暂无|没有|none)[。.！!]?$/.test(q)) pendingQuestions.push(q)
      }
    }
  }

  return {
    summary: summaryParts.join(' ').trim(),
    evidence: { verification, diffs: [], pendingQuestions },
  }
}

/**
 * 验证行解析：「- 命令（结果）」→ { command, passed }
 * #6 真机 2026-08-30（P1-1c）：结果尾巴只剥固定词表（通过/失败等），任意中文结果
 * （「（index.html 存在，5931 字节…）」）留在 command 里 → 系统代跑整串非法 shell → 恒失败。
 * 改为：剥任意尾随括号注释（全角/半角）作为结果文本；passed 从结果文本判定
 */
function parseVerificationItem(line: string): VerificationItem {
  // 尾随括号注释（结果文本）——命令主体与其分离（shell 命令极少以括号结尾；误剥面可控）
  const m = line.match(/^(.*?)\s*[（(]([^（）()]*)[）)]\s*$/)
  const command = (m ? m[1] : line).trim() || line
  // 有括号注释 → 结果文本只看注释内（避免命令/路径含「失败」等词误判）；无括号 → 扫整行（「npm run build 失败」形态）
  const resultText = m ? m[2] : line
  const failed = /失败|报错|error|exit-[1-9]/i.test(resultText)
  const passed =
    !failed && /通过|成功|ok\b|OK\b|0 错误|0 error|all pass|passed|200/i.test(resultText)
  return {
    command,
    passed: failed ? false : passed ? true : undefined,
  }
}
