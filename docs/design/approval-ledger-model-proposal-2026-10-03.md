# 领域模型修订提案：授权请求窗口一等化（ApprovalWindow）

状态: **final-v3.3·landed（终审三轴修后可＋四项根治裁定吸纳＝定稿；同日按 A1–A17 清单落原稿完毕——原稿 git diff 即落位证据；ADR-017 为权威登记）** ｜ 日期: 2026-10-03 ｜ 审计链: 十四轴 `independent-audit-v10`、十五轴 `independent-audit-v11`、终审三轴 `final-review-v3.1-{penetration,construction,landing}-axis-2026-10-03` ｜ 前提清查: `adr016-premise-sweep-2026-10-03` ｜ 取证: 22 家竞品源码 `approval-model-competitor-source-survey` ＋ `t000073-allow-channel-rootcause` ｜ 关联: ADR-015、00 §3.2、02 §2/02:191、d000011、ADR-014 #1/#2

## 域归属卡（ADR-016 规则 1 执行）

| 概念/字段 | 权威域 | 为何在此层 | 移除后兜底 |
|---|---|---|---|
| requestId（身份） | Conversation（决定寻址）＋main 签发（v3.1：跨重启唯一形态，见 §1 条款） | 决定必须可指向、可幂等 | main 台账拒收无 id；撞号由签发唯一性事前封堵 |
| requests[] 集合与 state | Conversation | "用户在批什么"是推进语义本体 | 无（此即真相源） |
| 执行可行性（id 可执行否/执行到哪） | **main 持久执行日志**（v3.3 由进程内台账升级——执行域边界 fail-closed） | 可执行事实须跨进程且不住领域 | journal 判（issued/approved/started/done 三判） |
| 执行效果不定（uncertain） | 事实＝main journal；**待裁状态呈窗** | 不可证事实按产品主张升格为用户决策（决策唯一输入），禁自动重放 | journal＋卡 |
| 三档规则权威（session/persistent） | **main**（v3.3——renderer taskTrust 降为呈现投影，:2374 isTrusted 旁路面移除） | 02:188 "renderer 不判断——防绕过"同款依据；信任集合住 renderer＝绕过温床（2376 事故） | main 规则表 |
| argsFingerprint 核验 | main（执行域） | 防批 A 行 B 属执行安全非决策语义 | — |
| 事件排序/序号 | **时间线日志域**（TimelineEvent.seq，06 注册表） | 排序是日志关注 | 日志层既有 |
| 呈现优先级（窗与确认卡互斥） | Conversation 槽（单值不变量 7） | 决策通道唯一 | drainQueued 转换 |
| taskTrust/规则三档 | Workspace（规则存储）＋Conversation（决定记录） | 02 §2 三方分工 | setRules/台账 |

## 0. 病灶（定稿表述）

需批准的执行请求事实住在 UI 卡列表（toolCalls[].status 为权威），approval 槽是单向镜像、allow 决定不写任何集合——故 allow 无法进门、pending 靠 effect 代理、批量部分批准不可表达。根治＝**集合成为领域事实、槽降为派生**。22 家竞品无一镜像建模；两家单槽者（hkuds/DSH）事实亦在请求集合。

## 1. 核心概念

- **授权请求**：`{ requestId, kind: 'tool'|'plan-batch', toolName, subject, argsFingerprint, state: queued|pending|approved|denied|failed|expired|uncertain, decidedBy?: 'user'|'rule', decidedAt?: string }`（decidedAt＝审计时间戳，非身份；uncertain＝v3.3 执行效果待用户裁——见 §5 日志三判）。
  - **requestId＝main 在 needApproval 裁决分支（tools.ts execute 咽喉）签发的全局唯一 id（跨进程、跨重启）**——**身份即 id**（第十五轴裁定：approval 面**撤除一切代次钟**，闸不看 seq；codex/gemini/kilocode 同构）。**不写"单调"**（终审 P-02：撤钟后单调性零消费者——排序归时间线日志域、窗内呈现＝数组插入序；"单调"系钟时代残留契约，删）。
  - **不透明条款（终审 M-01）**：requestId 对一切消费方（领域转换、闸、渲染、事件载荷）是**不透明字符串**——禁止解析/比较其内部结构（bootNonce/counter/ts 段仅是签发方防撞材料）；任何"id 内含可比较成分"的实现冲动＝代次钟借尸回流，违规。
  - **签发唯一性条款（v3.1，对用户裁定的独立复核补齐）**：requestId 必须**跨进程、跨重启唯一**（如 `apr_<bootNonce>_<counter>` 或 uuid；bootNonce 于 main 启动时生成，**只存在于 id 之内**——不进领域状态、不进台账结构，不违反 v3 撤钟裁定）。堵的洞：main 重启后进程内计数器复位 → 新签发 id 与恢复的旧会话 expired 记录撞号 → `approvalRequested` 的"同 id→no-op（幂等）"把**新请求静默吞掉**——幂等保护反向杀伤合法性。竞品无一使用纯进程内计数：opencursor `apr_<ts>_<rand>`、crush/goose uuid、hkuds DB 自增主键、reasonix nextID+nonce。
  - 上行搭 ToolResult 返回体（无推流不建）；**批复＝二次 execute 携 requestId**；args 摘要 ≠ argsFingerprint ⇒ main fail-closed 拒（TOCTOU 强制封死）。
  - `plan-batch`＝approve-files 合并授权卡：main 对虚拟工具同样签发，**存续与闸入窗统一**；决定内容/执行链仍走 approvalGranted＋planConfirmed 硬序门（正交的是语义域，不豁免的是闸）。
- **授权窗口 ApprovalWindow**：`ConversationState.approvalWindow = { requests: ApprovalRecord[] }`——**领域内无序号无代次**（v3 裁定：排序归事件层）。槽呈现规则（**单向派生**）：窗含 pending 请求 **且无确认卡占槽 ⇒ pending='approval'**；确认卡接管期间窗存续（不置槽不推号——decisionInstanceSeq 与 approval 无关，goal/plan/resolution 族专用）；槽释放 ⇒ `drainQueued`（queued→pending、置槽）。D5 hasApproval effect 退役。
- **决定**：`approvalDecided(s, { requestId | batch:'window'|'reject-rest' }, decision, answers{requestId})`——四入口（单卡/记住/批量/文本恰一）＋规则命中全收敛；allow 与 deny 同权入态。

## 2. 不变量与域界（含改写件）

- **不变量 1 扩写（00 §3.2 同步）**：状态推进只能由用户决策发生，**含其预先规则裁决**（always/session grant 命中＝`decidedBy:'rule'` 的同门登记，是先前用户决策的延迟执行）；main 侧规则/TTL 到期经**上行对账通道**（§6-4，终审 L-02 勘误断链）回写集合，保证"恰一 pending"计数与呈现的权威单一。
- 不变量 7 改述：**"单窗、N 可寻址目标"**——d000011 边界两轴确认：判据在解冻语义（windowResolved 归零才释放槽/解冻），无多槽、无部分批准解冻并发。
- 02 §2 三方分工补注：是否需批＝main 裁决；决定记录＝Conversation 窗；会话/持久规则＝Workspace 存储（taskTrust 现 renderer-only 随 §5 修）。
- 持久规则仅收文件/网络类；**bash/高危永不进规则**（02:191 产品裁定压过 goose 形）。规则序 `deny > always-allow > ask` 显式化（现 first-match）；落库经串行队列防交错。

## 3. 转换（ConversationState 新函数族）

```
approvalRequested(s, record{requestId,kind,tool,subject,argsFingerprint}, slotBusy)
//   slotBusy 定义（终审 P-03 修补——恰一 pending 呈现的基数闭合）：＝有确认卡占槽 **∨ 窗内已存在 pending 呈现记录**；
//     真→ state=queued 入窗不置槽；假→ pending 入窗＋置槽呈现。两工具请求相继到达＝第二者 queued，drainQueued 次序进入呈现
//   id 重复→（终审 M-02 可观测化）同 id 同指纹→no-op＋duplicate_ingress 打点事件；同 id 异指纹→拒收＋conversation.error（＝签发唯一性条款被违背的信号，不静默）
approvalDecided(s, target, decision, answers{requestId})
//   闸＝requestId∈窗 ∧ state∈{queued,pending}（无钟可撞）：miss/已决→no-op＋stale 事件
//   approved→记 decidedBy/decidedAt（终审 P-01：原注释"epoch"系违禁概念残留，§1 记录形态本无此字段，改 decidedAt）；执行由调用层凭窗内记录二次 execute 携 id（A 阶段"只记不判"除外）
//   batch:window＝提交瞬间窗内 queued/pending 全快照；reject-rest＝同快照减去本次显式目标；逐成员各过独立闸（已被 rule-drain 命中者 no-op+stale），每 id 各记一条（一决定 N 记录；整批拒为常规档治僵窗）
//   rule 命中（drain 时判定）：decidedBy='rule' 同闸同记；**plan-batch 不适用规则命中**（终审 M-05——规则仅面向真实工具请求；plan-batch 决定＝approvalDecided 记决定 → 执行链 approvalGranted＋planConfirmed 硬序门照旧，执行链失败回写 settled('failed')）
approvalExecutionSettled(s, requestId, 'done'|'failed')   // 执行回写收敛（批了但失败→failed，防双真相）
windowResolved(s)                                          // pending+queued 归零 → 槽释放（若 goal/plan/resolution 无卡）
reconcileJournal(s, rows[{requestId,phase,argsFingerprint}]) // v3.3 恢复/重连/低频对账（取代 expireWindow 的 restore/disconnect 缓解语义）——按 id 三判：窗未决∧phase≤approved→存续可决（判 A）；phase=done→settled('done')（判 B）；phase=started∧¬done→ **uncertain**（判 C，待用户裁）；无行（旧档/异机 journal 丢失）→未决 expired、approved∧未 settled→settled('failed')（缓解语义仅保留于此退化场景）
resolveUncertain(s, requestId, 'settled-done'|'authorize-rerun')  // uncertain 唯一用户出口（判 C 配套）：前者→settled('done')；后者→记录回 approved＋journal 记 rerun-authorized，同 id 再 execute（无自动重放——不可证事实只由用户决策退出）
expireWindow(s, reason:'ttl'|'legacy')  // v3.3 收窄：ttl＝main journal 到期经 §6-4 回写（未决→expired；approved∧未 started→settled('failed')——批了没跑＝失败可重批）；legacy＝无 journal 行可判的旧档记录。**'turn-end' 废除**（终审 L-04——悬挂卡跨轮存续是既有 UX，core.interaction 问题 A 场景即靠此，决策面不因模型轮次过期）
// 窗体量（终审 L-03）：requests[] 只存**非终态记录**＋最近 1 条终态（呈现需要）；终态历史权威＝时间线日志域，领域不重复记账
```

## 4. 文本批准（收窄定稿）

窗内**恰一**可决记录才认明确批准词（绑其 requestId）；多记录＝不生效＋可见提示"请在卡片上指明批准"（不静默、不落入 C2 direction 误判）；`/批 <id>` V2。C2 与回声（ADR-014）其余语义不变。

## 5. 规则三档与执行域

**v3.3 根治裁定吸纳（用户："按设计根治根因，不求最小修改"）**：

- **执行日志（journal）＝main 持久 append 账**（M-03 根治，取代 at-least-once 止损）：needApproval 签发即记 `issued`；批复二次 execute 前记 `approved`；execute 咽喉记 `started`；完成记 `done`（各含 requestId+argsFingerprint+ts）。main 二次 execute 校验＝**id ∈ journal ∧ phase 允许 ∧ argsFingerprint 等值**——可执行性判据跨进程成立（v3 "本进程台账不认识＝拒"是**内存台账遗忘前提下的缓解**，journal 消灭该前提；事实仍住执行域，领域零复制，撤钟裁定不违）。
- **恢复三判（取代"恢复即 expired/failed"缓解条款）**：重启/重连后窗快照（sessionStore 信封）与 journal 按 requestId 对账（§6-4 通道扩展为 journal 查询）——**判 A** 窗未决 ∧ journal≤approved（从未 started）→ 记录存续可呈现可决（用户被中断的决定**不丢**，幽灵 pending 根源"不可执行"已被 journal 证伪）；**判 B** journal=done ∧ 窗未 settled → `approvalExecutionSettled('done')` 对账收敛；**判 C** journal=started∧¬done → 窗记录 **uncertain**——执行可能已发生、不可证（两军问题，工具级幂等不可依赖）→ **呈现用户裁决卡**（"标记已完成"→settled('done')／"确认未发生并重执行"→journal 记 rerun-authorized 同 id 再 started；**无自动重放**——uncertain 只由用户决策退出，产品主张：不可证事实升格为决策点）。
- **规则权威归 main**（G1 根治）：once＝决定记录（事件流/窗）；session grant＝main 会话规则表，**任务边界（goal 确认）经 clearSessionGrants IPC 清除**——清 trust 不再是 renderer 局部动作；persistent＝Workspace 持久库（setRules 接线激活，跨任务语义不变、不参与边界清除）；**bash/高危永不进规则**（02:191 不变）。renderer taskTrust 集合降为呈现投影，判定权回收 main（ConversationPanel:2374 isTrusted 旁路面移除——02:188"renderer 不判断——防绕过"与 :2376 事故同源治理）。main 侧规则/TTL 到期经上行对账回写窗。renderer 盲信面（approved:true 无校验）关闭。

## 6. 事件/持久化/通道（定稿）

1. decision.* 单源：`decision.requested` 随 approvalRequested 开窗发（detail 窗快照）；`decision.resolved` 带 requestId+outcome+decidedBy；`decisionContent.approval` 单卡型面退役（双存储不留）；deriveStateEvents 对 approvalWindow 增派生规则。
2. sessionStore：**独立会话级窗快照字段**（不塞消息行）；排序/序号需求由**时间线日志域**承担（TimelineEvent.seq 既有；decision.requested/resolved detail 可带纯展示序，不入 ConversationState）；过滤器翻转使 plan-batch/未决卡可投影恢复；旧档 hydration＝空窗＋旧档恢复记录一律 expired（终审 L-01 措辞：不用"世代"；仿 hydrate 补水式）；落点形状（终审 S5 补注）：现 sessionStore 为裸 `StoredMsg[]` localStorage 数组，"独立窗快照字段"实为**数组→信封对象**（`{messages, approvalWindow?}`）形状迁移＋旧档兼容分支（约 8–12 触点）；restorePending 签名扩容归阶段 C。
3. **无世代号（v3 裁定）＋journal 权威（v3.3）**：重启后旧 requestId 可执行性/执行进度由 **main 持久执行日志（journal）**在 execute 边界与对账通道判据化判定（§5 三判），领域模型不复制该事实；"恢复即 expired/failed"降级为**journal 不可判退化场景（旧档/异机）专用缓解**；started∧¬done＝uncertain 升格用户裁决（判 C）。
4. **上行对账通道**：ToolResult 增标记（rule 放行/已决/到期）＋轻量对账查询 IPC（低频，不建推流）——rule-decided 与 TTL 的集合回写靠它取得权威；**v3.3：本通道即 reconcileJournal 的执行载体**（恢复/重连时 renderer 拉 journal 行→判 A/B/C）。
5. status_bar/onApprovalChange 派生随阶段 B5 改接（非 C）。

## 7. 迁移与分期（施工轴裁定，规模 135–205 触点——终审 S7 上修 110–160→120–185；v3.3 根治再 +15～20：journal 持久 append、对账 IPC、clearSessionGrants、isTrusted 迁移、resolveUncertain 卡面）

- **阶段 A（main-only，可独立绿）**：requestId 仅 needApproval 分支铸（write 计划门不铸）；journal append 自此期即写（**只记不判**——不做执行判据）；ToolResult 可选字段向后兼容；台账**只记不判**（TTL 只标不拦、无 id 的 approved:true 旁路——A 期现状保持）；rules L1 stub 喂生产空表常绿。**中途可发**。
- **阶段 B（原子对，中途不可发）**，八步：B1 类型面（tools/ipc/preload/types）→B2 领域（记录+§3 转换族八函数（v3.3 含 reconcileJournal/resolveUncertain），**领域无序号**）→B3 hook/事件派生→B4 四入口改线（reject 错位老坑＝时间线取证会话 a08d1775——**非本仓 commit**（终审 S8 勘误：git cat-file 不存在，实为 useToolApproval.ts:82 取证 ID），随 B6 定位统一根治；现状核对：reject 仍 idx 定位 useToolApproval.ts:203-220、approve 已 id 化——与"随 B6 根治"吻合）→B5 D5 退役＋消费方迁接（终审 S2 补全清单：status_bar/onApprovalChange 之外还有 **busyGate.ts:12、ConversationPanel.tsx:2574-2593（approval 期文本批准路由）、:703（status 打点）、:1932-1936（shouldStopContinuation 供料——D5 effect 非纯呈现镜像，是悬挂卡续转停止的输入；退役须同步迁窗派生，否则问题 A 十四轮循环回归）**）→B6 定位统一（rejectToolCall/approveAllRemember 并入 id 定位；双 id 并存文档化：tc.id=卡定位、requestId=审批寻址）→B7 L1 断言重写（conversationState/tools/permissionRules/hardOrderGate/timelineEvents/agentLoop/busyGate——七件全存在，终审 S1 核验）→B8 L3 分组（v4/双卡/合并/S7-3/A-016/mockBridge）。
- **阶段 C**：持久化翻转（信封形状）＋恢复 journal 对账（判 A/B/C，expired/failed 仅退化场景保留）＋restorePending 扩容＋事件族收口＋setRules 生产接线＋clearSessionGrants/isTrusted 权威回收 main。
- 静默风险必补 L1 七防线：接管不推号；id∉窗 no-op+stale；ttl/退化 expired 后 settled→failed；归零释放槽；batch 逐 id 记账；**uncertain 无自动重放（resolveUncertain 为用户唯一出口）**；**clearSessionGrants 任务边界清除 session 档、persistent 档不越界**。

## 8. 裁定记录（含 v3）

用户 2026-10-03：逐请求/三档/一对一按业界主流；requestId main 签发直取根治。**十五轴两轮击穿点全部关闭**（撤钟为最大简化：approval 与 ADR-015 的耦合从"双时钟同步"降为"槽的呈现互斥"）。**v3 追加裁定（2026-10-03 用户，第十五轴复核）**：window.seq/epoch 类序号是**时间线日志领域模型**的排序关注，不得进入 Conversation 领域身份——approval 域内身份＝requestId＋state；跨进程可执行性归 main 台账权威（执行域边界 fail-closed）；十五轴击穿轴第 1 条（双钟搬家）据此**溶解**（前提被裁归位，非裁决）。

**v3.1 复核记录（2026-10-03，用户指令"requestId 也是凭印象，不能直接采信，需要确认"）**：对两项裁定独立取证——① **序号归位裁定成立**：`timeline.ts:12` `seq: number // 会话内序号（单调递增）`＋`append(event: Omit<TimelineEvent,'ts'|'seq'>)`（:369）证明排序能力本就由时间线日志域承载，领域内撤钟与现有实现事实一致（非仅印象）。② **requestId 身份裁定成立但隐含前提有洞**：竞品 id 形态全部跨进程唯一（opencursor/crush/goose/hkuds/reasonix，见 §1 条款），而 v3 仅 §8 写"main 签发全局唯一单调"、§1/§5 未绑签发形态——进程内计数器重启撞号会经"同 id 幂等"分支吞新请求。据此出 **v3.1 签发唯一性条款**（bootNonce 只活在 id 内，不违撤钟裁定）。③ 连带勘误：竞品调研报告（`approval-model-competitor-source-survey`）第 31 行"requestId+windowSeq 双键"建议系 v3 裁定前产物，**已被取代**。本复核即 ADR-016 规则 4（裁定来源不豁免）的首例执行。**终审记录（2026-10-03，v3.1→v3.2）**：三轴独立审计全部收口——击穿轴"修后可定稿"（P-01 epoch 残留词、P-02 单调残留契约、P-03 slotBusy 基数洞＋M-01/02、L-01/02/03/04 已机械吸纳；bootNonce≠代次钟回流的场景经规则 2 判"错位前提不成立"作废）；施工轴"修后可执行"（S2 消费方四处补名——含最重的 shouldStopContinuation 供料、S8 a08d1775 引用勘误、S5 信封迁移、S7 触点上修，均已吸纳；S1/S3/S4/S6 吻合）；落稿轴"放行落稿"（四组替换草案相容、**落稿清单扩容**见下）。

**落稿清单（终审落稿轴勘误＋扩容，取代原"00 §3.2/§3.4、02 §2/§4.6、intent-design 四处"指针）**：核心组＝00 §3.2 要点 2（唯一措辞源——三项扩充必须**内嵌同句**防下游漂移）＋00 §2 判定表 :58、§3.5b、§3.6、§9；02 §4.2/§4.8 信任机制段＋§8；intent-design §3.2/§3.3/§3.4:255-265（approvalDecided 现状实际在此、非 00 §3.4）/**§4:297/:299/:305、§5:324、§8.2E:405、§8.4:427 四处必改级**；04 §1.1/§1.2/§2.3/§2.6-2.7；06 :37/:41/:49/:185-186；coverage-matrix 表2/表4 随行注；**新增 ADR-017**（声明取代 ADR-015 的 approval 面条款，历史不回改）＋000 索引行；product/01:282（低优先）。恢复语义接缝警示：expire/failed 反转 intent-design :263-265/:405 两处已落稿文本——**必须同批落**，防同文档双规则并存。全部 A1–A17 明细见 `final-review-v3.1-landing-axis-2026-10-03.md`。

**裁决收口（2026-10-03 用户："待裁决项根据设计采用根治根因的方式，不追求最小修改范围"）→ 提案定稿 v3.3**：① **M-03 溶解**——"接受 at-least-once/人工在场档/幂等键"三选项全部不取，根解＝**main 持久执行日志（journal）**：三判（≤approved 存续／done 对账收敛／started∧¬done→uncertain 升格用户裁决、无自动重放）取代"恢复即 expired/failed"缓解（该缓解的前提是 main 遗忘，journal 消灭前提；退化场景仍保留）；② **G1 溶解**——规则三档权威统一归 main（clearSessionGrants 任务边界清除 session 档；persistent 不跨任务语义不变；renderer taskTrust 降呈现投影、isTrusted 判定权回收——02:188 防绕过同源）；③ **G2 确认**（M-05 条款成立：approvalDecided 写窗记决定、approvalGranted 开清单门）；④ **落稿扩容 A1–A17＋ADR-017＋恢复语义同批落——确认**（ADR-017 同时声明取代 v3.2 恢复条款与 ADR-015 approval 面条款）。归属卡表同步（journal/uncertain/规则权威三行）。**落稿执行记录（2026-10-03 同日闭环）**：四组核心＋A1–A17 已全部落原稿——00（判定表行/§3.2 引言行/图/要点 1-5 含新要点 5/§3.4 双分支＋journal 恢复条/§3.5b/§3.6/§9）；02（§4.2 图＋要点/§4.8 全段重写含三档+clearSessionGrants+journal 条/§8 术语）；intent-design（§2 四行＋两新术语/§3.1 pending·approvalWindow·instanceSeq 注·decisionContent 收族·➕行/§3.2 ApprovalRecord/§3.3 派生行/§3.4 descriptorOf approval 退役·骨架行·approvalDecided 全块·restorePending 收窄·转换族登记/§3.5 两行/§4 Inv1·7·承载/§5·§8.2E 两行·§8.4）；04（§1.1 注·§1.2 图＋要点·§2.3 ApprovalRecord·§2.6 规则三档·§2.7 journal 接口·实现形态注）；06（tool.approved·remembered·pending_set·decision.*·注）；coverage-matrix（Inv1/Inv7＋表2/表4 随行注）；product/01 授权行。**落稿自检 grep 通过**：残留命中仅历史工件（identity-model-proposal/amendment 已加后继勘误行）；ADR-015 取代指针已加；ADR-017＋000 索引行已立。下一＝新实现计划（阶段 A/B/C 即批次，不叠 v 号）。
