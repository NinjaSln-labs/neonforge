// e2e 启动前置：坑 44 流程化——检测 dist/main 是否过期（改 main/preload 后自动 build:main）
// 2026-08-21：e2e-0to1.mjs / e2e-suite.mjs / e2e-supplement.mjs 共用——根治「e2e 加载旧产物」踩坑
// 2026-09-05：坑 14 流程化——e2e 前置目录自动创建（macOS/WSL 重启清 /tmp 后 openFolder 走系统对话框返回 null）
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

export function ensureMainBuild(cwd = process.cwd()) {
  // 坑 14：NF_TEST_PROJECT 目录必须已存在（openFolder 对不存在目录走系统对话框 → null → 进不了工作区）
  const e2eDir = '/tmp/nf-e2e-test'
  if (!fs.existsSync(e2eDir)) {
    fs.mkdirSync(e2eDir, { recursive: true })
    console.log(`ℹ️ e2e 前置目录已创建：${e2eDir}（坑 14 流程化）`)
  }
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
