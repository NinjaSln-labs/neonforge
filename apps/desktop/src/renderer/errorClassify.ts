// 2026-08-07 T1（regex-todo）：聊天错误分类——原 ConversationPanel finishError 用 String(err).includes('5') 过宽
// （任何含 '5' 的串如 token-limit-50/5000/x5x 都误归 service）；改为状态码/字面量/超时/网关前缀结构化匹配。
// 链路：gateway streamChat throw → ipc catch → e.message → finishError(err) → 本函数
// 信号全集：
//   我方字面量：key-invalid / service-error / timeout / network / gateway-error
//   我方网关文本：gateway: http-<status> / gateway: no-body（gateway.ts throw）
//   外部文本：DeepSeek 错误消息 / AbortSignal TimeoutError message（'The operation was aborted due to timeout'）/ fetch 网络错误 message

export type ChatErrorType = 'key-invalid' | 'service' | 'unknown'

export const classifyChatError = (err: string): ChatErrorType => {
  if (err === 'key-invalid' || /(^|\D)401(\D|$)/.test(err)) return 'key-invalid'
  if (
    err === 'service-error' ||
    err === 'timeout' ||
    err === 'network' ||
    err === 'gateway-error' ||
    /(^|\D)(5\d{2})(\D|$)/.test(err) || // 5xx 状态码（500/502/503…）——状态码边界匹配，防 5000/x5x 误伤
    /tim(?:eout|ed out)/i.test(err) || // 超时语义：'timeout' 字面 / 'The operation was aborted due to timeout' / 'timed out after 45s'
    err.startsWith('gateway') // 我方网关错误（gateway: http-xxx / gateway: no-body）
  )
    return 'service'
  return 'unknown'
}
