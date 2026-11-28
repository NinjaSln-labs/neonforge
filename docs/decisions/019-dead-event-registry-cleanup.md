# ADR-019：死事件登记清理（timeline 注册表与实现对齐）

- 状态: accepted
- 日期: 2026-11-28
- 相关: `src/domain/timeline.ts`；`docs/tests/coverage-matrix.md`；`docs/domain/06-domain-events.md`；`docs/ddd-rebuild/07-domain-interactions.md`；ADR-010（对话三级介入设计）；审计报告 `.scratch/neonforge-v1/audit-items/2026-11-24-design-implementation-audit.md`

## Context

2026-11-24 设计-实现审计发现 timeline 注册表（93 事件）中有 5 个事件全代码库无发射点（死事件）：`plan.rejected`、`changeset.reviewed`、`usage.period_closed`、`dialogue.needs_human`、`card.dismissed`。2026-11-28 逐事件根因取证（登记提交、被何机制取代、后续是否有发射点）结论：

| 事件                   | 根因                                                                                                                                                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plan.rejected`        | 2026-08-15 登记；同日的 DDD 重建把「清单外写入拦截」实现为 `tool.blocked` gate=`out-of-plan`（载荷更完整：name/gate/reason/args）。`plan.rejected` 全历史 0 发射点——设计升级后的旧登记残留。                                             |
| `card.dismissed`       | 设计文档定义「卡消失/任务重置」；实现中卡终结已被 `card.resolved`/`card.rejected` 覆盖，任务重置由新会话 `conversation.created` + 确认位复位承载。第三种「任务重置时旧卡静默消失」路径无信息价值（重放可由 conversation.created 推导）。 |
| `dialogue.needs_human` | 2026-09-07 随 ADR-010 四级梯度登记，设计为三级兜底（「强制卡也被拒」）；实现只落地了一级 `dialogue.loop_guard` 与二级 `dialogue.forced_clarify`，三级从未接线；同问题域的「转人工」由 `stuck.needs_human`（停滞升级）实际承载。          |
| `changeset.reviewed`   | 设计有（C26 变更审核子域），领域函数 `reviewItem()` 已实现且有单测，但 IPC/renderer 逐项审核未接线——该能力已随批次 4 裁定 **V1.5 延后**（`00-product-design.md` Flow 6 真实 diff 供给）。保留登记以备 V1.5 接线。                        |
| `usage.period_closed`  | 注册表注释自证「预留」；产品预算按自然月累计但无周期关闭动作。保留登记以备 V2 周期结算。                                                                                                                                                 |

## Decision

1. **删除** 3 个被取代事件的登记：`plan.rejected`、`dialogue.needs_human`、`card.dismissed`（union 成员 + `TIMELINE_EVENT_SPECS` 条目）；删除处保留带日期的注释说明取代关系与 ADR 编号。
2. **保留** `changeset.reviewed`、`usage.period_closed`，各加注释标注「V1.5 变更审核接线时启用」/「V2 周期结算预留」。
3. 领域文档（`06-domain-events.md`、`ddd-rebuild/07-domain-interactions.md`）同步删除断言，并在原位置注明由哪个事件承载。
4. 覆盖矩阵缺口清单从「5 个死事件」收敛为「2 个预留登记」。

## Consequences

- 注册表从 93 事件降为 90 事件；注册表遍历测试（`timelineEvents.test.ts`）的事件计数断言需同步。
- 时间线读侧（历史 JSONL）可能仍含旧事件——`TIMELINE_EVENT_SPECS` 查表仅用于校验/去重，历史文件不做迁移；读取方按 `type` 字符串消费，不受影响。
- 若 V1.5 实装变更审核，`changeset.reviewed` 的登记仍在（事件名稳定）；`plan.rejected` 若未来出现「按清单逐项拒绝」的独立语义，应新登记而非复用旧名。
- `dialogue.needs_human` 删除不等于 ADR-010 三级设计作废：三级语义（强制卡被拒后的人工接管）当前由 `stuck.needs_human` + 状态栏提示承载；若未来恢复独立的对话级三级路径，应新立 ADR。
