// S1b Task 4：preload 桥＋NeonforgeBridge 类型面（详设 §7 IPC 面／stage-spec F1 的 renderer 出口）。
// 桥是 renderer 经 IPC 的唯一出口，本测锁两件事：暴露对象命名空间/方法键集＝契约（逐键对齐 ipcDomain 的通道表），
// 及 stop 透传到 gateway:cancel-stream（E1 取消面）。此环境无 electron ⇒ 以 mock 捕获 exposeInMainWorld 的实参。
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Call = { channel: string; args: unknown[] }
type Fn = (...args: unknown[]) => unknown

const h = vi.hoisted(() => ({
  exposed: { key: '', api: null as Record<string, unknown> | null },
  calls: [] as Call[],
}))

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (key: string, api: Record<string, unknown>) => {
      h.exposed.key = key
      h.exposed.api = api
    },
  },
  ipcRenderer: {
    invoke: (channel: string, ...args: unknown[]) => {
      h.calls.push({ channel, args })
      return Promise.resolve()
    },
    on: () => {},
    removeListener: () => {},
  },
}))

// 副作用导入：模块加载即 exposeInMainWorld('neonforge', …)
import '../../src/preload/preload'

const api = h.exposed.api!
const ns = (name: string): Record<string, Fn> => api[name] as Record<string, Fn>

describe('preload 桥（Task 4）', () => {
  beforeEach(() => {
    h.calls.length = 0
  })

  it('暴露在 window.neonforge', () => {
    expect(h.exposed.key).toBe('neonforge')
  })

  it('委托单中心命名空间与方法键集＝契约面', () => {
    expect(Object.keys(ns('delegation')).sort()).toEqual(['accept', 'create', 'list', 'reject'])
    expect(Object.keys(ns('turn'))).toEqual(['start'])
    expect(Object.keys(ns('decision')).sort()).toEqual(['raise', 'resolve'])
    expect(Object.keys(ns('evidence')).sort()).toEqual(['inspect', 'listByDelegation'])
    expect(Object.keys(ns('queue'))).toEqual(['pending'])
    expect(Object.keys(ns('timeline')).sort()).toEqual([
      'onEvent',
      'queryByDelegation',
      'subscribe',
    ])
    // gateway 沿用既有面（streamChat/onStreamChunk/validate/activeModel）＋新增 stop
    expect(Object.keys(ns('gateway')).sort()).toEqual([
      'activeModel',
      'onStreamChunk',
      'stop',
      'streamChat',
      'validate',
    ])
  })

  it('各方法把渠道名与载荷投到 ipcRenderer.invoke', async () => {
    await ns('delegation').create({ intent: 'x' })
    await ns('delegation').accept('d1')
    await ns('delegation').reject('d1', '不要')
    await ns('turn').start({ delegationId: 'd1', triggerSource: '用户输入' })
    await ns('decision').resolve({ decisionPointId: 'dp1', value: '批准' })
    await ns('evidence').inspect('e1')
    await ns('queue').pending()
    await ns('timeline').queryByDelegation('d1')
    expect(h.calls.map((c) => c.channel)).toEqual([
      'delegation:create',
      'delegation:accept',
      'delegation:reject',
      'turn:start',
      'decision:resolve',
      'evidence:inspect',
      'queue:pending',
      'timeline:query-by-delegation',
    ])
    expect(h.calls[1].args).toEqual([{ delegationId: 'd1' }])
  })

  it('stop(streamId) ⇒ gateway:cancel-stream 载荷 {streamId}（E1 取消面）', async () => {
    await ns('gateway').stop('s9')
    expect(h.calls).toEqual([{ channel: 'gateway:cancel-stream', args: [{ streamId: 's9' }] }])
  })

  // S2b Task 3：scope:chain／scope:amend 两通道过桥
  it('scope 段键集＝契约面（恰 amend/chain 两键）', () => {
    expect(Object.keys(ns('scope')).sort()).toEqual(['amend', 'chain'])
  })

  it('scope.chain/amend 把渠道名与载荷原样投到 ipcRenderer.invoke', async () => {
    await ns('scope').chain('d1')
    expect(h.calls).toEqual([{ channel: 'scope:chain', args: [{ delegationId: 'd1' }] }])
    h.calls.length = 0
    const amendArgs = {
      delegationId: 'd1',
      decisionPointId: 'dp1',
      entries: [{ kind: '仓库', pattern: 'docs/**' }],
    }
    await ns('scope').amend(amendArgs)
    expect(h.calls).toEqual([{ channel: 'scope:amend', args: [amendArgs] }])
  })
})
