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

  if (screen === 'workspace') {
    return (
      <MainWorkspace
        rootPath={rootPath ?? null}
        onBackStart={() => { setRootPath(null); setScreen('start') }}
        onKeyExpired={() => setScreen('config')}
      />
    )
  }

  return null
}
