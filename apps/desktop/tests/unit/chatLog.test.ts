import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { appendChatLog, exportChatLog, logDir, todayLogFile } from '../../src/main/chatLog'

// 导出目标重定向到 /tmp（不污染真实 ~/Downloads——exportChatLog 用 os.homedir()）
vi.mock('node:os', () => ({ default: { homedir: () => '/tmp/nf-chatlog-downloads' } }))

describe('chatLog（对话日志 + 导出——2026-08-04 用户诉求：对话全导出/专有日志）', () => {
  let base: string
  beforeEach(() => {
    base = mkdtempSync(path.join('/tmp', 'nf-chatlog-'))
  })
  afterEach(() => {
    rmSync(base, { recursive: true, force: true })
    rmSync('/tmp/nf-chatlog-downloads', { recursive: true, force: true })
  })

  it('appendChatLog：自动创建 logs 目录 + 追加 JSONL（user）', () => {
    appendChatLog(base, { ts: '2026-08-04T09:00:00.000Z', role: 'user', content: '你好' })
    const file = todayLogFile(base)
    expect(existsSync(file)).toBe(true)
    expect(existsSync(logDir(base))).toBe(true)
    const lines = readFileSync(file, 'utf-8').trim().split('\n')
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0])).toMatchObject({ role: 'user', content: '你好' })
  })

  it('appendChatLog：多消息追加（user + assistant 含工具调用）', () => {
    appendChatLog(base, { ts: '2026-08-04T09:00:00.000Z', role: 'user', content: '帮我改文件' })
    appendChatLog(base, {
      ts: '2026-08-04T09:00:01.000Z', role: 'assistant', content: '已修改',
      toolCalls: [{ name: 'write', status: 'done' }]
    })
    const lines = readFileSync(todayLogFile(base), 'utf-8').trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[1])).toMatchObject({ role: 'assistant', content: '已修改', toolCalls: [{ name: 'write', status: 'done' }] })
  })

  it('appendChatLog：写盘失败静默（不影响对话）', () => {
    // base 指向文件（非目录）——mkdirSync recursive 抛 ENOTDIR → catch 静默
    const badBase = path.join(base, 'not-a-dir', 'x')
    writeFileSync(path.join(base, 'not-a-dir'), 'file')
    expect(() => appendChatLog(badBase, { ts: '2026-08-04T09:00:00.000Z', role: 'user', content: 'x' })).not.toThrow()
  })

  it('exportChatLog：无记录 → ok:false 友好提示', () => {
    const r = exportChatLog(base)
    expect(r.ok).toBe(false)
    expect(r.error).toBe('还没有对话记录')
  })

  it('exportChatLog：合并 + 按时间排序 + 生成可读 MD（含工具调用行）', () => {
    appendChatLog(base, { ts: '2026-08-04T09:00:02.000Z', role: 'assistant', content: '晚的', toolCalls: [{ name: 'bash', status: 'error' }] })
    appendChatLog(base, { ts: '2026-08-04T09:00:01.000Z', role: 'user', content: '早的' })
    const r = exportChatLog(base)
    expect(r.ok).toBe(true)
    const md = readFileSync(r.path!, 'utf-8')
    expect(md).toContain('# NeonForge 对话记录')
    // 排序：早的在晚的前面
    expect(md.indexOf('早的')).toBeLessThan(md.indexOf('晚的'))
    // 角色标记 + 时间（HH:MM:SS）；内容被反引号包裹（exportChatLog 模板）
    expect(md).toContain('我（09:00:01）：`早的`')
    expect(md).toContain('搭档（09:00:02）：`晚的`')
    expect(md).toContain('工具调用：bash（error）')
  })

  it('exportChatLog：损坏行忽略（不崩，正常导出其余）', () => {
    appendChatLog(base, { ts: '2026-08-04T09:00:01.000Z', role: 'user', content: '正常消息' })
    // 混入损坏行
    const f = todayLogFile(base)
    writeFileSync(f, readFileSync(f, 'utf-8') + 'not-json\n', 'utf-8')
    const r = exportChatLog(base)
    expect(r.ok).toBe(true)
    const md = readFileSync(r.path!, 'utf-8')
    expect(md).toContain('正常消息')
  })

  it('exportChatLog：跨天多文件全部合并', () => {
    // 先建 logs 目录（真实运行 appendChatLog 会自动创建；这里直接写历史文件需先建目录）
    mkdirSync(logDir(base), { recursive: true })
    const d1 = path.join(logDir(base), 'chat-2026-08-03.jsonl')
    writeFileSync(d1, JSON.stringify({ ts: '2026-08-03T20:00:00.000Z', role: 'user', content: '昨天' }) + '\n', 'utf-8')
    appendChatLog(base, { ts: '2026-08-04T09:00:00.000Z', role: 'user', content: '今天' })
    const r = exportChatLog(base)
    expect(r.ok).toBe(true)
    const md = readFileSync(r.path!, 'utf-8')
    expect(md).toContain('昨天')
    expect(md).toContain('今天')
    expect(md.indexOf('昨天')).toBeLessThan(md.indexOf('今天')) // 跨天仍按 ts 排序
  })
})
