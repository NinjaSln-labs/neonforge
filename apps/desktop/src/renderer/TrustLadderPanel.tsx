import { IconCheck, IconShield } from './icons'
import type { TrustMode } from '../domain/trustMode'

// 信任阶梯（ticket 14 / ADR-015）：L1-L4 渐进授权可视化 + 授权记录 + 真实信任模式
// - 当前等级由真实 trustMode 映射：strict/standard → L3（逐项授权），delegated → L4（低危文件操作委托）
// - 不再有演示用的「提升信任等级」「记录本次授权」假按钮/假记录；授权记录只取真实问题快照，空则显示暂无
const LEVELS = [
  ['L1', '观察', '只读分析 / 草稿 / 本地整理', '首次授权，静默'],
  ['L2', '建议', '生成方案 / 补丁 / PR', '一键应用'],
  ['L3', '操作', '写入文件 / 执行命令 / 网络', '分步授权 + 快照'],
  ['L4', '委托', '高度信任重复任务', '规则授权，可降级'],
] as const

const MODE_LABEL: Record<TrustMode, string> = {
  strict: '谨慎',
  standard: '标准',
  delegated: '低危委托',
}

export default function TrustLadderPanel({
  authorizedLogs,
  trustMode,
  onTrustModeChange,
}: {
  authorizedLogs?: Array<{ tool: string; file: string } | string> // 2026-08-15 Q9：结构化（旧 string 兼容）
  /** ADR-015：真实信任模式（main 持久化） */
  trustMode: TrustMode
  onTrustModeChange?: (mode: TrustMode) => void
}) {
  const level = trustMode === 'delegated' ? 4 : 3
  // 授权记录：真实数据（06 问题快照 authorized——可回溯）；空则诚实显示暂无（不回退演示记录）
  const logs = (authorizedLogs ?? []).map((a) => ({
    action: typeof a === 'string' ? a : `[${a.tool}] ${a.file}`,
    level: 'L3',
  }))

  return (
    <div className="nf-trust">
      <div className="nf-flow__head">
        <span className="nf-flow__title">
          <IconShield size={14} /> 信任阶梯
        </span>
        <span className="nf-flow__model">
          当前：L{level} · {MODE_LABEL[trustMode]}
        </span>
      </div>

      {/* L1-L4 阶梯（当前等级来自真实模式） */}
      <div className="nf-trust__ladder">
        {LEVELS.map(([id, name, scope, auth], i) => (
          <div
            key={id}
            className={`nf-trust__level${i + 1 <= level ? ' nf-trust__level--unlocked' : ''}${i + 1 === level ? ' nf-trust__level--current' : ''}`}
          >
            <span className="nf-trust__id">{id}</span>
            <div className="nf-trust__body">
              <strong>{name}</strong>
              <span>{scope}</span>
              <em>{auth}</em>
            </div>
            {i + 1 === level && <span className="nf-trust__mark">当前</span>}
          </div>
        ))}
      </div>

      {/* 授权记录（真实数据；无记录显示暂无） */}
      <div className="nf-trust__logs">
        <h4>授权记录</h4>
        {logs.length > 0 ? (
          <ul>
            {logs.map((l, i) => (
              <li key={i}>
                <span className="nf-trust__ok">
                  <IconCheck size={11} />
                </span>{' '}
                {l.action} <em>（{l.level}）</em>
              </li>
            ))}
          </ul>
        ) : (
          <p className="nf-trust__empty">暂无授权记录</p>
        )}
      </div>

      {/* 委托开关：与设置页同一 main 权威（nf-trust-changed 联动） */}
      <div className="nf-trust__controls">
        <label className="nf-trust__delegate">
          <input
            type="checkbox"
            checked={trustMode === 'delegated'}
            disabled={!onTrustModeChange}
            onChange={(e) => onTrustModeChange?.(e.target.checked ? 'delegated' : 'standard')}
            aria-label="低危委托模式"
          />
          L4
          委托：清单内低风险文件操作自动授权（不用每次确认）——会先备份、可随时关闭；执行命令与清单外文件始终单独确认
        </label>
      </div>
    </div>
  )
}
