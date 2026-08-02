// 0-1 项目初始化（ticket 07 真实执行地基）：从零开始 → 创建真实项目目录 + 骨架
// 纯逻辑模块（无 electron 依赖——可独立测试）；workspace 调用
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// 标题 → 目录 slug（小写/非字母数字转 -/限 30 字符；中文保留）
export function slugify(title: string): string {
  const s = String(title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
  return s || 'untitled'
}

// V1 项目基目录：用户 Documents/NeonForge（持久——非临时目录）
export function projectBaseDir(): string {
  return path.join(os.homedir(), 'Documents', 'NeonForge')
}

// 创建项目目录 + 基础骨架（README/package.json/src/index.ts）
export function initProjectFiles(dir: string, title: string): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'README.md'), `# ${title}\n\n> NeonForge 0-1 项目——需求驱动交付\n`, 'utf-8')
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: slugify(title), version: '0.1.0', private: true }, null, 2) + '\n', 'utf-8')
  mkdirSync(path.join(dir, 'src'), { recursive: true })
  writeFileSync(path.join(dir, 'src', 'index.ts'), `// ${title}\n// NeonForge 生成的骨架——从这里开始\n`, 'utf-8')
}
