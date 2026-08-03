import { useState } from 'react'
import { IconCheck, IconDot, IconRocket } from './icons'

// 0-1 交付流（ticket 07）：说需求 → 软件工程模型/敏捷 → 分步推进 → 交付部署
// V2：阶段状态提升——onStageChange/onModelSelect 通知 MainWorkspace（注入对话阶段指引）
// v3：当前步骤聚焦——对话区内嵌（固定布局），当前阶段大卡片突出
export const FLOW_STAGES = ['需求', '设计', '开发', '测试', '部署', '交付']
export const STAGE_HINT: Record<string, string> = {
  需求: '说清楚要做什么、给谁用、做成什么样算完',
  设计: '确认方案、技术选型、页面/结构设计',
  开发: '我写代码/生成内容，分步给你看',
  测试: '验证能跑、按验收标准逐项核对',
  部署: '发布/上线（超出数字能力→给指导）',
  交付: '交付包 + 验收对照，确认后关闭'
}

export default function DeliveryFlowPanel({
  onStageChange,
  onModelSelect
}: {
  onStageChange?: (stage: number) => void
  onModelSelect?: (model: 'traditional' | 'agile') => void
}) {
  const [stage, setStage] = useState(0) // 当前进行阶段（index）
  const [model, setModel] = useState<'traditional' | 'agile' | null>(null)

  const advance = () => {
    if (stage < FLOW_STAGES.length - 1) {
      const next = stage + 1
      setStage(next)
      onStageChange?.(next)
    }
  }

  const pickModel = (m: 'traditional' | 'agile') => {
    setModel(m)
    onModelSelect?.(m)
  }

  return (
    <div className="nf-flow">
      <div className="nf-flow__head">
        <span className="nf-flow__title"><IconRocket size={14} /> 从零做项目</span>
        {model && <span className="nf-flow__model">方式：{model === 'agile' ? '快速迭代' : '稳扎稳打'}</span>}
      </div>

      {/* 当前步骤聚焦卡（2026-08-04：加「当前阶段」标签——原「需求」大字似输入框误导；明确是状态指示非输入区） */}
      {model && stage < FLOW_STAGES.length - 1 && (
        <div className="nf-flow__focus">
          <span className="nf-flow__focus-tag">当前阶段</span>
          <span className="nf-flow__focus-step">{FLOW_STAGES[stage]}</span>
          <span className="nf-flow__focus-hint">{STAGE_HINT[FLOW_STAGES[stage]]}</span>
        </div>
      )}

      {/* 阶段机 */}
      <div className="nf-flow__stages">
        {FLOW_STAGES.map((name, i) => (
          <span key={name} className={`nf-flow__stage${i < stage ? ' nf-flow__stage--done' : ''}${i === stage ? ' nf-flow__stage--active' : ''}`}>
            {i < stage ? <IconCheck size={12} /> : i === stage ? <IconDot size={12} /> : <IconDot size={12} className="nf-flow__stage-idle" />} {name}
          </span>
        ))}
      </div>

      {/* 模型选择（未选时）——2026-08-03 v35：传统/敏捷术语人类化（非技术用户「稳扎稳打/快速迭代」）
          2026-08-04：加引导文案——明确这是必选入口（用户曾误以为不可用/忽略） */}
      {!model && (
        <div className="nf-flow__models">
          <span className="nf-flow__models-hint">先选一种做项目的方式——搭档会按阶段带你推进</span>
          <button type="button" className="nf-flow__model-btn" onClick={() => pickModel('traditional')}>
            稳扎稳打 <span className="nf-flow__hint">先定方案再开发（适合重要/安全相关的项目）</span>
          </button>
          <button type="button" className="nf-flow__model-btn" onClick={() => pickModel('agile')}>
            快速迭代 <span className="nf-flow__hint">边做边看效果（适合探索型的项目）</span>
          </button>
        </div>
      )}

      {/* 分步推进（2026-08-04：按钮文案统一为「确认推进」——与模型阶段指引提示一致，用户按提示找按钮） */}
      {model && stage < FLOW_STAGES.length - 1 && (
        <div className="nf-flow__advance">
          <span className="nf-flow__stage-label">当前阶段：{FLOW_STAGES[stage]}——完成就点「确认推进」</span>
          <button type="button" className="nf-delivery__primary" onClick={advance}>
            确认推进 →
          </button>
        </div>
      )}
      {model && stage === FLOW_STAGES.length - 1 && (
        <div className="nf-flow__done"><IconCheck size={12} /> 交付完成——产物在「产物」区，验收后确认关闭</div>
      )}
    </div>
  )
}
