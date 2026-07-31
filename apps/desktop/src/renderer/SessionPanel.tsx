// 会话区（左）：会话管理（新建/历史）——AI Agent IDE 会话导航
export default function SessionPanel({ onNewChat }: { onNewChat: () => void }) {
  return (
    <section className="nf-session">
      <header className="nf-session__header">
        <span>会话</span>
        <button type="button" className="nf-session__new" onClick={onNewChat}>＋ 新会话</button>
      </header>
      <div className="nf-session__list">
        <p className="nf-placeholder">历史会话将显示在这里</p>
      </div>
    </section>
  )
}
