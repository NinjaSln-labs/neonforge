import type { ProblemInstance, ProblemStatus } from './types'

// 问题台账（ticket 06）：问题 = 一等公民——7 态状态机、状态圆点、复开入口
const STATUS_LABEL: Record<ProblemStatus, string> = {
  understanding: '理解中',
  'awaiting-plan': '方案待确认',
  executing: '执行中',
  'awaiting-input': '待你操作',
  delivered: '已交付',
  closed: '已关闭',
  'failed-recoverable': '失败可恢复'
}
const STATUS_DOT: Record<ProblemStatus, string> = {
  understanding: '●',
  'awaiting-plan': '◉',
  executing: '●',
  'awaiting-input': '◉',
  delivered: '●',
  closed: '✓',
  'failed-recoverable': '✕'
}

export default function SessionPanel({
  problems,
  activeId,
  onSelect,
  onNew
}: {
  problems: ProblemInstance[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
}) {
  return (
    <section className="nf-session">
      <header className="nf-session__header">
        <span>问题</span>
        <button type="button" className="nf-session__new" onClick={onNew}>＋ 新问题</button>
      </header>
      <div className="nf-session__list">
        {problems.length === 0 && <p className="nf-placeholder">还没有问题——说出你当前的问题</p>}
        {problems.map((p) => (
          <div key={p.id} className={`nf-ledger__wrap${activeId === p.id ? ' nf-ledger__wrap--active' : ''}`}>
            <button
              type="button"
              className={`nf-ledger__item${activeId === p.id ? ' nf-ledger__item--active' : ''}`}
              onClick={() => onSelect(p.id)}
            >
              <span className={`nf-ledger__dot nf-ledger__dot--${p.status}`} aria-hidden="true">{STATUS_DOT[p.status]}</span>
              <span className="nf-ledger__title">{p.title}</span>
              <span className="nf-ledger__meta">
                {STATUS_LABEL[p.status]}
                {p.status === 'closed' && ' · 可复开'}
              </span>
            </button>
            {/* 06 断点续做深度（基线 §21）：选中问题展示会话快照——目标/已授权/待办（唤醒上下文） */}
            {activeId === p.id && p.snapshot && (
              <div className="nf-ledger__snapshot">
                {p.snapshot.authorized.length > 0 && (
                  <div className="nf-ledger__snap-row">已授权：{p.snapshot.authorized.slice(-3).map((a) => a.replace(/\[[^\]]+\]\s*/, '')).join(' · ')}</div>
                )}
                {p.snapshot.pending.length > 0 && (
                  <div className="nf-ledger__snap-row">待办：{p.snapshot.pending.slice(-2).join(' · ')}</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
