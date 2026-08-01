// workspace：打开文件夹 / 列目录 / 读文件（Main Process，fs 不进 renderer）
import { dialog, BrowserWindow } from 'electron'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import path from 'node:path'

const IGNORE = new Set([
  'node_modules', '.git', 'dist', 'out', 'build', 'coverage',
  '.DS_Store', '.vite', '.next', '.turbo', '__pycache__'
])

export interface DirEntry {
  name: string
  path: string
  kind: 'file' | 'dir'
}

export class WorkspaceService {
  private currentRoot: string | null = null
  getCurrentRoot(): string | null { return this.currentRoot }
  setCurrentRoot(p: string | null): void { this.currentRoot = p }

  async openFolder(win: BrowserWindow | null): Promise<string | null> {
    // 测试钩子：跳过系统对话框，直接打开指定目录
    if (process.env.NF_TEST_PROJECT && existsSync(process.env.NF_TEST_PROJECT)) {
      this.currentRoot = process.env.NF_TEST_PROJECT
      return process.env.NF_TEST_PROJECT
    }
    const opts: Electron.OpenDialogOptions = {
      properties: ['openDirectory'],
      title: '打开已有项目'
    }
    const result = win
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts)
    if (result.canceled || result.filePaths.length === 0) return null
    this.currentRoot = result.filePaths[0] ?? null
    return this.currentRoot
  }

  listDir(dirPath: string): DirEntry[] {
    if (!existsSync(dirPath) || !statSync(dirPath).isDirectory()) return []
    const names = readdirSync(dirPath)
    const entries: DirEntry[] = []
    for (const name of names) {
      if (IGNORE.has(name) || name.startsWith('._')) continue
      const full = path.join(dirPath, name)
      try {
        const st = statSync(full)
        entries.push({
          name,
          path: full,
          kind: st.isDirectory() ? 'dir' : 'file'
        })
      } catch {
        // skip unreadable
      }
    }
    entries.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    return entries
  }

  readFile(filePath: string): { ok: true; content: string } | { ok: false; error: string } {
    try {
      const st = statSync(filePath)
      if (!st.isFile()) return { ok: false, error: 'not-a-file' }
      if (st.size > 2 * 1024 * 1024) return { ok: false, error: 'too-large' }
      return { ok: true, content: readFileSync(filePath, 'utf-8') }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'read-failed' }
    }
  }

  // ticket 08d：搭档须知 .neonforge——项目根约定文件（存在则返回内容，无则 null）
  async readNotebook(rootPath: string | null): Promise<{ ok: true; content: string } | { ok: false; error: string } | null> {
    if (!rootPath) return null
    try {
      const p = join(rootPath, '.neonforge')
      if (!existsSync(p)) return null
      return { ok: true, content: readFileSync(p, 'utf-8') }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'notebook-read-failed' }
    }
  }
}

export const workspace = new WorkspaceService()
