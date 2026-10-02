# ADR-016 规则 4 全量适用：现行工件前提台账清查（首例 sweep）

日期: 2026-10-03 ｜ 触发: 用户裁定"ADR-016 追加规则需应用到所有"（裁定来源不豁免泛化为一切来源：用户裁定/自我裁决/审计发现/竞品建议/文档断言）｜ 范围: ApprovalWindow v3.1 提案与 ADR-014/015/016 现行有效工件所依赖的**事实前提**（现状断言）——逐条取证，标注 已验证/确认（二手归档）/凭印象。

## 方法

前提从提案正文逐条摘出 → 对照 `apps/desktop/src` 现场 grep（file:line 即证据）与归档取证物（调研报告/竞品源码盘）。**规则 4 的三种出口**在此体现为：确认成立＝多数条目；补隐含前提＝v3.1 签发唯一性条款（已落提案 §1/§8）；推翻＝本次零命中（无一条现状断言被现场证据推翻）。

## 台账

| # | 前提（断言出处） | 证据 | 状态 |
|---|---|---|---|
| 1 | 排序权威在时间线日志域（v3 撤钟裁定） | `domain/timeline.ts:12` `seq: number // 会话内序号（单调递增）`；`append(event: Omit<TimelineEvent,'ts'\|'seq'>)` :369 | 已验证 |
| 2 | requestId 跨重启唯一为业界形态（v3.1 条款） | 竞品无一纯进程内计数（opencursor `apr_<ts>_<rand>`、crush/goose uuid、hkuds DB 自增、reasonix nextID+nonce）——归档于 `approval-model-competitor-source-survey-2026-10-03.md`；源码盘 /mnt/f/neonforge-competitors 仍可复核 | 确认（二手归档，可复核） |
| 3 | 需批请求事实住 UI 卡列表、allow 不写任何集合（提案 §0） | `useToolApproval.ts` approve 路径零调用 approvalDecided；approvalDecided 全仓消费点仅 `useConversationState.ts:81`（reject 路径）＋approvalGranted（批文件另一语义） | 已验证 |
| 4 | approval 槽＝effect 单向镜像（D5，提案 §1 退役对象） | `ConversationPanel.tsx:332` `setPendingState('approval', …)`（effect 派生） | 已验证 |
| 5 | sessionStore 过滤使 need-approval 永不持久化（提案 §6-2 翻转依据） | `sessionStore.ts:45-47` 仅 done\|error\|reverted | 已验证 |
| 6 | taskTrust renderer-only（提案 §5 修接依据） | `ConversationPanel.tsx:2365-2387` useState/useRef，main 侧零写入点（全仓 grep taskTrust 仅 renderer） | 已验证 |
| 7 | 规则评估现为 first-match，非显式 deny>always>ask（提案 §2） | `main/tools.ts:156` `this.rules.find((r) => matchesRule(...))`；02-domain-model 规范段（~:187）声明 deny>allow>ask——规范与实现差距＝提案"显式化"论据成立 | 已验证 |
| 8 | renderer 盲信面：approved:true 无校验直执行（提案 §5 关闭对象） | `main/tools.ts:165` `if (!ruleAllows && tool.requiresApproval && !opts.approved)`——opts.approved 为 renderer 传入布尔，无台账核验；`ipc.ts:350-356` 直通 | 已验证 |
| 9 | 四批准入口（单卡/记住/批量/文本恰一）（提案 §1） | `ConversationPanel.tsx:3497` approveToolCall、:3508 rememberAndApprove、:3351 approveAllRemember、:2594 文本触发 approveAllToolCalls（:2566 文本批准路径注释） | 已验证 |
| 10 | bash/高危永不进记住规则＝产品裁定非实现巧合（提案 §2 压 goose 形依据） | `ConversationPanel.tsx:2376/:3502-3503` 安全漏洞注释（bash trustPath('') 全根绕过事故）＋"bash 高危永远单独确认"UI 不渲染记住按钮；02-domain-model 信任机制段 | 已验证 |
| 11 | d000011 边界两轴（无多槽裁定）存在 | `.handoff/decisions/d000011.md` | 已验证（存在性；内容已在十五轴复核读过） |
| 12 | 22 家竞品无一镜像建模、id-keyed ≈15/22（提案 §0/§1） | 归档调研报告（同上 #2，可复核） | 确认（二手归档，可复核） |
| 13 | ADR-015 机制前提（pendingSendRef 单槽、双钟耦合撤除点） | 本会话 T1-T4 实施＋L3 复验（commit 0d79ac8…27712a0）现场改造即证据 | 已验证 |

## 结论

- **零推翻**：13 条现状断言全部有现场或归档证据支撑；唯一"补隐含前提"＝#2（requestId 签发形态未绑定→v3.1 条款已补）。
- 两条"确认（二手归档）"（#2/#12）依赖竞品调研报告质量——报告出自本会话逐仓 grep 记录，且源码盘在位可随时重放；后续对 ApprovalWindow 的终审（击穿轴）如需更高置信，可对这两条做**源码盘重抽验**（建议但不强制）。
- 流程沉淀：本 sweep 即规则 4 ②"现行有效工件被引用前补前提台账"的首次执行模板（前提→证据 file:line→三态）。
