// 需求确认卡（2026-08-04 P2 重构——意图消歧 UI 化）：4 项候选 chips，点选 → 确认 → 自动进设计
// 借鉴 workshop-facilitation 的「编号选项 + Other」交互模式：确定性收敛，不依赖模型输出【需求确认】标记
import { useEffect, useState } from 'react'
import { IconCheck } from './icons'

interface FieldOption { v: string; d?: string }
interface Field { key: string; label: string; options: FieldOption[] }

const FIELDS: Field[] = [
  {
    key: 'type', label: '做什么',
    options: [
      { v: '射击游戏', d: '打枪、打怪、对战' },
      { v: '建造游戏', d: '像我的世界那样搭东西' },
      { v: '解谜/闯关游戏', d: '动脑过关' },
      { v: '其他', d: '在对话里说你想做的' }
    ]
  },
  {
    key: 'platform', label: '在哪儿玩',
    options: [
      { v: '网页打开就能玩', d: '发链接就能玩' },
      { v: '电脑上安装', d: '下载到电脑' },
      { v: '手机上玩', d: '手机 App' }
    ]
  },
  {
    key: 'audience', label: '给谁玩',
    options: [
      { v: '自己玩', d: '练手/自娱' },
      { v: '发给朋友玩', d: '分享给朋友' },
      { v: '做给别人用', d: '正式产品' }
    ]
  },
  {
    key: 'done', label: '做成什么样算完',
    options: [
      { v: '先做个能玩的版本', d: '最快看到效果' },
      { v: '做完整游戏', d: '功能齐全' },
      { v: '先看效果再定', d: '边做边调整' }
    ]
  }
]

export default function RequirementCard({ onConfirm, initialPrompt }: { onConfirm: (summary: string) => void; initialPrompt?: string }) {
  const [sel, setSel] = useState<Record<string, string>>({})
  const allPicked = FIELDS.every((f) => sel[f.key])
  const pick = (key: string, v: string) => setSel((s) => ({ ...s, [key]: v }))
  // 2026-08-04 体验修复（用户实测：已说「3D射击」还要重选）：首句关键词预选「做什么」——用户已说过的类型不用重选
  useEffect(() => {
    if (!initialPrompt || sel.type) return
    const t = initialPrompt.toLowerCase()
    const match = /(射击|打枪|枪|打怪|对战|fps)/.test(t) ? '射击游戏'
      : /(建造|搭建|世界|盖房子|创造)/.test(t) ? '建造游戏'
      : /(解谜|闯关|动脑|谜题)/.test(t) ? '解谜/闯关游戏'
      : null
    if (match) setSel((s) => ({ ...s, type: match }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt])

  return (
    <div className="nf-reqcard">
      <div className="nf-reqcard__head">
        <IconCheck size={16} />
        <span className="nf-reqcard__title">快速确认需求</span>
        <span className="nf-reqcard__sub">点选下面 4 项，10 秒搞定——不用一句句跟搭档聊</span>
      </div>
      {FIELDS.map((f) => (
        <div key={f.key} className="nf-reqcard__field">
          <span className="nf-reqcard__label">{f.label}</span>
          <div className="nf-reqcard__chips">
            {f.options.map((o) => (
              <button
                key={o.v}
                type="button"
                className={`nf-reqcard__chip${sel[f.key] === o.v ? ' nf-reqcard__chip--on' : ''}`}
                aria-pressed={sel[f.key] === o.v}
                onClick={() => pick(f.key, o.v)}
              >
                {o.v}{o.d ? <em>{o.d}</em> : null}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="nf-reqcard__actions">
        <button
          type="button"
          className="nf-delivery__primary"
          disabled={!allPicked}
          onClick={() => {
            const summary = `${sel.type}：${sel.platform}，${sel.audience}，${sel.done}`
            onConfirm(summary)
          }}
        >
          {allPicked ? '确认需求，开始设计 →' : '选完 4 项即可开始'}
        </button>
      </div>
    </div>
  )
}
