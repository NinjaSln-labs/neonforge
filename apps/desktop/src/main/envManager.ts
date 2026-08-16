// 环境管理领域层（2026-08-06 尽调调研驱动——5 源交叉验证：tavily/serper 双源 + oh-my-pi 环境 overlay 集中准备 + deepcode workflow_context 纯数据建模 + reasonix 路径边界）
// DDD：Value Object（ProjectEnvironment）+ Domain Service（EnvironmentDetector/EnvironmentRegistry）+ 端口分配器
// 核心原则「环境单源」：检测（check-capability 生成签名）→ 记录（Registry）→ 使用（spawn 统一 buildSpawnEnv 注入）——检测时确认的环境 = 使用时用的环境
// 纯逻辑可测（无 Electron 依赖——fs/node 命令注入 detect 内部，buildSpawnEnv/端口分配纯函数）

import { execFileSync } from 'node:child_process'
import { existsSync as fsExists, readdirSync } from 'node:fs'
import path from 'node:path'

// 宿主保留端口（NeonForge 自身用——与 serviceManager HOST_RESERVED_PORTS 同源语义）
export const HOST_RESERVED_PORTS = new Set([5173, 5175])

// === Value Object: 项目环境（纯数据 + 派生属性——deepcode workflow_context「pure data + derived」建模） ===
export interface ProjectEnvironment {
  rootPath: string
  runtime: 'node' | 'python' | 'none' // 检测到的 runtime 类型
  runtimeVersion: string // 如 v20.11.0
  hasPackageJson: boolean
  hasNodeModules: boolean
  packageManager: string // npm / pnpm / yarn / ''
  toolchain: string[] // 项目 node_modules/.bin 里的关键工具（vite 等）
  servicePort: number // Registry 分配的端口（0=未分配）
  signature: string // 检测指纹（runtime+version+deps 关键项 hash）——跨会话校验用
  // 2026-08-07 能力对齐（调研定论：环境=事实来源，能力=语义视图——消除双源 exec）：
  // 宿主 runtime 可用性（独立于项目 package.json——node/python 是否在 PATH 可执行）
  // status: ready（可用）/ missing（未装——ENOENT）/ failed（装了但不可用——超时/权限等，坑 83 Status 语义）
  systemRuntime: { node: { version: string; status: 'ready' | 'missing' | 'failed' }; python: { version: string; status: 'ready' | 'missing' | 'failed' } }
}

// 宿主 runtime 探测（ENOENT=未装 missing；其他异常=装了不可用 failed——区分 Status 语义，坑 83）
function tryVersion(cmd: string, args: string[]): { version: string; status: 'ready' | 'missing' | 'failed' } {
  try {
    return { version: execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).toString().trim(), status: 'ready' }
  } catch (e) {
    const code = (e as NodeJS.ErrnoException | null)?.code
    if (code === 'ENOENT') return { version: '', status: 'missing' }
    return { version: '', status: 'failed' } // 在 PATH 但不可用（超时/权限/损坏）——Status「装了但 failed=不可用」
  }
}

// 派生：node_modules/.bin 是否可注入 PATH（服务/命令执行环境）
export function binDirOf(env: ProjectEnvironment): string {
  return path.join(env.rootPath, 'node_modules', '.bin')
}

// === Domain Service: EnvironmentDetector——检测项目结构生成 ProjectEnvironment ===
export function detectEnvironment(rootPath: string): ProjectEnvironment {
  const packageJsonPath = path.join(rootPath, 'package.json')
  const hasPackageJson = fsExists(packageJsonPath)
  const hasNodeModules = fsExists(path.join(rootPath, 'node_modules'))
  let packageManager = ''
  if (hasPackageJson) {
    if (fsExists(path.join(rootPath, 'package-lock.json'))) packageManager = 'npm'
    else if (fsExists(path.join(rootPath, 'pnpm-lock.yaml'))) packageManager = 'pnpm'
    else if (fsExists(path.join(rootPath, 'yarn.lock'))) packageManager = 'yarn'
  }
  // runtime 类型 + 版本——2026-08-07 能力对齐：宿主 runtime 检测一次（systemRuntime——能力检测事实来源，消除双源 exec），
  // 项目 runtime 从 systemRuntime 推导（package.json 存在 → node 项目——版本取宿主检测结果，不重复 exec）
  const sysNode = tryVersion('node', ['--version'])
  const sysPython = tryVersion('python3', ['--version'])
  const sysPythonAlt = sysPython.status === 'missing' ? tryVersion('python', ['--version']) : sysPython
  let runtime: ProjectEnvironment['runtime'] = 'none'
  let runtimeVersion = ''
  if (hasPackageJson) {
    runtime = 'node'
    runtimeVersion = sysNode.version || (sysNode.status === 'failed' ? '未知（node 不可用）' : '未知（node 不在 PATH）')
  } else if (fsExists(path.join(rootPath, 'requirements.txt')) || fsExists(path.join(rootPath, 'pyproject.toml'))) {
    runtime = 'python'
    runtimeVersion = sysPythonAlt.version || (sysPythonAlt.status === 'failed' ? '未知（python 不可用）' : '未知（python3 不在 PATH）')
  }
  // 工具链：node_modules/.bin 里的可执行项（vite 等——起服务/跑测试常用）
  let toolchain: string[] = []
  const binDir = path.join(rootPath, 'node_modules', '.bin')
  if (hasNodeModules && fsExists(binDir)) {
    try {
      toolchain = readdirSync(binDir)
        .filter((n) => !n.startsWith('.'))
        .slice(0, 30) // 只取前 30 个（防超大列表）
    } catch { toolchain = [] }
  }
  // 签名：runtime + version + 关键文件存在性（跨会话校验——变了重新检测）
  const signature = [runtime, runtimeVersion, String(hasNodeModules), packageManager].join('|')
  return {
    rootPath, runtime, runtimeVersion, hasPackageJson, hasNodeModules, packageManager, toolchain, servicePort: 0, signature,
    systemRuntime: { node: { version: sysNode.version, status: sysNode.status }, python: { version: sysPythonAlt.version, status: sysPythonAlt.status } }
  }
}

// === Domain Service: EnvironmentRegistry——记录/校验/端口分配/环境提供 ===
const envs = new Map<string, ProjectEnvironment>()
const usedPorts = new Set<number>([...HOST_RESERVED_PORTS]) // 保留端口计入已用——分配器避开
let nextPort = 5190

export function getEnvironment(rootPath: string): ProjectEnvironment | undefined {
  return envs.get(rootPath)
}

export function registerEnvironment(env: ProjectEnvironment): void {
  envs.set(env.rootPath, env)
}

// 校验：签名变了（依赖/runtime 变化）→ 重新检测
export function ensureEnvironment(rootPath: string): ProjectEnvironment {
  const cur = envs.get(rootPath)
  const fresh = detectEnvironment(rootPath)
  if (cur && cur.signature === fresh.signature) return cur
  fresh.servicePort = cur?.servicePort ?? 0 // 端口保留（环境没变时）
  envs.set(rootPath, fresh)
  return fresh
}

// 端口分配器：显式分配独立端口（5190 起递增，避开保留端口 + 已用端口）——vite 显式 --port 有效（--port 0 无效——坑 77）
// 2026-08-06 修正：端口分配独立记录（portByRoot）——未注册项目也能分配/释放/复用（原来依赖 envs——未注册不记忆 → 重复分配）
const portByRoot = new Map<string, number>()
export function allocatePort(rootPath: string): number {
  const existing = portByRoot.get(rootPath)
  if (existing) return existing
  let port = nextPort
  while (usedPorts.has(port)) port += 1
  usedPorts.add(port)
  nextPort = port + 1
  portByRoot.set(rootPath, port)
  const cur = envs.get(rootPath)
  if (cur) { cur.servicePort = port; envs.set(rootPath, cur) }
  return port
}

export function releasePort(rootPath: string): void {
  const p = portByRoot.get(rootPath)
  if (p) {
    usedPorts.delete(p)
    portByRoot.delete(rootPath)
    const cur = envs.get(rootPath)
    if (cur) { cur.servicePort = 0; envs.set(rootPath, cur) }
  }
}

// 端口是否被本 Registry 分配/保留
export function isPortAllocated(port: number): boolean {
  return usedPorts.has(port)
}

// === 环境使用（spawn 统一注入——环境单源）：项目 node_modules/.bin 入 PATH——任何 npm 本地工具可跑（非 vite 特判——通用机制） ===
export function buildSpawnEnv(rootPath: string, baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...baseEnv }
  const binDir = path.join(rootPath, 'node_modules', '.bin')
  if (fsExists(binDir)) {
    env.PATH = `${binDir}:${env.PATH ?? ''}`
  }
  return env
}

// 服务命令端口规范化：vite 类命令注入/替换显式端口（--port 0 无效——vite 忽略 0 用默认 5173；显式端口有效）
export function normalizeServerCommand(cmd: string, port: number): string {
  const c = cmd.trim()
  const isVite = /^npx vite/.test(c) || /^vite( |$)/.test(c)
  if (!isVite) return c
  if (/--port\s+0/.test(c)) return c.replace(/--port\s+0/, `--port ${port}`)
  if (!/--port/.test(c)) return `${c} --port ${port}`
  return c // 已有显式端口——模型自己指定（尊重）
}

// === 2026-08-06 能力模型（坑 83 尽调确认——用户「能力才是要检测的东西」+ reasonix Capability 最完整实现 + arXiv「能力=抽象 vs 技能=实现」+ MCP-Zero 缺口获取） ===
// DDD：Value Object（Capability）+ Domain Service（CapabilityRegistry——平台原生清单按 OS + 外部扩展检测 Status/Requires）

export interface Capability {
  id: string // 能力名（文本编辑/文本搜索/node-runtime/python-runtime/spreadsheet……）
  category: 'system' | 'external' // 系统原生（无需安装）/ 外部扩展（需安装）
  status: 'ready' | 'missing' | 'failed' // reasonix Status 简化：ready 可用 / missing 未装 / failed 装了不可用
  implementations: string[] // 实现清单（跨平台——同一能力不同实现：grep/Select-String 都是「文本搜索」）
  requires?: string[] // 依赖能力（reasonix Requires——改 Excel 依赖 python-runtime）
  detail?: string // 检测细节（版本/路径）
}

function tryExec(cmd: string, args: string[]): string | null {
  try {
    return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).toString().trim()
  } catch { return null }
}

// === Domain Service: CapabilityRegistry——平台原生清单（按 OS）+ 外部扩展检测 ===
// 平台原生能力：系统自带无需安装（mac/windows 实现差异——能力抽象层）
const SYSTEM_CAPABILITIES: Record<string, Capability[]> = {
  darwin: [
    { id: 'filesystem', category: 'system', status: 'ready', implementations: ['内置 read/edit/文件操作'] },
    { id: 'text-edit', category: 'system', status: 'ready', implementations: ['内置 edit 工具'] },
    { id: 'text-search', category: 'system', status: 'ready', implementations: ['grep', 'rg'] },
    { id: 'file-list', category: 'system', status: 'ready', implementations: ['ls'] },
    { id: 'file-move', category: 'system', status: 'ready', implementations: ['mv'] },
    { id: 'shell', category: 'system', status: 'ready', implementations: ['zsh/bash'] }
  ],
  win32: [
    { id: 'filesystem', category: 'system', status: 'ready', implementations: ['内置 read/edit/文件操作'] },
    { id: 'text-edit', category: 'system', status: 'ready', implementations: ['内置 edit 工具'] },
    { id: 'text-search', category: 'system', status: 'ready', implementations: ['Select-String', 'findstr'] },
    { id: 'file-list', category: 'system', status: 'ready', implementations: ['dir'] },
    { id: 'file-move', category: 'system', status: 'ready', implementations: ['Move-Item'] },
    { id: 'shell', category: 'system', status: 'ready', implementations: ['PowerShell'] }
  ]
}

// 外部扩展能力检测（Status——2026-08-07 能力对齐：从 Environment.systemRuntime 推导，不重复 exec——环境=事实来源）
// status 语义（坑 83 reasonix Entry Status）：ready 可用 / missing 未装（ENOENT）/ failed 装了但不可用（超时/权限/损坏）
export function detectExternalCapabilities(rootPath: string, env?: ProjectEnvironment): Capability[] {
  const e = env ?? detectEnvironment(rootPath)
  const caps: Capability[] = []
  // node runtime（开发/起服务/多数工具依赖）——从宿主检测推导（消除双源 exec——原独立 tryExec node 与 detectEnvironment 重复）
  const node = e.systemRuntime.node
  caps.push({
    id: 'node-runtime', category: 'external', status: node.status,
    implementations: ['node'], detail: node.status === 'ready' ? node.version : (node.status === 'failed' ? 'node 在 PATH 但不可用（超时/损坏）' : 'node 未安装（brew install node / 官网安装）')
  })
  // python runtime（脚本/Office 操作可能用）
  const py = e.systemRuntime.python
  caps.push({
    id: 'python-runtime', category: 'external', status: py.status,
    implementations: ['python3', 'python'], detail: py.status === 'ready' ? py.version : (py.status === 'failed' ? 'python 在 PATH 但不可用' : 'python3 未安装')
  })
  // 电子表格能力（任一实现即可——openpyxl 或 exceljs——不绑定具体工具：坑 74 教训）——实现检测按各自 runtime 门控（openpyxl←python、exceljs←node）
  const spreadsheetImpls: string[] = []
  if (py.status === 'ready') {
    const hasOpenpyxl = !!tryExec('python3', ['-c', 'import openpyxl'])
    if (hasOpenpyxl) spreadsheetImpls.push('openpyxl')
  }
  if (node.status === 'ready') { // 2026-08-08 门控修正：exceljs 是 node 库——原被 py 门控（逻辑瑕疵）——按 node 状态检测
    const hasExceljs = !!(rootPath && fsExists(path.join(rootPath, 'node_modules', 'exceljs'))) || !!tryExec('node', ['-e', 'require("exceljs")'])
    if (hasExceljs) spreadsheetImpls.push('exceljs')
  }
  caps.push({
    id: 'spreadsheet', category: 'external',
    status: spreadsheetImpls.length > 0 ? 'ready' : 'missing',
    implementations: spreadsheetImpls,
    requires: ['python-runtime'],
    detail: spreadsheetImpls.length > 0 ? `可用：${spreadsheetImpls.join('/')}` : (py.status !== 'ready' ? 'python 不可用（装 python 后 pip install openpyxl）' : '未装（openpyxl 或 exceljs 任一即可）')
  })
  // PPT 能力（python-pptx）——python 可用才检测
  let hasPptx = false
  if (py.status === 'ready') hasPptx = !!tryExec('python3', ['-c', 'import pptx'])
  caps.push({
    id: 'ppt', category: 'external', status: hasPptx ? 'ready' : 'missing',
    implementations: hasPptx ? ['python-pptx'] : [], requires: ['python-runtime'],
    detail: hasPptx ? '可用：python-pptx' : (py.status !== 'ready' ? 'python 不可用' : '未装（pip install python-pptx）')
  })
  // 项目依赖（node_modules/.bin——开发工具 vite 等）——从 env.toolchain 推导（消除重复 readdirSync）
  caps.push({
    id: 'dev-tools', category: 'external', status: e.toolchain.length > 0 ? 'ready' : 'missing',
    implementations: e.toolchain, requires: ['node-runtime'],
    detail: e.toolchain.length > 0 ? `可用工具：${e.toolchain.slice(0, 5).join(', ')}…` : 'node_modules 未装（先 npm install）'
  })
  return caps
}

// 能力检测汇总（平台原生 + 外部扩展——check-capability 能力视图）
// 2026-08-07 Ledger 应用（坑 83 ⑥——自学习）：本会话内有执行失败记录的能力 → status 降级 failed（真实可用性从执行结果学习）
// 2026-08-08 单源修复（HANDOFF §3 环境/能力双源）：接受可选 env——调用方已检测（checkEnvironment/ensureEnvironment）则复用，
// 不重复 detectEnvironment（原 check-capability 一次调用 exec node/python 各 2 次——入口重复检测）
export function detectCapabilities(rootPath: string, platform: NodeJS.Platform = process.platform, env?: ProjectEnvironment): Capability[] {
  const system = SYSTEM_CAPABILITIES[platform] ?? SYSTEM_CAPABILITIES.darwin
  const e = env ?? detectEnvironment(rootPath) // 环境是事实来源——能力是视图；已检测则复用（单源）
  const caps = [...system, ...detectExternalCapabilities(rootPath, e)]
  const failed = capabilityFailedRefs.get(rootPath)
  if (failed && failed.size > 0) {
    for (const c of caps) {
      if (failed.has(c.id)) {
        c.status = 'failed'
        c.detail = c.detail ? `${c.detail}（本会话执行失败记录——状态降级）` : '本会话执行失败记录——状态降级'
      }
    }
  }
  return caps
}

// 查能力（按 id——CapabilityResolver 查询接口）
export function getCapability(rootPath: string, id: string): Capability | undefined {
  return detectCapabilities(rootPath).find((c) => c.id === id)
}

// === 2026-08-07 Ledger 结果回填（坑 83 教训 ⑥——自学习进化锚点：能力真实可用性从执行结果学习） ===
// 方案：执行失败（bash exit≠0 / 命令归因到能力）→ 记录失败 → 后续 check-capability 该能力 status 降级 failed；
// 成功执行 → 清除失败记录（能力恢复）。会话内有效（能力状态随环境变化，检测是事实来源）。
const capabilityFailedRefs = new Map<string, Set<string>>() // rootPath → 失败过的 capabilityId 集合

export function recordCapabilityResult(rootPath: string, capabilityId: string, ok: boolean): void {
  const set = capabilityFailedRefs.get(rootPath) ?? new Set<string>()
  if (ok) set.delete(capabilityId)
  else set.add(capabilityId)
  capabilityFailedRefs.set(rootPath, set)
}

// 命令失败归因到能力（bash exit≠0 时调用——按命令内容归因，非穷举白名单——常见 runtime/包管理命令）
export function attributeCommandFailure(rootPath: string, cmd: string): void {
  const c = cmd.trim()
  if (/(^|\s)(node|npx)(\s|$)/.test(c) || /(^|\s)(npm|pnpm|yarn)(\s|$)/.test(c)) recordCapabilityResult(rootPath, 'node-runtime', false)
  if (/(^|\s)python3?(\s|$)/.test(c)) recordCapabilityResult(rootPath, 'python-runtime', false)
  if (/(^|\s)(npm|pnpm|yarn)(\s|$)/.test(c)) recordCapabilityResult(rootPath, 'dev-tools', false)
}
