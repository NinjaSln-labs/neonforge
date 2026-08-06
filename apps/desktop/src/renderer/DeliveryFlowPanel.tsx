import { useEffect, useState } from 'react'
import { IconCheck, IconDot, IconRocket } from './icons'

// 0-1 交付流（ticket 07）：说需求 → 软件工程模型/敏捷 → 分步推进 → 交付部署
// V2：阶段状态提升——onStageChange/onModelSelect 通知 MainWorkspace（注入对话阶段指引）
// v3：当前步骤聚焦——对话区内嵌（固定布局），当前阶段大卡片突出
export const FLOW_STAGES = ['需求', '设计', '开发', '测试', '部署', '交付']
// 2026-08-05 体验反馈（用户「页卡内容太多冗余 + 出现标签」）：UI 阶段卡展示用户版一句话摘要——STAGE_HINT 是给模型的完整系统提示（含 <candidates> 示例/规则长文），不得直接显示给用户
export const USER_STAGE_HINT: Record<string, string> = {
  需求: '确认你到底想要什么——搭档会问你几个问题，也可用上方「快速确认需求」点选',
  设计: '搭档在定方案（技术/界面/结构）——看完完整方案点「确认推进」进入开发',
  开发: '搭档在写真实代码文件——写完会告诉你进展和需要你定的事',
  测试: '搭档在验证能跑、对照目标逐项核对',
  部署: '发布/上线准备',
  交付: '交付包 + 验收对照，确认后关闭'
}
export const STAGE_HINT: Record<string, string> = {
  // 2026-08-04 P1 重构（意图消歧）：一次一问 + 候选选项 + 强制同音/近义候选——用户「3D设计游戏」实测：模型顺着词面理解，没猜「射击」（同音）
  // 2026-08-05 方案 3（候选按钮）：候选必须用 <candidates> 标记块包裹（每行一个选项，行首 - ），UI 会渲染成可点击按钮——用户点选发送的是选项文本，不是序号；
  // 收到用户选择后必须严格按 <candidates> 块内列表顺序理解 + 先复述确认（实测：模型列 1射击/2解谜/3建造，用户回 1 却被理解成建造——序号映射漂移，点选文本彻底规避）
  需求: '需求阶段只做一件事：把用户真正想要的问清楚。规则：① 一次只问一个问题（从「做什么」开始），不要一次抛多个问题。② 先复述你的理解，然后对需求里的关键词列出 2-3 个候选理解（必须包含同音/近义/模糊词的猜测——如用户说「设计游戏」，「设计」可能打错/听成「射击」「解谜」「建造」）。**候选必须用下面的标记块包裹，每个选项单独一行，行首用 -**：<candidates>\n- 选项一（一句说明）\n- 选项二（一句说明）\n</candidates>\n（块前后可以写引导语，如「你对『设计』的理解，点选或回复序号」）——用户会看到可点击按钮，点选后发送的就是选项文字本身，你也可以让用户直接回复文字/序号。③ 收到用户选择后，**严格按上面 <candidates> 块内列出的顺序理解对应关系**（第一个 - 就是第一个选项），不要重新排序、不要猜测错位；理解后先复述确认（如「你选的是：射击游戏，对吗？」）再继续。④ 用户选定「做什么」后，再逐个问「给谁玩」「在哪儿玩（网页/电脑/手机）」「做成什么样算完」——每个问题的候选同样用 <candidates> 块分行列出（每行一个选项：- 选项（一句说明）），让用户点选或回复。⑤ 用户确认需求后，输出【需求确认：一句话准确需求】，然后才提示「点确认推进」——需求确认前不要提示点推进（用户此时会以为需求已确认但实际没确认）。**【需求确认：】标记必须输出**（没有它 UI 无法识别需求已确认——用户点「确认推进」按钮能兜底确认，但标记能保证需求内容准确回写）。⑥ 除 <candidates> 外，**回复正文禁止出现任何尖括号标签**（如 <one-question>、<question> 等）——那些标签会原样显示给用户，用户看到的是标签不是内容；需要强调内容直接写出来就行，不要用标签包裹。本阶段禁止写代码或给技术方案，也不要说「开始动手」这类话（还没到开发）。（2026-08-06 强化）【需求确认】输出后**必须提示「点确认推进」**——**不要说「进入设计阶段/开始设计」这类话**（阶段切换由用户点推进按钮触发，你说的不算——UI 只认按钮；需求确认后直接宣布进设计会让用户看不到推进提示）。',
  设计: '确认方案、技术选型、页面/结构设计——先定方案，不要急着写代码。2026-08-04 体验修复（用户「设计阶段没确认就进开发」）：设计必须完整输出——整体方案一句话 + 技术选型（用什么做）+ 页面/结构（有哪些界面、每块干什么）+ 模块划分（代码怎么组织）——写完整再让用户点「确认推进」；设计只写了一两句就不要提示确认推进（用户看不到完整设计没法确认，推进了也像没确认）。2026-08-05 体验反馈（用户「设计阶段没找我确认」）：**本阶段禁止调用 plan_approval / write / edit 工具**（那是开发阶段的事）——设计方案写完整后停下来等用户点「确认推进」；进入开发阶段后才规划文件清单（plan_approval）。（2026-08-06 强化）方案写完整后**提示「点确认推进」**——**不要说「进入开发阶段」**（UI 只认用户点推进按钮，你说的不算）。',
  开发: '开发阶段第 0 步（必须·环境就绪——2026-08-06 环境单源设计）：先调 check-env 确认项目环境（runtime 版本/依赖/工具链）——node_modules 未安装先执行 npm install（或 pnpm install）装好依赖再继续；环境就绪后才能正常起服务验证。第 1 步（规划）：先用一句话说明本次要做什么，然后调用 plan_approval 工具列出要新增/修改的全部文件（每个文件：路径 + 修改原因），等用户批准后再开始写——不要只写文字清单不调 plan_approval 工具，也不要直接逐个 write 触发授权（用户批准 plan_approval 后这些文件自动放行，不用逐个确认）。然后：直接动手产出真实可运行的文件（用 write/edit 工具；先写出第一版能跑的东西，再问需要用户决策的问题，一次只问一个；不要只提问不产出）。铁律：你的每条回复必须以实际行动收尾——说「开始」后就立刻调用工具干活（read/ls 看目录或 write 写文件），不要把「开始动手了」当结尾停下来等用户，也不要只说话不调工具。2026-08-04 体验修复：禁止预告轮——说「现在写 X」的同一条回复必须同时调用写 X 的工具（write X），说了就同轮做掉；工具结果显示「已写入：路径」= 该文件已经写好了，不要重复写同一个文件（重复写会被检测为死循环而暂停）；写文件用绝对路径或项目内相对路径。2026-08-06 端口（坑 77 修正——vite 忽略 --port 0 实测）：起开发服务器用 **start-server 工具**（NeonForge 自动分配独立端口 5190+，不会占用宿主 5173/5175；spawn 已注入项目 node_modules/.bin 环境——裸 vite 也能跑）；**不要 bash 起服务、不要手动 `--port 0`**（vite 忽略 0 会落默认 5173 宿主端口）；启动后以 start-server 返回的实际地址为准（如 `Local: http://localhost:5174/`）告知用户，不要把猜的端口当实际地址。（2026-08-06 强化）**write/edit 后必须验证改动生效**（重新 read 目标文件确认内容正确，或启动服务看实际效果）——**不要只说「改好了」就继续**（模型声称成功 ≠ 实际成功）；改 UI/按钮前先 read 相关文件确认真实结构，**不要猜位置**（如「按钮在右下角」——先看 HTML 再说位置）。',
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
  model: modelProp,
  requirementConfirmed = false,
  artifactsReady = false,
  busy = false,
  stageOverride,
  advanceHint = false
}: {
  onStageChange?: (stage: number) => void
  onModelSelect?: (model: 'traditional' | 'agile') => void
  model?: 'traditional' | 'agile' | null // 2026-08-04 体验修复：受控——来自 MainWorkspace flowModel（自动推导/手选）；不传时非受控（demo 通道）用内部 state
  requirementConfirmed?: boolean // 2026-08-04 P0：需求已确认（对话【需求确认】或确认卡）→ 解锁从需求推进
  artifactsReady?: boolean // 2026-08-04 体验修复：开发阶段已有真实文件产出（write/edit 成功）→ 解锁推进到测试（防阶段空转）
  busy?: boolean // 2026-08-04 体验修复：搭档处理中禁止推进（防 advanceChat 被 working 守卫跳过——阶段前进但模型不知道）
  stageOverride?: number // 2026-08-04：外部推进（需求确认卡）同步本地阶段机——本地 stage 与 MainWorkspace flowStage 双状态对齐
  advanceHint?: boolean // 2026-08-06 阶段推进设计层：模型输出「确认推进」→ 按钮高亮（用户注意到该点了）
}) {
  const [stage, setStage] = useState(0) // 当前进行阶段（index）
  // 2026-08-04：受控/非受控双模式——主流程传 model（受控）；demo 通道不传（非受控，内部维护）——修复受控化破坏 demo 选择
  const [innerModel, setInnerModel] = useState<'traditional' | 'agile' | null>(null)
  const model = modelProp === undefined ? innerModel : modelProp
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
    onModelSelect?.(m)
    if (modelProp === undefined) setInnerModel(m) // 非受控（demo）——内部维护
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
          <span className="nf-flow__focus-hint">{USER_STAGE_HINT[FLOW_STAGES[stage]] ?? STAGE_HINT[FLOW_STAGES[stage]]}</span>
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
            <span className="nf-flow__gate-hint">点「确认推进」= 确认当前需求，进入设计（也可在上方需求卡点选，或先和搭档把需求聊清楚）</span>
          )}
          {/* 2026-08-04 体验修复：开发阶段门控——必须有真实文件产出（write/edit 成功）才能推进到测试（防阶段空转） */}
          {stage === 2 && !artifactsReady && (
            <span className="nf-flow__gate-hint">开发阶段还没产出文件——等搭档写完文件（对话里会出现可回滚的工具卡）再推进</span>
          )}
          {/* 2026-08-06 用户反馈「每阶段顶部常驻搭档处理中卡片（界面设计问题）」：删除常驻 busy 提示（按钮文案「搭档处理中…」已表达 busy + 状态栏有 workingStage）——
              busy 只在按钮禁用语义（坑 43 防推进被 working 守卫跳过），不需要阶段卡顶部常驻大卡片 */}
          <button
            type="button"
            // 2026-08-06 阶段推进设计层：模型说「确认推进」→ 按钮高亮脉冲（用户注意到该点了——反馈「不会自动或提示进入部署」）
            className={`nf-delivery__primary${advanceHint && !busy && !(stage === 2 && !artifactsReady) ? ' nf-delivery__primary--hint' : ''}`}
            // 2026-08-05 第六轮修复：需求阶段不再依赖 requirementConfirmed 禁用——模型没输出【需求确认】标记时按钮禁用 = 死锁（模型提示点按钮却点不了）；
            // 用户显式点击「确认推进」= 最强确认信号 → MainWorkspace 自动确认需求（handleStageChange 兜底）；busy/开发产物门控保留
            disabled={(stage === 2 && !artifactsReady) || busy}
            onClick={advance}
          >
            {busy ? '搭档处理中…' : stage === 0 && !requirementConfirmed ? '确认推进（确认需求）' : stage === 2 && !artifactsReady ? '等开发产出文件后可推进' : stage === 2 ? '确认开发完成，进入测试' : '确认推进'}
          </button>
        </div>
      )}
      {model && stage === FLOW_STAGES.length - 1 && (
        <div className="nf-flow__done"><IconCheck size={12} /> 交付完成——产物在「产物」区，验收后确认关闭</div>
      )}
    </div>
  )
}
