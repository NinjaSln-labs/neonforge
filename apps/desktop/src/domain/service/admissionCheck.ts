import { requiresApproval, type Operation } from '../spec/requiresApproval.js'
import type { Scope } from '../authorization/Scope.js'
import type { HighImpactOperation } from '../authorization/highImpactList.js'

// AdmissionCheck 领域服务（详设 §5／I-7）＝RequiresApprovalSpec 的入口前置闸，校验先于产出。
// true＝可执行（不需拍板）；false＝须拍板⇒调用方转 RaiseDecision，本闸自身零副作用。
export function admissionCheck(
  op: Operation,
  scope: Scope,
  list: readonly HighImpactOperation[],
): boolean {
  return !requiresApproval(op, scope, list)
}
