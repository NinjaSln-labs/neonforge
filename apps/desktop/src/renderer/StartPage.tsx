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
      <p className="nf-start__slogan">说出问题，拿到结果</p>
      <p className="nf-start__prompt">今天想做什么？直接说，剩下的交给搭档</p>
      <div className="nf-start__actions">
        <button type="button" className="nf-start__cta nf-start__cta--primary" onClick={onOpenProject}>
          打开已有项目
        </button>
        <button type="button" className="nf-start__cta nf-start__cta--ghost" onClick={onNewProject}>
          从零开始
        </button>
      </div>
      <p className="nf-start__hint">整理文件 · 做小工具 · 修系统 · 做新项目</p>
    </div>
  )
}
