// S1b Task 1：main 持领域单例（详设 §7 机制落点／plan Task 1）。
// 本测只验装配面的三件事：单例生命周期（内存态、重启即失＝F2 诚实前提）、仓储面在场可用、
// 事件经唯一机制口落账（S-1 写路径）。真网关接入＝Task 3（本任务只立注入口）。
import { describe, it, expect, beforeEach } from 'vitest'
import { getRuntime, resetRuntime, type GatewayLike } from '../../src/main/domainRuntime'
import { Delegation } from '../../src/domain/delegation/Delegation'
import { Scope } from '../../src/domain/authorization/Scope'

const noopGateway: GatewayLike = { nextChangeSet: () => '' }

describe('domainRuntime 领域单例装配', () => {
  beforeEach(() => {
    resetRuntime()
  })

  it('同进程多次调＝同一实例（内存态生命周期＝一进程一运行时）', () => {
    expect(getRuntime()).toBe(getRuntime())
  })

  it('仓储面在场：delegations.findActive() 返数组（初始空）', () => {
    const rt = getRuntime()
    expect(Array.isArray(rt.delegations.findActive())).toBe(true)
    expect(rt.delegations.findActive()).toEqual([])
  })

  it('聚合与仓储同源：Delegation.create 存单例后 findActive 命中同 id', () => {
    const rt = getRuntime()
    const { delegation, event } = Delegation.create('d1', '把 forge 接进真网关')
    rt.delegations.save(delegation)
    rt.log(event)
    expect(rt.delegations.findActive().map((d) => d.delegationId)).toEqual(['d1'])
    expect(rt.timeline.since(1).map((e) => e.type)).toEqual(['DelegationCreated'])
  })

  it('log 经唯一机制口：连发三草稿 seq＝[1,2,3] 单调无跳号（I-2）', () => {
    const rt = getRuntime()
    for (const id of ['a', 'b', 'c']) rt.log(Delegation.create(id, 'x').event)
    expect(rt.timeline.since(1).map((e) => e.seq)).toEqual([1, 2, 3])
  })

  it('网关注入口可换（真网关 Task 3 由此注入），newDeps 绑定该委托的 Scope', () => {
    const rt = getRuntime({ gateway: noopGateway })
    expect(rt.gateway).toBe(noopGateway)
    const scope = Scope.initial('d1', [{ kind: '目录', pattern: 'src/**' }])
    const deps = rt.newDeps(scope)
    expect([deps.scope === scope, deps.list.length, deps.changeSets.size]).toEqual([true, 5, 0])
  })

  it('resetRuntime 清内存态（测试隔离＋S1 无持久化的显式面）', () => {
    const rt = getRuntime()
    rt.delegations.save(Delegation.create('d1', 'x').delegation)
    resetRuntime()
    expect(getRuntime().delegations.findActive()).toEqual([])
  })
})
