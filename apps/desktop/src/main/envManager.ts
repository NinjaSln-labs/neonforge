// 环境管理领域层（2026-08-06 尽调调研驱动——5 源交叉验证：tavily/serper 双源 + oh-my-pi 环境 overlay 集中准备 + deepcode workflow_context 纯数据建模 + reasonix 路径边界）
// DDD：Value Object（ProjectEnvironment）+ Domain Service（EnvironmentDetector/EnvironmentRegistry）+ 端口分配器
// 核心原则「环境单源」：检测（check-env 生成签名）→ 记录（Registry）→ 使用（spawn 统一 buildSpawnEnv 注入）——检测时确认的环境 = 使用时用的环境
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
  // runtime 类型 + 版本（node 优先——package.json 存在即 node 项目；否则探测 python）
  let runtime: ProjectEnvironment['runtime'] = 'none'
  let runtimeVersion = ''
  if (hasPackageJson) {
    runtime = 'node'
    try {
      const v = execFileSync('node', ['--version'], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).toString().trim()
      runtimeVersion = v
    } catch { runtimeVersion = '未知（node 不在 PATH）' }
  } else if (fsExists(path.join(rootPath, 'requirements.txt')) || fsExists(path.join(rootPath, 'pyproject.toml'))) {
    runtime = 'python'
    try {
      const v = execFileSync('python3', ['--version'], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).toString().trim()
      runtimeVersion = v
    } catch { runtimeVersion = '未知（python3 不在 PATH）' }
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
  return { rootPath, runtime, runtimeVersion, hasPackageJson, hasNodeModules, packageManager, toolchain, servicePort: 0, signature }
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

// 外部扩展能力检测（装了没 + Status——reasonix Status：装了但 failed=不可用）
export function detectExternalCapabilities(rootPath: string): Capability[] {
  const caps: Capability[] = []
  // node runtime（开发/起服务/多数工具依赖）
  const node = tryExec('node', ['--version'])
  caps.push({ id: 'node-runtime', category: 'external', status: node ? 'ready' : 'missing', implementations: ['node'], detail: node ?? undefined })
  // python runtime（脚本/Office 操作可能用）
  const py = tryExec('python3', ['--version']) ?? tryExec('python', ['--version'])
  caps.push({ id: 'python-runtime', category: 'external', status: py ? 'ready' : 'missing', implementations: ['python3', 'python'], detail: py ?? undefined })
  // 电子表格能力（任一实现即可——openpyxl 或 exceljs——不绑定具体工具：坑 74 教训）
  const hasOpenpyxl = !!tryExec('python3', ['-c', 'import openpyxl'])
  const hasExceljs = !!(rootPath && fsExists(path.join(rootPath, 'node_modules', 'exceljs'))) || !!tryExec('node', ['-e', 'require("exceljs")'])
  const spreadsheetImpls: string[] = []
  if (hasOpenpyxl) spreadsheetImpls.push('openpyxl')
  if (hasExceljs) spreadsheetImpls.push('exceljs')
  caps.push({
    id: 'spreadsheet', category: 'external',
    status: spreadsheetImpls.length > 0 ? 'ready' : (caps.find((c) => c.id === 'python-runtime')?.status === 'ready' ? 'missing' : 'missing'),
    implementations: spreadsheetImpls,
    requires: ['python-runtime'],
    detail: spreadsheetImpls.length > 0 ? `可用：${spreadsheetImpls.join('/')}` : '未装（openpyxl 或 exceljs 任一即可）'
  })
  // PPT 能力（python-pptx）
  const hasPptx = !!tryExec('python3', ['-c', 'import pptx'])
  caps.push({
    id: 'ppt', category: 'external', status: hasPptx ? 'ready' : 'missing',
    implementations: hasPptx ? ['python-pptx'] : [], requires: ['python-runtime'],
    detail: hasPptx ? '可用：python-pptx' : '未装（pip install python-pptx）'
  })
  // 项目依赖（node_modules/.bin——开发工具 vite 等）
  const binDir = path.join(rootPath, 'node_modules', '.bin')
  const hasDevTools = fsExists(binDir)
  let devTools: string[] = []
  if (hasDevTools) { try { devTools = readdirSync(binDir).filter((n) => !n.startsWith('.')).slice(0, 10) } catch { devTools = [] } }
  caps.push({
    id: 'dev-tools', category: 'external', status: hasDevTools ? 'ready' : 'missing',
    implementations: devTools, requires: ['node-runtime'],
    detail: hasDevTools ? `可用工具：${devTools.slice(0, 5).join(', ')}…` : 'node_modules 未装（先 npm install）'
  })
  return caps
}

// 能力检测汇总（平台原生 + 外部扩展——check-env 能力视图）
export function detectCapabilities(rootPath: string, platform: NodeJS.Platform = process.platform): Capability[] {
  const system = SYSTEM_CAPABILITIES[platform] ?? SYSTEM_CAPABILITIES.darwin
  return [...system, ...detectExternalCapabilities(rootPath)]
}

// 查能力（按 id——CapabilityResolver 查询接口）
export function getCapability(rootPath: string, id: string): Capability | undefined {
  return detectCapabilities(rootPath).find((c) => c.id === id)
}
