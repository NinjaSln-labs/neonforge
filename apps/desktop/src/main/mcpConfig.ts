// BC-13 MCP 服务器配置：仅存命令/参数/工作目录，不存任何凭据值（凭据经环境变量传入）。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { McpServerConfig } from './mcpClient.js'

interface McpConfigFile {
  servers?: unknown
}

const NAME_RE = /^[A-Za-z0-9._-]{1,64}$/

export function validateMcpServer(input: unknown): McpServerConfig {
  if (!input || typeof input !== 'object') throw new Error('MCP 服务器必须是对象')
  const raw = input as Record<string, unknown>
  const name = String(raw.name ?? '').trim()
  if (!NAME_RE.test(name)) {
    throw new Error('MCP 服务器名称只能包含字母/数字/._-，长度 1-64')
  }
  const command = String(raw.command ?? '').trim()
  if (!command) throw new Error(`MCP 服务器 ${name} 缺少 command`)
  if (raw.args != null && !Array.isArray(raw.args)) {
    throw new Error(`MCP 服务器 ${name} 的 args 必须是字符串数组`)
  }
  const args = (raw.args as unknown[] | undefined)?.map((a) => String(a)) ?? []
  if (args.some((a) => a.length > 4000)) throw new Error(`MCP 服务器 ${name} 的 args 过长`)
  if (raw.cwd != null && typeof raw.cwd !== 'string') {
    throw new Error(`MCP 服务器 ${name} 的 cwd 必须是字符串`)
  }
  const cwd = typeof raw.cwd === 'string' ? raw.cwd.trim() : undefined
  return { name, command, args, ...(cwd ? { cwd } : {}) }
}

export function validateMcpServers(input: unknown): McpServerConfig[] {
  const list = (input as McpConfigFile | undefined)?.servers ?? input
  if (!Array.isArray(list)) throw new Error('MCP 配置必须是 { "servers": [...] } 或数组')
  const servers = list.map(validateMcpServer)
  const seen = new Set<string>()
  for (const server of servers) {
    if (seen.has(server.name)) throw new Error(`MCP 服务器名称重复：${server.name}`)
    seen.add(server.name)
  }
  return servers
}

export class McpConfigStore {
  constructor(private readonly filePath: string) {}

  path(): string {
    return this.filePath
  }

  load(): { servers: McpServerConfig[]; error?: string } {
    try {
      if (!existsSync(this.filePath)) return { servers: [] }
      const raw = JSON.parse(readFileSync(this.filePath, 'utf-8')) as unknown
      return { servers: validateMcpServers(raw) }
    } catch (e) {
      return {
        servers: [],
        error: `MCP 配置读取失败：${e instanceof Error ? e.message : String(e)}`,
      }
    }
  }

  save(input: unknown): { ok: true; servers: McpServerConfig[] } | { ok: false; error: string } {
    try {
      const servers = validateMcpServers(input)
      const dir = path.dirname(this.filePath)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      const tmp = `${this.filePath}.tmp`
      writeFileSync(tmp, JSON.stringify({ servers }, null, 2), { mode: 0o600 })
      renameSync(tmp, this.filePath)
      return { ok: true, servers }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }
}
