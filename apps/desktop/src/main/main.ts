import { app, BrowserWindow, Menu } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { registerIpc } from './ipc.js'
import { killAllSubprocesses } from './tools.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 单实例（2026-08-03 优化）：同时只能运行一个 NeonForge——第二个实例启动即退出，并聚焦已有实例主窗口
// 必须在 app ready 前获取锁；锁按 app 用户数据目录（app name）作用域
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  function createWindow() {
    const preloadPath = path.join(__dirname, '../preload/preload.cjs')
    if (!existsSync(preloadPath)) {
      console.error('[main] preload missing:', preloadPath)
    }

    const win = new BrowserWindow({
      width: 1280,
      height: 800,
      // 2026-08-04 审计修复（D1）：三栏布局（240+1fr+380）最小可用宽度——窄窗中栏被挤压至 278px 不可用（实测 900×600）
      minWidth: 1080,
      minHeight: 680,
      show: false, // 等 ready-to-show 再显示——避免启动闪烁（默认最大化）
      title: 'NeonForge',
      backgroundColor: '#1a1b1e', // D3 tokens: 深色主题背景
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })

    // 启动默认最大化（2026-08-03 用户优化）——铺满屏幕但保留标题栏/菜单栏
    // v38 修复：macOS 窗口状态恢复（restorable——记住上次关闭的窗口 frame）可能在显示时覆盖 maximize
    // → 先 show 再延迟 maximize——上次非最大化关闭也不残留，启动必铺满（「有时候不是全屏」根治）
    win.once('ready-to-show', () => {
      win.show()
      setTimeout(() => { if (!win.isDestroyed()) win.maximize() }, 30)
    })

    win.webContents.on('preload-error', (_e, pathFailed, err) => {
      console.error('[main] preload-error', pathFailed, err)
    })

    // V1 仅深色主题（D0 §8 / D3 tokens）
    if (process.env.VITE_DEV_SERVER_URL) {
      win.loadURL(process.env.VITE_DEV_SERVER_URL)
    } else {
      win.loadFile(path.join(__dirname, '../renderer/index.html'))
    }

    if (process.env.NF_DEBUG === '1') {
      win.webContents.openDevTools({ mode: 'detach' })
    }
  }

  app.whenReady().then(() => {
    // 2026-08-05 用户反馈（「启动清固定端口会误杀用户进程」→ 修正）：只清 NeonForge 自己记录的子进程（PID 文件）
    // ——不碰任何端口/用户进程；上次异常退出（SIGKILL）残留的 dev server 在此清理
    killAllSubprocesses()
    // 2026-08-04 体验修复：隐藏默认应用菜单（全屏时顶部不再显示「Electron」菜单栏——产品化；Cmd+Q/Cmd+C 等系统快捷键仍由窗口/系统兜底）
    Menu.setApplicationMenu(null)
    registerIpc()
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    // 2026-08-05 用户反馈 1：关窗也清理子进程（单窗口应用——关窗即退出语义；macOS 不 quit 但清理残留）
    killAllSubprocesses()
    if (process.platform !== 'darwin') app.quit()
  })

  // 2026-08-05 用户反馈 1（服务反复起/端口冲突）：app 退出时清理所有 bash 子进程
  // （模型起的 dev server 是 detached 进程组——exec 时代残留孤儿 → 下次会话端口被占 → 模型反复换端口）
  app.on('before-quit', () => {
    killAllSubprocesses()
  })

  // 2026-08-05：外部终止（SIGTERM——playwright close/系统关闭）不走 before-quit——兜底清理
  process.on('SIGTERM', () => {
    killAllSubprocesses()
    process.exit(0)
  })
}
