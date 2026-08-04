import { useEffect, useState } from 'react'
import ConfigPage from './ConfigPage'
import StartPage from './StartPage'
import MainWorkspace from './MainWorkspace'
import { clearSession } from './sessionStore'
import { saveProblems } from './problemStore'

// ticket 01：骨架；ticket 02：配置页；ticket 03：启动页 + 打开项目 + 文件树

type Screen = 'boot' | 'config' | 'start' | 'workspace' | 'new-project'

export default function App() {
  const [screen, setScreen] = useState<Screen>('boot')
  const [rootPath, setRootPath] = useState<string | null>(null)
  const [zeroToOne, setZeroToOne] = useState(false) // 0-1 交付模式（从零开始——创建项目后仍保持流程）
  // 2026-08-04 启动页方案 A：启动页输入/点选的问题 → 进入工作区后预填对话输入框（不自动发送）
  const [prefillPrompt, setPrefillPrompt] = useState('')

  useEffect(() => {
    let mounted = true
    const bridge = window.neonforge
    if (!bridge?.config?.hasKey) {
      console.error('[App] window.neonforge missing — preload failed')
      setScreen('config')
      return
    }
    void bridge.config.hasKey().then((v) => {
      if (mounted) setScreen(v ? 'start' : 'config')
    }).catch((err) => {
      console.error('[App] hasKey failed', err)
      if (mounted) setScreen('config')
    })
    return () => { mounted = false }
  }, [])

  const openExisting = async () => {
    const path = await window.neonforge.workspace.openFolder()
    if (!path) return
    setRootPath(path)
    setScreen('workspace')
  }

  if (screen === 'boot') return <div className="nf-app" />

  if (screen === 'config') {
    return (
      <div className="nf-app nf-app--config">
        <ConfigPage onDone={() => setScreen('start')} />
      </div>
    )
  }

  if (screen === 'start') {
    return (
      <div className="nf-app nf-app--start">
        <StartPage
          onOpenProject={(prefill) => { setPrefillPrompt(prefill); void openExisting() }}
          onNewProject={(prefill) => { setPrefillPrompt(prefill); clearSession(); saveProblems([]); setRootPath(null); setZeroToOne(true); setScreen('workspace') }}
        />
      </div>
    )
  }

  if (screen === 'workspace') {
    return (
      <MainWorkspace
        rootPath={rootPath ?? null}
        onBackStart={() => { setRootPath(null); setZeroToOne(false); setScreen('start') }}
        onKeyExpired={() => setScreen('config')}
        onProjectCreated={(p) => setRootPath(p)}
        zeroToOneMode={zeroToOne}
        initialPrompt={prefillPrompt}
      />
    )
  }

  return null
}
