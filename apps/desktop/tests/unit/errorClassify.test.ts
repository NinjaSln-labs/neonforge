import { describe, it, expect } from 'vitest'
import { classifyChatError } from '../../src/renderer/errorClassify'

// 2026-08-07 T1（regex-todo）：错误分类 String(err).includes('5') 过宽——任何含 '5' 的串（token-limit-50/5000/x5x）都误归 service
// 链路：gateway streamChat throw → ipc catch e.message → finishError 文本解析
// 信号全集：我方字面量（key-invalid/service-error/timeout/network/gateway-error）+ 我方网关文本（gateway: http-<status>/gateway: no-body）
//          + 外部文本（DeepSeek 错误消息 / AbortSignal TimeoutError message / fetch 网络错误 message）

describe('classifyChatError key-invalid', () => {
  it('我方字面量 key-invalid → key-invalid', () => {
    expect(classifyChatError('key-invalid')).toBe('key-invalid')
  })

  it('401 状态码（gateway: http-401 / 文本含 401）→ key-invalid', () => {
    expect(classifyChatError('gateway: http-401')).toBe('key-invalid')
    expect(classifyChatError('Unauthorized: 401')).toBe('key-invalid')
  })

  it('401 前后非数字边界——4012 不是 401 不误判', () => {
    expect(classifyChatError('error-4012')).not.toBe('key-invalid')
  })
})

describe('classifyChatError service', () => {
  it('5xx 状态码（gateway: http-500 / 独立 500 / 503 Service Unavailable）→ service', () => {
    expect(classifyChatError('gateway: http-500')).toBe('service')
    expect(classifyChatError('500')).toBe('service')
    expect(classifyChatError('503 Service Unavailable')).toBe('service')
    expect(classifyChatError('gateway: http-502 Bad Gateway')).toBe('service')
  })

  it('我方字面量 service-error/timeout/network/gateway-error → service', () => {
    expect(classifyChatError('service-error')).toBe('service')
    expect(classifyChatError('timeout')).toBe('service')
    expect(classifyChatError('network')).toBe('service')
    expect(classifyChatError('gateway-error')).toBe('service')
  })

  it('AbortSignal 超时文本（The operation was aborted due to timeout）→ service', () => {
    expect(classifyChatError('The operation was aborted due to timeout')).toBe('service')
    expect(classifyChatError('request timed out after 45s')).toBe('service')
  })

  it('gateway 层错误（gateway: no-body / gateway: http-429 限流）→ service', () => {
    expect(classifyChatError('gateway: no-body')).toBe('service')
    expect(classifyChatError('gateway: http-429')).toBe('service')
  })
})

describe("classifyChatError T1 误伤回归（原 includes('5') 过宽）", () => {
  it('含 5 但不是状态码（token-limit-50 / 5000 / x5x）→ 不再误归 service', () => {
    expect(classifyChatError('token-limit-50')).toBe('unknown')
    expect(classifyChatError('5000')).toBe('unknown')
    expect(classifyChatError('x5x')).toBe('unknown')
    expect(classifyChatError('error code 5')).toBe('unknown')
  })

  it('完全无关文本 → unknown', () => {
    expect(classifyChatError('something else entirely')).toBe('unknown')
    expect(classifyChatError('')).toBe('unknown')
  })
})
