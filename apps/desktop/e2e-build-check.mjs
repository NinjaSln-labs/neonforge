// e2e 启动前置：坑 44 流程化——检测 dist/main 是否过期（改 main/preload 后自动 build:main）
// 2026-08-21：e2e-0to1.mjs / e2e-suite.mjs / e2e-supplement.mjs 共用——根治「e2e 加载旧产物」踩坑
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

export function ensureMainBuild(cwd = process.cwd()) {
  const distMain = path.join(cwd, 'dist/main/main.js')
  if (!fs.existsSync(distMain)) {
    console.log('ℹ️ dist/main 不存在——构建 main…')
    execSync('npm run build:main', { stdio: 'inherit', cwd })
    return
  }
  const distTime = fs.statSync(distMain).mtimeMs
  const mainSrcDir = path.join(cwd, 'src/main')
  const stale = fs
    .readdirSync(mainSrcDir)
    .filter((f) => f.endsWith('.ts'))
    .some((f) => fs.statSync(path.join(mainSrcDir, f)).mtimeMs > distTime)
  const preloadSrc = path.join(cwd, 'src/preload/preload.ts')
  const preloadCjs = path.join(cwd, 'dist/preload/preload.cjs')
  const preloadStale =
    fs.existsSync(preloadSrc) &&
    (!fs.existsSync(preloadCjs) ||
      fs.statSync(preloadSrc).mtimeMs > fs.statSync(preloadCjs).mtimeMs)
  if (stale || preloadStale) {
    console.log('ℹ️ main/preload 源码比 dist 新——重新构建…')
    execSync('npm run build:main', { stdio: 'inherit', cwd })
  }
}
