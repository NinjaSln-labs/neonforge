import { useCallback, useState } from 'react'
import SessionPanel from './SessionPanel'
import SettingsPanel from './SettingsPanel'
import DeliveryFlowPanel from './DeliveryFlowPanel'
import OutputPanel from './OutputPanel'
import ConversationPanel from './ConversationPanel'
import type { DeliveryPackage, ProblemInstance } from './types'

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
  rootPath: string | null
  onBackStart: () => void
  onKeyExpired: () => void
}) {
  const [chatTab, setChatTab] = useState<'chat' | 'tasks'>('chat')
  const [activePath, setActivePath] = useState<string | null>(null)
  const [content, setContent] = useState<string>('')
  const [working, setWorking] = useState(false)
  const [chatKey, setChatKey] = useState(0)
  const [showSettings, setShowSettings] = useState(false)
  const [deliveryPkg, setDeliveryPkg] = useState<DeliveryPackage | null>(initDeliveryPkg())
  const [problems, setProblems] = useState<ProblemInstance[]>(initProblems())
  const [activeProblem, setActiveProblem] = useState<string | null>(problems[0]?.id ?? null)

function initDeliveryPkg(): DeliveryPackage | null {
  // 演示模式（VITE_NF_DEMO_DELIVERY=1）或测试注入（window.neonforge.demo.delivery）
  const demoEnv = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_NF_DEMO_DELIVERY
  if (demoEnv === '1') {
    return {
      status: 'delivered',
      summary: '整理了 Downloads 里的发票和合同：按类型分类、统一命名、重复文件标出（未删除）',
      artifacts: ['发票/2026-08.xlsx', '合同/2026-07-15-服务协议.pdf', '重复文件清单.csv'],
      acceptance: [
        { label: '发票都在「发票」文件夹', done: false },
        { label: '文件名含日期 + 商户', done: false },
        { label: '重复文件已标出（未删，待你确认）', done: false }
      ],
      nextSteps: [
        '重复文件确认后我帮你删（授权后）',
        '需要发布网站？域名/备案超出数字工具能力——源码已给，我指导你发布'
      ],
      rerunLabel: '上次那个整理，再跑一遍'
    }
  }
  return (window.neonforge as unknown as { demo?: { delivery?: DeliveryPackage } }).demo?.delivery ?? null
}

function initProblems(): ProblemInstance[] {
  const demo = (window.neonforge as unknown as { demo?: { problems?: ProblemInstance[] } }).demo?.problems
  if (demo) return demo
  const demoEnv = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_NF_DEMO_DELIVERY
  if (demoEnv === '1') {
    return [
      { id: 'p1', title: '整理 Downloads 里的发票和合同', status: 'closed', updatedAt: '10:20' },
      { id: 'p2', title: '做一个能发给朋友的旅行手册网页', status: 'awaiting-plan', updatedAt: '11:05' },
      { id: 'p3', title: '把销售表合并出月度图表', status: 'executing', updatedAt: '11:12' }
    ]
  }
  return []
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
      {zeroToOne && <DeliveryFlowPanel />}
      {/* 左：会话区 */}
      <SessionPanel
        problems={problems}
        activeId={activeProblem}
        onSelect={(id) => setActiveProblem(id)}
        onNew={() => { setActiveProblem(null); setChatKey((k) => k + 1) }}
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
      <OutputPanel
        rootPath={rootPath ?? ''}
        activePath={activePath}
        content={content}
        deliveryPkg={deliveryPkg}
        onOpenFile={openFile}
        onCloseProblem={() => setDeliveryPkg((p) => (p ? { ...p, status: 'closed' } : p))}
        onAdjustProblem={() => {}}
      />

      {showSettings && <SettingsPanel />}

      <footer className="nf-statusbar">
        {working ? (
          <>🔵 搭档思考中…</>
        ) : (
          <>🟢 就绪</>
        )}
        {' │ '}{(rootPath ?? '从零开始').split(/[/\\]/).filter(Boolean).pop()} │ 待审核: 0
        <button type="button" className="nf-statusbar__settings" onClick={() => setShowSettings((v) => !v)}>⚙ 设置</button>
      </footer>
    </div>
  )
}
