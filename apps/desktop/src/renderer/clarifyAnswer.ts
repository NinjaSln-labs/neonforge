// ADR-014：结构化澄清回答的格式化/解析单源。
// 用户消息是 LLM 读取的自由文本，但格式由本模块拥有：JSON 载荷负责转义换行/冒号/标记，
// 避免假设或修正文本破坏逐条编码；解析函数用于 UI 已回复判定与来源校验。
export type ClarifyChoice = '符合' | '不符合'

export interface ClarifyAnswerRow {
  assumption: string
  choice: ClarifyChoice
  correction?: string
}

export interface ClarifyAnswer {
  question: string
  answers: ClarifyAnswerRow[]
}

const MARKER = '【澄清回答】'

export function formatClarifyAnswer(answer: ClarifyAnswer): string {
  return `${MARKER}\n${JSON.stringify(answer)}`
}

/** 解析结构化澄清回答；非本格式/损坏 → null（UI 不把普通文本误判为已回答）。 */
export function parseClarifyAnswer(text: string): ClarifyAnswer | null {
  if (!text.startsWith(`${MARKER}\n`)) return null
  try {
    const parsed = JSON.parse(text.slice(MARKER.length + 1)) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const value = parsed as Partial<ClarifyAnswer>
    if (typeof value.question !== 'string' || !Array.isArray(value.answers)) return null
    const answers: ClarifyAnswerRow[] = []
    for (const raw of value.answers) {
      if (!raw || typeof raw !== 'object') return null
      const row = raw as Partial<ClarifyAnswerRow>
      if (typeof row.assumption !== 'string') return null
      if (row.choice !== '符合' && row.choice !== '不符合') return null
      if (row.correction !== undefined && typeof row.correction !== 'string') return null
      answers.push({
        assumption: row.assumption,
        choice: row.choice,
        ...(row.correction !== undefined ? { correction: row.correction } : {}),
      })
    }
    return { question: value.question, answers }
  } catch {
    return null
  }
}
