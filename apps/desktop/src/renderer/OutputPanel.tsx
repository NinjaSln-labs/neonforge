import { useState } from 'react'
import Editor from '@monaco-editor/react'
import FileTree from './FileTree'
import DeliveryPanel from './DeliveryPanel'
import type { DeliveryPackage } from './types'

// 产物区（右）：工程 / 产物 Tabs——工程=文件树；产物=交付包（ticket 05）
export default function OutputPanel({
  rootPath,
  activePath,
  content,
  deliveryPkg,
  onOpenFile,
  onCloseProblem,
  onAdjustProblem
}: {
  rootPath: string
  activePath: string | null
  content: string
  deliveryPkg: DeliveryPackage | null
  onOpenFile: (path: string) => void
  onCloseProblem: () => void
  onAdjustProblem: () => void
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
      {/* 双渲染 + 隐藏切换（保持组件状态——打勾/已关闭不因切 Tab 丢失） */}
      <div style={{ display: tab === 'project' ? 'flex' : 'none', flex: 1, minHeight: 0 }}>
        <FileTree
          rootPath={rootPath}
          selectedPath={activePath}
          onOpenFile={(p) => { onOpenFile(p); setTab('output') }}
          collapsed={false}
          onToggle={() => {}}
        />
      </div>
      <div className="nf-output__body" style={{ display: tab === 'output' ? 'flex' : 'none', padding: 0 }}>
        {deliveryPkg ? (
          <DeliveryPanel pkg={deliveryPkg} onClose={onCloseProblem} onAdjust={onAdjustProblem} />
        ) : activePath ? (
          <Editor
            height="100%"
            path={activePath}
            language="typescript"
            value={content}
            theme="vs-dark"
            options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13 }}
          />
        ) : (
          <DeliveryPanel pkg={null} onClose={onCloseProblem} onAdjust={onAdjustProblem} />
        )}
      </div>
    </section>
  )
}
