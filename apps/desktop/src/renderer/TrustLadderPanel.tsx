import { useState } from 'react'
import { IconCheck, IconDot, IconShield } from './icons'

// 信任阶梯（ticket 14）：L1-L4 渐进授权可视化 + 授权记录 + 委托规则
// 2026-08-02：授权记录接真实数据（06 问题快照 authorized——对接 ticket 06「授权记录可回溯」AC）
const LEVELS = [
  ['L1', '观察', '只读分析 / 草稿 / 本地整理', '首次授权，静默'],
  ['L2', '建议', '生成方案 / 补丁 / PR', '一键应用'],
  ['L3', '操作', '写入文件 / 执行命令 / 网络', '分步授权 + 快照'],
  ['L4', '委托', '高度信任重复任务', '规则授权，可降级']
] as const

const DEMO_LOGS = [
  { t: '11:05', action: '只读分析（旅行手册项目）', level: 'L1', ok: true },
  { t: '11:06', action: '生成方案建议', level: 'L2', ok: true },
  { t: '11:12', action: '写入：sales-merge.py（快照已建）', level: 'L3', ok: true }
]

export default function TrustLadderPanel({ authorizedLogs, delegateLowRisk, onDelegateChange }: {
  authorizedLogs?: string[]
  // ticket 14 执行引擎对接：委托规则受控（ConversationPanel 持有真实状态——localStorage 持久化；此处仅展示/切换）
  delegateLowRisk?: boolean
  onDelegateChange?: (v: boolean) => void
}) {
  const [level, setLevel] = useState(1) // 当前信任等级（L1 起步，演示推进）
  const [internalDelegate, setInternalDelegate] = useState(false) // 无受控时内部兜底（demo 显示）
  const delegate = delegateLowRisk ?? internalDelegate
  const setDelegate = (v: boolean) => { setInternalDelegate(v); onDelegateChange?.(v) }
  // 授权记录：真实数据（06 问题快照 authorized——可回溯）优先；无则 demo 回退
  const [demoLogs, setDemoLogs] = useState(DEMO_LOGS)
  const realLogs = (authorizedLogs ?? []).map((a) => ({ t: '', action: a, level: 'L3', ok: true }))
  const logs = realLogs.length > 0 ? realLogs : demoLogs

  const upgrade = () => { if (level < 3) setLevel((l) => l + 1) }
  const addLog = () => {
    setDemoLogs((prev) => [
      { t: '11:1' + (prev.length + 1), action: `L${level + 1} 操作授权（快照可回滚）`, level: `L${level + 1}`, ok: true },
      ...prev
    ])
  }

  return (
    <div className="nf-trust">
      <div className="nf-flow__head">
        <span className="nf-flow__title"><IconShield size={14} /> 信任阶梯</span>
        <span className="nf-flow__model">当前：L{level} · 渐进解锁</span>
      </div>

      {/* L1-L4 阶梯 */}
      <div className="nf-trust__ladder">
        {LEVELS.map(([id, name, scope, auth], i) => (
          <div key={id} className={`nf-trust__level${i + 1 <= level ? ' nf-trust__level--unlocked' : ''}${i + 1 === level ? ' nf-trust__level--current' : ''}`}>
            <span className="nf-trust__id">{id}</span>
            <div className="nf-trust__body">
              <strong>{name}</strong>
              <span>{scope}</span>
              <em>{auth}</em>
            </div>
            {i + 1 === level && <span className="nf-trust__mark"><IconDot size={10} /> 当前</span>}
          </div>
        ))}
      </div>

      {/* 授权记录 */}
      <div className="nf-trust__logs">
        <h4>授权记录</h4>
        <ul>
          {logs.map((l, i) => <li key={i}><span className="nf-trust__ok"><IconCheck size={11} /></span> {l.action} <em>（{l.level}）</em></li>)}
        </ul>
      </div>

      {/* 委托规则 + 推进 */}
      <div className="nf-trust__controls">
        <label className="nf-trust__delegate">
          <input type="checkbox" checked={delegate} onChange={(e) => setDelegate(e.target.checked)} />
          L4 委托：低风险文件操作自动授权（不用每次确认）——会先备份、可随时关闭；执行命令始终单独确认
        </label>
        <div className="nf-trust__btns">
          {level < 3 && <button type="button" className="nf-delivery__primary" onClick={upgrade}>提升信任等级</button>}
          <button type="button" className="nf-delivery__ghost" onClick={addLog}>记录本次授权</button>
        </div>
      </div>
    </div>
  )
}
