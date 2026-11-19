import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  initTools,
  toolRegistry,
  revertToolFile,
  cancelActiveCommand,
  markPlanApproved,
  resetPlanApproved,
  syncPlanApprovedFromStore,
  isValidOpenUrl,
  isReadOnlyBash,
  resolveDeliveryTarget,
} from '../../src/main/tools'
import { isKillablePid, killProcessGroupBestEffort } from '../../src/main/processGuard'
import { getPlannedFilesStore } from '../../src/main/plannedFilesStore.instance'

// 2026-08-06 open 工具（用户「帮我打开」）：mock electron shell——vitest node 环境无 electron
const { openExternalMock } = vi.hoisted(() => ({ openExternalMock: vi.fn(async () => {}) }))
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/nf-unit-tools' },
  shell: { openExternal: openExternalMock },
}))

const TMP = '/tmp/nf-unit-tools'

describe('ToolRegistry 真实执行安全闭环（L3 授权 + 先备份后写 + 回滚）', () => {
  beforeEach(() => {
    markPlanApproved() // 2026-08-04 规划强制适配：write/edit 测试默认已规划（规划机制本身有独立行为）
    if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true })
    initTools()
    toolRegistry.setRules([]) // BC-02：规则测试不得泄漏到其它用例
  })
  afterEach(() => {
    toolRegistry.setRules([])
    rmSync(TMP, { recursive: true, force: true })
  })

  it('write：未授权拒绝（L3）——不写文件 + 结构化 needApproval 标记', async () => {
    const file = path.join(TMP, 'a.txt')
    const r = await toolRegistry.execute('write', { path: file, content: 'x' }, {})
    expect(r.ok).toBe(false)
    // 2026-08-07 T2（regex-todo）：needApproval 结构化字段——原 renderer includes('授权') 文本耦合（main 改文案/英文 → 授权卡变 error）
    expect(r.needApproval).toBe(true)
    expect(r.error).toContain('授权')
    expect(existsSync(file)).toBe(false)
  })

  // BC-02 权限规则持久化配套：规则引擎在真实执行路径生效
  it('allow 规则命中 → edit 无需逐次授权', async () => {
    const file = path.join(TMP, 'rule-allow.txt')
    writeFileSync(file, 'hello')
    toolRegistry.setRules([{ action: 'allow', tool: 'edit', specifier: TMP }])
    const r = await toolRegistry.execute(
      'edit',
      { path: file, old: 'hello', new: 'world' },
      { rootPath: TMP },
    )
    expect(r.ok).toBe(true)
    expect(readFileSync(file, 'utf-8')).toBe('world')
  })

  it('deny 规则优先于同参数 allow（规则顺序不改变裁决）', async () => {
    const file = path.join(TMP, 'rule-deny.txt')
    writeFileSync(file, 'hello')
    toolRegistry.setRules([
      { action: 'allow', tool: 'edit', specifier: TMP },
      { action: 'deny', tool: 'edit', specifier: TMP },
    ])
    const r = await toolRegistry.execute(
      'edit',
      { path: file, old: 'hello', new: 'world' },
      { rootPath: TMP, approved: true },
    )
    expect(r.ok).toBe(false)
    expect(r.error).toContain('已阻止')
    expect(readFileSync(file, 'utf-8')).toBe('hello')
  })

  it('ask 规则不被只读 preApproval 自动放行绕过', async () => {
    toolRegistry.setRules([{ action: 'ask', tool: 'bash', specifier: 'ls' }])
    const r = await toolRegistry.execute('bash', { command: 'ls' }, { rootPath: TMP })
    expect(r.ok).toBe(false)
    expect(r.needApproval).toBe(true)
  })

  it('ask 规则：自动批准来源仍要求用户授权，user 来源放行', async () => {
    const file = path.join(TMP, 'ask-read.txt')
    writeFileSync(file, 'x')
    toolRegistry.setRules([{ action: 'ask', tool: 'read', specifier: TMP }])
    const auto = await toolRegistry.execute(
      'read',
      { path: file },
      { approved: true, approvalSource: 'auto', rootPath: TMP },
    )
    expect(auto.ok).toBe(false)
    expect(auto.needApproval).toBe(true)
    const user = await toolRegistry.execute(
      'read',
      { path: file },
      { approved: true, approvalSource: 'user', rootPath: TMP },
    )
    expect(user.ok).toBe(true)
  })

  it('ask 规则对无需授权的工具也生效', async () => {
    toolRegistry.setRules([{ action: 'ask', tool: 'search', specifier: 'x' }])
    const r = await toolRegistry.execute('search', { query: 'x' }, { rootPath: TMP })
    expect(r.ok).toBe(false)
    expect(r.needApproval).toBe(true)
  })

  it('allow read 前缀不能借 .. 逃出项目根（回到逐次授权）', async () => {
    const outside = '/tmp/nf-unit-outside-read.txt'
    writeFileSync(outside, 'secret')
    try {
      toolRegistry.setRules([{ action: 'allow', tool: 'read', specifier: path.join(TMP, 'src') }])
      const escape = path.join(TMP, 'src', '../../nf-unit-outside-read.txt')
      const r = await toolRegistry.execute('read', { path: escape }, { rootPath: TMP })
      expect(r.ok).toBe(false)
      expect(r.needApproval).toBe(true)
    } finally {
      rmSync(outside, { force: true })
    }
  })

  it('非授权错误不带 needApproval 字段（未知工具——T2 协议边界）', async () => {
    const r = await toolRegistry.execute('nonexistent-tool', {}, {})
    expect(r.ok).toBe(false)
    expect(r.needApproval).toBeUndefined()
  })

  // ADR-011：内层 data.ok===false 须抬到外层（原恒 ok:true 吞失败）
  it('execute：内层 data.ok===false → 外层 ok=false（ADR-011）', async () => {
    toolRegistry.register({
      name: 'web_search_probe',
      source: 'core',
      requiresApproval: false,
      risk: 'none',
      execute: async () => ({ ok: false, error: 'fetch failed' }),
    })
    const r = await toolRegistry.execute('web_search_probe', {}, {})
    expect(r.ok).toBe(false)
    expect(String(r.error)).toMatch(/fetch failed/)
  })

  // 2026-08-08 根因 3 修复②：write 规划门控（先 approve-files 再写）是**策略引导**不是「工具执行失败」——
  // policy 标记让 renderer 不置 lastToolFailed（否则 forceTool 恒释放 → 模型纯文本承诺后停住——冒烟 O4/O5 根因）
  it('write：未规划拒绝 = 策略引导（policy 标记）——非执行失败，不弹授权卡', async () => {
    resetPlanApproved() // 模拟用户未批准过 approve-files
    const file = path.join(TMP, 'p.txt')
    const r = await toolRegistry.execute('write', { path: file, content: 'x' }, {})
    expect(r.ok).toBe(false)
    expect(r.policy).toBe(true) // 策略拦截——模型收到引导应先调 approve-files，不应被误判「工具失败」
    expect(r.needApproval).toBeUndefined() // 不是授权请求（引导先规划，不逐个授权）
    expect(r.error).toContain('approve-files')
    expect(existsSync(file)).toBe(false)
  })

  // D3（ADR-005）：main 门控跨重启一致——syncPlanApprovedFromStore（registerIpc 启动恢复路径）从
  // 持久化 store 恢复 approved → write 不再被「先调 approve-files」规划引导拦（policy 放行）；
  // 授权判定（needApproval）仍正常（approved 由 renderer 侧状态机判定——approved 恢复 ≠ 授权放行）
  it('D3：syncPlanApprovedFromStore 从 store 恢复 approved → write 规划引导放行（跨重启一致）', async () => {
    resetPlanApproved()
    const file = path.join(TMP, 'd3.txt')
    // 预写 store（模拟上次会话批准过——跨重启保留；afterEach 清 TMP 自动隔离）
    getPlannedFilesStore().add([file])
    // registerIpc 启动恢复路径
    syncPlanApprovedFromStore()
    const r = await toolRegistry.execute('write', { path: file, content: 'x' }, {})
    expect(r.ok).toBe(false)
    expect(r.policy).toBeUndefined() // 规划引导已放行（approved 恢复——不引导先调 approve-files）
    expect(r.needApproval).toBe(true) // 正常授权判定（write 需 approved——由 renderer 状态机提供）
  })

  it('write：授权后写文件 + 写前快照 .nf-bak + 回滚恢复原样', async () => {
    const file = path.join(TMP, 'b.txt')
    writeFileSync(file, 'old-content\n', 'utf-8')
    const r = await toolRegistry.execute(
      'write',
      { path: file, content: 'new-content\n' },
      { approved: true },
    )
    expect(r.ok).toBe(true)
    expect(readFileSync(file, 'utf-8')).toBe('new-content\n')
    expect(existsSync(file + '.nf-bak')).toBe(true)
    const rv = revertToolFile(file)
    expect(rv.ok).toBe(true)
    expect(readFileSync(file, 'utf-8')).toBe('old-content\n')
  })

  it('edit：替换 + 写前快照 + 回滚', async () => {
    const file = path.join(TMP, 'c.txt')
    writeFileSync(file, 'alpha\nbeta\n', 'utf-8')
    const r = await toolRegistry.execute(
      'edit',
      { path: file, old: 'beta', new: 'BETA' },
      { approved: true },
    )
    expect(r.ok).toBe(true)
    expect(readFileSync(file, 'utf-8')).toBe('alpha\nBETA\n')
    expect(existsSync(file + '.nf-bak')).toBe(true)
    const rv = revertToolFile(file)
    expect(rv.ok).toBe(true)
    expect(readFileSync(file, 'utf-8')).toBe('alpha\nbeta\n')
  })

  it('read：只读无需授权（L1）', async () => {
    const file = path.join(TMP, 'd.txt')
    writeFileSync(file, 'hello', 'utf-8')
    const r = await toolRegistry.execute('read', { path: file }, { rootPath: TMP })
    expect(r.ok).toBe(true)
    expect(r.data).toBe('hello')
  })

  it('回滚：无快照 → 错误提示（新写入文件无可恢复内容）', async () => {
    const file = path.join(TMP, 'e.txt')
    const r = revertToolFile(file)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('无快照')
  })

  it('read：相对路径必须解析到 rootPath 下（v37 修复——防止读到 main cwd 同名文件）', async () => {
    // 项目内真实文件：相对路径 package.json → 应读项目文件（而非 Electron 启动目录的同名文件）
    const file = path.join(TMP, 'package.json')
    writeFileSync(file, '{"name":"project-pkg"}\n', 'utf-8')
    const r = await toolRegistry.execute('read', { path: 'package.json' }, { rootPath: TMP })
    expect(r.ok).toBe(true)
    expect(String(r.data)).toContain('project-pkg')
    // 类绝对路径 /package.json 同样 join rootPath（模型相对语义）
    const r2 = await toolRegistry.execute('read', { path: '/package.json' }, { rootPath: TMP })
    expect(r2.ok).toBe(true)
    expect(String(r2.data)).toContain('project-pkg')
    // 项目外真实绝对路径 → 直接用（坑 12：不重复 join）
    const outside = '/tmp/nf-unit-tools-outside.json'
    writeFileSync(outside, '{"k":"outside"}\n', 'utf-8')
    try {
      const r3 = await toolRegistry.execute(
        'read',
        { path: outside },
        { rootPath: TMP, approved: true },
      )
      expect(r3.ok).toBe(true)
      expect(String(r3.data)).toContain('outside')
    } finally {
      rmSync(outside, { force: true })
    }
    // 2026-08-04 回归：绝对路径不存在 → 不拼出 rootPath+绝对路径 的荒谬路径（talk.txt 实测 bug）——返回友好提示
    // 2026-08-06 read 增强：不存在时返回目录列表（模型知道目录里有什么，不再盲读）
    const r4 = await toolRegistry.execute(
      'read',
      { path: '/Users/nobody/NeonForge/package.json' },
      { rootPath: TMP, approved: true },
    )
    expect(r4.ok).toBe(true)
    expect(String(r4.data)).not.toContain(`${TMP}/Users`)
    expect(String(r4.data)).toContain('找不到文件')
  })

  // P0-01：读取边界——项目根内自动；根外必须授权；无 rootPath 也必须授权
  it('read：项目外路径需授权（根内自动/根外授权）', async () => {
    const outside = '/tmp/nf-unit-tools-outside-auth.txt'
    writeFileSync(outside, 'secret-outside', 'utf-8')
    try {
      const denied = await toolRegistry.execute('read', { path: outside }, { rootPath: TMP })
      expect(denied.ok).toBe(false)
      expect(denied.needApproval).toBe(true)
      expect(denied.data).toBeUndefined()

      const granted = await toolRegistry.execute(
        'read',
        { path: outside },
        { rootPath: TMP, approved: true },
      )
      expect(granted.ok).toBe(true)
      expect(granted.data).toBe('secret-outside')

      const noRoot = await toolRegistry.execute('read', { path: outside }, {})
      expect(noRoot.ok).toBe(false)
      expect(noRoot.needApproval).toBe(true)
    } finally {
      rmSync(outside, { force: true })
    }
  })

  // 2026-11-17 审查修复：read 预检必须与执行器同一路径解析（否则带项目名前缀的 symlink 可绕过 realpath）
  it('read：相对路径误带项目名 + 根内 symlink 指向根外 → 不得自动放行', async () => {
    const secret = '/tmp/nf-unit-tools-read-escape-secret.txt'
    const link = path.join(TMP, 'escape-link.txt')
    writeFileSync(secret, 'outside-secret', 'utf-8')
    try {
      rmSync(link, { force: true })
    } catch {
      /* ignore */
    }
    const { symlinkSync } = await import('node:fs')
    symlinkSync(secret, link)
    try {
      const denied = await toolRegistry.execute(
        'read',
        { path: `${path.basename(TMP)}/escape-link.txt` },
        { rootPath: TMP },
      )
      expect(denied.ok).toBe(false)
      expect(denied.needApproval).toBe(true)
      expect(denied.data).toBeUndefined()

      const granted = await toolRegistry.execute(
        'read',
        { path: `${path.basename(TMP)}/escape-link.txt` },
        { rootPath: TMP, approved: true },
      )
      expect(granted.ok).toBe(true)
      expect(granted.data).toBe('outside-secret')
    } finally {
      rmSync(link, { force: true })
      rmSync(secret, { force: true })
    }
  })

  it('resolveDeliveryTarget：交付 diff 写路径必须根内且不可 symlink 逃逸', async () => {
    const inside = path.join(TMP, 'delivery.txt')
    writeFileSync(inside, 'x', 'utf-8')
    const ok = await resolveDeliveryTarget(inside, TMP)
    expect(ok).toMatchObject({ ok: true, target: inside })

    const outside = '/tmp/nf-unit-delivery-outside.txt'
    writeFileSync(outside, 'secret', 'utf-8')
    try {
      const denied = await resolveDeliveryTarget(outside, TMP)
      expect(denied.ok).toBe(false)
      expect(denied.error).toMatch(/项目根内/)
    } finally {
      rmSync(outside, { force: true })
    }

    const secret = '/tmp/nf-unit-delivery-link-secret.txt'
    const link = path.join(TMP, 'delivery-link.txt')
    writeFileSync(secret, 'secret', 'utf-8')
    const { symlinkSync } = await import('node:fs')
    symlinkSync(secret, link)
    try {
      const escaped = await resolveDeliveryTarget(link, TMP)
      expect(escaped.ok).toBe(false)
      expect(escaped.error).toMatch(/项目根内/)
    } finally {
      rmSync(link, { force: true })
      rmSync(secret, { force: true })
    }

    const noRoot = await resolveDeliveryTarget(inside, undefined)
    expect(noRoot.ok).toBe(false)
  })

  // P0-04：进程清理守卫——无效 pid 不得进入 kill(-pid)（-0 会向当前进程组发信号）
  it('isKillablePid：只接受正整数', () => {
    expect(isKillablePid(1234)).toBe(true)
    expect(isKillablePid(0)).toBe(false)
    expect(isKillablePid(-1)).toBe(false)
    expect(isKillablePid(-1234)).toBe(false)
    expect(isKillablePid(1.5)).toBe(false)
    expect(isKillablePid(Number.NaN)).toBe(false)
    expect(isKillablePid(undefined)).toBe(false)
    expect(isKillablePid(null)).toBe(false)
  })

  it('killProcessGroupBestEffort：无效 pid 不调用 kill（防 kill(-0) 打当前进程组）', () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true as never)
    expect(killProcessGroupBestEffort(undefined)).toBe(false)
    expect(killProcessGroupBestEffort(0)).toBe(false)
    expect(killProcessGroupBestEffort(Number.NaN)).toBe(false)
    expect(kill).not.toHaveBeenCalled()
    expect(killProcessGroupBestEffort(1234)).toBe(true)
    expect(kill).toHaveBeenCalledWith(-1234, 'SIGKILL')
    kill.mockRestore()
  })

  it('search：关键词检索（Layer2 CodeRAG——agentic grep 模式）返回命中+行号+片段', async () => {
    const src = path.join(TMP, 'src')
    mkdirSync(src, { recursive: true })
    writeFileSync(path.join(src, 'a.ts'), 'export function greet() {}\nconst TODO = 1\n', 'utf-8')
    writeFileSync(path.join(src, 'b.ts'), 'import { greet } from "./a"\n', 'utf-8')
    const r = await toolRegistry.execute('search', { query: 'greet' }, { rootPath: TMP })
    expect(r.ok).toBe(true)
    const hits = (r.data as { hits: Array<{ path: string; line: number; snippet: string }> }).hits
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].path).toContain('a.ts')
    expect(hits[0].line).toBe(1)
    expect(hits[0].snippet).toContain('greet')
  })

  it('search：无 rootPath → 提示无项目；空 query → 无有效关键词', async () => {
    const r1 = await toolRegistry.execute('search', { query: 'x' }, {})
    expect((r1.data as { hits: unknown[]; note?: string }).hits).toEqual([])
    const r2 = await toolRegistry.execute('search', { query: '' }, { rootPath: TMP })
    expect((r2.data as { hits: unknown[]; note?: string }).note).toContain('无有效关键词')
  })

  it('list：返回 risk 等级（ticket 14——read/search=none L1 观察，write/edit=low L3 文件操作，bash=high L3 命令执行）', () => {
    const tools = toolRegistry.list()
    expect(tools.find((t) => t.name === 'read')?.risk).toBe('none')
    expect(tools.find((t) => t.name === 'search')?.risk).toBe('none')
    expect(tools.find((t) => t.name === 'write')?.risk).toBe('low')
    expect(tools.find((t) => t.name === 'edit')?.risk).toBe('low')
    expect(tools.find((t) => t.name === 'bash')?.risk).toBe('high')
  })

  it('bash：取消当前活动命令（ticket 14 可撤销——任何时刻停止，不卡死）', async () => {
    const execPromise = toolRegistry.execute('bash', { command: 'sleep 10' }, { approved: true })
    // 轮询等 bash 子进程启动（child_process 动态导入 + exec 启动有延迟）
    let cancelled = false
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 50))
      const c = cancelActiveCommand()
      if (c.ok) {
        cancelled = true
        break
      }
    }
    expect(cancelled).toBe(true)
    const r = await execPromise
    expect(r.ok).toBe(false)
    expect(r.error).toContain('已停止')
    // 无活动命令 → 取消返回错误
    const c2 = cancelActiveCommand()
    expect(c2.ok).toBe(false)
  })

  // 2026-08-06 open 工具（用户「帮我打开」）：http/https；项目内 file:// / 相对路径（单文件 HTML）
  it('open：http/https 地址放行并调用 shell.openExternal（无需授权）', async () => {
    openExternalMock.mockClear()
    const r = await toolRegistry.execute('open', { url: 'http://localhost:5174/' }, {})
    expect(r.ok).toBe(true)
    expect(openExternalMock).toHaveBeenCalledWith('http://localhost:5174/')
    const tool = toolRegistry.list().find((t) => t.name === 'open')
    expect(tool?.requiresApproval).toBe(false)
    expect(tool?.risk).toBe('none')
  })

  it('open：项目外 file:// 拒绝（防越权）', async () => {
    openExternalMock.mockClear()
    const r = await toolRegistry.execute(
      'open',
      { url: 'file:///etc/passwd' },
      { rootPath: '/tmp/nf-proj' },
    )
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/项目内|http\/https/)
    expect(openExternalMock).not.toHaveBeenCalled()
  })

  it('open：项目内相对路径 / file:// 放行', async () => {
    openExternalMock.mockClear()
    const root = '/tmp/nf-open-proj'
    const { mkdirSync, writeFileSync, rmSync } = await import('fs')
    rmSync(root, { recursive: true, force: true })
    mkdirSync(root, { recursive: true })
    writeFileSync(`${root}/index.html`, '<h1>ok</h1>')
    const r = await toolRegistry.execute('open', { url: 'index.html' }, { rootPath: root })
    expect(r.ok).toBe(true)
    expect(openExternalMock).toHaveBeenCalled()
    const opened = String(openExternalMock.mock.calls[0][0])
    expect(opened.startsWith('file://')).toBe(true)
    expect(opened.includes('index.html')).toBe(true)
    const r2 = await toolRegistry.execute(
      'open',
      { url: `file://${root}/index.html` },
      { rootPath: root },
    )
    expect(r2.ok).toBe(true)
    rmSync(root, { recursive: true, force: true })
  })

  it('isValidOpenUrl：http 任意；file 须落在 rootPath', () => {
    expect(isValidOpenUrl('http://localhost:5174/')).toBe(true)
    expect(isValidOpenUrl('https://example.com')).toBe(true)
    expect(isValidOpenUrl('file:///etc/passwd')).toBe(false)
    expect(isValidOpenUrl('file:///etc/passwd', '/tmp/proj')).toBe(false)
    expect(isValidOpenUrl('javascript:alert(1)')).toBe(false)
    expect(isValidOpenUrl('')).toBe(false)
    expect(isValidOpenUrl('not a url')).toBe(false)
  })
  // 2026-08-06 设计层升级（fail-closed——用户「白名单匹配不完」）：curl 一律需授权（验证服务用 check-server 工具）；
  // 白名单冻结（不加新条目）；cat 等只读白名单命令仍自动
  // 2026-08-16 S6（拍板 3 + §8.1 A）：isReadOnlyBash 改引用 classifyReadonly——curl localhost 自动放行；
  // 外网 curl 仍 fail-closed（ask——安全默认）
  it('isReadOnlyBash：S6 拍板 3——curl localhost 自动放行、外网 curl 需授权；只读白名单仍自动', () => {
    expect(isReadOnlyBash('curl -s http://localhost:5188/')).toBe(true) // S6 拍板 3：localhost 自动放行
    // #6 真机 2026-08-30（P2-5）：-o /dev/null 健康检查惯用法不落盘——不再计写副作用（真机授权卡误弹证据）
    expect(isReadOnlyBash('curl -s -o /dev/null http://localhost:5173/')).toBe(true)
    expect(isReadOnlyBash('curl -s https://example.com')).toBe(false) // 外网 curl fail-closed（ask——安全默认）
    expect(isReadOnlyBash('cat package.json')).toBe(true) // cat 白名单（回归）
    expect(isReadOnlyBash('ls -la /x && cat package.json')).toBe(true) // ls/cat 白名单复合
    expect(isReadOnlyBash('npm run dev')).toBe(false) // 高风险命令需授权
  })

  // 2026-08-07 无阶段重构 S2：check-env → check-capability（能力检查工具改名——注册名 + 能力视图）
  it('check-capability：注册 + 有 dir 返回能力视图（工具改名回归）', async () => {
    const r = await toolRegistry.execute('check-capability', { dir: TMP }, {})
    expect(r.ok).toBe(true)
    expect(r.data).toBeTruthy() // 能力视图（capabilities/runtime/missing）
    // 旧名 check-env 不再注册（改名后旧名应 404——防双名双源）
    const old = await toolRegistry.execute('check-env', {}, {})
    expect(old.needApproval).toBeUndefined()
  })
})

// ADR-015（GitHub #12）：低危委托的 main 执行边界二次校验
describe('ToolRegistry decide：只裁决不执行（评估桥复用）', () => {
  beforeEach(() => {
    markPlanApproved()
    if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true })
    initTools()
    toolRegistry.setRules([])
  })
  afterEach(() => {
    toolRegistry.setRules([])
    rmSync(TMP, { recursive: true, force: true })
  })

  it('write 未授权 → needApproval，且不创建文件', async () => {
    const file = path.join(TMP, 'decide-write.txt')
    const r = await toolRegistry.decide('write', { path: file, content: 'x' }, {})
    expect(r?.ok).toBe(false)
    expect(r?.needApproval).toBe(true)
    expect(existsSync(file)).toBe(false)
  })

  it('allow 规则 → 返回 null，且不执行 edit', async () => {
    const file = path.join(TMP, 'decide-allow.txt')
    writeFileSync(file, 'hello')
    toolRegistry.setRules([{ action: 'allow', tool: 'edit', specifier: TMP }])
    const r = await toolRegistry.decide(
      'edit',
      { path: file, old: 'hello', new: 'world' },
      { rootPath: TMP },
    )
    expect(r).toBeNull()
    expect(readFileSync(file, 'utf-8')).toBe('hello')
  })

  it('deny 规则 → policy 拦截，且不执行 edit', async () => {
    const file = path.join(TMP, 'decide-deny.txt')
    writeFileSync(file, 'hello')
    toolRegistry.setRules([{ action: 'deny', tool: 'edit', specifier: TMP }])
    const r = await toolRegistry.decide(
      'edit',
      { path: file, old: 'hello', new: 'world' },
      { rootPath: TMP },
    )
    expect(r?.ok).toBe(false)
    expect(r?.policy).toBe(true)
    expect(readFileSync(file, 'utf-8')).toBe('hello')
  })

  it('未知工具 → 错误，不抛异常', async () => {
    const r = await toolRegistry.decide('not-a-tool', {}, {})
    expect(r?.ok).toBe(false)
    expect(r?.error).toContain('未知工具')
  })
})

describe('ToolRegistry 委托边界（ADR-015）', () => {
  beforeEach(() => {
    markPlanApproved()
    getPlannedFilesStore().reset()
    initTools()
    toolRegistry.setRules([])
    if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true })
  })
  afterEach(() => {
    getPlannedFilesStore().reset()
    toolRegistry.setRules([])
    rmSync(TMP, { recursive: true, force: true })
  })

  it('delegate：根内 + 已批准清单内 edit 放行（自动委托真实执行）', async () => {
    const file = path.join(TMP, 'delegated-edit.txt')
    writeFileSync(file, 'alpha\nbeta\n', 'utf-8')
    getPlannedFilesStore().addPlan([file])
    const r = await toolRegistry.execute(
      'edit',
      { path: file, old: 'beta', new: 'BETA' },
      { approved: true, approvalSource: 'delegate', rootPath: TMP },
    )
    expect(r.ok).toBe(true)
    expect(readFileSync(file, 'utf-8')).toBe('alpha\nBETA\n')
  })

  it('delegate：根内 + planConfirmed 清单内 write 放行（write/edit 同一防线）', async () => {
    const file = path.join(TMP, 'delegated-write.txt')
    getPlannedFilesStore().addPlan([file])
    const r = await toolRegistry.execute(
      'write',
      { path: file, content: 'x' },
      { approved: true, approvalSource: 'delegate', rootPath: TMP },
    )
    expect(r.ok).toBe(true)
    expect(readFileSync(file, 'utf-8')).toBe('x')
  })

  it('delegate：旧存档只有 approve-files approved（无 planConfirmed）也视为有效批准', async () => {
    const file = path.join(TMP, 'legacy-approved.txt')
    writeFileSync(file, 'a')
    getPlannedFilesStore().add([file]) // approved=true，planConfirmed=false（旧版本数据）
    const r = await toolRegistry.execute(
      'edit',
      { path: file, old: 'a', new: 'b' },
      { approved: true, approvalSource: 'delegate', rootPath: TMP },
    )
    expect(r.ok).toBe(true)
    expect(readFileSync(file, 'utf-8')).toBe('b')
  })

  it('delegate：清单外文件拒绝（needApproval + 不执行）', async () => {
    const file = path.join(TMP, 'out-of-plan.txt')
    const planned = path.join(TMP, 'planned.txt')
    writeFileSync(planned, 'x')
    getPlannedFilesStore().addPlan([planned])
    const r = await toolRegistry.execute(
      'write',
      { path: file, content: 'x' },
      { approved: true, approvalSource: 'delegate', rootPath: TMP },
    )
    expect(r.ok).toBe(false)
    expect(r.needApproval).toBe(true)
    expect(r.error).toContain('委托越界')
    expect(existsSync(file)).toBe(false)
  })

  it('delegate：项目根外文件拒绝（即使已列入清单）', async () => {
    const outside = '/tmp/nf-delegated-outside.txt'
    const file = path.join(TMP, 'root-outside.txt')
    writeFileSync(outside, 'secret')
    getPlannedFilesStore().addPlan([file])
    try {
      const r = await toolRegistry.execute(
        'write',
        { path: file, content: 'x' },
        { approved: true, approvalSource: 'delegate', rootPath: '/tmp/nf-other-root' },
      )
      expect(r.ok).toBe(false)
      expect(r.needApproval).toBe(true)
      expect(existsSync(file)).toBe(false)
    } finally {
      rmSync(outside, { force: true })
    }
  })

  it('delegate：bash / 非文件动作永不委托', async () => {
    getPlannedFilesStore().addPlan([path.join(TMP, 'x.txt')])
    const r = await toolRegistry.execute(
      'bash',
      { command: 'echo hi' },
      { approved: true, approvalSource: 'delegate', rootPath: TMP },
    )
    expect(r.ok).toBe(false)
    expect(r.needApproval).toBe(true)
    expect(r.error).toContain('委托越界')
  })

  it('delegate 不得借显式 ask 规则绕过（ask 只接受 user 来源）', async () => {
    const file = path.join(TMP, 'ask-delegate.txt')
    writeFileSync(file, 'hello')
    getPlannedFilesStore().addPlan([file])
    toolRegistry.setRules([{ action: 'ask', tool: 'edit', specifier: TMP }])
    const r = await toolRegistry.execute(
      'edit',
      { path: file, old: 'hello', new: 'world' },
      { approved: true, approvalSource: 'delegate', rootPath: TMP },
    )
    expect(r.ok).toBe(false)
    expect(r.needApproval).toBe(true)
    expect(readFileSync(file, 'utf-8')).toBe('hello')
  })

  it('delegate：方案未确认 → 拒绝（renderer 不能独立宣告方案已确认）', async () => {
    const file = path.join(TMP, 'no-approved-plan.txt')
    writeFileSync(file, 'hello')
    const r = await toolRegistry.execute(
      'edit',
      { path: file, old: 'hello', new: 'world' },
      { approved: true, approvalSource: 'delegate', rootPath: TMP },
    )
    expect(r.ok).toBe(false)
    expect(r.needApproval).toBe(true)
    expect(readFileSync(file, 'utf-8')).toBe('hello')
  })
  it('delegate：路径解析异常（ENOTDIR）回授权卡而非 IPC 拒绝（工具卡不得永久 pending）', async () => {
    const blocker = path.join(TMP, 'a-file.txt')
    writeFileSync(blocker, 'x')
    getPlannedFilesStore().addPlan([blocker])
    const bad = path.join(blocker, 'child.txt') // 中间路径是文件 → ENOTDIR
    const r = await toolRegistry.execute(
      'edit',
      { path: bad, old: 'a', new: 'b' },
      { approved: true, approvalSource: 'delegate', rootPath: TMP },
    )
    expect(r.ok).toBe(false)
    expect(r.needApproval).toBe(true)
    expect(r.error).toContain('路径无法校验')
  })
})
