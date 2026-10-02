// ADR-017：授权执行日志（main 持久权威——"这条请求能不能跑、跑没跑过"）
// 身份即 id：issueId＝apr_<bootNonce>_<counter>——bootNonce 只活在 id 内（不进领域状态/台账结构，撤钟裁定）；
// 对一切消费方不透明（禁解析内部结构——M-01）。append-only JSONL（plannedFilesStore 容错模式：损坏行忽略、落盘失败忽略）。
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

export type JournalPhase = 'issued' | 'approved' | 'started' | 'done'
export interface JournalRow {
  requestId: string
  toolName: string
  argsFingerprint: string
  phase: JournalPhase
  ts: string
}

/** args 摘要指纹（键序无关——canonical JSON＋djb2；防"批 A 行 B"TOCTOU 核验） */
export function fingerprintArgs(name: string, args: Record<string, unknown>): string {
  const canon = JSON.stringify(
    Object.keys(args)
      .sort()
      .map((k) => [k, args[k]]),
  )
  let h = 5381
  const s = name + canon
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(16) + '_' + s.length.toString(16)
}

const PHASES: JournalPhase[] = ['issued', 'approved', 'started', 'done']

export class ApprovalJournal {
  private readonly bootNonce = Math.random().toString(36).slice(2, 8)
  private counter = 0

  constructor(private readonly filePath: string) {}

  issueId(): string {
    return `apr_${this.bootNonce}_${++this.counter}`
  }

  append(entry: Omit<JournalRow, 'ts'>): void {
    try {
      const dir = path.dirname(this.filePath)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      appendFileSync(
        this.filePath,
        JSON.stringify({ ...entry, ts: new Date().toISOString() }) + '\n',
        { mode: 0o600 },
      )
    } catch {
      /* 落盘失败忽略——签发仍可执行（A 期只记不判） */
    }
  }

  private allRows(): JournalRow[] {
    try {
      if (!existsSync(this.filePath)) return []
      return readFileSync(this.filePath, 'utf-8')
        .split('\n')
        .filter(Boolean)
        .flatMap((line) => {
          try {
            const r = JSON.parse(line) as JournalRow
            return typeof r.requestId === 'string' && PHASES.includes(r.phase) ? [r] : []
          } catch {
            return []
          }
        })
    } catch {
      return []
    }
  }

  /** 每 id 最新阶段（文件序＝写入序） */
  latestRows(): JournalRow[] {
    const byId = new Map<string, JournalRow>()
    for (const r of this.allRows()) byId.set(r.requestId, r)
    return [...byId.values()]
  }

  phaseOf(requestId: string): JournalPhase | null {
    let phase: JournalPhase | null = null
    for (const r of this.allRows()) if (r.requestId === requestId) phase = r.phase
    return phase
  }
}
