import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { initTools, toolRegistry, revertToolFile, cancelActiveCommand, markPlanApproved, isValidOpenUrl, isReadOnlyBash } from '../../src/main/tools'

// 2026-08-06 open 工具（用户「帮我打开」）：mock electron shell——vitest node 环境无 electron
const { openExternalMock } = vi.hoisted(() => ({ openExternalMock: vi.fn(async () => {}) }))
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/nf-unit-tools' },
  shell: { openExternal: openExternalMock }
}))

const TMP = '/tmp/nf-unit-tools'

describe('ToolRegistry 真实执行安全闭环（L3 授权 + 先备份后写 + 回滚）', () => {
  beforeEach(() => {
    markPlanApproved() // 2026-08-04 规划强制适配：write/edit 测试默认已规划（规划机制本身有独立行为）
    if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true })
    initTools()
  })
  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true })
  })

  it('write：未授权拒绝（L3）——不写文件', async () => {
    const file = path.join(TMP, 'a.txt')
    const r = await toolRegistry.execute('write', { path: file, content: 'x' }, {})
    expect(r.ok).toBe(false)
    expect(r.error).toContain('授权')
    expect(existsSync(file)).toBe(false)
  })

  it('write：授权后写文件 + 写前快照 .nf-bak + 回滚恢复原样', async () => {
    const file = path.join(TMP, 'b.txt')
    writeFileSync(file, 'old-content\n', 'utf-8')
    const r = await toolRegistry.execute('write', { path: file, content: 'new-content\n' }, { approved: true })
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
    const r = await toolRegistry.execute('edit', { path: file, old: 'beta', new: 'BETA' }, { approved: true })
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
      const r3 = await toolRegistry.execute('read', { path: outside }, { rootPath: TMP })
      expect(r3.ok).toBe(true)
      expect(String(r3.data)).toContain('outside')
    } finally {
      rmSync(outside, { force: true })
    }
    // 2026-08-04 回归：绝对路径不存在 → 不拼出 rootPath+绝对路径 的荒谬路径（talk.txt 实测 bug）——返回友好错误
    const r4 = await toolRegistry.execute('read', { path: '/Users/nobody/NeonForge/package.json' }, { rootPath: TMP })
    expect(r4.ok).toBe(false)
    expect(r4.error).not.toContain(`${TMP}/Users`)
    expect(r4.error).toContain('找不到这个文件')
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
      if (c.ok) { cancelled = true; break }
    }
    expect(cancelled).toBe(true)
    const r = await execPromise
    expect(r.ok).toBe(false)
    expect(r.error).toContain('已停止')
    // 无活动命令 → 取消返回错误
    const c2 = cancelActiveCommand()
    expect(c2.ok).toBe(false)
  })

  // 2026-08-06 open 工具（用户「帮我打开」4 次没打开网页）：http/https 打开默认浏览器（无需授权——无害操作）
  // main 是 ESM——openExecutor 用 await import('electron')（require 在 ESM 未定义 = open 失败根因）；vitest mock 动态 import 生效 → 可断言完整成功路径
  it('open：http/https 地址放行并调用 shell.openExternal（无需授权）', async () => {
    openExternalMock.mockClear()
    const r = await toolRegistry.execute('open', { url: 'http://localhost:5174/' }, {})
    expect(r.ok).toBe(true)
    expect(openExternalMock).toHaveBeenCalledWith('http://localhost:5174/')
    // requiresApproval false → 不传 approved 也执行（无需授权卡）
    const tool = toolRegistry.list().find((t) => t.name === 'open')
    expect(tool?.requiresApproval).toBe(false)
    expect(tool?.risk).toBe('none')
  })

  it('open：非 http/https 地址拒绝（file:// 等本地协议防越权）', async () => {
    openExternalMock.mockClear()
    const r = await toolRegistry.execute('open', { url: 'file:///etc/passwd' }, {})
    expect(r.ok).toBe(false)
    expect(r.error).toContain('http/https')
    expect(openExternalMock).not.toHaveBeenCalled()
  })

  it('isValidOpenUrl：只认 http/https（防注入/空值）', () => {
    expect(isValidOpenUrl('http://localhost:5174/')).toBe(true)
    expect(isValidOpenUrl('https://example.com')).toBe(true)
    expect(isValidOpenUrl('file:///etc/passwd')).toBe(false)
    expect(isValidOpenUrl('javascript:alert(1)')).toBe(false)
    expect(isValidOpenUrl('')).toBe(false)
    expect(isValidOpenUrl('not a url')).toBe(false)
  })
  // 2026-08-06 用户反馈「读取/浏览文件弹授权卡」：curl GET 类（验证服务）只读自动执行；含写标志需授权
  it('isReadOnlyBash：curl GET 类只读放行（验证服务不弹卡）；写标志拒绝', () => {
    expect(isReadOnlyBash('curl -s http://localhost:5188/')).toBe(true)
    expect(isReadOnlyBash('curl -s localhost:5173 && cat package.json')).toBe(true) // curl 开头复合（head0=curl）
    expect(isReadOnlyBash('curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/')).toBe(false) // -o 写文件
    expect(isReadOnlyBash('curl -d "a=1" http://x.com')).toBe(false) // POST 数据
    expect(isReadOnlyBash('cat package.json')).toBe(true) // cat 白名单（回归）
  })
})
