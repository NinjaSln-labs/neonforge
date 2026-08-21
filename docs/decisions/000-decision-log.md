# 决策日志（Architecture Decision Records）

> 规则：阶段内任何**语义裁定/拍板/设计裁决** → 当阶段写 ADR（Nygard 模板：context/decision/consequences + status 状态机）。
> 状态：`proposed` → `accepted` | `superseded` | `rejected`。
> 防双源：HANDOFF/设计文档只引用 ADR 编号，不复制内容；superseded 不删除（历史链保留）。
> 消费方：`decision-log`（SKILL-3，skill 库）；`project-handoff`（HANDOFF §5 引用）。

## 索引

| #   | 标题                                                                               | 状态     | 日期       |
| --- | ---------------------------------------------------------------------------------- | -------- | ---------- |
| 001 | rejectStreak 计数语义（§4.1 C8——重提议延续，不重置）                               | accepted | 2026-08-16 |
| 002 | 网络只读 S1 过渡语义（外网 curl 双门放行——S6 变更点）                              | accepted | 2026-08-16 |
| 003 | Inv4 单源（evidenceVerifiable 公共谓词）                                           | accepted | 2026-08-16 |
| 004 | verifyCompletion 领域层消费系统核验同步快照（V1a/V1b——IO 归应用层）                | accepted | 2026-08-16 |
| 005 | PlannedFiles 权威下沉 main + 批准事实跨重启（D3——IPlannedFilesRepository）         | accepted | 2026-08-16 |
| 006 | 换目标重新确认（#7——goal 已确认后的新目标提议=新任务提议；拒绝=回澄清）            | accepted | 2026-08-16 |
| 007 | provider 切换——DeepSeek 官方 → Command Code（模型仍 DeepSeek V4 系列；接入方可切） | accepted | 2026-08-21 |
