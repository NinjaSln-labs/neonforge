# 决策日志（Architecture Decision Records）

> 规则：阶段内任何**语义裁定/拍板/设计裁决** → 当阶段写 ADR（Nygard 模板：context/decision/consequences + status 状态机）。
> 状态：`proposed` → `accepted` | `superseded` | `rejected`。
> 防双源：HANDOFF/设计文档只引用 ADR 编号，不复制内容；superseded 不删除（历史链保留）。
> 消费方：`decision-log`（SKILL-3，skill 库）；`project-handoff`（HANDOFF §5 引用）。

## 索引

| #   | 标题                                                                                                              | 状态     | 日期       |
| --- | ----------------------------------------------------------------------------------------------------------------- | -------- | ---------- |
| 001 | rejectStreak 计数语义（§4.1 C8——重提议延续，不重置）                                                              | accepted | 2026-08-16 |
| 002 | 网络只读 S1 过渡语义（外网 curl 双门放行——S6 变更点）                                                             | accepted | 2026-08-16 |
| 003 | Inv4 单源（evidenceVerifiable 公共谓词）                                                                          | accepted | 2026-08-16 |
| 004 | verifyCompletion 领域层消费系统核验同步快照（V1a/V1b——IO 归应用层）                                               | accepted | 2026-08-16 |
| 005 | PlannedFiles 权威下沉 main + 批准事实跨重启（D3——IPlannedFilesRepository）                                        | accepted | 2026-08-16 |
| 006 | 换目标重新确认（#7——goal 已确认后的新目标提议=新任务提议；拒绝=回澄清）                                           | accepted | 2026-08-16 |
| 007 | provider 切换——DeepSeek 官方 → Command Code（模型仍 DeepSeek V4 系列；接入方可切）                                | accepted | 2026-08-21 |
| 008 | 遗留问题不阻塞完成对账（S4 证据语义修订）                                                                         | accepted | 2026-08-30 |
| 009 | 确认协议工具化（V1.5——文本标记 → schema 工具调用）                                                                | accepted | 2026-08-31 |
| 010 | 多源 Provider 注册表 + DeepSeek 模型 Catalog（Zen/Go/官方/Command Code）                                          | accepted | 2026-09-28 |
| 011 | 成功＝领域命题成立（非外壳返回）                                                                                  | accepted | 2026-09-29 |
| 012 | 测完再修（测试轮禁止临修 · 硬闸）                                                                                 | accepted | 2026-09-30 |
| 013 | 搭档 Busy 边界与 silent 通道（输入≠打断补全）                                                                     | accepted | 2026-10-01 |
| 014 | 决策点代次绑定与 C2 输入归属精化（β 修法·保留 C2——领域忠实口径）                                                  | accepted | 2026-10-02 |
| 015 | 决策点一等身份与两轴分离（β 根因领域解·定稿，权威文本＝提案 decision-point-identity-model-proposal）              | accepted | 2026-10-02 |
| 016 | 审计域归属闸门——提案字段逐条出归属卡；审计先核前提再攻击；错位走溶解不走裁决；裁定来源不豁免（含用户裁定）        | accepted | 2026-10-03 |
| 017 | 授权窗口一等化与执行日志权威（ApprovalWindow·requestId 身份·四入口收敛·journal 三判·规则三档归 main·定稿 v3.3）   | accepted | 2026-10-03 |
| 018 | 对话回合礼仪（产品层补齐"谁在什么时候开口"——发言真实性/意图通道显式化/排队可见/系统轮披露；含反转 ADR-014 残留①；终审批补 C13 单一推进点＋收回 C2/a6 射程） | **accepted**（2026-10-04 终审通过） | 2026-10-04 |
| 019 | 驱动拓扑裁定——入口唯一消费者＋同步取消令牌（26 入口各自 ++sid 开链判为**实现偏离**，阶 C 拆纠偏批/补模批）        | accepted | 2026-10-04 |
