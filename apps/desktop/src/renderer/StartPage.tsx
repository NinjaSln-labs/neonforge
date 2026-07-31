// 启动页（D0 §3.2 / D5 屏幕1）：打开已有项目 / 从零开始
export default function StartPage({
  onOpenProject,
  onNewProject
}: {
  onOpenProject: () => void
  onNewProject: () => void
}) {
  return (
    <div className="nf-start">
      <h1 className="nf-start__brand">NeonForge</h1>
      <p className="nf-start__prompt">今天想做什么？</p>
      <input
        className="nf-start__input"
        placeholder="用自然语言描述…"
        readOnly
        aria-label="自然语言入口（对话闭环见 ticket 04）"
      />
      <div className="nf-start__links">
        <button type="button" className="nf-start__link" onClick={onOpenProject}>
          打开已有项目
        </button>
        <button type="button" className="nf-start__link" onClick={onNewProject}>
          从零开始
        </button>
      </div>
    </div>
  )
}
