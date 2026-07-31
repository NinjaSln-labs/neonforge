import { useEffect, useState } from 'react'
import ConfigPage from './ConfigPage'
import StartPage from './StartPage'
import MainWorkspace from './MainWorkspace'

// ticket 01：骨架；ticket 02：配置页；ticket 03：启动页 + 打开项目 + 文件树

type Screen = 'boot' | 'config' | 'start' | 'workspace' | 'new-project'

export default function App() {
  const [screen, setScreen] = useState<Screen>('boot')
  const [rootPath, setRootPath] = useState<string | null>(null)

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
          onOpenProject={() => { void openExisting() }}
          onNewProject={() => setScreen('new-project')}
        />
      </div>
    )
  }

  if (screen === 'new-project') {
    return (
      <div className="nf-app nf-app--start">
        <div className="nf-start">
          <h1 className="nf-start__brand">NeonForge</h1>
          <p className="nf-start__prompt">从零开始</p>
          <p className="nf-start__hint">新建项目流见 ticket 07，当前为入口占位。</p>
          <button type="button" className="nf-start__link" onClick={() => setScreen('start')}>
            返回启动页
          </button>
        </div>
      </div>
    )
  }

  if (screen === 'workspace' && rootPath) {
    return (
      <MainWorkspace
        rootPath={rootPath}
        onBackStart={() => { setRootPath(null); setScreen('start') }}
        onKeyExpired={() => setScreen('config')}
      />
    )
  }

  return null
}
