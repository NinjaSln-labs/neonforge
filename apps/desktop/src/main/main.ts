import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { registerIpc } from './ipc.js'

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
    registerIpc()
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
