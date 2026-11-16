// ADR-014：假设来源制裁——模型自报来源不可信，只有本会话真实发生过的澄清/点选才能保留来源标签。
// 未命中证据的来源一律降级为 model_inference（用户确认卡上不得把模型臆断标成「你的选择」）。
import type { Assumption } from '../domain/conversationState'

export interface AssumptionEvidence {
  /** 用户在假设核对卡中确认（符合）的假设文本，以及其修正文本 */
  clarified: Set<string>
  /** 用户点选过的候选标签 */
  chosen: Set<string>
}

const normalize = (text: string): string => text.trim()

export function sanitizeAssumptionSources(
  assumptions: Assumption[],
  evidence: AssumptionEvidence,
): Assumption[] {
  return assumptions.map((a) => {
    if (a.source === 'clarification' && evidence.clarified.has(normalize(a.text))) return a
    if (a.source === 'user_choice' && evidence.chosen.has(normalize(a.text))) return a
    return { ...a, source: 'model_inference' }
  })
}
