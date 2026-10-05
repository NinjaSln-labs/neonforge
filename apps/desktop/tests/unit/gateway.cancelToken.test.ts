// E1 流级取消令牌（stage-spec E1／详设 §8 重叠窗＝流剩余＋写前复核延迟）。
// 本仓此前零取消管道（ADR-019 二批实测：gateway.ts 与旧呈现皆无 AbortController），本测即新建面的判据。
// 不打真网络：fetch 桩——/models 返清单，/chat/completions 挂在流上直到 signal 被 abort（＝真 fetch 的取消形状）。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { DeepSeekGateway, beginStream, abortStream } from '../../src/main/gateway'
import { getRuntime, resetRuntime } from '../../src/main/domainRuntime'
import { Turn } from '../../src/domain/turn/Turn'
import { Delegation } from '../../src/domain/delegation/Delegation'
import { DomainError } from '../../src/domain/domainError'

// 守卫类断言取违例码而非文案（坑 p000172：多道闸同在场时只断「抛了错」会次序蒙对）。
const codeOf = (fn: () => unknown): string | null => {
  try {
    fn()
    return null
  } catch (e) {
    return e instanceof DomainError ? e.code : 'other'
  }
}

const sse = (content: string) =>
  new Response(`data: {"choices":[{"delta":{"content":"${content}"}}]}\n\ndata: [DONE]\n\n`, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })

/** chat 挂流桩（abort 即 reject）＋调用计数；正常完成面用 sse() 直接返 */
const stallChat = () => {
  const calls = { chat: 0 }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/models'))
        return new Response(JSON.stringify({ data: [{ id: 'deepseek/deepseek-v4.1-flash' }] }), {
          status: 200,
        })
      calls.chat += 1
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted.', 'AbortError')),
        )
      })
    }),
  )
  return calls
}

const opts = (streamId?: string, onDelta: (c: { type: string }) => void = () => {}) => ({
  providerId: 'deepseek' as const,
  manualModelId: 'deepseek/deepseek-v4.1-flash',
  messages: [{ role: 'user', content: 'x' }],
  onDelta,
  ...(streamId ? { streamId } : {}),
})

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('E1 流级取消令牌（streamId→AbortController→令牌过期）', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    resetRuntime()
  })

  it('注册面：begin 未取消、abort 置 aborted 且返 true、二次与未知 id 皆 false', () => {
    const signal = beginStream('s1')
    expect(signal.aborted).toBe(false)
    expect(abortStream('s1')).toBe(true)
    expect(signal.aborted).toBe(true)
    expect(abortStream('s1')).toBe(false) // 取消即出表（不留已废控制器）
    expect(abortStream('从未注册')).toBe(false) // 未知 id 不抛
  })

  it('外部取消＝一击不重拉（取消非瞬态，重试阶梯必须让位）', async () => {
    const calls = stallChat()
    const g = new DeepSeekGateway()
    const p = g.streamChat('k', opts('s2'))
    await tick() // 让 /models 与 chat 发起
    expect(abortStream('s2')).toBe(true)
    await expect(p).rejects.toThrow(/aborted/i)
    expect(calls.chat).toBe(1) // 重试 3 击的阶梯不得把用户取消当瞬态错误重拉
  })

  it('正常完成也出表（不留悬挂控制器），无 streamId 的旧调用方不入表', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) =>
        String(input).endsWith('/models')
          ? new Response(JSON.stringify({ data: [{ id: 'deepseek/deepseek-v4.1-flash' }] }), {
              status: 200,
            })
          : sse('ok'),
      ),
    )
    const g = new DeepSeekGateway()
    await g.streamChat('k', opts('s3'))
    expect(abortStream('s3')).toBe(false) // 收尾清表
    await g.streamChat('k', opts()) // 旧调用面无 streamId＝不注册、行为不变
    expect(abortStream('s4')).toBe(false)
  })

  it('令牌联动：取消后该轮收口「中止」⇒在飞轮复合值写被 I-13 丢弃＋计数留证', () => {
    const rt = getRuntime()
    const d = Delegation.create('d1', '接真网关前先把 Stop 做对')
    rt.delegations.save(d.delegation)
    rt.log(d.event)
    const started = Turn.start(
      { delegationId: 'd1', turnId: 't1', triggerSource: '用户输入', inputId: 'in1' },
      { inFlight: null, deniedPending: false },
    )
    rt.turns.save(started.turn)
    rt.log(started.started)
    rt.log(started.acknowledged)

    // wiring 侧取消语义（Task 3 落 ipc，本处按同一路径直调）：abort ⇒ 轮终态＝中止（I-10 恰一终态）
    expect(abortStream('s5')).toBe(false) // 未注册面不得误判成功
    const begin = beginStream('s5')
    expect(abortStream('s5')).toBe(true)
    expect(begin.aborted).toBe(true)
    rt.log(started.turn.terminal('中止'))
    rt.turns.save(started.turn)

    const inFlightToken = rt.turns.findInFlight()?.token ?? null
    expect(inFlightToken).toBeNull() // 在飞位已让出（全局单飞 I-1）
    expect(started.turn.guardedWrite(inFlightToken)).toBe(false) // 过期令牌写入＝丢弃
    expect(started.turn.expiredWriteCount).toBe(1) // 计数器留证（不入 timeline，段3 §5 留痕口径）
    expect(codeOf(() => started.turn.terminal('收口'))).toBe('I-10') // 恰一终态（断违例码，非文案）
    expect(rt.timeline.since(1).map((e) => e.type)).toEqual([
      'DelegationCreated',
      'TurnStarted',
      'InputAcknowledged',
      'TurnEnded',
    ])
  })
})
