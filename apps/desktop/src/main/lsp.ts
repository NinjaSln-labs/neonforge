// LspService（ticket 12 / A0 §2 Layer 2）：LSP 客户端框架——连接管理 + 6 工具
// V1：框架 + 工具注册（真实语言服务器连接待环境——typescript-language-server 等需安装/配置）
// 边界：ContextEngine=上下文注入（Layer 3 经 ToolRegistry read 工具）；LSP 查询经此服务

const LSP_TOOLS = ['find_definition', 'find_references', 'get_imports', 'get_call_chain', 'get_type_info', 'get_diagnostics'] as const

export class LspService {
  private connected = false
  private projectPath: string | null = null

  connect(projectPath: string): { ok: true; projectPath: string } {
    this.connected = true
    this.projectPath = projectPath
    return { ok: true, projectPath }
  }

  disconnect(): void {
    this.connected = false
    this.projectPath = null
  }

  isConnected(): boolean {
    return this.connected
  }

  // V1 占位：语言服务器未接入时返回明确占位（真实查询待环境）
  async query(kind: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.connected) throw new Error(`LSP 未连接——「${kind}」查询待语言服务器接入（V1 框架占位）`)
    return { kind, args, projectPath: this.projectPath, note: 'LSP 查询待语言服务器接入' }
  }
}

export const lsp = new LspService()

// 注册 6 LSP 工具到 ToolRegistry（source: 'lsp'）
export function registerLspTools(registry: {
  register(t: { name: string; source: 'lsp'; requiresApproval: boolean; execute: (args: Record<string, unknown>, ctx: { rootPath?: string }) => Promise<unknown> }): void
}): void {
  for (const name of LSP_TOOLS) {
    registry.register({
      name,
      source: 'lsp',
      requiresApproval: false,
      execute: (args) => lsp.query(name, args)
    })
  }
}
