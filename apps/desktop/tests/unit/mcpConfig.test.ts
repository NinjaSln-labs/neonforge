import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { McpConfigStore, validateMcpServers } from '../../src/main/mcpConfig'

let dir = ''
let store: McpConfigStore

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'nf-mcp-config-'))
  store = new McpConfigStore(path.join(dir, 'mcp-servers.json'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('MCP 配置（BC-13）', () => {
  it('校验：名称/命令/参数；重复名称拒绝', () => {
    const servers = validateMcpServers([
      { name: 'fs', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '.'] },
    ])
    expect(servers[0]).toMatchObject({ name: 'fs', command: 'npx' })
    expect(() => validateMcpServers([{ name: '', command: 'x' }])).toThrow(/名称/)
    expect(() => validateMcpServers([{ name: 'x', command: '' }])).toThrow(/command/)
    expect(() =>
      validateMcpServers([
        { name: 'dup', command: 'a' },
        { name: 'dup', command: 'b' },
      ]),
    ).toThrow(/重复/)
  })

  it('保存/读取：原子写入 0600；损坏文件返回错误不抛出', () => {
    const saved = store.save([{ name: 'fs', command: 'npx', args: ['server'] }])
    expect(saved.ok).toBe(true)
    expect(store.load().servers).toHaveLength(1)
    writeFileSync(store.path(), '{invalid', { mode: 0o600 })
    const loaded = store.load()
    expect(loaded.servers).toEqual([])
    expect(loaded.error).toMatch(/读取失败/)
  })

  it('load：无文件为空配置；save 非法输入返回错误', () => {
    expect(store.load()).toEqual({ servers: [] })
    const bad = store.save({ servers: 'nope' })
    expect(bad.ok).toBe(false)
  })
})
