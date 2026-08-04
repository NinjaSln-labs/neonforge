import { useEffect, useState } from 'react'
import { IconCheck, IconDot, IconRocket } from './icons'

// 0-1 交付流（ticket 07）：说需求 → 软件工程模型/敏捷 → 分步推进 → 交付部署
// V2：阶段状态提升——onStageChange/onModelSelect 通知 MainWorkspace（注入对话阶段指引）
// v3：当前步骤聚焦——对话区内嵌（固定布局），当前阶段大卡片突出
export const FLOW_STAGES = ['需求', '设计', '开发', '测试', '部署', '交付']
export const STAGE_HINT: Record<string, string> = {
  // 2026-08-04 P1 重构（意图消歧）：一次一问 + 候选选项 + 强制同音/近义候选——用户「3D设计游戏」实测：模型顺着词面理解，没猜「射击」（同音）
  需求: '需求阶段只做一件事：把用户真正想要的问清楚。规则：① 一次只问一个问题（从「做什么」开始），不要一次抛多个问题。② 先复述你的理解，然后对需求里的关键词列出 2-3 个候选理解（必须包含同音/近义/模糊词的猜测——如用户说「设计游戏」，「设计」可能打错/听成「射击」「解谜」「建造」，用 ① ② ③ 编号+一句说明列出），让用户选或补充。③ 用户选定「做什么」后，再逐个问「给谁玩」「在哪儿玩（网页/电脑/手机）」「做成什么样算完」。④ 用户确认需求后，输出【需求确认：一句话准确需求】，然后才提示「点确认推进」——需求确认前不要提示点推进（此时按钮是禁用的，提示了也点不动）。本阶段禁止写代码或给技术方案，也不要说「开始动手」这类话（还没到开发）。',
  设计: '确认方案、技术选型、页面/结构设计——先定方案，不要急着写代码',
  开发: '直接动手产出真实可运行的文件（用 write/edit 工具；先写出第一版能跑的东西，再问需要用户决策的问题，一次只问一个；不要只提问不产出）。铁律：你的每条回复必须以实际行动收尾——说「开始」后就立刻调用工具干活（read/ls 看目录或 write 写文件），不要把「开始动手了」当结尾停下来等用户，也不要只说话不调工具。',
  测试: '验证能跑、按验收标准逐项核对',
  部署: '发布/上线（超出数字能力→给指导）',
  交付: '交付包 + 验收对照，确认后关闭'
}

// 2026-08-04 体验修复：模型风格自动推导——从需求文本判断（用户不用手选「稳扎稳打/快速迭代」）
// 快速迭代：探索/先看效果/雏形/能玩就行；稳扎稳打：完整/正式/质量要求高；默认快速迭代（NeonForge 用户多为探索型）
export function inferFlowModel(reqText: string): 'traditional' | 'agile' {
  const t = reqText ?? ''
  const agile = /(能玩的版本|先看效果|雏形|最快|试试|练手|自娱|先做|原型|快速|简单|小样|探索|先跑起来|先能玩|玩着爽|粗糙)/.test(t)
  const traditional = /(完整|正式|功能齐全|重要|安全|生产|给别人用|商用|上线|复杂|稳定|规范|认真做|做完整)/.test(t)
  if (traditional && !agile) return 'traditional'
  return 'agile'
}

export default function DeliveryFlowPanel({
  onStageChange,
  onModelSelect,
  requirementConfirmed = false,
  artifactsReady = false,
  busy = false,
  stageOverride
}: {
  onStageChange?: (stage: number) => void
  onModelSelect?: (model: 'traditional' | 'agile') => void
  requirementConfirmed?: boolean // 2026-08-04 P0：需求已确认（对话【需求确认】或确认卡）→ 解锁从需求推进
  artifactsReady?: boolean // 2026-08-04 体验修复：开发阶段已有真实文件产出（write/edit 成功）→ 解锁推进到测试（防阶段空转）
  busy?: boolean // 2026-08-04 体验修复：搭档处理中禁止推进（防 advanceChat 被 working 守卫跳过——阶段前进但模型不知道）
  stageOverride?: number // 2026-08-04：外部推进（需求确认卡）同步本地阶段机——本地 stage 与 MainWorkspace flowStage 双状态对齐
}) {
  const [stage, setStage] = useState(0) // 当前进行阶段（index）
  const [model, setModel] = useState<'traditional' | 'agile' | null>(null)
  // 外部推进（需求确认卡 handleStageChange）→ 本地阶段机跟随（只前进，不倒退）
  useEffect(() => {
    if (typeof stageOverride === 'number' && stageOverride > stage) setStage(stageOverride)
  }, [stageOverride, stage])

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

      {/* 分步推进（2026-08-04：按钮文案统一为「确认推进」——与模型阶段指引提示一致；P0 门控：需求阶段未确认需求 → 禁用提示）
          2026-08-04 体验修复：未选模型也常驻显示（模型说「点确认推进」时用户能看到按钮——灰 + 提示先选方式） */}
      {stage < FLOW_STAGES.length - 1 && (
        <div className="nf-flow__advance">
          <span className="nf-flow__stage-label">当前阶段：{FLOW_STAGES[stage]}——完成就点「确认推进」</span>
          {!model && (
            <span className="nf-flow__gate-hint">没选做项目的方式也不影响推进——选了（稳扎稳打/快速迭代）搭档会按对应风格工作</span>
          )}
          {stage === 0 && !requirementConfirmed && (
            <span className="nf-flow__gate-hint">需求还没确认——先在对话里和搭档确认，或在上方需求卡点选</span>
          )}
          {/* 2026-08-04 体验修复：开发阶段门控——必须有真实文件产出（write/edit 成功）才能推进到测试（防阶段空转） */}
          {stage === 2 && !artifactsReady && (
            <span className="nf-flow__gate-hint">开发阶段还没产出文件——等搭档写完文件（对话里会出现可回滚的工具卡）再推进</span>
          )}
          {/* 2026-08-04 体验修复：搭档处理中（advanceChat 自动触发阶段工作）时禁止推进——避免阶段推进被 working 守卫跳过（模型不知道已推进） */}
          {busy && (
            <span className="nf-flow__gate-hint">搭档正在处理——等它回复完再推进</span>
          )}
          <button
            type="button"
            className="nf-delivery__primary"
            disabled={(stage === 0 && !requirementConfirmed) || (stage === 2 && !artifactsReady) || busy}
            onClick={advance}
          >
            {busy ? '搭档处理中…' : stage === 0 && !requirementConfirmed ? '确认需求后可推进' : stage === 2 && !artifactsReady ? '等开发产出文件后可推进' : stage === 2 ? '确认开发完成，进入测试 →' : '确认推进 →'}
          </button>
        </div>
      )}
      {model && stage === FLOW_STAGES.length - 1 && (
        <div className="nf-flow__done"><IconCheck size={12} /> 交付完成——产物在「产物」区，验收后确认关闭</div>
      )}
    </div>
  )
}
