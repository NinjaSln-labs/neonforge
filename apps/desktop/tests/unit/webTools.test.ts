import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  assertPublicHost,
  isPrivateIp,
  probeWebAccess,
  webSearch,
  webFetch,
  type SearchHit,
} from '../../src/main/webTools.js'
import type { WebAccessConfig } from '../../src/main/configStore.js'

function cfg(p: Partial<WebAccessConfig> = {}): WebAccessConfig {
  return {
    enabled: false,
    probeOk: false,
    builtinProvider: null,
    searchUrl: null,
    hasSearchKey: false,
    searchKey: null,
    keenableApiKey: null,
    hasKeenableKey: false,
    keenablePublicTrial: false,
    ...p,
  }
}

describe('webTools 门控', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('未开启 → policy 拒绝', async () => {
    const r = await webSearch('foo', cfg())
    expect(r).toMatchObject({ ok: false, policy: true })
    expect(String((r as { error: string }).error)).toMatch(/未开启/)
  })

  it('开启但无覆盖且探测未过 → 拒绝 search', async () => {
    const r = await webSearch('foo', cfg({ enabled: true, probeOk: false }))
    expect(r).toMatchObject({ ok: false, policy: true })
    expect(String((r as { error: string }).error)).toMatch(/探测/)
  })

  it('开启即可 web_fetch（不依赖 probeOk）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html><script>x</script><body>Hello world</body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    )
    const r = await webFetch('https://example.com/page', cfg({ enabled: true, probeOk: false }))
    expect(r.ok).toBe(true)
    if (r.ok) {
      const d = r.data as { text: string }
      expect(d.text).toContain('Hello world')
      expect(d.text).not.toContain('script')
    }
  })

  it('web_fetch 拒绝非 http(s)', async () => {
    const r = await webFetch('file:///etc/passwd', cfg({ enabled: true }))
    expect(r).toMatchObject({ ok: false })
    expect(String((r as { error: string }).error)).toMatch(/http/)
  })

  it('覆盖端点 POST query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [{ title: 'A', url: 'https://a.test', snippet: 's' }] satisfies SearchHit[],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const r = await webSearch(
      'neon',
      cfg({
        enabled: true,
        probeOk: false,
        searchUrl: 'https://my.search/api',
        searchKey: 'sk-x',
      }),
    )
    expect(r.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://my.search/api',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer sk-x' }),
      }),
    )
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    expect(body).toEqual({ query: 'neon' })
  })

  it('probeWebAccess：DDG 通 → provider=ddg，不探 Keenable', async () => {
    const urls: string[] = []
    globalThis.fetch = async (input: RequestInfo | URL) => {
      urls.push(String(input))
      return new Response('{}', { status: 200 })
    }
    const r = await probeWebAccess(2000)
    expect(r).toEqual({ ok: true, provider: 'ddg' })
    expect(urls.some((u) => u.includes('api.duckduckgo.com'))).toBe(true)
    expect(urls.every((u) => !u.includes('keenable'))).toBe(true)
  })

  it('probeWebAccess：DDG 失败无 Key → GET health → keenable', async () => {
    const urls: string[] = []
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const u = String(input)
      urls.push(u)
      if (u.includes('duckduckgo')) throw new TypeError('fetch failed')
      return new Response('ok', { status: 200 })
    }
    const r = await probeWebAccess(2000)
    expect(r).toEqual({ ok: true, provider: 'keenable' })
    expect(urls.some((u) => u.includes('/health'))).toBe(true)
    expect(urls.every((u) => !u.includes('/search'))).toBe(true)
  })

  it('probeWebAccess：DDG 失败有 Key → POST /v1/search → keenable', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const u = String(input)
      if (u.includes('duckduckgo')) throw new TypeError('fetch failed')
      return new Response(JSON.stringify({ results: [] }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const r = await probeWebAccess(2000, { keenableApiKey: 'keen_test' })
    expect(r).toEqual({ ok: true, provider: 'keenable' })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.keenable.ai/v1/search',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-API-Key': 'keen_test' }),
      }),
    )
    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls.every((u) => !u.includes('/search/public') && !u.includes('/health'))).toBe(true)
  })

  it('probeWebAccess：两者皆失败', async () => {
    globalThis.fetch = async () => {
      throw new TypeError('fetch failed')
    }
    const r = await probeWebAccess(500)
    expect(r.ok).toBe(false)
  })

  it('web_search keenable 无 Key 试用关 → policy，不打 public', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const r = await webSearch(
      '天气',
      cfg({ enabled: true, probeOk: true, builtinProvider: 'keenable' }),
    )
    expect(r).toMatchObject({ ok: false, policy: true })
    expect(String((r as { error: string }).error)).toMatch(/Key|试用|端点/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('web_search keenable 有 Key → POST /v1/search + X-API-Key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [{ title: 'K', url: 'https://k.test', snippet: 's' }],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const r = await webSearch(
      '天气',
      cfg({
        enabled: true,
        probeOk: true,
        builtinProvider: 'keenable',
        keenableApiKey: 'keen_x',
        hasKeenableKey: true,
      }),
    )
    expect(r.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.keenable.ai/v1/search',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-API-Key': 'keen_x' }),
      }),
    )
  })

  it('web_search keenable 试用开无 Key → public + Title', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [{ title: 'K', url: 'https://k.test', snippet: 's' }],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const r = await webSearch(
      '天气',
      cfg({
        enabled: true,
        probeOk: true,
        builtinProvider: 'keenable',
        keenablePublicTrial: true,
      }),
    )
    expect(r.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.keenable.ai/v1/search/public',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Keenable-Title': 'NeonForge' }),
      }),
    )
  })
})

// P1-01：SSRF 边界——本机/私网/云元数据地址拒绝；重定向手动逐跳校验
describe('web_fetch SSRF 边界', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('localhost/私网/元数据地址 → 拒绝且不发起请求', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const r1 = await webFetch('http://localhost:3000/x', cfg({ enabled: true }))
    expect(r1).toMatchObject({ ok: false })
    expect(String((r1 as { error: string }).error)).toMatch(/本机|私网/)
    const r2 = await webFetch('http://169.254.169.254/latest/meta-data', cfg({ enabled: true }))
    expect(r2).toMatchObject({ ok: false })
    const r3 = await webFetch('http://10.0.0.5/admin', cfg({ enabled: true }))
    expect(r3).toMatchObject({ ok: false })
    const r4 = await webFetch('http://192.168.1.1/', cfg({ enabled: true }))
    expect(r4).toMatchObject({ ok: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // 2026-11-17 审查修复：IPv4-mapped IPv6 与 DNS 解析到私网均不得绕过 SSRF 边界
  it('IPv4-mapped IPv6 字面量 → 拒绝且不发起请求', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true)
    expect(isPrivateIp('::ffff:7f00:1')).toBe(true)
    expect(isPrivateIp('::ffff:a9fe:a9fe')).toBe(true)
    expect(isPrivateIp('8.0.10.0')).toBe(false)
    expect(isPrivateIp('93.184.216.34')).toBe(false)
    const r1 = await webFetch('http://[::ffff:127.0.0.1]:8080/', cfg({ enabled: true }))
    expect(r1).toMatchObject({ ok: false })
    const r2 = await webFetch('http://[::ffff:a9fe:a9fe]/', cfg({ enabled: true }))
    expect(r2).toMatchObject({ ok: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('DNS 解析到私网/回环 → 拒绝；公网地址放行', async () => {
    await expect(assertPublicHost('localtest.me', async () => ['127.0.0.1'])).rejects.toThrow(
      /本机|私网/,
    )
    await expect(
      assertPublicHost('localtest.me', async () => ['::ffff:127.0.0.1']),
    ).rejects.toThrow(/本机|私网/)
    await expect(
      assertPublicHost('example.com', async () => ['93.184.216.34']),
    ).resolves.toBeUndefined()
  })

  it('重定向到私网 → 阻断（只发起第一跳）', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response('', { status: 302, headers: { Location: 'http://127.0.0.1/admin' } }),
      )
    vi.stubGlobal('fetch', fetchMock)
    const r = await webFetch('https://example.com/redirect', cfg({ enabled: true }))
    expect(r).toMatchObject({ ok: false })
    expect(String((r as { error: string }).error)).toMatch(/重定向|本机|私网/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('重定向到合法地址 → 跟随并返回内容', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('', { status: 302, headers: { Location: 'https://example.com/final' } }),
      )
      .mockResolvedValueOnce(
        new Response('ok', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
      )
    vi.stubGlobal('fetch', fetchMock)
    const r = await webFetch('https://example.com/start', cfg({ enabled: true }))
    expect(r.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('重定向协议非 http(s) → 拒绝', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response('', { status: 302, headers: { Location: 'file:///etc/passwd' } }),
      )
    vi.stubGlobal('fetch', fetchMock)
    const r = await webFetch('https://example.com/x', cfg({ enabled: true }))
    expect(r).toMatchObject({ ok: false })
    expect(String((r as { error: string }).error)).toMatch(/重定向|http/)
  })
})
