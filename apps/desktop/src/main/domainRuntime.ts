// 领域运行时装配（详设 §7 机制落点／plan S1b Task 1）：main 进程持 S1a 领域单例。
// 内存态＝重启即失（F2 未持久化须显式呈现的前提）；持久化落 S3，届时换仓储适配、本装配面不变。
// 事件写入只经 TimelineRepo.append 唯一机制口（S-1/I-2），本文件是 wiring 侧、不直连 record。
import { HIGH_IMPACT_LIST } from '../domain/authorization/highImpactList.js'
import { InMemoryDecisionPointRepo } from '../domain/repos/memory/decisionPointRepo.js'
import { InMemoryDelegationRepo } from '../domain/repos/memory/delegationRepo.js'
import { InMemoryEvidenceRepo } from '../domain/repos/memory/evidenceRepo.js'
import { InMemoryInstructionQueueRepo } from '../domain/repos/memory/instructionQueueRepo.js'
import { InMemoryScopeRepo } from '../domain/repos/memory/scopeRepo.js'
import { InMemoryTimelineRepo } from '../domain/repos/memory/timelineRepo.js'
import { InMemoryTurnRepo } from '../domain/repos/memory/turnRepo.js'
import type { ApplyChangeDeps } from '../domain/service/applyChange.js'
import { applyChange, attachEvidenceCollector } from '../domain/service/applyChange.js'
import type { Operation } from '../domain/spec/requiresApproval.js'
import type { EventDraft } from '../domain/timeline.js'
import { Scope } from '../domain/authorization/Scope.js'

// 网关 port＝真假两轨的共同实现面（假轨承 S1a Task 18：同输入同产出、无网络无随机）。
export interface GatewayLike {
  nextChangeSet(delegationId: string, turnId: string): string
}

export const fakeGateway = (changeSet = '-old\n+new'): GatewayLike => ({
  nextChangeSet: () => changeSet,
})

export interface DomainRuntime {
  timeline: InMemoryTimelineRepo
  delegations: InMemoryDelegationRepo
  evidence: InMemoryEvidenceRepo
  decisionPoints: InMemoryDecisionPointRepo
  scopes: InMemoryScopeRepo
  queue: InMemoryInstructionQueueRepo
  turns: InMemoryTurnRepo
  // ponytail: 变更集内容经此表跨订阅面传递（同 applyChange 的 S1 内存态天花板，真持久化落 S3 撤除）。
  changeSets: Map<string, string>
  gateway: GatewayLike
  setGateway(gateway: GatewayLike): void
  newDeps(scope: Scope): ApplyChangeDeps
  /** §9 步2 产物推进：经 admissionCheck→ChangeProduced→（订阅）EvidenceRecorded。返回草稿或 null（未过闸/幂等）。 */
  produce(input: {
    delegationId: string
    turnId: string
    changeSet: string
    op: Operation
  }): EventDraft | null
  log(draft: EventDraft, tx?: () => void): void
}

let runtime: DomainRuntime | undefined

function build(gateway: GatewayLike): DomainRuntime {
  const rt: DomainRuntime = {
    timeline: new InMemoryTimelineRepo(),
    delegations: new InMemoryDelegationRepo(),
    evidence: new InMemoryEvidenceRepo(),
    decisionPoints: new InMemoryDecisionPointRepo(),
    scopes: new InMemoryScopeRepo(),
    queue: new InMemoryInstructionQueueRepo(),
    turns: new InMemoryTurnRepo(),
    changeSets: new Map<string, string>(),
    gateway,
    setGateway(next) {
      rt.gateway = next
    },
    newDeps(scope) {
      return {
        timeline: rt.timeline,
        evidence: rt.evidence,
        scope,
        list: HIGH_IMPACT_LIST,
        changeSets: rt.changeSets,
      }
    },
    produce(input) {
      const scope =
        rt.scopes.findByDelegation(input.delegationId) ?? Scope.initial(input.delegationId, [])
      return applyChange(
        {
          delegationId: input.delegationId,
          turnId: input.turnId,
          ts: new Date().toISOString(),
          changeSet: input.changeSet,
          op: input.op,
        },
        rt.newDeps(scope),
      )
    },
    log(draft, tx) {
      // draft 的 type↔detail 配对已由聚合构造处钉住，展开只补 ts。
      rt.timeline.append({ ts: new Date().toISOString(), ...draft }, tx)
    },
  }
  // 证据域订阅面挂一次（单例级）：ChangeProduced ⇒ EvidenceRecorded。collector 只读 timeline/evidence/changeSets，
  // 不读 scope，故占位 Scope 仅满足形参（内容不影响采集）。
  attachEvidenceCollector(rt.newDeps(Scope.initial('__collector__', [])))
  return rt
}

// 首建选项生效；单例已在场时换网关走 setGateway（真网关由 Task 3 的 IPC 接线注入）。
export function getRuntime(opts?: { gateway?: GatewayLike }): DomainRuntime {
  runtime ??= build(opts?.gateway ?? fakeGateway())
  return runtime
}

export function resetRuntime(): void {
  runtime = undefined
}
