import { useEffect, useState } from 'react'
import type { DirEntry } from './types'
import { IconFile, IconFolder, IconFolderOpen } from './icons'

// 文件树（D2 §9 / D7：行高 24px、字号 12px；可折叠）
function TreeNode({
  entry,
  depth,
  selectedPath,
  onOpenFile
}: {
  entry: DirEntry
  depth: number
  selectedPath: string | null
  onOpenFile: (path: string) => void
}) {
  const [open, setOpen] = useState(depth === 0)
  const [children, setChildren] = useState<DirEntry[] | null>(null)

  useEffect(() => {
    if (entry.kind !== 'dir' || !open || children !== null) return
    let alive = true
    void window.neonforge.workspace.listDir(entry.path).then((list) => {
      if (alive) setChildren(list)
    })
    return () => { alive = false }
  }, [entry.kind, entry.path, open, children])

  if (entry.kind === 'file') {
    return (
      <button
        type="button"
        className={`nf-tree__row${selectedPath === entry.path ? ' nf-tree__row--active' : ''}`}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => onOpenFile(entry.path)}
      >
        <span className="nf-tree__icon"><IconFile size={12} /></span>
        <span className="nf-tree__name">{entry.name}</span>
      </button>
    )
  }

  return (
    <div>
      <button
        type="button"
        className="nf-tree__row"
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="nf-tree__icon">{open ? <IconFolderOpen size={12} /> : <IconFolder size={12} />}</span>
        <span className="nf-tree__name">{entry.name}</span>
      </button>
      {open && children?.map((child) => (
        <TreeNode
          key={child.path}
          entry={child}
          depth={depth + 1}
          selectedPath={selectedPath}
          onOpenFile={onOpenFile}
        />
      ))}
    </div>
  )
}

export default function FileTree({
  rootPath,
  selectedPath,
  onOpenFile,
  collapsed,
  onToggle
}: {
  rootPath: string
  selectedPath: string | null
  onOpenFile: (path: string) => void
  collapsed: boolean
  onToggle: () => void
}) {
  const rootName = rootPath.split(/[/\\]/).filter(Boolean).pop() ?? rootPath
  const rootEntry: DirEntry = { name: rootName, path: rootPath, kind: 'dir' }

  return (
    <aside className={`nf-filetree${collapsed ? ' nf-filetree--collapsed' : ''}`}>
      <header className="nf-filetree__header">
        {/* 2026-08-03 v31 A3：面板标题语义化（aria heading） */}
        {!collapsed && <span className="nf-filetree__title" role="heading" aria-level={2}>文件</span>}
        {/* 2026-08-03 C4 审计修复：纯图标按钮补 aria-label（title 不构成无障碍名） */}
        <button type="button" className="nf-filetree__fold" onClick={onToggle} aria-label={collapsed ? '展开文件树' : '折叠文件树'} title={collapsed ? '展开文件树' : '折叠文件树'}>
          {collapsed ? '→' : '←'}
        </button>
      </header>
      {!collapsed && (
        <div className="nf-filetree__body">
          {/* 2026-08-04 审计修复（A1）：空 rootPath（从零开始未创建项目）显示占位——原渲染空名目录按钮（axe button-name critical） */}
          {rootPath ? (
            <TreeNode entry={rootEntry} depth={0} selectedPath={selectedPath} onOpenFile={onOpenFile} />
          ) : (
            <p className="nf-placeholder">项目创建后显示文件</p>
          )}
        </div>
      )}
    </aside>
  )
}
