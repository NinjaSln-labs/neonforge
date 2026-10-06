# ADR-034：S3 持久化架构＝单文档「账本权威＋同事务物化快照」（方案丙）

- 状态: accepted
- 日期: 2026-10-07
- 相关: `docs/design/stage-specs/V1-S3-persistence-recovery.md`（S3 契约件，DoD A–F）；`docs/design/v1.0.0-s3-detailed-design.md`（段5 详设，本裁定落地）；`docs/design/s3-persistence-architecture-comparison.md`（三方案对比）；段3 `03-domain-tactics.md` frozen v1.3 §4（I-11/I-12/I-13）、§5（22 事件闭集／留痕口径尾注）、§6（事务边界）、§7（仓储面）、§8（RecoverableSpec）；段4 计划 §3 S3 行／§8 移交必答项 2（持久化格式与迁移策略）

## Context

S3（持久化与崩溃恢复）须把 7 仓储面从内存换持久实现（段3 §6「聚合与 TimelineLog 同库」），并落 RecoverableSpec＋账本重放（I-12）。段4 计划 §8 移交必答项 2 把「**聚合快照 vs 事件重放**的取舍」显式列为段5 必答项。段5 现场读码（HEAD `086d7d5`）得三事实：

1. **7 聚合并无序列化面**（无 `toJSON`/`fromJSON`/`snapshot`），构造器为 private＋static 工厂。
2. **事件载荷大部分可重建聚合态**（`DelegationReopened.reopenCount`、`TurnEnded.terminal`、`DecisionResolved.resolution`、`ScopeAmended` 版本对等），但 **`Turn._expiredWrites`（I-13 过期令牌写入计数器）不在任何事件**——段3 §5 尾注明令聚合计数器「不入 timeline 闭集」，且不得就地扩闭集（扩＝铁律②回退段2／段3）。
3. 契约 A2 要求 `save→重建→find` 逐字段相等；A3 要求聚合写入与 `append` 同库同事务。

三个候选方案（对比件）：甲＝纯事件重放（撞事实 2 硬伤：`_expiredWrites` 不可重放，丢则违 I-13、扩闭集则犯规）；乙＝聚合快照＋账本并存（快照成为**并行权威**，与 I-12「恢复只还原账本」字面张力，双写需协调）；丙＝单文档账本权威＋同事务物化快照。

## Decision

**S3 持久化架构采方案丙：单一原子 JSON 文档，`log`（事件账本，authoritative）与 `snapshots`（7 聚合物化视图）同写一份、同一次原子替换。** 三条口径：

1. **`log` 是权威**，`snapshots` 是同事务物化视图，**不构成第二权威**（不新开 DB、不新开文件）。
2. **载入＝读快照 ＋ 用 log 重放校验**：重放所得与快照逐字段比对，一致 ⇒ 采信；不一致 ⇒ `RecoverableSpec` 不过 ⇒ `DelegationRestored(恢复结果=失败＋原因)`、拒绝恢复（契约 B4）。快照是**加速＋校验**，不替代重放。
3. **`save()` = 写对应 `snapshots` 段**，与本次 `append` 同一次原子落盘（契约 A3；段3 §6 同库同事务因此**结构性天然**）。

**非事件字段（`Turn._expiredWrites`）只住 `snapshots.turns`**——它是快照段存在的第一理由，也是本方案消掉方案甲硬伤的关键：**无需扩 timeline 闭集**（段3 §5 尾注的「不入闭集」得到尊重）。

**存储格式与迁移**：`schemaVersion=1`，单文件、`0o600`、路径构造注入（可测）、写 `tmp`→`rename` 原子替换、损坏/未知版本**拒绝加载**（fail-closed，不静默清空）；V1 无历史格式，**不预设迁移器**（YAGNI，未来第二格式时再立）。

## Consequences

**正面**：
- 消掉方案甲的 I-13 硬伤（非事件字段由快照段承载，闭集 22 不变、无铁律②回退）。
- 消掉方案乙的 I-12 字面张力（`log` 明确权威，快照经重放校验，非并行权威）。
- 段3 §6「聚合与 TimelineLog 同库」与契约 A3 回滚做成**结构性天然**（单文件一次原子替换，不靠跨文件协调）。
- 快照与重放**互为校验**，直接产出契约 B3（重放）与 B4（失败键）的证据——比纯重放多一层「恢复正确性」证据。
- 落 `configStore` 既有模式，无新依赖。

**代价**：7 聚合各加一对 `toSnapshot`/`fromSnapshot`（与方案乙同量级）；但这是段3 §7「仓储只存聚合本体」的直接兑现，非额外抽象。

**登记位（本阶段不做）**：跨进程写者与 outbox（段3 §6 升级路径，V1 射程外）；多委托并行持久化（L0 §6 6a OUT）；迁移器（YAGNI）。

**铁律②回退计数**：本裁定**不触发**回退（22 事件闭集、载荷键禁增禁减、7 仓储接口三冻结面零触碰；段3／段2 零改动）。
