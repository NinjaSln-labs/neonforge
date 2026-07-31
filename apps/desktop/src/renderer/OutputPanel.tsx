import { useState } from 'react'
import Editor from '@monaco-editor/react'
import FileTree from './FileTree'

// 产物区（右）：工程 / 产物 Tabs——agent 干活的产物（文件树 + 文件只读查看）
export default function OutputPanel({
  rootPath,
  activePath,
  content,
  onOpenFile
}: {
  rootPath: string
  activePath: string | null
  content: string
  onOpenFile: (path: string) => void
}) {
  const [tab, setTab] = useState<'project' | 'output'>('project')

  return (
    <section className="nf-output">
      <header className="nf-panel__header">
        <div className="nf-tabs">
          <button
            type="button"
            className={`nf-tabs__item${tab === 'project' ? ' nf-tabs__item--active' : ''}`}
            onClick={() => setTab('project')}
          >
            工程
          </button>
          <button
            type="button"
            className={`nf-tabs__item${tab === 'output' ? ' nf-tabs__item--active' : ''}`}
            onClick={() => setTab('output')}
          >
            产物
          </button>
        </div>
      </header>
      {tab === 'project' ? (
        <FileTree
          rootPath={rootPath}
          selectedPath={activePath}
          onOpenFile={(p) => { onOpenFile(p); setTab('output') }}
          collapsed={false}
          onToggle={() => {}}
        />
      ) : (
        <div className="nf-output__body" style={{ padding: 0 }}>
          {activePath ? (
            <Editor
              height="100%"
              path={activePath}
              language="typescript"
              value={content}
              theme="vs-dark"
              options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13 }}
            />
          ) : (
            <p className="nf-placeholder">从「工程」选文件查看内容</p>
          )}
        </div>
      )}
    </section>
  )
}
