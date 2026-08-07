// 执行确认卡（2026-08-07 无阶段重构 S4 新增——Plan-and-Execute human approval 落地）：
// 目标确认后显示——用户确认「开始执行」→ executionConfirmed = true → forceTool 生效
// （目标+执行已确认但无产出 → API 强制模型必须调工具产出——防只说不做，坑 80）
// 流程：目标确认 → 能力检查（check-capability）→ 模型输出【执行方案】（含文件清单）→ 本卡确认执行
// S4 基础版：确认入口 + 流程说明（能力状态/文件清单展示随 S6 提示词引导增强）
import { IconCheck } from './icons'

export default function ExecutionConfirmCard({ onConfirm, goalText }: { onConfirm: () => void; goalText?: string }) {
  return (
    <div className="nf-exec-card">
      <div className="nf-exec-card__head">
        <IconCheck size={16} />
        <span className="nf-exec-card__title">确认执行</span>
      </div>
      {goalText ? (
        <p className="nf-exec-card__goal">目标：{goalText.length > 60 ? goalText.slice(0, 60) + '…' : goalText}</p>
      ) : null}
      <p className="nf-exec-card__note">
        搭档会先检查能力（需要的工具/环境是否就绪），再给出执行方案（要写/改哪些文件）。
        确认后搭档开始动手，需要你决定的地方会停下问你。
      </p>
      <div className="nf-exec-card__actions">
        <button type="button" className="nf-delivery__primary" onClick={onConfirm}>
          确认，开始执行
        </button>
      </div>
    </div>
  )
}
