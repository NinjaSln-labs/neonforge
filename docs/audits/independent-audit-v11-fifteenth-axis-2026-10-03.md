# 第十五轴三向审计：ApprovalWindow 提案 v2r

日期: 2026-10-03 ｜ 被审: `docs/design/approval-ledger-model-proposal-2026-10-03.md`（v2r）｜ 方法: 符合轴（GO-with-fixes）／二次击穿轴（修后可施工）／施工轴（补三件后开工）。全部裁定已折入 **v2s**。

## 十四轴八必修复核（符合轴）
5 闭（requestId∉descriptor、IPC 载体、执行回写、僵窗整批拒、计划面正交声明）；2 半闭（单钟、恢复）；1 闭而引新洞（D5 退役把 file-approval 置位一起退役→挂卡放飞）。

## 本轮新击穿核心（击穿轴，已裁）

**"单钟"仍是搬家**：window.seq 与 slot 的 decisionInstanceSeq 在"他 kind 接管窗"（plan 卡压过挂起窗）时分叉，isAnswerStale 用 slot、门用 seq——同答两判。裁定＝**approval 面撤钟**：身份＝requestId 本身（main 签发全局唯一单调），闸＝`requestId ∈ 集合 ∧ state 可决`（codex/gemini/kilocode 同构＝无第二 epoch 的 id 键控）；进程世代 nonce（openclaw 形）管重启；decisionInstanceSeq 收缩回 goal/plan/resolution 三族。此裁一并消解"窗内推号误杀正当决定"整类问题。

## v2s 补全条款（对击穿/施工清单的逐条处置）

1. 撤钟（上）；§1 双条件等价式改**单向派生**："窗开启且无确认卡占槽 ⇒ pending='approval'"（接管时窗存续不推号、不置槽——D5 互斥语义由领域而非 effect 承载）。
2. **argsFingerprint 升强制**：二次 execute 的 args 摘要 ≠ 签发时指纹 ⇒ main 拒绝（fail-closed）——批 A 执行 B 的 TOCTOU 洞封死；reasonix 的"批前刷新"不采（本产品冻结参数语义已足，V2 再议刷新 UX）。
3. **queued 态显式化**：`state: queued|pending|...`；确认卡在位时新请求入窗记 queued（不占槽不冻结）；槽释放→`drainQueued` 转换开呈（非 effect）；main TTL 对 queued 照跑，排空前重验＋过期上行（见 6）。
4. **file-approval 入窗统一**（审回轴一"放飞"洞）：approve-files 合并授权卡＝`kind:'plan-batch'` 窗内记录（main 对虚拟工具同样铸 requestId），决定闸同构（id∈窗∧可决）；执行仍走 approvalGranted/硬序门链（决定内容与执行链不同构、**存续与闸统一**——§7"正交"改此表述）。
5. **恢复语义定死**：旧世代 `approved ∧ 未 settled` → 一律 settled('failed') 回写（重放＝无授权执行，丢弃＝白批，failed 可重批＝唯一安全解）；nonce 源＝main 启动签发的进程世代号，握手下行，renderer 快照随附。
6. **上行对账通道**（击穿轴⑥，缺此"decidedBy:rule 同门登记"与文本"恰一"计数失权威）：ToolResult 增标记（rule 放行/到期/已决），main 侧规则命中与 TTL 到期的集合回写经 per-response 标记＋轻量对账 IPC（低频查询即可，不建推流）。
7. **施工三补**（施工轴）：阶段 A 明文"台账只记不判"（TTL 只标不拦、无 requestId 的 approved:true 走旁路——A 独立绿的前提）；onApprovalChange/status_bar 派生由 C 移 **B5**；阶段 B 采纳八步点序（B1 类型→B2 领域→B3 hook→B4 四入口→B5 D5 退役+status_bar→B6 定位统一含 reject 错位老坑 P2 a08d1775→B7 L1 断言→B8 L3 分组），restorePending 签名扩容与窗快照持久化归 C。
8. **静默风险必补 L1 五防线**：窗存续不推号（他 kind 接管）；requestId∉窗⇒no-op+stale；expired 后 settled⇒failed；末 pending 归零 windowResolved⇒槽释放；batch=每 requestId 各记各执；旧档无窗字段 hydration 空窗＋旧世代全 expired。
9. 规模修正：总 110–160 触点（A 15–25／B 70–95／C 25–40）。

## 复判
三轴合并：**v2s 修后可施工**（撤钟后 approval 与 ADR-015 的耦合面从"双时钟同步"降为"槽的呈现互斥"，复杂度净降）。待终审 v2s → 定稿 → 落原稿 → 实现计划（沿用"新起不叠 v 号"纪律，但本案三阶段 A/B/C 即天然批次）。

## 裁定补记（同日，用户复核）

击穿轴第 1 条（双钟搬家）**被裁定为域归属错误而非设计缺陷**：window.seq/代次号属**时间线日志域**的排序关注（TimelineEvent.seq 既有能力），不应进入 Conversation 领域身份——审计把序号当身份建模才是偏离产品设计。提案升 **v3**：域内身份＝requestId＋state；跨进程可执行性归 main 台账权威（执行域边界 fail-closed）；恢复规则改"未决一律 expired、approved 未 settled 一律 failed"，无世代号。撤钟裁定从"裁决"改述为"溶解"。
