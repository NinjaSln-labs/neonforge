// McpManager 单例（main userData/config/mcp-servers.json）。
import { app } from 'electron'
import path from 'node:path'
import { McpConfigStore } from './mcpConfig.js'
import { McpManager } from './mcpManager.js'

let manager: McpManager | null = null

export function getMcpManager(): McpManager {
  if (!manager) {
    manager = new McpManager(
      new McpConfigStore(path.join(app.getPath('userData'), 'config', 'mcp-servers.json')),
    )
  }
  return manager
}
