import { useCallback, useState } from 'react'
import Editor from '@monaco-editor/react'
import FileTree from './FileTree'

function langFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'ts': case 'tsx': return 'typescript'
    case 'js': case 'jsx': case 'mjs': case 'cjs': return 'javascript'
    case 'json': return 'json'
    case 'css': return 'css'
    case 'html': return 'html'
    case 'md': return 'markdown'
    case 'py': return 'python'
    case 'rs': return 'rust'
    case 'go': return 'go'
    case 'yml': case 'yaml': return 'yaml'
    default: return 'plaintext'
  }
}

// 主工作区（D0 §2 / ticket 03）：搭档可折叠 + 文件树可折叠 + Monaco + 详情
export default function MainWorkspace({
  rootPath,
  onBackStart
}: {
  rootPath: string
  onBackStart: () => void
}) {
  const [companionOpen, setCompanionOpen] = useState(true)
  const [treeCollapsed, setTreeCollapsed] = useState(false)
  const [activePath, setActivePath] = useState<string | null>(null)
  const [content, setContent] = useState<string>('// 从左侧文件树打开文件')
  const [loadError, setLoadError] = useState<string | null>(null)

  const openFile = useCallback((filePath: string) => {
    void window.neonforge.workspace.readFile(filePath).then((res) => {
      if (res.ok) {
        setActivePath(filePath)
        setContent(res.content)
        setLoadError(null)
      } else {
        setLoadError(res.error)
      }
    })
  }, [])

  const fileLabel = activePath
    ? activePath.split(/[/\\]/).pop()
    : '未打开文件'

  return (
    <div className={`nf-app${companionOpen ? '' : ' nf-app--companion-collapsed'}`}>
      {/* 左：搭档面板（可折叠） */}
      <aside className={`nf-panel nf-panel--left${companionOpen ? '' : ' nf-panel--collapsed'}`}>
        <header className="nf-panel__header">
          {companionOpen && (
            <>
              <span className="nf-breath" />
              <span className="nf-panel__title">搭档</span>
            </>
          )}
          <button
            type="button"
            className="nf-panel__fold"
            onClick={() => setCompanionOpen((v) => !v)}
            title={companionOpen ? '折叠搭档' : '展开搭档'}
          >
            {companionOpen ? '←' : '→'}
          </button>
        </header>
        {companionOpen && (
          <div className="nf-panel__body">
            <p className="nf-placeholder">对话区占位</p>
            <p className="nf-placeholder">输入框占位</p>
            <p className="nf-placeholder">任务列表占位（● 执行 / ◉ 待审 / ○ 排队）</p>
          </div>
        )}
      </aside>

      {/* 中：文件树 + 编辑器 */}
      <main className="nf-workspace">
        <div className="nf-workspace__split">
          <FileTree
            rootPath={rootPath}
            selectedPath={activePath}
            onOpenFile={openFile}
            collapsed={treeCollapsed}
            onToggle={() => setTreeCollapsed((v) => !v)}
          />
          <div className="nf-editor">
            <div className="nf-workspace__toolbar">
              <span className="nf-filetree-tag">{fileLabel}</span>
              <button type="button" onClick={onBackStart}>启动页</button>
            </div>
            {loadError && <p className="nf-config__err">无法打开：{loadError}</p>}
            <Editor
              height="100%"
              path={activePath ?? 'untitled'}
              language={activePath ? langFromPath(activePath) : 'typescript'}
              value={content}
              theme="vs-dark"
              options={{ readOnly: false, minimap: { enabled: false }, fontSize: 13 }}
              onChange={(v) => setContent(v ?? '')}
            />
          </div>
        </div>
      </main>

      {/* 右：详情面板 */}
      <aside className="nf-panel nf-panel--right">
        <header className="nf-panel__header">
          <span className="nf-panel__title">详情</span>
        </header>
        <div className="nf-panel__body">
          <p className="nf-placeholder">🧠 推理过程占位</p>
          <p className="nf-placeholder">修改计划占位</p>
          <details>
            <summary>▸ 本轮用量</summary>
            <p className="nf-meta">—</p>
          </details>
        </div>
      </aside>

      <footer className="nf-statusbar">
        🟢 就绪 │ {rootPath.split(/[/\\]/).filter(Boolean).pop()} │ 待审核: 0
      </footer>
    </div>
  )
}
