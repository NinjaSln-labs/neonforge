import { useState } from 'react'

// 信任阶梯（ticket 14）：L1-L4 渐进授权可视化 + 授权记录 + 委托规则
const LEVELS = [
  ['L1', '观察', '只读分析 / 草稿 / 本地整理', '首次授权，静默'],
  ['L2', '建议', '生成方案 / 补丁 / PR', '一键应用'],
  ['L3', '操作', '写入文件 / 执行命令 / 网络', '分步授权 + 快照'],
  ['L4', '委托', '高度信任重复任务', '规则授权，可降级']
] as const

export default function TrustLadderPanel() {
  const [level, setLevel] = useState(1) // 当前信任等级（L1 起步，演示推进）
  const [delegate, setDelegate] = useState(false)
  const [logs, setLogs] = useState([
    { t: '11:05', action: '只读分析（旅行手册项目）', level: 'L1', ok: true },
    { t: '11:06', action: '生成方案建议', level: 'L2', ok: true },
    { t: '11:12', action: '写入：sales-merge.py（快照已建）', level: 'L3', ok: true }
  ])

  const upgrade = () => { if (level < 3) setLevel((l) => l + 1) }
  const addLog = () => {
    setLogs((prev) => [
      { t: '11:1' + (prev.length + 1), action: `L${level + 1} 操作授权（快照可回滚）`, level: `L${level + 1}`, ok: true },
      ...prev
    ])
  }

  return (
    <div className="nf-trust">
      <div className="nf-flow__head">
        <span className="nf-flow__title">🛡 信任阶梯</span>
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
            {i + 1 === level && <span className="nf-trust__mark">● 当前</span>}
          </div>
        ))}
      </div>

      {/* 授权记录 */}
      <div className="nf-trust__logs">
        <h4>授权记录</h4>
        <ul>
          {logs.map((l, i) => <li key={i}><span className="nf-trust__ok">✓</span> {l.action} <em>（{l.level}）</em></li>)}
        </ul>
      </div>

      {/* 委托规则 + 推进 */}
      <div className="nf-trust__controls">
        <label className="nf-trust__delegate">
          <input type="checkbox" checked={delegate} onChange={(e) => setDelegate(e.target.checked)} />
          L4 委托：对「格式化类」建议可直接应用（可随时降级/撤销）
        </label>
        <div className="nf-trust__btns">
          {level < 3 && <button type="button" className="nf-delivery__primary" onClick={upgrade}>提升信任等级</button>}
          <button type="button" className="nf-delivery__ghost" onClick={addLog}>记录本次授权</button>
        </div>
      </div>
    </div>
  )
}
