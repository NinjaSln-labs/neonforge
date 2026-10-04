# 第十四轴三向审计：ApprovalLedger 提案（accepted-v2 → 击穿后修订）

日期: 2026-10-03 ｜ 被审: `docs/design/approval-ledger-model-proposal-2026-10-03.md`
方法: 三独立 agent——设计符合轴（GO-with-fixes，1 blocking）／对抗击穿轴（**击穿·结构性**，8 序列）／可实现性轴（§7 需修订后重审）。全部发现已折入提案 **v2-r**。

## 击穿轴核心发现（必修四条＝缺一不可施工）

1. **双时钟分叉（blocking）**：ADR-015 身份钟（decisionInstanceSeq 按 descriptor 推号）与提案 windowSeq（空→非空推号）并存 ⇒ 窗内 A→A+B 一推一停即分叉；同一迟到答复 app 层 `isAnswerStale`（用旧 seq）与域门（用 windowSeq）判向相反。⇒ 合并为**一张钟**（窗开启＝推号），requestId 仅作集合内目标键、**不入 descriptor**（运行时 nonce 破坏不变量 2 适用域；approval 身份推进规则改"窗开启事件"并在 §3.4 显式记 deviation——deriveDecisionPoint 纯性不受影响）。
2. **恢复面冲突（high）**：serializeMessages 现过滤 toolCalls 仅 done|error|reverted——need-approval **根本不落盘**；提案"序列化集合"与现状直接矛盾且未给改法；requestId"本进程签发"令恢复后历史窗全 miss＝反向误拒。⇒ 集合＋钟＋**签发世代 nonce** 序列化；恢复＝旧世代 pending 一律 expired（合法化，非 bug）＋卡随之终态渲染。
3. **IPC 载体不存在（high）**：tools:execute 纯 invoke、无推流（唯一 push＝gateway:stream-chunk）；"main IPC 事件驱动 approvalRequested"无落点。⇒ requestId 搭 ToolResult 返回体上行（波及 4 点已列）；批复＝二次 execute 携 requestId（不建二通道）；**main 进程内新增待批台账**（pending 集合＋轮终止信号：stop/换轮时 renderer 通知 cancel＋TTL 兜底）。
4. **双真相复活（high）**：decided 先写集合、执行结果后写 messages——execute 失败/超时时集合仍 approved。⇒ 执行回写收敛转换（approved→failed/expired 记入集合，卡片终态由集合投影）。

## 其余必修（v2-r 已含）

- 规则命中放行＝预授权记录 `decidedBy:'rule'` 同门登记；**不变量 1 改写**为"用户决策（含其预先规则裁决）是唯一输入"。
- rules 显式 `deny > always-allow > ask` 定序（现首个命中制）；always 落库反向放行与 deny 落库的交错定序（串行 persistenceQueue，gemini 先例）。
- **持久规则形状受限**：仅文件/网络类进规则，bash/高危永不（02:191 产品安全裁定压过 goose 形）——竞品形态按产品原意裁剪。
- **reject 加常规出口**：整批拒绝为正常档（主流 reject 级联），"拒 1 剩 N"僵窗配"不再等待"逃逸；断线/停机级联保留。
- **file-approval/approve-files＝计划面正交**（虚拟工具无 requestId 可铸、一次清单批准非 N 决定），不入集合、approvalGranted/planConfirmed 硬序门链保留——提案原文"四入口"改为"工具授权四入口＋计划面单列"。
- 多 pending 时打字"批准"＝**不生效＋可见提示"请指明/点卡"**（不静默、不误判 C2 拒绝）；恰一 pending 才绑 requestId。
- renderer 卡定位 id（tc.id）与审批 requestId **双 id 并存**显式文档化（各司其职）。
- decision.* 事件单源收编：requested 随窗推号；resolved 带 requestId+answeredInstanceId；`decisionContent.approval` 单卡型面退役（不留双存储）；`ApprovalLedger` 更名 **ApprovalWindow**（避 Capability Ledger 撞词）。
- 规模修正：~80-120 断言触点、四漏列（main 台账/sessionStore 翻转/approve-files 归属/双 id）；**三阶段**：A＝main-only（id 铸造＋台账＋rules，向后兼容独立绿）→ B＝**原子对**（renderer 消费×集合×D5 退役×四入口×断言重写，中途不可发）→ C＝持久化翻转＋事件族＋status_bar 退役。

## 复判

修后形态：**可施工（分三阶段）**。00:101/不变量 7 措辞改"单窗、N 可寻址目标"；d000011 边界判词获两轴独立确认（解冻语义为准，非仅 UI 之差）。提案 v2-r 见原文件；待用户终审 → 定稿落原稿 → 实现计划（不叠 v 号）。
