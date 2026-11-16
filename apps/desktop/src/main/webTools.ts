// 外网检索套件：probe / web_search / web_fetch（门控在 configStore）
// 无覆盖时按可连性：先 DDG，再 Keenable（有 Key 真搜探活，无 Key 仅 GET /health）
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import type { BuiltinSearchProvider, WebAccessConfig } from './configStore.js'

export type WebToolResult =
  { ok: true; data: unknown } | { ok: false; policy?: boolean; error: string }

const FETCH_MAX = 50_000
const DDG_API = 'https://api.duckduckgo.com/'
const KEENABLE_SEARCH = 'https://api.keenable.ai/v1/search'
const KEENABLE_SEARCH_PUBLIC = 'https://api.keenable.ai/v1/search/public'
const KEENABLE_HEALTH = 'https://api.keenable.ai/health'
const KEENABLE_TITLE = 'NeonForge'

export type ProbeWebResult = {
  ok: boolean
  provider?: BuiltinSearchProvider
  error?: string
}

async function probeDdg(timeoutMs: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const u = new URL(DDG_API)
    u.searchParams.set('q', 'neonforge-probe')
    u.searchParams.set('format', 'json')
    u.searchParams.set('no_redirect', '1')
    u.searchParams.set('no_html', '1')
    const res = await fetch(u.toString(), {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (res.ok || (res.status >= 200 && res.status < 500)) return { ok: true }
    return { ok: false, error: `ddg probe http-${res.status}` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network' }
  }
}

async function probeKeenableKeyed(
  timeoutMs: number,
  apiKey: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(KEENABLE_SEARCH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({ query: 'neonforge-probe', mode: 'realtime', max_results: 1 }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (res.ok) return { ok: true }
    return { ok: false, error: `keenable probe http-${res.status}` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network' }
  }
}

async function probeKeenableHealth(timeoutMs: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(KEENABLE_HEALTH, {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (res.status >= 200 && res.status < 300) return { ok: true }
    return { ok: false, error: `keenable health http-${res.status}` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network' }
  }
}

/** 先 DDG → 有 Key 则 keyed search，否则 GET /health；禁止 probe 打 /public */
export async function probeWebAccess(
  timeoutMs = 8000,
  opts?: { keenableApiKey?: string | null },
): Promise<ProbeWebResult> {
  const ddg = await probeDdg(timeoutMs)
  if (ddg.ok) return { ok: true, provider: 'ddg' }
  const key = opts?.keenableApiKey?.trim() || null
  const keen = key ? await probeKeenableKeyed(timeoutMs, key) : await probeKeenableHealth(timeoutMs)
  if (keen.ok) return { ok: true, provider: 'keenable' }
  return { ok: false, error: ddg.error || keen.error || 'network' }
}

function deny(msg: string): WebToolResult {
  return { ok: false, policy: true, error: msg }
}

function gateAccess(cfg: WebAccessConfig, forSearch: boolean): WebToolResult | null {
  if (!cfg.enabled) {
    return deny('外网检索未开启——请在设置中打开「允许外网检索」后再试')
  }
  if (forSearch && !cfg.searchUrl && !cfg.probeOk) {
    return deny('外网探测未通过——请在设置中重新开启「允许外网检索」或配置自有搜索端点')
  }
  return null
}

export interface SearchHit {
  title: string
  url: string
  snippet?: string
}

/** 用户覆盖：POST { query } → JSON results 或纯文本 */
async function searchViaOverride(
  query: string,
  url: string,
  key: string | null,
): Promise<WebToolResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (key) headers.Authorization = `Bearer ${key}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(20000),
    })
    const text = await res.text()
    if (!res.ok)
      return { ok: false, error: `web_search override http-${res.status}: ${text.slice(0, 200)}` }
    try {
      const j = JSON.parse(text) as { results?: SearchHit[]; data?: SearchHit[] }
      const results = j.results ?? j.data
      if (Array.isArray(results)) {
        return { ok: true, data: { source: 'override', results: results.slice(0, 8) } }
      }
    } catch {
      /* 非 JSON → 纯文本 */
    }
    return { ok: true, data: { source: 'override', text: text.slice(0, FETCH_MAX) } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network' }
  }
}

/** 内置：DuckDuckGo Instant Answer（无 Key；结果可能偏少） */
async function searchDdg(query: string): Promise<WebToolResult> {
  const u = new URL(DDG_API)
  u.searchParams.set('q', query)
  u.searchParams.set('format', 'json')
  u.searchParams.set('no_redirect', '1')
  u.searchParams.set('no_html', '1')
  try {
    const res = await fetch(u.toString(), { signal: AbortSignal.timeout(15000) })
    if (!res.ok) return { ok: false, error: `web_search http-${res.status}` }
    const j = (await res.json()) as {
      AbstractText?: string
      AbstractURL?: string
      Heading?: string
      RelatedTopics?: Array<{ Text?: string; FirstURL?: string; Topics?: unknown[] }>
    }
    const results: SearchHit[] = []
    if (j.AbstractText && j.AbstractURL) {
      results.push({
        title: j.Heading || j.AbstractURL,
        url: j.AbstractURL,
        snippet: j.AbstractText.slice(0, 300),
      })
    }
    for (const t of j.RelatedTopics ?? []) {
      if (t.FirstURL && t.Text) {
        results.push({ title: t.Text.slice(0, 80), url: t.FirstURL, snippet: t.Text })
      }
      if (results.length >= 8) break
    }
    return {
      ok: true,
      data: {
        source: 'ddg',
        results,
        note:
          results.length === 0
            ? '内置检索无命中——可在设置配置自有搜索端点（webSearchUrl）覆盖'
            : undefined,
      },
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network' }
  }
}

function parseKeenableResults(text: string, source: 'keenable' | 'keenable-public'): WebToolResult {
  const j = JSON.parse(text) as {
    results?: Array<{ title?: string; url?: string; snippet?: string; description?: string }>
  }
  const results: SearchHit[] = (j.results ?? [])
    .filter((r) => r.url && r.title)
    .slice(0, 8)
    .map((r) => ({
      title: String(r.title),
      url: String(r.url),
      snippet: (r.snippet || r.description || '').slice(0, 300) || undefined,
    }))
  return {
    ok: true,
    data: {
      source,
      results,
      note: results.length === 0 ? 'Keenable 无命中——可换查询或配置自有搜索端点' : undefined,
    },
  }
}

/** 有 Key → /v1/search；试用开 → /public；否则 policy 拒绝 */
async function searchKeenable(query: string, cfg: WebAccessConfig): Promise<WebToolResult> {
  const key = cfg.keenableApiKey?.trim() || null
  if (!key && !cfg.keenablePublicTrial) {
    return deny(
      'Keenable 搜索需配置 API Key，或在设置中开启「公共试用」，或填写自有搜索端点（searchUrl）',
    )
  }
  const url = key ? KEENABLE_SEARCH : KEENABLE_SEARCH_PUBLIC
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (key) headers['X-API-Key'] = key
  else headers['X-Keenable-Title'] = KEENABLE_TITLE
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, mode: 'realtime', max_results: 8 }),
      signal: AbortSignal.timeout(20000),
    })
    const text = await res.text()
    if (!res.ok) {
      return { ok: false, error: `web_search keenable http-${res.status}: ${text.slice(0, 200)}` }
    }
    return parseKeenableResults(text, key ? 'keenable' : 'keenable-public')
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network' }
  }
}

function searchBuiltin(query: string, cfg: WebAccessConfig): Promise<WebToolResult> {
  // 旧配置 probeOk 但无 provider：按探测顺序回退试 DDG（兼容）
  if (cfg.builtinProvider === 'keenable') return searchKeenable(query, cfg)
  return searchDdg(query)
}

export async function webSearch(query: string, cfg: WebAccessConfig): Promise<WebToolResult> {
  const q = query.trim()
  if (!q) return { ok: false, error: 'web_search: 缺少 query' }
  const blocked = gateAccess(cfg, true)
  if (blocked) return blocked
  if (cfg.searchUrl) return searchViaOverride(q, cfg.searchUrl, cfg.searchKey)
  return searchBuiltin(q, cfg)
}

function stripNoise(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// P1-01：SSRF 边界——web_fetch 只访问公网 http(s)，拒绝本机/私网/链路本地/云元数据地址。
// hostname 来自 URL 解析（IPv6 带方括号）；重定向逐跳复用同一判定。
// 2026-11-17 审查修复：补齐 IPv4-mapped IPv6 与 DNS 解析到私网地址（原仅字面量匹配）。

function stripIpBrackets(hostname: string): string {
  const h = hostname.trim().toLowerCase()
  return h.startsWith('[') && h.endsWith(']') ? h.slice(1, -1) : h
}

function privateIpv4(a: number, b: number): boolean {
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 126) return true // CGNAT
  return false
}

/** 字面量 IP（含 IPv4-mapped IPv6）是否本机/私网/链路本地。 */
export function isPrivateIp(address: string): boolean {
  const bare = stripIpBrackets(address)
  // IPv4-mapped IPv6：::ffff:127.0.0.1 / ::ffff:7f00:1 / ::ffff:a9fe:a9fe
  const mapped = bare.match(/^::ffff:(.+)$/i)
  if (mapped) {
    const tail = mapped[1] ?? ''
    const dotted = tail.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
    if (dotted) {
      return privateIpv4(Number(dotted[1]), Number(dotted[2]))
    }
    const hex = tail.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i)
    if (hex) {
      const hi = Number.parseInt(hex[1] ?? '0', 16)
      return privateIpv4(hi >> 8, hi & 0xff)
    }
  }
  if (bare === '::1' || bare === '::' || bare === '0:0:0:0:0:0:0:1') return true
  // IPv6 唯一本地地址（fc00::/7）与链路本地（fe80::/10）
  if (/^(?:fc|fd|fe)[0-9a-f]{2}:/.test(bare)) return true
  const m = bare.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    return privateIpv4(Number(m[1]), Number(m[2]))
  }
  return false
}

export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h === 'localhost.localdomain') return true
  return isPrivateIp(h)
}

export type HostResolver = (hostname: string) => Promise<string[]>

export async function defaultHostResolver(hostname: string): Promise<string[]> {
  const addrs = await lookup(hostname, { all: true, verbatim: true })
  return addrs.map((a) => a.address)
}

const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true'

/** 入口/重定向逐跳校验：字面量私网直接拒绝；域名解析出的任一地址为私网则拒绝。 */
export async function assertPublicHost(hostname: string, resolver?: HostResolver): Promise<void> {
  const bare = stripIpBrackets(hostname)
  if (isPrivateHost(bare)) throw new Error('web_fetch: 拒绝访问本机/私网地址')
  if (isIP(bare) !== 0) return
  // 单测不依赖外网 DNS；生产路径必须解析并校验（resolver 注入仅供单测验证 DNS 分支）
  if (!resolver && isTestEnv) return
  const resolve = resolver ?? defaultHostResolver
  const addresses = await resolve(bare)
  if (addresses.length === 0) throw new Error('web_fetch: 无法解析主机地址')
  for (const address of addresses) {
    if (isPrivateIp(address)) throw new Error('web_fetch: 拒绝访问本机/私网地址')
  }
}

const MAX_REDIRECTS = 5

async function fetchWithRedirectGuard(initial: URL): Promise<Response> {
  let current = initial
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (current.protocol !== 'http:' && current.protocol !== 'https:') {
      throw new Error('web_fetch: 重定向只支持 http/https')
    }
    await assertPublicHost(current.hostname)
    const res = await fetch(current.toString(), {
      redirect: 'manual', // 逐跳校验目标 host（follow 会让私网/元数据地址绕过入口检查）
      signal: AbortSignal.timeout(20000),
      headers: { Accept: 'text/html,text/plain,application/json,*/*' },
    })
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (!location) return res
      if (hop === MAX_REDIRECTS) throw new Error('web_fetch: 重定向次数过多')
      let next: URL
      try {
        next = new URL(location, current)
      } catch {
        throw new Error('web_fetch: 重定向地址无效')
      }
      current = next
      continue
    }
    return res
  }
  throw new Error('web_fetch: 重定向次数过多')
}

export async function webFetch(url: string, cfg: WebAccessConfig): Promise<WebToolResult> {
  const blocked = gateAccess(cfg, false)
  if (blocked) return blocked
  let parsed: URL
  try {
    parsed = new URL(url.trim())
  } catch {
    return { ok: false, error: 'web_fetch: URL 无效' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'web_fetch: 只支持 http/https' }
  }
  try {
    const res = await fetchWithRedirectGuard(parsed)
    const raw = await res.text()
    const truncated = raw.length > FETCH_MAX
    const body = raw.slice(0, FETCH_MAX)
    const ct = res.headers.get('content-type') ?? ''
    const text = /html/i.test(ct) ? stripNoise(body) : body
    return {
      ok: true,
      data: {
        url: res.url || parsed.toString(),
        status: res.status,
        contentType: ct,
        truncated,
        text: text.slice(0, FETCH_MAX),
      },
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network' }
  }
}
