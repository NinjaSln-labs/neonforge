// BC-13 扩展与集成（目标态实现）：A16 扩展（Extension）。
// 不变量（I20）：
// - 只有已注册且 active 的扩展能力可被调用；未知扩展/能力 → 拒绝。
// - 激活/停用幂等；单个扩展失败只影响自身。
// - 第三方扩展首次调用外部能力必须经过用户授权；内置扩展按 BC-02 风险分级。
// - 本模块不持有 fs/process/network 权限——执行统一经 BC-02 ToolRegistry。

export type ExtensionKind = 'builtin' | 'mcp' | 'git'
export type ExtensionStatus = 'registered' | 'active' | 'inactive' | 'failed'
export type TrustLevel = 'builtin' | 'user-authorized' | 'untrusted'
export type CapabilityRisk = 'none' | 'low' | 'high'

export interface CapabilityDescriptor {
  /** 扩展内唯一能力标识（MCP 工具名 / git 子命令） */
  id: string
  name: string
  description: string
  /** BC-02 风险分级：none 只读；low 文件操作；high 命令/外部进程 */
  risk: CapabilityRisk
}

export interface ExtensionInput {
  id?: string
  name: string
  version: string
  kind?: ExtensionKind
  capabilities?: CapabilityDescriptor[]
  trust?: TrustLevel
}

export interface ExtensionState {
  id: string
  name: string
  version: string
  kind: ExtensionKind
  status: ExtensionStatus
  trust: TrustLevel
  capabilities: CapabilityDescriptor[]
  createdAt: string
  updatedAt: string
  failureReason?: string
  authorizedAt?: string
}

export interface InvocationDecision {
  allowed: boolean
  requiresApproval: boolean
  reason?: string
}

function requireText(value: string, field: string): string {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) throw new TypeError(`扩展 ${field} 不能为空`)
  return trimmed
}

function normalizeCapabilities(input: CapabilityDescriptor[] = []): CapabilityDescriptor[] {
  const seen = new Set<string>()
  return input.map((cap) => {
    const id = requireText(cap.id, 'capability.id')
    if (seen.has(id)) throw new TypeError(`扩展能力重复：${id}`)
    seen.add(id)
    return {
      id,
      name: requireText(cap.name, 'capability.name'),
      description: String(cap.description ?? ''),
      risk: cap.risk,
    }
  })
}

export function createExtension(input: ExtensionInput, at: string): ExtensionState {
  const name = requireText(input.name, 'name')
  const version = requireText(input.version, 'version')
  const kind = input.kind ?? 'builtin'
  const trust = input.trust ?? (kind === 'builtin' ? 'builtin' : 'untrusted')
  return {
    id: (input.id ?? name).trim() || name,
    name,
    version,
    kind,
    status: 'registered',
    trust,
    capabilities: normalizeCapabilities(input.capabilities),
    createdAt: at,
    updatedAt: at,
  }
}

export function activateExtension(state: ExtensionState, at: string): ExtensionState {
  if (state.status === 'active') return state // 幂等
  if (state.status === 'failed') {
    throw new TypeError(`扩展 ${state.name} 已失败，需重新注册后可激活`)
  }
  return { ...state, status: 'active', updatedAt: at, failureReason: undefined }
}

export function deactivateExtension(state: ExtensionState, at: string): ExtensionState {
  if (state.status === 'inactive' || state.status === 'registered') {
    return { ...state, status: 'inactive', updatedAt: at } // 幂等
  }
  if (state.status === 'failed') return state
  return { ...state, status: 'inactive', updatedAt: at }
}

export function markExtensionFailed(
  state: ExtensionState,
  reason: string,
  at: string,
): ExtensionState {
  return {
    ...state,
    status: 'failed',
    failureReason: String(reason || '未知错误'),
    updatedAt: at,
  }
}

export function updateCapabilities(
  state: ExtensionState,
  capabilities: CapabilityDescriptor[],
  at: string,
): ExtensionState {
  return { ...state, capabilities: normalizeCapabilities(capabilities), updatedAt: at }
}

/** 用户显式授权第三方扩展（首次调用前的信任授予；内置扩展保持 builtin） */
export function grantTrust(state: ExtensionState, at: string): ExtensionState {
  if (state.kind === 'builtin' || state.trust === 'builtin') return state
  return { ...state, trust: 'user-authorized', authorizedAt: at, updatedAt: at }
}

/**
 * 能力调用裁决（不执行）：
 * - 未激活 → 拒绝；
 * - 未知能力 → 拒绝；
 * - 第三方未授权 → 拒绝并标记需要授权（用户授权后重试）；
 * - 其余按风险：none 免授权，low/high 交由 BC-02 授权卡。
 */
export function decideInvocation(state: ExtensionState, capabilityId: string): InvocationDecision {
  if (state.status !== 'active') {
    return { allowed: false, requiresApproval: false, reason: `扩展未激活：${state.name}` }
  }
  const capability = state.capabilities.find((c) => c.id === capabilityId)
  if (!capability) {
    return {
      allowed: false,
      requiresApproval: false,
      reason: `扩展能力不存在：${state.name}/${capabilityId}`,
    }
  }
  if (state.trust === 'untrusted') {
    return {
      allowed: false,
      requiresApproval: true,
      reason: `第三方扩展首次调用需用户授权：${state.name}`,
    }
  }
  if (capability.risk === 'none') return { allowed: true, requiresApproval: false }
  return { allowed: true, requiresApproval: true }
}

/** 扩展快照（UI/审计用；capabilities 为浅拷贝防外部改写） */
export function describeExtension(state: ExtensionState): ExtensionState {
  return { ...state, capabilities: state.capabilities.map((c) => ({ ...c })) }
}
