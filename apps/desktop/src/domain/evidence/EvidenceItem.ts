// EvidenceItem 聚合 + Provenance 恒等值 + PayloadRef 落账前脱敏（详设 §2/§8 S-4／段3 §3 I-5）
// Provenance 单字面量类型 ⇒ 编译期不可表达「AI 自述」，非系统采集写不进（I-5）。
// 本文件零归档面 import。

export type Provenance = '系统采集'

export type EvidenceType = '变更集' | '命令输出' | '测试结果' | '验收判据运行结果'

export interface PayloadRef {
  ptr: string
  digest: string
}

// S-4 凭据形态：与 tools/desens-scan.py 的「凭据值」「私钥块」两族同规则（跨语言镜像）。
const CREDENTIAL_SHAPE =
  /(?:\b(?:sk|ghp|gho|xox[bp])[-_][A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,}|AKIA[0-9A-Z]{12,}|Bearer\s+[A-Za-z0-9._-]{20,}|(?:api[_-]?key|secret|passwd|password|access_token|refresh_token)\s*[:=＝]\s*["'][A-Za-z0-9+/._-]{12,}["'])/i
const PRIVATE_KEY_BLOCK = /-----BEGIN [A-Z ]*PRIVATE KEY-----/

function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** 内容摘要（证据域单源；ApplyChange 的去重键复用同一算法）。 */
export function digest(content: string): string {
  return fnv1a(content)
}

const PTR_PREFIX = 'mem://evidence/'

/** S1 内存态指针（落账与 ChangeProduced 载荷的变更集ref 同源）。 */
export function evidencePtr(evidenceId: string): string {
  return `${PTR_PREFIX}${evidenceId}`
}

export function evidenceIdFromPtr(ptr: string): string {
  return ptr.slice(PTR_PREFIX.length)
}

// 落账前脱敏判据：含凭据形态串 ⇒ 拒（S-4）。
export function assertNoCredentialShape(content: string): void {
  if (CREDENTIAL_SHAPE.test(content) || PRIVATE_KEY_BLOCK.test(content)) {
    throw new Error('S-4：payload 含凭据形态串，拒绝落账')
  }
}

function makePayloadRef(evidenceId: string, content: string): PayloadRef {
  assertNoCredentialShape(content)
  return { ptr: evidencePtr(evidenceId), digest: digest(content) }
}

export interface EvidenceRecordInput {
  evidenceId: string
  delegationId: string
  type: EvidenceType
  content: string // 落账前过 S-4
}

export class EvidenceItem {
  readonly evidenceId: string
  readonly delegationId: string
  readonly type: EvidenceType
  readonly provenance: Provenance = '系统采集' // 恒等值，非入参 ⇒ 无法表达非系统采集（I-5）
  readonly payloadRef: PayloadRef
  private firstInspected = false
  private inspectionCount = 0

  private constructor(input: EvidenceRecordInput, payloadRef: PayloadRef) {
    this.evidenceId = input.evidenceId
    this.delegationId = input.delegationId
    this.type = input.type
    this.payloadRef = payloadRef
  }

  static record(input: EvidenceRecordInput): EvidenceItem {
    return new EvidenceItem(input, makePayloadRef(input.evidenceId, input.content))
  }

  // 打开核验：返回是否「首次打开」（过程指标②：首开计入、重复不计）。
  inspect(): boolean {
    this.inspectionCount += 1
    if (this.firstInspected) return false
    this.firstInspected = true
    return true
  }

  get firstInspection(): boolean {
    return this.firstInspected
  }
}
