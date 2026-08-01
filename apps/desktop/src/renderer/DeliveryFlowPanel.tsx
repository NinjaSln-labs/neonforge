import { useState } from 'react'

// 0-1 交付流（ticket 07）：说需求 → 软件工程模型/敏捷 → 分步推进 → 交付部署
// V1 UI 层：阶段机 + 模型选择 + 分步确认（真实执行由 agent 引擎驱动，后续对接）
const FLOW_STAGES = ['需求', '设计', '开发', '测试', '部署', '交付']

export default function DeliveryFlowPanel() {
  const [stage, setStage] = useState(0) // 当前进行阶段（index）
  const [model, setModel] = useState<'traditional' | 'agile' | null>(null)

  const advance = () => {
    if (stage < FLOW_STAGES.length - 1) setStage((s) => s + 1)
  }

  return (
    <div className="nf-flow">
      <div className="nf-flow__head">
        <span className="nf-flow__title">🚀 0-1 交付流</span>
        {model ? (
          <span className="nf-flow__model">模型：{model === 'agile' ? '敏捷（迭代）' : '传统软件工程'}</span>
        ) : (
          <span className="nf-flow__model">选择模型后开始</span>
        )}
      </div>

      {/* 阶段机 */}
      <div className="nf-flow__stages">
        {FLOW_STAGES.map((name, i) => (
          <span key={name} className={`nf-flow__stage${i < stage ? ' nf-flow__stage--done' : ''}${i === stage ? ' nf-flow__stage--active' : ''}`}>
            {i < stage ? '✓' : i === stage ? '●' : '○'} {name}
          </span>
        ))}
      </div>

      {/* 模型选择（未选时） */}
      {!model && (
        <div className="nf-flow__models">
          <button type="button" className="nf-flow__model-btn" onClick={() => setModel('traditional')}>
            传统软件工程 <span className="nf-flow__hint">瀑布 / 增量 / 螺旋（按项目类型推荐）</span>
          </button>
          <button type="button" className="nf-flow__model-btn" onClick={() => setModel('agile')}>
            敏捷开发 <span className="nf-flow__hint">Scrum / Kanban 迭代，可 demo</span>
          </button>
        </div>
      )}

      {/* 分步推进 */}
      {model && stage < FLOW_STAGES.length - 1 && (
        <div className="nf-flow__advance">
          <span className="nf-flow__stage-label">当前阶段：{FLOW_STAGES[stage]}（确认后推进）</span>
          <button type="button" className="nf-delivery__primary" onClick={advance}>
            确认 {FLOW_STAGES[stage]} 完成 → 下一步
          </button>
        </div>
      )}
      {model && stage === FLOW_STAGES.length - 1 && (
        <div className="nf-flow__done">✅ 交付完成——产物在「产物」区，验收后确认关闭</div>
      )}
    </div>
  )
}
