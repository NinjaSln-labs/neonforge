# ADR-004：verifyCompletion 领域层消费系统核验同步快照（V1a/V1b）

- 状态: accepted
- 日期: 2026-08-16
- 相关: docs/design/intent-confirmation-domain-design.md §3.3（verifyCompletion 签名）；docs/decisions/003-invariant4-single-source.md（Inv 4 单源）；stage-specs/S2.md

## Context

设计 §3.3 的 verifyCompletion 扩展要求：
- V1a：对 claim.evidence.verification[].command 中声明 passed 的命令，系统重新执行一次只读验证命令核对输出
- V1b：claim.evidence.diffs 由系统从 plannedFiles/producedFiles 派生比对（非模型自述）

实现时面临签名设计选择：**领域层直接执行代跑（异步）vs 领域层消费系统已核验的同步快照**。

初步尝试前者（`runVerificationCommand` 返回 Promise + fire-and-forget 写入 missing）——发现破坏领域层纯函数性质：
- verifyCompletion 是 L1 可测的纯判定函数（不变量 4 单源——ADR-003），引入异步执行后返回语义分裂（同步对象 + 异步副作用），断言时序不确定
- 代跑执行是 IO（子进程/网络），按 DDD 分层属应用层/适配器职责，不属领域层

## Decision

**verifyCompletion 保持同步纯函数，第二参数 SystemVerifier 为「系统已核验的同步快照」**：

```ts
interface SystemVerifier {
  verificationResults: Record<string, { ok: boolean; output?: string }> // V1a：系统代跑结果（command → 复核 ok 与否）
  deriveDiffs(planned: Set<string>, produced: Set<string>): Array<{ path: string }> // V1b：纯函数派生
  plannedFiles: Set<string>
  producedFiles: Set<string>
}
```

- 领域层只消费「系统已核验」的数据（verificationResults 查表 + deriveDiffs 纯派生）——不做任何 IO
- V1a 的实际代跑执行在 main 进程（S4 接线时提供真实 SystemVerifier——执行只读命令、填充结果表）
- systemState 缺省 = 纯逻辑判定（S1 兼容——旧调用 `verifyCompletion(c)` 不破；S4 接线后必传）
- verificationResults 中命令缺省 = 系统未核验 → 按模型自报 passed 计（不误判失败）

## Consequences

- 积极：领域层保持纯逻辑（L1 可测——S2 已 8 条 V1a/V1b 用例锁定）；分层清晰（IO 归应用层）；S4 接线简单（main 提供快照）
- 代价：V1a 的「系统代跑」与「核验判定」分离——代跑时机（何时执行命令）由接线方决定；领域层无法验证「命令真的跑过」只验证「结果表怎么说」（真实执行正确性由 S4 接线测试兜底）
- 边界：非只读命令（isSystemVerifiable=false）不进 verificationResults 检查——保持 unverifiable 语义（ADR-003 单源）
