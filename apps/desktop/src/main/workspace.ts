// workspace：打开文件夹 / 列目录 / 读文件（Main Process，fs 不进 renderer）
import { dialog, BrowserWindow } from 'electron'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import path from 'node:path'
import { slugify, projectBaseDir, initProjectFiles, updateProjectTitle } from './projectInit.js'

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

  // ticket 07：0-1 项目初始化——从零开始 → 创建真实项目目录 + 骨架（Documents/NeonForge/<slug>）
  // 2026-08-04：同名目录已存在 → 自动加序号（slug-2、slug-3…）——绝不覆盖已有项目（用户反馈「会不会改已有目录」）
  initProject(title: string): { ok: true; path: string; title: string } | { ok: false; error: string } {
    try {
      const base = slugify(title)
      let slug = base
      let dir = join(projectBaseDir(), slug)
      let n = 2
      while (existsSync(dir)) {
        slug = `${base}-${n}`
        dir = join(projectBaseDir(), slug)
        n++
      }
      initProjectFiles(dir, title)
      this.currentRoot = dir
      return { ok: true, path: dir, title }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'init-project-failed' }
    }
  }

  // 2026-08-04：需求确认后回写项目标题（README 首行 + package.json name——目录名不变，防路径断裂）
  updateProjectTitle(p: string, title: string): { ok: boolean; error?: string } {
    try {
      updateProjectTitle(p, title)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'update-project-title-failed' }
    }
  }
}

export const workspace = new WorkspaceService()
