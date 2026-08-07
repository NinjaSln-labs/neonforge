import { describe, it, expect } from 'vitest'
import { GatewayHttpError, classifyGatewayError } from '../../src/main/gateway'

// 2026-08-07 T1 根因补强（用户质疑「只是替换成正则匹配吗」——正则文本重建是打地鼠）：
// 根因 = gateway 层已有 res.status（结构化）但 throw 成文本 gateway: http-500 → ipc 文本 → renderer 正则抠
// 修复 = GatewayHttpError 携带 status 透传 → ipc 层 classifyGatewayError 返回结构化 errorType → renderer 读字段（文本仅兜底）

describe('GatewayHttpError（结构化状态码透传）', () => {
  it('携带 status 属性 + 文本 message 兼容（gateway: http-<status>）', () => {
    const e = new GatewayHttpError(500)
    expect(e.status).toBe(500)
    expect(e.message).toBe('gateway: http-500')
    expect(e).toBeInstanceOf(Error)
  })
})

describe('classifyGatewayError（ipc 层分类——renderer 不再正则解析文本）', () => {
  it('401 → key-invalid', () => {
    expect(classifyGatewayError(new GatewayHttpError(401))).toBe('key-invalid')
  })

  it('5xx（500/502/503）→ service', () => {
    expect(classifyGatewayError(new GatewayHttpError(500))).toBe('service')
    expect(classifyGatewayError(new GatewayHttpError(502))).toBe('service')
    expect(classifyGatewayError(new GatewayHttpError(503))).toBe('service')
  })

  it('429 限流 → service（稍后再试）', () => {
    expect(classifyGatewayError(new GatewayHttpError(429))).toBe('service')
  })

  it('gateway 层错误（gateway: no-body）→ service', () => {
    expect(classifyGatewayError(new Error('gateway: no-body'))).toBe('service')
  })

  it('AbortSignal 超时（DOMException TimeoutError）→ service', () => {
    expect(classifyGatewayError(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))).toBe('service')
  })

  it('fetch 网络错误（TypeError）→ service', () => {
    expect(classifyGatewayError(new TypeError('fetch failed'))).toBe('service')
  })

  it('其他未知错误 → unknown', () => {
    expect(classifyGatewayError(new Error('something else entirely'))).toBe('unknown')
  })
})
