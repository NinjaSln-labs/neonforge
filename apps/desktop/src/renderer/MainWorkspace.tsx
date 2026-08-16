import { useCallback, useEffect, useRef, useState } from 'react'
import SessionPanel from './SessionPanel'
import SettingsPanel from './SettingsPanel'
// 2026-08-07 无阶段重构 S4：DeliveryFlowPanel（阶段卡/推进按钮/STAGE_HINT）删除——阶段体系移除
import OutputPanel from './OutputPanel'
import ConversationPanel from './ConversationPanel'
import type { DeliveryPackage, ProblemInstance } from './types'
import { createProblem, loadProblems, saveProblems, updateProblemSnapshot } from './problemStore'
import { clearSession } from './sessionStore'
import { IconSettings } from './icons'
// 2026-08-15 Q10：demo 注入通道类型化单例
import { getDemoBridge } from './demoBridge'

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
        <summary>本轮用量</summary>
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
  zeroToOneMode: _zeroToOneMode = false,
  initialPrompt
}: {
  rootPath: string | null
  onBackStart: () => void
  onKeyExpired: () => void
  onProjectCreated?: (path: string) => void
  zeroToOneMode?: boolean
  initialPrompt?: string // 2026-08-04 启动页方案 A：进入工作区预填对话输入框（不自动发送）
}) {
  const [chatTab, setChatTab] = useState<'chat' | 'tasks'>('chat')
  const [activePath, setActivePath] = useState<string | null>(null)
  const [content, setContent] = useState<string>('')
  const [working, setWorking] = useState(false)
  // 2026-08-04 审计修复（D2）：有待批准工具操作（授权卡）——状态栏提示（键盘用户感知，Shift+Tab 可回退到授权卡）
  const [pendingApproval, setPendingApproval] = useState(false)
  // 2026-08-05 用户反馈 2：isActionPromise 状态栏提示（非侵入——不插入对话流）——模型说要做没动手时提示可回复「继续」
  const [actionHint, setActionHint] = useState<string | null>(null)
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
  // 2026-08-04 体验修复：真实文件变更 → 文件树/@mention 刷新（write 成功后用户看不到新文件的根因）
  const [fileTreeRefreshKey, setFileTreeRefreshKey] = useState(0)
  const refreshProjectFiles = () => {
    if (!rootPath) return
    void window.neonforge.workspace.listDir(rootPath).then((entries) =>
      setProjectFiles(entries.filter((e) => e.kind === 'file').map((e) => e.name))
    )
  }
  const lastPromptRef = useRef<string | null>(null) // 最近用户输入——复跑 rerunPrompt 兜底
  const handleToolResult = (r: { name: string; file?: string; ok: boolean }) => {
    if (!r.ok || !r.file) return
    setRealChanges((prev) => (prev.some((c) => c.file === r.file) ? prev : [...prev, { file: r.file as string, op: r.name }]))
    setFileTreeRefreshKey((k) => k + 1) // 文件变更 → 文件树重载
    refreshProjectFiles() // @mention 列表同步
    // 06 断点续做深度（基线 §21）：授权操作记录到问题快照 authorized（跨会话可回溯）
    // 2026-08-06 用户「HUD.js 授权清单记录了两次」：label=[工具名]文件——write+edit 各授权一次 → label 不同 → 两条记录；
    // 修复：按文件去重（同一文件任何工具授权过即视为已授权——TrustLadder 不重复显示）；
    // 举一反三：r.file 是绝对路径（writeExecutor 返回 filePath）→ endsWith 精确匹配唯一标识（不同目录同名文件绝对路径不同不误判；不用 includes 防路径后缀巧合）
    if (activeProblem) {
      setProblems((prev) => prev.map((p) => {
        if (p.id !== activeProblem) return p
        // 2026-08-15 Q9：authorized 结构化（{tool, file}——原 `[工具] 路径` 字符串拼接；旧存档 string 归一后比较）
        const file = r.file as string // 闭包内 narrowing 丢失——外层已守卫 !r.file
        const entry = { tool: r.name, file }
        const rawAuth = (p.snapshot?.authorized ?? []) as Array<{ tool: string; file: string } | string>
        const normalized = rawAuth.map((a) => {
          if (typeof a !== 'string') return a
          const m = a.match(/^\[(.+?)\] (.+)$/)
          return m ? { tool: m[1], file: m[2] } : { tool: 'unknown', file: a }
        })
        const alreadyFile = normalized.some((a) => a.file === r.file)
        if (!alreadyFile) tlog('problem.snapshot_updated', { problemId: activeProblem, field: 'authorized' })
        return alreadyFile ? p : updateProblemSnapshot(p, { authorized: [...normalized, entry] })
      }))
    }
  }
  // 2026-08-04：目标确认回写——模型【目标确认：xxx】→ 更新台账标题/快照 goal + 项目 README（目录名不变）
  // 2026-08-07 无阶段重构 S4：requirementConfirmed → goalConfirmed（目标确认——无阶段下确认「达成什么」）；删 inferFlowModel（模型风格随阶段体系移除）
  const [goalSeq, setGoalSeq] = useState(0) // 2026-08-07 无阶段重构 S4：目标确认次数——每次确认 = 任务边界（信任清除驱动；goalConfirmed 恒 true 后靠它感知新目标）
  // 2026-08-08 会话日志（用户「每次应该是单独的会话日志」）：当前会话 ID——ConversationPanel 挂载（进入对话）生成后上报
  // （MainWorkspace 侧 timeline 事件 goal-confirmed/exec-confirmed 归属同一会话）
  const sessionIdRef = useRef('')
  const handleSessionStart = (id: string) => { sessionIdRef.current = id }
  // 2026-08-15 补齐：问题台账事件（06 §1.7 problem.*——M3 建模后接线）
  const tlog = (type: string, detail: Record<string, unknown>) => {
    try { void window.neonforge.timeline?.log?.({ session: sessionIdRef.current || (rootPath ?? undefined), type, role: 'system', detail }) } catch { /* 日志失败不影响 */ }
  }
  const handleGoalConfirmed = (title: string) => {
    setGoalConfirmed(true) // 目标已确认 → 解锁执行确认卡
    setGoalSeq((s) => s + 1) // 任务边界递增——ConversationPanel clearTrust（授权收回）
    // 2026-08-07 会话时间线（Session Timeline BC）：目标确认事件（来源：模型标记 onGoalConfirmed / 用户打字确认词）
    if (activeProblem) {
      setProblems((prev) => prev.map((p) => p.id === activeProblem
        ? { ...updateProblemSnapshot(p, { goal: title }), title: title.length > 20 ? title.slice(0, 20) + '…' : title }
        : p))
      tlog('problem.snapshot_updated', { problemId: activeProblem, field: 'goal' })
    }
    if (rootPath) void window.neonforge.workspace.updateProjectTitle(rootPath, title)
  }
  // 2026-08-04 P2：目标确认卡确认 → 回写（确定性收敛，不依赖模型标记）
  // 2026-08-07 无阶段重构 S4：不再 handleStageChange（无阶段无推进）——确认目标即结束澄清，进入能力检查/执行方案
  const [goalConfirmed, setGoalConfirmed] = useState(false)
  const [planConfirmed, setPlanConfirmed] = useState(false) // 2026-08-07 无阶段重构 S4：执行方案确认（ExecutionConfirmCard）
  // 2026-08-04 体验修复：需求阶段用户需求文本暂存（无阶段重构 S4：目标文本暂存——「确认目标」兜底回写/注入用——不依赖模型【目标确认：】标记）
  const goalTextRef = useRef('')
  // 2026-08-07 用户决策（行业共识——显式结构化确认，非确认词匹配）：确认全部走对话内嵌确认/拒绝卡片（像授权卡）
  // 目标确认卡【确认目标】→ handleGoalConfirmed；执行确认卡【确认执行】→ handlePlanConfirmed；达成确认卡【已解决】→ goalAchieved
  const handlePlanConfirmed = () => {
    if (!goalConfirmed) handleGoalConfirmed(goalTextRef.current || initialPrompt || '目标已确认')
    setPlanConfirmed(true)
  }
  // 2026-08-15 D1：拒绝路径对称回退（渲染镜像与状态机一致——修复「拒绝被 effect 反转」；状态机权威在 ConversationPanel stateRef）
  const handleGoalRejected = () => {
    setGoalConfirmed(false)
  }
  const handleExecutionRejected = () => {
    setPlanConfirmed(false)
  }
  const handleUserMessage = (text: string) => {
    lastPromptRef.current = text
    // 2026-08-07 用户决策：确认词正则匹配删除（「可以撤销吗」也触发等误触发——行业共识是结构化确认动作）——
    // 确认只走卡片按钮（目标/执行/达成）+ 授权卡
    if (!goalConfirmed) goalTextRef.current = text // 目标未确认时用户说的话即目标描述
    // ticket 07：从零开始 → 首条消息创建真实项目目录（0-1 交付真实执行地基——后续模型在真实项目内 write/read）
    if (!rootPath && onProjectCreated) {
      void window.neonforge.workspace.initProject(text).then((r) => {
        if (r.ok) onProjectCreated(r.path)
      })
    }
    // 06 问题台账：发送 → 创建问题实例（持久化——断点续做基础；同标题复跑 → 更新状态不新增）
    // 2026-08-04 修复：setActiveProblem 移出 setProblems updater（React 严格模式 updater 双调 + updater 内 setState 反模式——activeProblem 设置不可靠，导致目标确认回写台账失败）
    const inst = createProblem(text)
    const dup = problems.find((x) => x.title === inst.title)
    tlog(dup ? 'problem.rerun' : 'problem.created', { problemId: dup ? dup.id : inst.id, title: inst.title })
    setActiveProblem(dup ? dup.id : inst.id)
    setProblems((prev) => {
      if (dup) {
        // 复跑/续做：保留快照（目标更新 + 记录待办）
        const snap = updateProblemSnapshot(dup, {
          goal: text,
          pending: [...(dup.snapshot?.pending ?? []).filter((x) => x !== text).slice(-4), text]
        })
        return [{ ...snap, updatedAt: inst.updatedAt, status: 'executing' as const }, ...prev.filter((x) => x.id !== dup.id)]
      }
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
    tlog('problem.closed', { problemId: activeProblem })
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
  return getDemoBridge()?.delivery ?? null
}

function initProblems(): ProblemInstance[] {
  // 数据源：测试注入（window.neonforge.demo.problems）优先；否则 localStorage 持久化台账（断点续做基础）
  const demo = getDemoBridge()?.problems
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

  // 2026-08-07 无阶段重构 S4：阶段机（flowStage/flowModel/stageHint/stageAdvance/advanceHint/handleStageChange）全部移除——
  // 无阶段流程：目标确认 → 能力检查 → 执行确认 → 达成循环（状态由 goalConfirmed/planConfirmed 表达）

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
        {/* 2026-08-04 UX 修复：0-1 交付流面板移出滚动容器（原在 .nf-panel__body 内被对话内容滚出视口）
            2026-08-07 无阶段重构 S4：阶段卡/推进按钮删除 → 目标确认卡 + 执行确认卡（无阶段交互）
            2026-08-07 无阶段修复（用户「最上面的那块都不需要了」）：dock 顶部全清——GoalCard/执行确认卡都删除，
            确认流程全部走对话（模型【目标确认】标记 / 用户打字确认词）——dock 无任何卡片残留 */}
        <div className="nf-panel__body">
          {chatTab === 'chat' ? (
            <ConversationPanel key={chatKey} rootPath={rootPath} currentFile={activePath} onKeyExpired={onKeyExpired} onWorkingChange={setWorking} onApprovalChange={setPendingApproval} onActionPromiseHint={setActionHint} externalRequest={rerunRequest} onExternalConsumed={() => setRerunRequest(null)} onToolResult={handleToolResult} onUserMessage={handleUserMessage} onGoalConfirmed={handleGoalConfirmed} onPlanConfirmed={handlePlanConfirmed} onGoalRejected={handleGoalRejected} onPlanRejected={handleExecutionRejected} goalConfirmed={goalConfirmed} planConfirmed={planConfirmed} goalSeq={goalSeq} recentFilesExternal={projectFiles} initialPrompt={initialPrompt} onSessionStart={handleSessionStart} activeAuthorizedLogs={problems.find((p) => p.id === activeProblem)?.snapshot?.authorized} />
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
        fileTreeRefreshKey={fileTreeRefreshKey}
      />

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      {/* 2026-08-03 A4/C3 审计修复：移除硬编码假数据「待审核: 0」+ 状态栏 aria-live（处理中/就绪变化播报）
          2026-08-04 D2：待批准工具操作（授权卡）——状态栏 amber 提示（键盘用户感知） */}
      <footer className="nf-statusbar" role="status" aria-live="polite">
        {working ? (
          <><span className="nf-statusbar__dot nf-statusbar__dot--working" />搭档处理中…</>
        ) : pendingApproval ? (
          <><span className="nf-statusbar__dot nf-statusbar__dot--approval" />有操作待你批准（对话区授权卡）</>
        ) : actionHint ? (
          <><span className="nf-statusbar__dot nf-statusbar__dot--hint" />{actionHint}</>
        ) : (
          <><span className="nf-statusbar__dot nf-statusbar__dot--ready" />就绪</>
        )}
        {' │ '}{(rootPath ?? '从零开始').split(/[/\\]/).filter(Boolean).pop()}
      </footer>
    </div>
  )
}
