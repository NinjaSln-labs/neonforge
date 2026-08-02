import { useCallback, useEffect, useRef, useState } from 'react'
import SessionPanel from './SessionPanel'
import SettingsPanel from './SettingsPanel'
import DeliveryFlowPanel from './DeliveryFlowPanel'
import OutputPanel from './OutputPanel'
import ConversationPanel from './ConversationPanel'
import type { DeliveryPackage, ProblemInstance } from './types'
import { createProblem, loadProblems, saveProblems } from './problemStore'
import { clearSession } from './sessionStore'

// 任务工作台（对话面板「任务」Tab，06 任务队列前为结构占位）
function TaskPanel() {
  const [preheatInfo, setPreheatInfo] = useState<{ cache: { hash: string; history: Array<{ hit: boolean }> } | null } | null>(null)
  useEffect(() => {
    void window.neonforge.preheat?.status?.().then(setPreheatInfo)
  }, [])
  const history = preheatInfo?.cache?.history ?? []
  const hitRate = history.length > 0 ? Math.round((history.filter((h) => h.hit).length / history.length) * 100) : 0
  return (
    <div className="nf-task">
      <p className="nf-placeholder">当前任务：无（● 执行 / ◉ 待审 / ○ 排队）</p>
      <p className="nf-placeholder">待审核变更：无（05 diff 审核入口）</p>
      <details>
        <summary>▸ 本轮用量</summary>
        <p className="nf-meta">{preheatInfo?.cache ? `前缀缓存 ${hitRate}% 命中（hash ${preheatInfo.cache.hash}）` : '—'}</p>
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
  rootPath: string | null
  onBackStart: () => void
  onKeyExpired: () => void
}) {
  const [chatTab, setChatTab] = useState<'chat' | 'tasks'>('chat')
  const [activePath, setActivePath] = useState<string | null>(null)
  const [content, setContent] = useState<string>('')
  const [working, setWorking] = useState(false)
  const [chatKey, setChatKey] = useState(0)
  const [rerunRequest, setRerunRequest] = useState<string | null>(null) // 05 B：复跑请求
  const [showSettings, setShowSettings] = useState(false)
  // 08 快捷键（D0 §6）：⌘+, 打开/关闭设置（全局）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault()
        setShowSettings((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const [deliveryPkg, setDeliveryPkg] = useState<DeliveryPackage | null>(initDeliveryPkg())
  const [problems, setProblems] = useState<ProblemInstance[]>(initProblems)
  const [activeProblem, setActiveProblem] = useState<string | null>(null)
  // 13 交付包联动：真实工具执行（write/edit）成功 → 收集变更 → 生成真实交付包（覆盖 demo）
  const [realChanges, setRealChanges] = useState<Array<{ file: string; op: string }>>([])
  const lastPromptRef = useRef<string | null>(null) // 最近用户输入——复跑 rerunPrompt 兜底
  const handleToolResult = (r: { name: string; file?: string; ok: boolean }) => {
    if (!r.ok || !r.file) return
    setRealChanges((prev) => (prev.some((c) => c.file === r.file) ? prev : [...prev, { file: r.file as string, op: r.name }]))
  }
  const handleUserMessage = (text: string) => {
    lastPromptRef.current = text
    // 06 问题台账：发送 → 创建问题实例（持久化——断点续做基础；同标题复跑 → 更新状态不新增）
    setProblems((prev) => {
      const inst = createProblem(text)
      const dup = prev.find((x) => x.title === inst.title)
      return dup
        ? [{ ...dup, updatedAt: inst.updatedAt, status: 'executing' as const }, ...prev.filter((x) => x.id !== dup.id)]
        : [inst, ...prev]
    })
  }
  // 06 问题台账：台账持久化
  useEffect(() => { saveProblems(problems) }, [problems])
  // 06 问题台账：选中问题——closed 复开 → 复跑（「上次那个再跑一遍」）
  const handleSelectProblem = (id: string) => {
    setActiveProblem(id)
    const p = problems.find((x) => x.id === id)
    if (p && p.status === 'closed') setRerunRequest(p.title)
  }
  // ticket 12 ContextEngine：项目顶层文件 → @mention 列表（真实数据，替换 demo）
  const [projectFiles, setProjectFiles] = useState<string[]>([])
  useEffect(() => {
    if (!rootPath) { setProjectFiles([]); return }
    void window.neonforge.workspace.listDir(rootPath).then((entries) =>
      setProjectFiles(entries.filter((e) => e.kind === 'file').map((e) => e.name))
    )
  }, [rootPath])
  useEffect(() => {
    if (realChanges.length === 0) return
    setDeliveryPkg({
      status: 'delivered',
      summary: `已${realChanges.length === 1 ? '写入/修改 1 个文件' : `写入/修改 ${realChanges.length} 个文件`}（写前快照已建——可在对话中回滚）`,
      artifacts: realChanges.map((c) => c.file),
      acceptance: [],
      nextSteps: [],
      rerunLabel: '↻ 再跑一遍',
      rerunPrompt: lastPromptRef.current ?? undefined
    })
  }, [realChanges])

function initDeliveryPkg(): DeliveryPackage | null {
  // 数据源：测试注入（window.neonforge.demo.delivery——视觉基线/演示）——产品运行时无 demo 字段 → 空态（真实执行后联动生成）
  return (window.neonforge as unknown as { demo?: { delivery?: DeliveryPackage } }).demo?.delivery ?? null
}

function initProblems(): ProblemInstance[] {
  // 数据源：测试注入（window.neonforge.demo.problems）优先；否则 localStorage 持久化台账（断点续做基础）
  const demo = (window.neonforge as unknown as { demo?: { problems?: ProblemInstance[] } }).demo?.problems
  return demo ?? loadProblems()
}

  const openFile = useCallback((filePath: string) => {
    void window.neonforge.workspace.readFile(filePath).then((res) => {
      if (res.ok) {
        setActivePath(filePath)
        setContent(res.content)
      }
    })
  }, [])

  const zeroToOne = !rootPath

  return (
    <div className="nf-app">
      {/* 左：会话区 */}
      <SessionPanel
        problems={problems}
        activeId={activeProblem}
        onSelect={handleSelectProblem}
        onNew={() => { setActiveProblem(null); clearSession(); setChatKey((k) => k + 1) }}
      />

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
          <div className="nf-chat__actions">
            <button type="button" className="nf-session__new" onClick={() => setShowSettings((v) => !v)}>⚙ 设置</button>
            <button type="button" className="nf-session__new" onClick={onBackStart}>启动页</button>
          </div>
        </header>
        <div className="nf-panel__body">
          {zeroToOne && <DeliveryFlowPanel />}
          {chatTab === 'chat' ? (
            <ConversationPanel key={chatKey} rootPath={rootPath} onKeyExpired={onKeyExpired} onWorkingChange={setWorking} externalRequest={rerunRequest} onExternalConsumed={() => setRerunRequest(null)} onToolResult={handleToolResult} onUserMessage={handleUserMessage} recentFilesExternal={projectFiles} />
          ) : (
            <TaskPanel />
          )}
        </div>
      </aside>

      {/* 右：产物区（工程 / 产物） */}
      <OutputPanel
        rootPath={rootPath ?? ''}
        activePath={activePath}
        content={content}
        deliveryPkg={deliveryPkg}
        onOpenFile={openFile}
        onCloseProblem={() => setDeliveryPkg((p) => (p ? { ...p, status: 'closed' } : p))}
        onAdjustProblem={() => {}}
        onRerun={(prompt) => setRerunRequest(prompt)}
      />

      {showSettings && <SettingsPanel />}

      <footer className="nf-statusbar">
        {working ? (
          <>🔵 搭档思考中…</>
        ) : (
          <>🟢 就绪</>
        )}
        {' │ '}{(rootPath ?? '从零开始').split(/[/\\]/).filter(Boolean).pop()} │ 待审核: 0
      </footer>
    </div>
  )
}
