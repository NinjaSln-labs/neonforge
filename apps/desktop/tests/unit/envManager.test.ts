import { describe, it, expect, vi } from 'vitest'

// 2026-08-06 补充：buildSpawnEnv 依赖 fs.existsSync（.bin 目录存在才注入 PATH）——测试 mock fs（含 node_modules/.bin 的路径视为存在）
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: (p: string) => typeof p === 'string' && p.includes('node_modules/.bin')
  }
})

import { normalizeServerCommand, allocatePort, releasePort, buildSpawnEnv, HOST_RESERVED_PORTS, detectCapabilities, recordCapabilityResult, attributeCommandFailure } from '../../src/main/envManager'

// 环境管理领域层（2026-08-06 尽调调研驱动——环境单源：检测→记录→使用；显式端口替换 --port 0；.bin PATH 注入通用机制）

describe('normalizeServerCommand（服务命令端口规范化——显式端口替换 --port 0）', () => {
  it('`--port 0` → 替换为显式端口（坑 77：vite 忽略 0 用默认 5173——显式端口有效）', () => {
    expect(normalizeServerCommand('vite --port 0', 5190)).toBe('vite --port 5190')
    expect(normalizeServerCommand('npx vite --port 0', 5191)).toBe('npx vite --port 5191')
  })

  it('无 --port 的 vite 命令 → 注入显式端口（不注入 0——无效）', () => {
    expect(normalizeServerCommand('npx vite', 5192)).toBe('npx vite --port 5192')
    expect(normalizeServerCommand('vite', 5193)).toBe('vite --port 5193')
  })

  it('已有显式端口 → 尊重（不覆盖模型指定的）', () => {
    expect(normalizeServerCommand('vite --port 5200', 5194)).toBe('vite --port 5200')
  })

  it('非 vite 命令 → 原样（npm run dev 等——脚本内部端口不可控）', () => {
    expect(normalizeServerCommand('npm run dev', 5195)).toBe('npm run dev')
  })
})

describe('端口分配器（显式独立端口——避开宿主保留 + 已用）', () => {

  it('分配避开保留端口 5173/5175（5190 起）', () => {
    const p = allocatePort('/test/proj1')
    expect(HOST_RESERVED_PORTS.has(p)).toBe(false)
    expect(p).toBeGreaterThanOrEqual(5190)
  })

  it('多项目分配不同端口（互不冲突——多项目并行环境隔离）', () => {
    const p1 = allocatePort('/test/proj1')
    const p2 = allocatePort('/test/proj2')
    expect(p1).not.toBe(p2)
  })

  it('同项目重复分配 → 复用已分配端口（Registry 记忆）', () => {
    const p1 = allocatePort('/test/proj3')
    const p2 = allocatePort('/test/proj3')
    expect(p1).toBe(p2)
  })

  it('释放后端口不再占用（新分配不冲突——分配器单调递增不回退）', () => {
    const p1 = allocatePort('/test/proj4')
    releasePort('/test/proj4')
    const p2 = allocatePort('/test/proj4')
    expect(p2).not.toBe(p1)
    expect(p2).toBeGreaterThan(p1)
  })
})

describe('buildSpawnEnv（环境单源——项目 node_modules/.bin 入 PATH，通用非 vite 特判）', () => {
  it('注入项目 .bin 到 PATH 前缀（任何 npm 本地工具可跑）', () => {
    const env = buildSpawnEnv('/proj/root', { PATH: '/usr/bin:/bin' })
    expect(env.PATH).toContain('/proj/root/node_modules/.bin')
    expect(env.PATH).toContain('/usr/bin:/bin') // 原 PATH 保留
  })
})

// 2026-08-06 能力模型（坑 83——用户「能力才是要检测的东西」+ reasonix Capability 验证）
describe('CapabilityRegistry（能力模型——平台原生 + 外部扩展 Status/Requires）', () => {
  it('平台原生能力按 OS（mac grep / windows Select-String——同一「文本搜索」能力不同实现）', () => {
    const mac = detectCapabilities('/proj', 'darwin').find((c) => c.id === 'text-search')
    expect(mac?.status).toBe('ready')
    expect(mac?.implementations).toContain('grep')
    const win = detectCapabilities('/proj', 'win32').find((c) => c.id === 'text-search')
    expect(win?.implementations).toContain('Select-String')
    expect(win?.implementations).not.toContain('grep') // Windows 无 grep——能力抽象层
  })

  it('外部扩展能力带 Status 和 Requires（电子表格依赖 python runtime——reasonix Requires）', () => {
    const spread = detectCapabilities('/proj', 'darwin').find((c) => c.id === 'spreadsheet')
    expect(spread?.category).toBe('external')
    expect(spread?.requires).toContain('python-runtime')
    expect(['ready', 'missing', 'failed']).toContain(spread?.status ?? '')
  })

  it('能力视图包含系统原生 + 外部扩展（filesystem 原生 / node-runtime 外部）', () => {
    const caps = detectCapabilities('/proj', 'darwin')
    expect(caps.find((c) => c.id === 'filesystem')?.category).toBe('system')
    expect(caps.find((c) => c.id === 'node-runtime')?.category).toBe('external')
  })

  it('单源：detectCapabilities 复用传入 env（能力 status 从 env.systemRuntime 推导——不重复检测）', () => {
    // 2026-08-08 环境/能力双源修复：check-capability 已调 checkEnvironment（检测一次）→ detectCapabilities 传 env 复用——
    // node-runtime status 应来自传入 env（而非重新 detectEnvironment 的真实系统状态）
    const fakeEnv = {
      rootPath: '/proj/env-reuse', runtime: 'node', runtimeVersion: 'v99.0.0',
      hasPackageJson: true, hasNodeModules: true, packageManager: 'npm', toolchain: ['vite'],
      servicePort: 0, signature: 'x',
      systemRuntime: { node: { version: 'v99.0.0', status: 'failed' as const }, python: { version: '', status: 'missing' as const } }
    }
    const caps = detectCapabilities('/proj/env-reuse', 'darwin', fakeEnv)
    // node-runtime 用传入 env 的 failed（若重新检测会是本机真实 node 状态——多为 ready）
    expect(caps.find((c) => c.id === 'node-runtime')?.status).toBe('failed')
    expect(caps.find((c) => c.id === 'node-runtime')?.detail).toContain('不可用')
    expect(caps.find((c) => c.id === 'python-runtime')?.status).toBe('missing')
  })
})

// 2026-08-07 Ledger 结果回填（坑 83 ⑥——能力真实可用性从执行结果学习，自进化闭环）
describe('CapabilityLedger（执行结果回填——失败降级/成功恢复）', () => {
  it('执行失败记录 → detectCapabilities 该能力 status 降级 failed（自学习——真实可用性从结果学习）', () => {
    recordCapabilityResult('/proj/ledger1', 'node-runtime', false)
    const caps = detectCapabilities('/proj/ledger1', 'darwin')
    const node = caps.find((c) => c.id === 'node-runtime')
    expect(node?.status).toBe('failed')
    expect(node?.detail).toContain('降级')
    // 其他能力不受影响（filesystem 原生仍 ready）
    expect(caps.find((c) => c.id === 'filesystem')?.status).toBe('ready')
  })

  it('成功执行 → 清除失败记录（能力恢复——Ledger 双向：失败降级/成功恢复）', () => {
    recordCapabilityResult('/proj/ledger2', 'node-runtime', false)
    expect(detectCapabilities('/proj/ledger2', 'darwin').find((c) => c.id === 'node-runtime')?.status).toBe('failed')
    recordCapabilityResult('/proj/ledger2', 'node-runtime', true)
    expect(detectCapabilities('/proj/ledger2', 'darwin').find((c) => c.id === 'node-runtime')?.status).not.toBe('failed')
  })

  it('attributeCommandFailure 归因（bash 失败按命令内容归因——node/npm 命令 → node-runtime）', () => {
    attributeCommandFailure('/proj/ledger3', 'node -v')
    expect(detectCapabilities('/proj/ledger3', 'darwin').find((c) => c.id === 'node-runtime')?.status).toBe('failed')
    attributeCommandFailure('/proj/ledger4', 'npm install')
    expect(detectCapabilities('/proj/ledger4', 'darwin').find((c) => c.id === 'dev-tools')?.status).toBe('failed')
    // 无关命令不归因（ls——shell 原生不降级）
    attributeCommandFailure('/proj/ledger5', 'ls -la')
    expect(detectCapabilities('/proj/ledger5', 'darwin').find((c) => c.id === 'node-runtime')?.status).not.toBe('failed')
  })
})
