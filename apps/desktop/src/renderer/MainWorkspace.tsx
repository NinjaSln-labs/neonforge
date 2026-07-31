import { useCallback, useState } from 'react'
import SessionPanel from './SessionPanel'
import OutputPanel from './OutputPanel'
import ConversationPanel from './ConversationPanel'

// 任务工作台（对话面板「任务」Tab，06 任务队列前为结构占位）
function TaskPanel() {
  return (
    <div className="nf-task">
      <p className="nf-placeholder">当前任务：无（● 执行 / ◉ 待审 / ○ 排队）</p>
      <p className="nf-placeholder">待审核变更：无（05 diff 审核入口）</p>
      <details>
        <summary>▸ 本轮用量</summary>
        <p className="nf-meta">—</p>
      </details>
    </div>
  )
}

// 主工作区（布局 v3 · AI Agent IDE：左会话区 | 中对话（核心）| 右产物区 | 底部状态栏）
// 定位：用户不写代码——对话指挥 agent，产物区查看 agent 产出；无常驻大编辑器
export default function MainWorkspace({
  rootPath,
  onBackStart,
  onKeyExpired
}: {
  rootPath: string
  onBackStart: () => void
  onKeyExpired: () => void
}) {
  const [chatTab, setChatTab] = useState<'chat' | 'tasks'>('chat')
  const [activePath, setActivePath] = useState<string | null>(null)
  const [content, setContent] = useState<string>('')
  const [working, setWorking] = useState(false)
  const [chatKey, setChatKey] = useState(0)

  const openFile = useCallback((filePath: string) => {
    void window.neonforge.workspace.readFile(filePath).then((res) => {
      if (res.ok) {
        setActivePath(filePath)
        setContent(res.content)
      }
    })
  }, [])

  return (
    <div className="nf-app">
      {/* 左：会话区 */}
      <SessionPanel onNewChat={() => setChatKey((k) => k + 1)} />

      {/* 中：对话区（核心，最大）——对话 / 任务 Tabs */}
      <aside className="nf-panel nf-panel--center">
        <header className="nf-panel__header">
          <div className="nf-tabs">
            <button
              type="button"
              className={`nf-tabs__item${chatTab === 'chat' ? ' nf-tabs__item--active' : ''}`}
              onClick={() => setChatTab('chat')}
            >
              对话
            </button>
            <button
              type="button"
              className={`nf-tabs__item${chatTab === 'tasks' ? ' nf-tabs__item--active' : ''}`}
              onClick={() => setChatTab('tasks')}
            >
              任务
            </button>
          </div>
          <button type="button" className="nf-session__new" onClick={onBackStart}>启动页</button>
        </header>
        <div className="nf-panel__body">
          {chatTab === 'chat' ? (
            <ConversationPanel key={chatKey} onKeyExpired={onKeyExpired} onWorkingChange={setWorking} />
          ) : (
            <TaskPanel />
          )}
        </div>
      </aside>

      {/* 右：产物区（工程 / 产物） */}
      <OutputPanel rootPath={rootPath} activePath={activePath} content={content} onOpenFile={openFile} />

      <footer className="nf-statusbar">
        {working ? (
          <>🔵 搭档思考中…</>
        ) : (
          <>🟢 就绪</>
        )}
        {' │ '}{rootPath.split(/[/\\]/).filter(Boolean).pop()} │ 待审核: 0
      </footer>
    </div>
  )
}
