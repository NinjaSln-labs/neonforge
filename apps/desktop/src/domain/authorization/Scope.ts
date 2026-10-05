// Scope 聚合根（详设 §2／段3 §2）：S1 仅 initial()＝内存构版本链 v1 首元素（CC-05）。
// 不发 ScopeAmended、无修正命令——AmendScope/I-8/I-17 与首射事件→S2。本文件零归档面 import。

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

export class Scope {
  readonly delegationId: string
  private readonly chain: ScopeVersion[]

  private constructor(delegationId: string, chain: ScopeVersion[]) {
    this.delegationId = delegationId
    this.chain = chain
  }

  static initial(delegationId: string, entries: ScopeEntry[]): Scope {
    return new Scope(delegationId, [{ seq: 1, entries, amendmentRef: null }])
  }

  get version(): number {
    return this.chain[this.chain.length - 1].seq
  }

  get entries(): ScopeEntry[] {
    return this.chain[this.chain.length - 1].entries
  }

  // 作用域内读数（RequiresApprovalSpec 的①类判据输入）：条目资源类型相等 ∧ 模式命中。
  covers(kind: ResourceKind, resource: string): boolean {
    return this.entries.some((e) => e.kind === kind && matches(e.pattern, resource))
  }
}

// ponytail: S1 命中判据＝'**' 全放行 ∨ 尾随 '/**' 前缀 ∨ 字面相等；正式 glob 语义随 S2 作用域修正批落地。
function matches(pattern: string, resource: string): boolean {
  if (pattern === '**') return true
  if (pattern.endsWith('/**')) return resource.startsWith(pattern.slice(0, -2))
  return resource === pattern
}
