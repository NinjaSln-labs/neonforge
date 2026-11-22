// Electron 可执行文件解析与显示环境命令（跨平台，供 evals/perf 运行器共用）。
const { readFileSync } = require('node:fs')
const path = require('node:path')

function resolveElectronBin(repoRoot) {
  const electronDir = path.join(repoRoot, 'apps/desktop/node_modules/electron')
  try {
    const rel = readFileSync(path.join(electronDir, 'path.txt'), 'utf8').trim()
    if (rel) return path.join(electronDir, 'dist', rel)
  } catch {
    // fall through to legacy Linux layout
  }
  return path.join(electronDir, 'dist/electron')
}

function electronFlags() {
  // macOS 目标机基线保留默认 GPU 路径；WSL/Linux 无头基线固定软件渲染。
  return process.platform === 'darwin' ? [] : ['--disable-gpu', '--no-sandbox']
}

function electronCommand(electronBin) {
  const base =
    process.platform !== 'linux' || process.env.DISPLAY
      ? [electronBin]
      : ['xvfb-run', '-a', '-s', '-screen 0 1280x800x24', electronBin]
  return [...base, ...electronFlags()]
}

function displayMode() {
  if (process.platform === 'darwin') return 'mac-gui'
  return process.env.DISPLAY ? 'host' : 'xvfb'
}

module.exports = { resolveElectronBin, electronFlags, electronCommand, displayMode }
