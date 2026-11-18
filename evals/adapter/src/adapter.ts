#!/usr/bin/env node
// NeonForge 无头评估适配器（v0）
//
// 外部 harness（BFCL / AgentDojo）通过本适配器调用本地 Magpie：
// - 复用 NeonForge 的 provider 传输语义与工具参数修复（toolCallRepair）
// - 可选注入 NeonForge 产品系统提示（NF_ADAPTER_PROMPT=product）
// - 只做模型请求转发；不执行工具、不落盘、不记录请求正文
//
// 注意：v0 尚未把工具授权/审批门接入 harness；能力卡必须注明这一点。

import http from 'node:http'
import { Readable } from 'node:stream'
import { pathToFileURL } from 'node:url'
import { toolCallRepair } from '../../../apps/desktop/src/main/gateway.js'
import { buildSysHint } from '../../../apps/desktop/src/renderer/sysPrompt.js'

export type PromptMode = 'none' | 'product'

export interface AdapterConfig {
  host: string
  port: number
  upstreamBase: string
  upstreamModel: string
  promptMode: PromptMode
  timeoutMs: number
  apiKey: string
  tolerantArgs: boolean
}

const PRODUCT_PROMPT = buildSysHint('', '', '').content
const MAX_BODY_BYTES = 8 * 1024 * 1024
const PASSTHROUGH_KEYS = [
  'tools',
  'tool_choice',
  'temperature',
  'top_p',
  'max_tokens',
  'stop',
  'stream',
  'stream_options',
  'parallel_tool_calls',
  'response_format',
  'seed',
] as const

export function resolveConfig(env: NodeJS.ProcessEnv): AdapterConfig {
  const apiKey = env.MAGPIE_GATEWAY_KEY
  if (!apiKey) throw new Error('MAGPIE_GATEWAY_KEY is required')
  const port = Number(env.NF_ADAPTER_PORT ?? '8000')
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`invalid NF_ADAPTER_PORT: ${env.NF_ADAPTER_PORT}`)
  }
  const timeoutMs = Number(env.NF_ADAPTER_TIMEOUT_MS ?? '180000')
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) {
    throw new Error(`invalid NF_ADAPTER_TIMEOUT_MS: ${env.NF_ADAPTER_TIMEOUT_MS}`)
  }
  return {
    host: env.NF_ADAPTER_HOST ?? '127.0.0.1',
    port,
    upstreamBase: (env.MAGPIE_BASE_URL ?? 'http://127.0.0.1:3425/v1').replace(/\/+$/, ''),
    upstreamModel: env.MAGPIE_MODEL ?? 'opendesign/deepseek-v4.1-flash-eco',
    promptMode: env.NF_ADAPTER_PROMPT === 'product' ? 'product' : 'none',
    timeoutMs,
    apiKey,
    tolerantArgs: env.NF_ADAPTER_TOLERANT_ARGS === '1',
  }
}

/** 注入产品系统提示；不覆盖 harness 自己的 system message。 */
export function buildMessages(messages: unknown, mode: PromptMode): unknown[] {
  if (!Array.isArray(messages)) throw new Error('messages must be an array')
  const out = messages.slice()
  if (mode !== 'product') return out
  const already = out.some(
    (m) =>
      m !== null &&
      typeof m === 'object' &&
      (m as { role?: unknown }).role === 'system' &&
      (m as { content?: unknown }).content === PRODUCT_PROMPT,
  )
  if (!already) out.unshift({ role: 'system', content: PRODUCT_PROMPT })
  return out
}

/** 构造发往 Magpie 的请求体：模型名收敛到本次评估模型，过滤非必要字段。 */
export function buildUpstreamRequest(
  body: unknown,
  config: Pick<AdapterConfig, 'upstreamModel' | 'promptMode'>,
): Record<string, unknown> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('body must be a JSON object')
  }
  const source = body as Record<string, unknown>
  const out: Record<string, unknown> = {
    model: config.upstreamModel,
    messages: buildMessages(source.messages, config.promptMode),
  }
  for (const key of PASSTHROUGH_KEYS) {
    if (key in source && source[key] !== undefined) out[key] = source[key]
  }
  return out
}

/** 对返回的 tool_calls 参数做 NeonForge 同源修复；返回修复/容忍条数。 */
export function repairToolCalls(
  payload: unknown,
  tolerantArgs = false,
): { payload: unknown; repaired: number; coerced: number } {
  if (payload === null || typeof payload !== 'object')
    return { payload, repaired: 0, coerced: 0 }
  const choices = (payload as { choices?: unknown }).choices
  if (!Array.isArray(choices)) return { payload, repaired: 0, coerced: 0 }
  let repaired = 0
  let coerced = 0
  const apply = (
    target: { arguments?: unknown },
    args: unknown,
  ): void => {
    const fixed = repairArguments(args, tolerantArgs)
    if (fixed === undefined) return
    target.arguments = fixed.arguments
    if (fixed.coerced) coerced++
    else repaired++
  }
  for (const choice of choices) {
    if (choice === null || typeof choice !== 'object') continue
    const message = (choice as { message?: unknown }).message
    if (message === null || typeof message !== 'object') continue
    const calls = (message as { tool_calls?: unknown }).tool_calls
    if (Array.isArray(calls)) {
      for (const call of calls) {
        if (call === null || typeof call !== 'object') continue
        const fn = (call as { function?: unknown }).function
        if (fn === null || typeof fn !== 'object') continue
        apply(fn as { arguments?: unknown }, (fn as { arguments?: unknown }).arguments)
      }
    }
    // 旧式 function_call（部分 harness 仍会读取）
    const legacy = (message as { function_call?: unknown }).function_call
    if (legacy !== null && typeof legacy === 'object') {
      apply(legacy as { arguments?: unknown }, (legacy as { arguments?: unknown }).arguments)
    }
  }
  return { payload, repaired, coerced }
}

function repairArguments(
  args: unknown,
  tolerantArgs: boolean,
): { arguments: string; coerced: boolean } | undefined {
  if (args !== null && typeof args === 'object') {
    return { arguments: JSON.stringify(args), coerced: false }
  }
  if (typeof args !== 'string') return undefined
  const fixed = toolCallRepair(args, 0) ?? toolCallRepair(args, 1)
  if (fixed !== null && fixed !== undefined && typeof fixed === 'object') {
    const serialized = JSON.stringify(fixed)
    return serialized === args ? undefined : { arguments: serialized, coerced: false }
  }
  if (tolerantArgs) {
    try {
      JSON.parse(args)
      return undefined
    } catch {
      // 评估用容忍模式：保留调用但把无法解析的参数降级为 {}；不记录参数内容
      return { arguments: '{}', coerced: true }
    }
  }
  return undefined
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  })
  res.end(payload)
}

function upstreamHeaders(config: AdapterConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
    'x-openai-actor-authorization': 'magpie',
    // 仅用于本地审计；不包含 prompt/正文
    'User-Agent': 'neonforge-eval-adapter/0.1',
  }
}

async function handleChat(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  config: AdapterConfig,
): Promise<void> {
  let source: unknown
  try {
    source = JSON.parse(await readBody(req))
  } catch (e) {
    sendJson(res, 400, { error: { message: e instanceof Error ? e.message : 'invalid body' } })
    return
  }

  let upstreamBody: Record<string, unknown>
  try {
    upstreamBody = buildUpstreamRequest(source, config)
  } catch (e) {
    sendJson(res, 400, { error: { message: e instanceof Error ? e.message : 'invalid request' } })
    return
  }

  const stream = upstreamBody.stream === true
  const tools = Array.isArray(upstreamBody.tools) ? upstreamBody.tools.length : 0
  console.log(
    `[adapter] chat model=${config.upstreamModel} prompt=${config.promptMode} messages=${
      (upstreamBody.messages as unknown[]).length
    } tools=${tools} stream=${stream}`,
  )

  let upstream: Response
  try {
    upstream = await fetch(`${config.upstreamBase}/chat/completions`, {
      method: 'POST',
      headers: upstreamHeaders(config),
      body: JSON.stringify(upstreamBody),
      signal: AbortSignal.timeout(config.timeoutMs),
    })
  } catch (e) {
    console.log(`[adapter] upstream error: ${e instanceof Error ? e.name : 'unknown'}`)
    sendJson(res, 502, { error: { message: 'upstream request failed' } })
    return
  }

  console.log(`[adapter] upstream http=${upstream.status}`)

  if (stream) {
    res.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'text/event-stream',
      'Cache-Control': 'no-store',
    })
    if (!upstream.body) {
      res.end()
      return
    }
    Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res)
    return
  }

  const text = await upstream.text()
  const contentType = upstream.headers.get('Content-Type') ?? ''
  if (!contentType.includes('application/json')) {
    res.writeHead(upstream.status, {
      'Content-Type': contentType || 'text/plain; charset=utf-8',
      'Content-Length': Buffer.byteLength(text),
      'Cache-Control': 'no-store',
    })
    res.end(text)
    return
  }

  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    sendJson(res, 502, { error: { message: 'upstream returned invalid JSON' } })
    return
  }
  if (upstream.ok) {
    const repaired = repairToolCalls(payload, config.tolerantArgs)
    if (repaired.repaired > 0) console.log(`[adapter] repaired tool_calls=${repaired.repaired}`)
    if (repaired.coerced > 0) console.log(`[adapter] coerced tool_calls=${repaired.coerced}`)
  }
  sendJson(res, upstream.status, payload)
}

export function createServer(config: AdapterConfig): http.Server {
  return http.createServer((req, res) => {
    const url = req.url ?? '/'
    if (req.method === 'GET' && url === '/health') {
      sendJson(res, 200, {
        ok: true,
        provider: 'magpie',
        model: config.upstreamModel,
        prompt: config.promptMode,
        tolerantArgs: config.tolerantArgs,
      })
      return
    }
    if (req.method === 'GET' && url === '/v1/models') {
      sendJson(res, 200, {
        object: 'list',
        data: [{ id: config.upstreamModel, object: 'model', owned_by: 'magpie' }],
      })
      return
    }
    if (req.method === 'POST' && url === '/v1/chat/completions') {
      void handleChat(req, res, config).catch((e) => {
        console.log(`[adapter] handler error: ${e instanceof Error ? e.message : 'unknown'}`)
        if (!res.headersSent) sendJson(res, 500, { error: { message: 'adapter error' } })
        else res.end()
      })
      return
    }
    sendJson(res, 404, { error: { message: 'not found' } })
  })
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  let config: AdapterConfig
  try {
    config = resolveConfig(process.env)
  } catch (e) {
    console.error(`[adapter] ${e instanceof Error ? e.message : 'invalid config'}`)
    process.exit(2)
  }
  const server = createServer(config)
  server.listen(config.port, config.host, () => {
    console.log(
      `[adapter] listening http://${config.host}:${config.port} -> ${config.upstreamBase} model=${config.upstreamModel} prompt=${config.promptMode}`,
    )
  })
  const shutdown = () => {
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 3000).unref()
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}
