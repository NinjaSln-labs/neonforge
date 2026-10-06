// S2b Task 5：作用域面板——版本链只读呈现（I-8）＋修正两步流（案 A：提请→批准后仍须用户再提交）。
// 纯呈现（S-1）：只经 window.neonforge 领域桥回投命令，零核心聚合 import。
import { useState } from 'react'
import type { DomainView, TimelineRowDTO } from './useDomainView'
import type { ScopeEntryDTO } from './types'

const KINDS: readonly string[] = ['仓库', '目录', '命令', '网络']

/** 每行 `kind<TAB>pattern`；解析不出的行显式报错（原则 1：不静默丢弃），错误未清不发命令。 */
function parseEntries(text: string): { entries: ScopeEntryDTO[]; errors: string[] } {
  const entries: ScopeEntryDTO[] = []
  const errors: string[] = []
  text.split('\n').forEach((line, i) => {
    if (line.trim() === '') return
    const parts = line.split('\t')
    if (parts.length !== 2 || parts[1] === '' || !KINDS.includes(parts[0])) {
      errors.push(
        `第 ${i + 1} 行解析不出（需 kind<TAB>pattern，kind ∈ 仓库/目录/命令/网络）：${line}`,
      )
      return
    }
    entries.push({ kind: parts[0] as ScopeEntryDTO['kind'], pattern: parts[1] })
  })
  return { entries, errors }
}

/** 在飞轮 turnId＝最后一条 TurnStarted 且其后无同 turnId 的 TurnEnded；无在飞轮＝null（I-3 不接受空归属）。 */
function inflightTurnId(timeline: TimelineRowDTO[]): string | null {
  let current: string | null = null
  for (const row of timeline) {
    if (row.type === 'TurnStarted') current = (row.detail as { turnId: string }).turnId
    else if (row.type === 'TurnEnded' && (row.detail as { turnId: string }).turnId === current)
      current = null
  }
  return current
}

export default function ScopePanel({
  delegationId,
  view,
}: {
  delegationId: string | null
  view: DomainView
}) {
  const nf = window.neonforge
  const [entriesText, setEntriesText] = useState('')
  const [operation, setOperation] = useState('')
  const [raisedId, setRaisedId] = useState<string | null>(null)
  const [rejected, setRejected] = useState<string | null>(null)
  const [advancedTo, setAdvancedTo] = useState<number | null>(null)

  const current = view.scopeVersions.at(-1)
  const history = view.scopeVersions.slice(0, -1)
  const { entries, errors } = parseEntries(entriesText)
  const turnId = inflightTurnId(view.timeline)

  // 案 A 第二步闸门：本轮提请的决策点已获「批准」决议才许提交（批准本身不推进版本）
  const approved =
    raisedId !== null &&
    view.timeline.some((r) => {
      if (r.type !== 'DecisionResolved') return false
      const d = r.detail as { decisionPointId?: string; resolution?: string }
      return d?.decisionPointId === raisedId && d.resolution === '批准'
    })

  const blocked =
    delegationId === null ? '未选中委托单' : turnId === null ? '无在飞轮，不能提出作用域修正' : null

  const raiseFn = nf?.decision?.raise
  const raise = async () => {
    if (delegationId === null || turnId === null) return
    setRejected(null)
    setAdvancedTo(null)
    // 不传 decisionPointId＝id 只在 main 侧生成（详设 §7／5204840）；桥面两处已同标可选
    const receipt = await raiseFn?.({
      delegationId,
      turnId,
      requestReason: { reason: '作用域修正', operation, requestedBy: '用户提请' },
    })
    if (receipt) setRaisedId(receipt.decisionPointId)
  }

  const amend = async () => {
    if (delegationId === null || raisedId === null) return
    setRejected(null)
    setAdvancedTo(null)
    const out = await nf?.scope?.amend?.({ delegationId, decisionPointId: raisedId, entries })
    if (!out) return
    if ('rejected' in out) setRejected(out.why)
    else setAdvancedTo(out.version)
  }

  return (
    <div className="nf-scopepanel">
      <div className="nf-scopepanel__head">作用域</div>

      <div className="nf-scope-current" data-testid="nf-scope-current">
        {current && current.entries.length > 0 ? (
          current.entries.map((e, i) => (
            <div key={i} className="nf-scope-current__entry">
              <span className="nf-scope-current__kind">{e.kind}</span>
              <span className="nf-scope-current__pattern">{e.pattern}</span>
            </div>
          ))
        ) : (
          <div className="nf-scope-current__empty">无作用域条目</div>
        )}
      </div>

      <div className="nf-scope-history" data-testid="nf-scope-history">
        {history.map((v) => (
          <div key={v.seq} className="nf-scope-history__item">
            <span className="nf-scope-history__seq">{v.seq}</span>
            <span className="nf-scope-history__ref">{v.amendmentRef ?? '首版本'}</span>
          </div>
        ))}
      </div>

      {blocked !== null && <div className="nf-scopepanel__blocked">{blocked}</div>}
      {errors.map((e) => (
        <div key={e} className="nf-scopepanel__parseerror">
          {e}
        </div>
      ))}

      <textarea
        className="nf-scope-entries"
        data-testid="nf-scope-entries"
        value={entriesText}
        placeholder={'每行一条：kind<TAB>pattern（kind ∈ 仓库/目录/命令/网络）'}
        onChange={(ev) => setEntriesText(ev.target.value)}
      />
      <input
        className="nf-scopepanel__operation"
        value={operation}
        placeholder="修正说明（operation）"
        onChange={(ev) => setOperation(ev.target.value)}
      />
      <button
        className="nf-scope-raise"
        data-testid="nf-scope-raise"
        disabled={blocked !== null || errors.length > 0}
        onClick={() => void raise()}
      >
        提出修正
      </button>
      <button
        className="nf-scope-amend"
        data-testid="nf-scope-amend"
        disabled={blocked !== null || errors.length > 0 || raisedId === null || !approved}
        onClick={() => void amend()}
      >
        提交修正
      </button>

      {advancedTo !== null && (
        <div className="nf-scopepanel__advanced">版本已推进至 {advancedTo}</div>
      )}
      {rejected !== null && (
        <div className="nf-scope-rejected" data-testid="nf-scope-rejected">
          {rejected}
        </div>
      )}
    </div>
  )
}
