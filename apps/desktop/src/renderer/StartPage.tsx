// 启动页（D0 §3.2 / D5 屏幕1）——2026-08-04 方案 A：真实输入框（占位轮播）+ 场景卡（点击预填）+ 二选一芯片
// 与对话空态场景卡共享 SCENES 数据源（scenes.tsx）——零学习成本：说出/点选 → 二选一进入工作区
import { useEffect, useState } from 'react'
import { SCENES } from './scenes'

// 占位轮播（每 5s 换一个示例问题——展示「能做什么」，输入即停）
const PLACEHOLDERS = [
  '想解决什么？直接说，剩下的交给搭档',
  '把 Downloads 里的发票和合同分类整理',
  '帮我做一个每周记账的小工具',
  '我要做一个3D射击小游戏（第一人称，科幻风格）',
  '我要做一个能发给朋友的旅行手册网页',
]

export default function StartPage({
  onOpenProject,
  onNewProject,
}: {
  onOpenProject: (prefill: string) => void
  onNewProject: (prefill: string) => void
}) {
  const [value, setValue] = useState('')
  const [phIdx, setPhIdx] = useState(0)
  // 占位轮播（每 5s 换一个示例问题——展示「能做什么」，输入即停；5s 防视觉测试截图跨轮播抖动）
  useEffect(() => {
    const t = setInterval(() => setPhIdx((i) => (i + 1) % PLACEHOLDERS.length), 5000)
    return () => clearInterval(t)
  }, [])

  const pick = (q: string) => {
    setValue(q)
  }

  return (
    <div className="nf-start">
      <h1 className="nf-start__brand">NeonForge</h1>
      <p className="nf-start__slogan">说出问题，拿到结果</p>

      <div className="nf-start__compose">
        <textarea
          className="nf-start__input"
          rows={2}
          value={value}
          placeholder={PLACEHOLDERS[phIdx]}
          aria-label="想解决的问题"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            // 2026-08-04 重审修复：Enter = 从零开始（主路径）——输入后按 Enter 有明确反馈（原无反应）
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              onNewProject(value)
            }
          }}
        />
        <div className="nf-start__scenes">
          {SCENES.map(({ icon: Icon, label, q }) => (
            <button
              key={label}
              type="button"
              className="nf-start__scene"
              aria-label={`示例：${label}`}
              onClick={() => pick(q)}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="nf-start__actions">
        <button
          type="button"
          className="nf-start__cta nf-start__cta--primary"
          onClick={() => onNewProject(value)}
        >
          从零开始
        </button>
        <button
          type="button"
          className="nf-start__cta nf-start__cta--ghost"
          onClick={() => onOpenProject(value)}
        >
          打开已有项目
        </button>
      </div>
      <p className="nf-start__hint">
        从零开始：搭档带你从需求做到交付 · 打开已有项目：直接改你电脑上的文件
      </p>
    </div>
  )
}
