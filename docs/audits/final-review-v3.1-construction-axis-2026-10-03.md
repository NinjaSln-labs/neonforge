# 终审 v3.1 第二轴：施工可行性独立审计（2026-10-03）

被审件：`docs/design/approval-ledger-model-proposal-2026-10-03.md` §5/§6/§7（阶段 A/B1-B8/C、规模 110–160 触点、"阶段 B 原子对中途不可发"）。
审计法：逐步骤对照 `apps/desktop/src` 与 `tests/` 真实代码，只取证不改动。前置现状清查见 `adr016-premise-sweep-2026-10-03.md`，不重复。
路径基准：`apps/desktop/`（file:line 相对此根）。

## 发现表

| # | 结论 | 证据（file:line） | 影响 | 建议处置 |
|---|---|---|---|---|
| S1 阶段 B7 七测试文件 | **吻合** | `tests/unit/` 下 conversationState.test.ts（1595 行，approval 相关匹配 84 处）、tools.test.ts（303 行/11 处）、permissionRules.test.ts（79 行——测 `matchesRule/isInSandbox`，0 处 approval 断言）、hardOrderGate.test.ts（78 行/3 处）、timelineEvents.test.ts（352 行/11 处）、agentLoop.test.ts（884 行/22 处）、busyGate.test.ts（20 行/4 处）七件全部存在 | B7 | 无缺件。注意 permissionRules.test.ts 现状为纯规则匹配单测（未测生产规则表），与阶段 A "stub 喂生产空表常绿"表述吻合；B7 对它的"断言重写"实为**扩容**而非重写，措辞可注记 |
| S2 B5 D5 退役消费者清单 | **偏差** | D5 effect 本体 `ConversationPanel.tsx:319-349`；提案已点名：onApprovalChange/status_bar（`MainWorkspace.tsx:64,374,434`，§6-5）、deriveStateEvents（`timeline.ts:320`，§6-1）。**未点名消费方至少四个**：① `busyGate.ts:12`（ADR-013 待授权直送不排队）；② `ConversationPanel.tsx:2574-2593` send 路由（approval 期明确批准词→`approveAllToolCalls`，§4 语义有约但步骤未挂）；③ `ConversationPanel.tsx:703-709` status_change 打点读 pending==='approval'；④ **最重者**＝`ConversationPanel.tsx:1932-1936` maybeContinue 续转停止：注释明言"卡悬挂在**旧消息**→全列表 effect 已置 pending='approval'，lastMsg 派生检测不到"——D5 effect 是 `shouldStopContinuation`（`conversationState.ts:1067-1071`）悬挂卡检测的**供料者**，非纯呈现镜像 | B5、B3、B4 | B5 触点清单补名这四处；尤其"退役 D5"必须同时让 approvalWindow 非空判定接管悬挂卡续转停止（§1932 场景），否则问题 A（14 轮循环）回归。建议 §7 B5 加一行"含续转停止供料迁移" |
| S3 B6 双 id 并存现状 | **吻合** | tc.id＝renderer 流事件层生成：`ConversationPanel.tsx:877,900-905`（`nextMsgId()` 闭包 tcId，updater 外同步生成）、复用点 `:1564`；`h${callSeq+i}`（`:2297,2317`）仅为模型历史回放重算 id，非卡 id；main 侧无任何 toolCall id（grep toolCallId/callId 于 src/main 无命中）。二次 execute 现状**不携任何 id**：`useToolApproval.ts:131-133` execute(name,args,{approved,rootPath,sessionId})；rejectToolCall 仍按 idx+末消息定位（`useToolApproval.ts:203-220`），approve 路径已 id 化（`patchToolCall :88-121`）——B6"reject 并入 id 定位"靶子正确 | B1、B6 | IPC 面真实改动量＝opts 增 requestId 四处（`tools.ts:126-129` 签名、`ipc.ts:343-361` handler opts 面、`preload.ts:166-178`、`types.d.ts:264-275`）＋ ToolCallMsg 加 requestId 字段＋上行读取点（`useToolApproval.ts:128-144`）≈8–14 触点，量级与提案 B1+B6 隐含范围一致，无需修文 |
| S4 阶段 A ToolResult 可选字段向后兼容 | **吻合** | `ToolResult`（`main/tools.ts:88-97`）已有 needApproval?/policy? 可选字段先例（`:92-95`）；ipc handler 对结果**整体透传**不逐字段枚举（`ipc.ts:356-369 return res`）；preload/types 返回面同为可选字段内联型（`preload.ts:182-186`、`types.d.ts:269-275`）；L3 mock 的 execute 返回体＝`mockBridge.ts:235-245` addInitScript **源码字符串**（不过 tsc）＋各 interaction 件内联字面量（`core.interaction.ts:284,788,1230,1823,2092,2254` 等）——对象缺新可选字段编译/运行均无感。"renderer 盲读不改即绿"成立 | 阶段 A、B1 | 无。唯一注意点：rule 放行成功路径现无标记（`tools.ts:155-163,177-179`），§6-4 增标记属阶段 A 台账面自然延伸，可选字段同样兼容 |
| S5 §6-2 sessionStore 独立窗快照字段 | **偏差（轻）** | 现存储＝localStorage 单键 `nf-session` 下**裸 StoredMsg[] 数组**（`sessionStore.ts:8,60-65,68-79`，serialize 白名单式 `:22-57`）；消费面窄：`ConversationPanel.tsx:6,354,573-574` ＋ `tests/unit/sessionStore.test.ts`（约 10 用例）。"不塞消息行"可行，但顶层加字段＝**数组→信封对象**形状迁移（`Array.isArray(parsed)` 兼容判定 `:72-74` 须改），非零改动加键 | 阶段 C | 触点约 8–12，量级不碍；§6-2 建议补一句"存储形状 StoredMsg[]→{messages,approvalWindow} 信封化＋旧数组档兼容分支"（与既有"旧档 hydration＝空窗"裁定同流，只是落点要写明） |
| S6 §6-4 轻量对账查询 IPC | **吻合** | `ipc.ts` 现 39 条 `ipcMain.handle`（`:39-407`），top-level 注册模式成熟；增一条 query handler＝ipc.ts 1＋preload API 1＋types.d.ts 1＋main 台账查询方法 1-2 ≈ 4–6 触点；无推流＝不触 electron 事件通道面 | 阶段 A/C | 无。与"不建推流"自洽 |
| S7 110–160 触点估计 | **偏差（上界偏紧）** | 分步实测基数：B7 七件 3311 行、approval 匹配 135 处（重写主量在 conversationState.test 84＋agentLoop.test 22）；B8 面 core.interaction.ts 2305 行含 approval mock 字面量 ≥6 处＋mockBridge/cards/factory/retry/forcedClarify 五件；B2 领域 conversationState.ts 1072 行需加六转换+改造 approvalGranted/canExecute 邻域；B1/阶段 A 类型面 4 文件；B4/B5/B6 改线约 30–45；S5+S6 持久化/对账约 12–18 | 全案 | 独立估计 **125–185**：下沿与提案吻合，上界超提案约 15%（测试重写体量为主因）。非阻断，建议区间改 120–180 |
| S8 B4 引用 a08d1775 | **缺失（引用失效）** | `git cat-file -t a08d1775` → "Not a valid object name"；`git log --all` 无此 hash——**非本仓 commit**。该串实为时间线取证会话 id：`useToolApproval.ts:82`、`core.interaction.ts:2010` 均作"2026-08-15 P2（时间线实证 a08d1775…）"引用；提案 B4 原文"P2 a08d1775"沿用代码注释义，但字面形似 commit hash，终审文内未释 | B4 | 引用失效判定成立（按 commit 语义）；实质内容不失——老坑现状：approve 已修（id 定位）、reject 未修（idx 定位，S3 证据），"随 B6 根治"成立。处置：B4 括注"a08d1775＝时间线取证会话 ID（非 commit）" |

## 总判

**修后可执行。** 施工八步与真实代码的对应关系总体成立：阶段 A 向后兼容路径有既有可选字段先例背书（S4）、B6 双 id 靶点与现状精确吻合（S3）、对账/持久化面改动量级与提案一致（S5/S6）、B7 七件全部存在（S1）。两处必修均为文档级：① B5 消费者清单缺名四处（busyGate、send 文本批准路由、status 打点、**续转停止供料**——最后者涉行为回归，最高优先）；② a08d1775 引用加注。触点区间建议上修为 120–180。

## 独立触点估计

120–185（主不确定源＝B7/B8 测试重写体量，其中 conversationState.test.ts 84 处 + core.interaction.ts 2305 行为最大单件）。

审计人：施工可行性独立审计（终审 v3.1 第二轴）。被审文档与产品代码零改动。
