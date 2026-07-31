import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { registerIpc } from './ipc.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function createWindow() {
  const preloadPath = path.join(__dirname, '../preload/preload.cjs')
  if (!existsSync(preloadPath)) {
    console.error('[main] preload missing:', preloadPath)
  }

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'NeonForge',
    backgroundColor: '#1a1b1e', // D3 tokens: 深色主题背景
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
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
