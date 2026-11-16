import { describe, it, expect } from 'vitest'
import { McpClient, type McpTransport } from '../../src/main/mcpClient'

interface SentMessage {
  jsonrpc: string
  id?: number
  method?: string
  params?: unknown
}

class FakeTransport implements McpTransport {
  sent: SentMessage[] = []
  private messageHandler: ((message: unknown) => void) | null = null
  private closeHandler: ((reason: string) => void) | null = null

  send(message: unknown): void {
    this.sent.push(message as SentMessage)
  }
  onMessage(handler: (message: unknown) => void): void {
    this.messageHandler = handler
  }
  onClose(handler: (reason: string) => void): void {
    this.closeHandler = handler
  }
  close(): void {
    this.closeHandler?.('closed')
  }
  respond(id: number, result: unknown): void {
    this.messageHandler?.({ jsonrpc: '2.0', id, result })
  }
  respondError(id: number, message: string): void {
    this.messageHandler?.({ jsonrpc: '2.0', id, error: { code: -1, message } })
  }
  find(method: string): SentMessage {
    const matches = this.sent.filter((m) => m.method === method)
    const msg = matches[matches.length - 1]
    if (!msg || msg.id === undefined) throw new Error(`未发送请求：${method}`)
    return msg
  }
}

describe('MCP 客户端（BC-13）', () => {
  it('initialize：发送协议握手 + initialized 通知', async () => {
    const transport = new FakeTransport()
    const client = new McpClient(transport)
    const pending = client.initialize()
    transport.respond(transport.find('initialize').id!, { protocolVersion: '2024-11-05' })
    await expect(pending).resolves.toEqual({ protocolVersion: '2024-11-05' })
    expect(transport.sent.some((m) => m.method === 'notifications/initialized')).toBe(true)
    expect(transport.find('initialize').params).toMatchObject({
      clientInfo: { name: 'neonforge' },
    })
  })

  it('listTools：过滤无效项并保留描述/schema', async () => {
    const transport = new FakeTransport()
    const client = new McpClient(transport)
    const pending = client.listTools()
    transport.respond(transport.find('tools/list').id!, {
      tools: [
        { name: 'read_file', description: '读文件', inputSchema: { type: 'object' } },
        { name: '' },
        'bad',
      ],
    })
    const tools = await pending
    expect(tools).toEqual([
      { name: 'read_file', description: '读文件', inputSchema: { type: 'object' } },
    ])
  })

  it('callTool：成功返回内容；isError → ok:false + 文本', async () => {
    const transport = new FakeTransport()
    const client = new McpClient(transport)
    const okPending = client.callTool('ping', {})
    transport.respond(transport.find('tools/call').id!, {
      content: [{ type: 'text', text: 'pong' }],
    })
    await expect(okPending).resolves.toMatchObject({ ok: true })

    const errPending = client.callTool('fail', {})
    transport.respond(transport.find('tools/call').id!, {
      isError: true,
      content: [{ type: 'text', text: 'boom' }],
    })
    await expect(errPending).resolves.toEqual({ ok: false, error: 'boom' })
  })

  it('错误响应与超时：reject 并携带原因', async () => {
    const transport = new FakeTransport()
    const client = new McpClient(transport, { timeoutMs: 20 })
    const pending = client.initialize()
    transport.respondError(transport.find('initialize').id!, 'bad request')
    await expect(pending).rejects.toThrow('bad request')

    const timeoutClient = new McpClient(new FakeTransport(), { timeoutMs: 10 })
    await expect(timeoutClient.initialize()).rejects.toThrow(/超时/)
  })
})
