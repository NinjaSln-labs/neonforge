import { useEffect, useState } from 'react'
import Editor, { DiffEditor } from '@monaco-editor/react'
import ConfigPage from './ConfigPage'

// ticket 01：三栏布局占位（D0 §2 信息架构）+ Monaco + DiffEditor 验证 + 状态栏（D0 §3.3）
// ticket 02：首次配置页判断（D0 §1.3/§3.1：无有效 Key → 配置页；有 → 主工作区）

const ORIGINAL = `// auth.ts
export function checkPermission(user) {
  return user.role === 'admin'
}`
const MODIFIED = `// auth.ts
export function checkPermission(user) {
  return user.role === 'admin' || user.role === 'editor'
}`

function MainWorkspace() {
  const [diffVisible, setDiffVisible] = useState(true)

  return (
    <>
      {/* 左：搭档面板（可折叠） */}
      <aside className="nf-panel nf-panel--left">
        <header className="nf-panel__header">
          <span className="nf-breath" />
          <span className="nf-panel__title">搭档</span>
        </header>
        <div className="nf-panel__body">
          <p className="nf-placeholder">对话区占位</p>
          <p className="nf-placeholder">输入框占位</p>
          <p className="nf-placeholder">任务列表占位（● 执行 / ◉ 待审 / ○ 排队）</p>
        </div>
      </aside>

      {/* 中：工作区（编辑器 + DiffEditor 验证） */}
      <main className="nf-workspace">
        <div className="nf-workspace__toolbar">
          <button onClick={() => setDiffVisible(v => !v)}>
            {diffVisible ? '编辑器' : 'Diff 视图'}
          </button>
          <span className="nf-filetree-tag">文件树（可折叠）</span>
        </div>
        {diffVisible ? (
          <DiffEditor
            height="100%"
            language="typescript"
            original={ORIGINAL}
            modified={MODIFIED}
            theme="vs-dark"
            options={{ renderSideBySide: true, readOnly: true }}
          />
        ) : (
          <Editor height="100%" defaultLanguage="typescript" defaultValue="// NeonForge 编辑器占位" theme="vs-dark" />
        )}
      </main>

      {/* 右：详情面板（可按需展开） */}
      <aside className="nf-panel nf-panel--right">
        <header className="nf-panel__header">
          <span className="nf-panel__title">详情</span>
        </header>
        <div className="nf-panel__body">
          <p className="nf-placeholder">🧠 推理过程占位</p>
          <p className="nf-placeholder">修改计划占位</p>
          <details>
            <summary>▸ 本轮用量</summary>
            <p className="nf-meta">12K tokens │ 缓存命中 87%</p>
          </details>
        </div>
      </aside>

      {/* 状态栏（D0 §3.3 权威） */}
      <footer className="nf-statusbar">
        🟢 就绪 │ main │ 待审核: 0
      </footer>
    </>
  )
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [hasKey, setHasKey] = useState(false)

  useEffect(() => {
    let mounted = true
    void window.neonforge.config.hasKey().then((v) => {
      if (mounted) { setHasKey(v); setReady(true) }
    })
    return () => { mounted = false }
  }, [])

  if (!ready) return <div className="nf-app" />
  if (!hasKey) {
    return (
      <div className="nf-app nf-app--config">
        <ConfigPage onDone={() => setHasKey(true)} />
      </div>
    )
  }
  return (
    <div className="nf-app">
      <MainWorkspace />
    </div>
  )
}
