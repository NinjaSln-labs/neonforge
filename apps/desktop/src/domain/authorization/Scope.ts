// Scope 聚合根（详设 §2／段3 §2）：版本链只追加，amend()＝唯一追加口（I-8 同决议查重与
// I-17 缘由/批准两支前置均已落，A1–A5）。ScopeVersion 三层深冻结（VO 不可变）。本文件零归档面 import。

import type { DecisionPoint } from './DecisionPoint.js'
import { DomainError } from '../domainError.js'
import type { EventDraft } from '../timeline.js'

export type ResourceKind = '仓库' | '目录' | '命令' | '网络'

export interface ScopeEntry {
  kind: ResourceKind
  pattern: string
}

// ScopeVersion VO＝seq＋entries＋amendmentRef（版本不可变，只追加）。
export interface ScopeVersion {
  seq: number
  entries: ScopeEntry[]
  amendmentRef: string | null
}

// 逐条拷贝再冻结：外来数组属接线层，改写它不是领域事实。
const freezeEntry = (e: ScopeEntry): ScopeEntry =>
  Object.freeze({ kind: e.kind, pattern: e.pattern })
const freezeVersion = (v: ScopeVersion): ScopeVersion =>
  // 断言回 ScopeEntry[]：Object.freeze 产 readonly 数组，但接口面维持原字面（改接口会波及 entries 既有调用方）；运行时已冻结。
  Object.freeze({
    seq: v.seq,
    entries: Object.freeze(v.entries.map(freezeEntry)) as ScopeEntry[],
    amendmentRef: v.amendmentRef,
  })

export class Scope {
  readonly delegationId: string
  private readonly chain_: ScopeVersion[]

  private constructor(delegationId: string, chain: ScopeVersion[]) {
    this.delegationId = delegationId
    this.chain_ = chain
  }

  static initial(delegationId: string, entries: ScopeEntry[]): Scope {
    return new Scope(delegationId, [freezeVersion({ seq: 1, entries, amendmentRef: null })])
  }

  // 对外只读面：每次拷一份并冻结。热路径（version/entries/covers）一律读 chain_ 末位，不走此 getter。
  get chain(): readonly ScopeVersion[] {
    return Object.freeze([...this.chain_])
  }

  get version(): number {
    return this.chain_[this.chain_.length - 1].seq
  }

  get entries(): ScopeEntry[] {
    return this.chain_[this.chain_.length - 1].entries
  }

  // 作用域内读数（RequiresApprovalSpec 的①类判据输入）：条目资源类型相等 ∧ 模式命中。
  covers(kind: ResourceKind, resource: string): boolean {
    return this.chain_[this.chain_.length - 1].entries.some(
      (e) => e.kind === kind && matches(e.kind, e.pattern, resource),
    )
  }

  // 唯一追加口：追加而非替换——返回新实例，绝不原地改 this.chain_。ts 暂不进 payload（段3 §5 三键禁增禁减）。
  amend(
    dp: DecisionPoint,
    entries: ScopeEntry[],
    _ts: string,
  ): { scope: Scope; draft: EventDraft } {
    if (dp?.requestReason?.reason !== '作用域修正')
      throw new DomainError('I-17', '修正须绑定缘由＝作用域修正的决策点')
    if (dp.resolution?.value !== '批准')
      throw new DomainError('I-17', '批准权仅用户：决议未批准（未决/拒绝/选项一律拒）')
    if (this.chain_.some((v) => v.amendmentRef === dp.decisionPointId))
      throw new DomainError('I-8', '同 decisionPointId 只产一个版本')
    const seq = this.chain_[this.chain_.length - 1].seq + 1
    const next = new Scope(this.delegationId, [
      ...this.chain_,
      freezeVersion({ seq, entries, amendmentRef: dp.decisionPointId }),
    ])
    return {
      scope: next,
      draft: {
        type: 'ScopeAmended',
        delegationId: this.delegationId,
        detail: {
          delegationId: this.delegationId,
          versionPair: { from: seq - 1, to: seq },
          decisionPointId: dp.decisionPointId,
        },
      },
    }
  }
}

const segEq = (p: string, r: string) =>
  p === r ||
  (p.includes('*') &&
    new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$').test(r))

// 按资源类型分流；命令支不收 argv（首 token 由调用方传入，领域层不做 shell 解析）。
function matches(kind: ResourceKind, pattern: string, resource: string): boolean {
  if (pattern === '**') return true
  if (kind === '命令')
    return pattern.endsWith('*') ? resource.startsWith(pattern.slice(0, -1)) : resource === pattern
  if (kind === '网络') {
    if (!pattern.startsWith('*.')) return resource === pattern
    const dot = pattern.slice(1) // '*.github.com' → '.github.com'（点即边界）
    return resource.endsWith(dot) && resource.length > dot.length
  }
  const ps = pattern.split('/')
  const rs = resource.split('/')
  return pattern.endsWith('/**')
    ? rs.length >= ps.length - 1 && ps.slice(0, -1).every((p, i) => segEq(p, rs[i]))
    : ps.length === rs.length && ps.every((p, i) => segEq(p, rs[i]))
}
