import { useCallback, useEffect, useRef, useState } from 'react'
import SessionPanel from './SessionPanel'
import SettingsPanel from './SettingsPanel'
import DeliveryFlowPanel, { FLOW_STAGES, STAGE_HINT } from './DeliveryFlowPanel'
import OutputPanel from './OutputPanel'
import ConversationPanel from './ConversationPanel'
import type { DeliveryPackage, ProblemInstance } from './types'
import { createProblem, loadProblems, saveProblems, updateProblemSnapshot } from './problemStore'
import { clearSession } from './sessionStore'
import { IconSettings } from './icons'

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
      {/* 2026-08-03 A7 审计修复：占位措辞诚实化——任务队列尚未实现（原「当前任务：无」永远假信息）；v35 去 V2/diff 术语 */}
      <p className="nf-placeholder">任务队列：即将支持——暂时没有进行中的任务</p>
      <p className="nf-placeholder">待审核变更：无（审核在「产物」区）</p>
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
  onKeyExpired,
  onProjectCreated,
  zeroToOneMode = false
}: {
  rootPath: string | null
  onBackStart: () => void
  onKeyExpired: () => void
  onProjectCreated?: (path: string) => void
  zeroToOneMode?: boolean
}) {
  const [chatTab, setChatTab] = useState<'chat' | 'tasks'>('chat')
  const [activePath, setActivePath] = useState<string | null>(null)
  const [content, setContent] = useState<string>('')
  const [working, setWorking] = useState(false)
  const [chatKey, setChatKey] = useState(0)
  const [rerunRequest, setRerunRequest] = useState<string | null>(null) // 05 B：复跑请求
  const [showSettings, setShowSettings] = useState(false)
  // 08 快捷键（D0 §6）：⌘, 打开/关闭设置 + ⌘N 新任务（全局）
  const handleNew = () => { setActiveProblem(null); clearSession(); setChatKey((k) => k + 1) }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault()
        setShowSettings((v) => !v)
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        handleNew()
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
    // 06 断点续做深度（基线 §21）：授权操作记录到问题快照 authorized（跨会话可回溯）
    if (activeProblem) {
      setProblems((prev) => prev.map((p) => {
        if (p.id !== activeProblem) return p
        const label = `[${r.name}] ${r.file}`
        const auth = p.snapshot?.authorized ?? []
        return auth.includes(label) ? p : updateProblemSnapshot(p, { authorized: [...auth, label] })
      }))
    }
  }
  const handleUserMessage = (text: string) => {
    lastPromptRef.current = text
    // ticket 07：从零开始 → 首条消息创建真实项目目录（0-1 交付真实执行地基——后续阶段模型在真实项目内 write/read）
    if (!rootPath && onProjectCreated) {
      void window.neonforge.workspace.initProject(text).then((r) => {
        if (r.ok) onProjectCreated(r.path)
      })
    }
    // 06 问题台账：发送 → 创建问题实例（持久化——断点续做基础；同标题复跑 → 更新状态不新增）
    setProblems((prev) => {
      const inst = createProblem(text)
      const dup = prev.find((x) => x.title === inst.title)
      if (dup) {
        // 复跑/续做：保留快照（目标更新 + 记录待办）
        const snap = updateProblemSnapshot(dup, {
          goal: text,
          pending: [...(dup.snapshot?.pending ?? []).filter((x) => x !== text).slice(-4), text]
        })
        setActiveProblem(dup.id)
        return [{ ...snap, updatedAt: inst.updatedAt, status: 'executing' as const }, ...prev.filter((x) => x.id !== dup.id)]
      }
      setActiveProblem(inst.id)
      return [inst, ...prev]
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
  // 2026-08-03 A5 审计修复：交付包「确认问题关闭」→ 同步问题台账（SessionPanel 状态 closed——跨组件状态一致）
  const handleConfirmClosed = () => {
    if (!activeProblem) return
    setProblems((prev) => prev.map((p) => (p.id === activeProblem ? { ...p, status: 'closed' as const } : p)))
    setDeliveryPkg((p) => (p ? { ...p, status: 'closed' } : p))
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
    setDeliveryPkg((prev) => ({
      status: 'delivered',
      summary: `已${realChanges.length === 1 ? '写入/修改 1 个文件' : `写入/修改 ${realChanges.length} 个文件`}（写前快照已建——可在对话中回滚）`,
      artifacts: realChanges.map((c) => c.file),
      acceptance: prev?.acceptance ?? [], // 保留阶段验收项（07 编排——若已设置）
      nextSteps: [],
      rerunLabel: '↻ 再跑一遍',
      rerunPrompt: lastPromptRef.current ?? undefined
    }))
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

  const zeroToOne = zeroToOneMode
  // ticket 07 阶段机：阶段/模型状态提升——注入对话阶段指引（模型按阶段产出）
  const [flowStage, setFlowStage] = useState(0)
  const [flowModel, setFlowModel] = useState<'traditional' | 'agile' | null>(null)
  const stageName = FLOW_STAGES[flowStage]
  const stageHint = flowModel
    ? `【0-1 交付 · ${flowModel === 'agile' ? '敏捷（迭代）' : '传统软件工程'} · ${stageName} 阶段】${STAGE_HINT[stageName]}——按本阶段工作；阶段完成请提示用户点「确认推进」。`
    : undefined
  // 07 阶段产物编排：阶段推进 → 交付包验收项（阶段确认列表——确定性，不依赖模型）
  const handleStageChange = (stage: number) => {
    setFlowStage(stage)
    const acceptance = FLOW_STAGES.map((s, i) => ({
      label: i < stage ? `${s} 阶段已完成` : i === stage ? `${s} 阶段进行中` : `${s} 待开始`,
      done: i < stage
    }))
    setDeliveryPkg((prev) => ({
      status: 'delivered',
      summary: prev?.summary ?? '0-1 交付进行中',
      artifacts: prev?.artifacts ?? [],
      acceptance,
      nextSteps: []
    }))
  }

  return (
    <div className="nf-app">
      {/* 2026-08-03 v31 A3：工作区总标题（sr-only——读屏文档结构，视觉隐藏） */}
      <h1 className="nf-sr-only">NeonForge 工作区</h1>
      {/* 左：会话区 */}
      <SessionPanel
        problems={problems}
        activeId={activeProblem}
        onSelect={handleSelectProblem}
        onNew={handleNew}
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
            <button type="button" className="nf-session__new" onClick={() => setShowSettings((v) => !v)}><IconSettings size={12} /> 设置</button>
            <button type="button" className="nf-session__new" onClick={onBackStart}>启动页</button>
          </div>
        </header>
        {/* 2026-08-04 UX 修复：0-1 交付流面板移出滚动容器——对话滚动时「模型选择/确认推进」常驻可见（原在 .nf-panel__body 内被对话内容滚出视口——用户找不到推进按钮） */}
        {zeroToOne && (
          <div className="nf-flow__dock">
            <DeliveryFlowPanel onStageChange={handleStageChange} onModelSelect={setFlowModel} />
          </div>
        )}
        <div className="nf-panel__body">
          {chatTab === 'chat' ? (
            <ConversationPanel key={chatKey} rootPath={rootPath} currentFile={activePath} onKeyExpired={onKeyExpired} onWorkingChange={setWorking} externalRequest={rerunRequest} onExternalConsumed={() => setRerunRequest(null)} onToolResult={handleToolResult} onUserMessage={handleUserMessage} recentFilesExternal={projectFiles} stageHint={stageHint} activeAuthorizedLogs={problems.find((p) => p.id === activeProblem)?.snapshot?.authorized} />
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
        onAdjustProblem={() => setChatTab('chat')} /* 2026-08-03 A2 审计修复：继续调整 → 切回对话 Tab（原空函数无反应） */
        onConfirmed={handleConfirmClosed}
        onRerun={(prompt) => setRerunRequest(prompt)}
      />

      {showSettings && <SettingsPanel />}

      {/* 2026-08-03 A4/C3 审计修复：移除硬编码假数据「待审核: 0」+ 状态栏 aria-live（处理中/就绪变化播报） */}
      <footer className="nf-statusbar" role="status" aria-live="polite">
        {working ? (
          <><span className="nf-statusbar__dot nf-statusbar__dot--working" />搭档处理中…</>
        ) : (
          <><span className="nf-statusbar__dot nf-statusbar__dot--ready" />就绪</>
        )}
        {' │ '}{(rootPath ?? '从零开始').split(/[/\\]/).filter(Boolean).pop()}
      </footer>
    </div>
  )
}
