# 方案审计 · 幽灵占位 / busy 同源 / 排队死信 修批（v2 → v2.1）

> 日期：2026-10-01 · 审计对象：`docs/superpowers/plans/2026-10-01-ghost-busy-deadletter-fix-v2.md`（现地升至 **v2.1**）
> 授权背景：Task7 关单复测硬闸 FAIL → ADR-012 停等 → 用户裁决（handoff `d000006`）批准 RC1a/RC1b(仅同源)/RC3
> 审计方式：两路独立评审（技术事实面 / 规范权威面）+ 主审交叉复核与实跑验证；结论落 §15/§16（方案内）
> 裁决：**GO-with-fixes** —— v2 **不可照抄执行**（8+ 处必挂），v2.1 修毕可执行；4 项转用户裁决

## 1. 判定摘要

| 维度 | v2 判定 | v2.1 状态 |
|------|---------|-----------|
| 授权边界（是否越 d000006 之界） | 基本守住：未触碰簇 2 口径、未碰 `t000068`；改 flush 点/idle 边缘＝裁决原文用语，非扩权 | ✅ 保持；D6 字面微超已列为可否决项 |
| 技术正确性 | **2 个 P1 安全洞 + 1 个 P1 漏修点 + 测试样例必挂** | ✅ 全部改造（见 §3 F1/B2/C*） |
| 取证纪律（ADR-012） | 处置/本地验证/Mac 回归三轮分离，硬闸数字与上批一致无降标 | ✅ 保持；闸门口径按实测基线订正 |
| 断言可跑性 | DoD 数字与选择器大多可跑，但**基线口径失真**（称 L3 全绿可达） | ✅ 改为「不新增失败」+ A10 |
| 落位与写口 | 位置正确；未声明 handoff 单一写口、决策指针仍指 v1 | ✅ §8 补齐 |

## 2. 审计自身的证据基线（实跑，非引用）

| 项 | 结果 | 证据 |
|----|------|------|
| L1 单测 | **703 passed / 47 files** | `env -u NODE_ENV npx vitest run`（本机 WSL，HEAD 8baf919）；CI 36782657278 同数 |
| 类型检查 | `tsconfig.json` **0 错**（`tsconfig.main.json` 由实施 Task 4 Step 0 补） | `npx tsc -p … --noEmit` |
| **L3 interaction** | **70 passed / 3 failed ❌** —— 预存在红 | 本机实跑；**CI 36782657278（Linux）失败集合逐项相同** ⇒ 非 WSL 环境artifact；单跑复现＝确定性失败（非 flaky） |
| 失败项 | `cards-from-decision-content.interaction.ts:440`（S5-2 escalate 只说不做）· `core.interaction.ts:685`（根因 3 confirm执行 forceTool）· `core.interaction.ts:1859`（问题 A approve-files 悬挂） | 三者均涉 busy/排队/escalate 语义，与本批改动域相邻 ⇒ 实施后须观察是否意外转绿 |
| 处置 | 登记 `t000069`（blocked：非本批范围·待裁决是否另开修批） | 分支 CI 自 2026-09-29 起即红（两次 run 均 fail 于「L3 组件交互」步） |

**这是本审计最重要的一条**：上批方案与本批 v2 都把「L3 全绿」当闸，而改前 HEAD 就有 3 例红且**从未登记**。若不先钉基线，实施者会在「修不动既有 3 红」与「顺手改断言」之间误入歧途（后者违反 ADR-012 精神与本批范围）。

## 3. Findings（编号沿用方案 §15；★＝阻断照抄执行）

### 完整性 / 正确性

- **★ F1（P1）同族漏第三调用点**。`retryFailedTurn` L2744-2754 也 push 流式占位，L2761 `await runChat(...)` **无 try/finally**。v2 只处理 send 侧兜底，漏此路：重试链撞 `forced-clarify` 裸退 → **既不收尾占位、也不释放 working** → 状态栏永久「搭档处理中…」（真悬挂，重于簇 1 的谎报）。违背方案自设不变量 I2 与 §0.1「同族一起修」。
  → 修法取**根因位**：裸退 B 自身 `finalizeOrphanStream(sid)` + 释放 busy，一次覆盖三调用者；anchor 在三处 push 点各记一次。
- **★ B2（P1）anchor 身份不足 + 越界扫描**。单存 `roundStreamIdRef` 且 `anchor<0` 回退「扫全表」：`approval` 期非 silent 直送（`busyGate.ts:12`）允许 B 链在 A 链持锁期间覆盖 anchor（`send` 的 push L2494 早于 `acquireChain` L2588）→ A 在裸退时按 **B 的占位**为锚 → 删掉 B 的活占位 → B 整轮回复无处落（chunk updater `target===-1` 静默丢）。
  → anchor 改 `{sid,id}` 配对（D3）+ `anchor<0`/非 streaming 直接 return（D2）+ 扫描范围严格 `i<=anchor`。
- **★ C4（P1）busy 窗口论证为假**。`streamDelay:2200` 撑不开它声称的窗口：mock `streamChat` 立即 ok，窗口 ≈ 800ms done 等待（L2206-2216）+ 500ms `maybeContinue` 首 tick（L1847-1858）≈ **1.3s 封顶**；`manualEmit` 兜底同样越不过该 800ms；`approval:'all'` 反而**破坏排队前提**（审批期直送）。
  → 确定性构造：`approval:'none'` + 8 轮自动执行的只读工具（pending 恒 none，续链持续在飞）。
- **B1/C7（P3）未点破的实现前提**：`messagesRef` 由 commit 后 effect（L305-307）同步，裸退 A 处靠 L1975 的 50ms 等待救活；状态栏 `.nf-statusbar__left` innerText 实为「搭档处理中… │ 项目名」（子串匹配仍正确）。→ 两处已进注释。
- **C1/C2/C3（P1→P2）测试样例必挂**：缺 `capture:{chatCount:true}` ⇒ `chatCount()` 返回 `undefined`；用户气泡计数写 2 实为 3（启动 `initialPrompt` 经 L677-683 自动直发也进气泡）；`expectLastUserMsg(甲)` 语义错（乙落地后甲永不再 last）；A5 用甲/乙测「系统文案不进气泡」不成立（它们不是 nudge 文本）。→ Step 1/2 重写，A4/A5 订正。
- **E / D4③（P2）§5.1 论证两处不成立**：前提「`workingRef` 只在 `[working]` effect 写」为假（`stopGeneration` L2389、`finishError` L2699 同步写）；「两触发点同 tick 互杀」为假（相隔 >16ms + `send` 自带排队判定 → 重入自愈）。结论仍成立，但**理由必须换成**：后两处同步清 ref 均紧跟 `setWorking(false)`，边缘 effect 先置 ref 再 flush ⇒ 死信窗口结构上不存在；多触发点不需要但无害。

### 取证安全 / 边界

- **F3（P2）busy 源缺失时静默判 idle** → 选择器失效会在真 busy 期放行动作、污染整批取证。→ 改 **fail-closed**（读不到 → 保守判 busy + `WARN busy-source-missing`）+ `[role="status"]` 回退。
- **F4（P2）未论证审批卡期 flush**：边缘 flush 撞上 `pending==='approval'` → 直送 → `sessionRef++` 作废旧授权链。→ 已论证为 ADR-013.2 既有例外的同路径同语义（非新口径），列入 Task 5 观测行与 R3。
- **F11/R7（P2）新跨层契约未闭环**：harness 以状态栏**文案子串**为 busy 契约，文案改动静默致盲。→ 加同源哨兵（首轮比对 `conversation.status_change` 孪生事件，L661-673）+ `data-nf-status` 锚定转裁决。
- **簇 2 边界声明成立**（审计核代码）：状态栏 working 优先（`MainWorkspace.tsx:427-452`）且 `maybeContinue` 工具期保持 working（L1835-1839）⇒ 工具间隙/续链在飞期新旧源同为 busy；decision-pending 同为非 busy。换源**只减去幽灵与模型正文的假阳性**，门闩 L686-691 未动 ⇒ **未实际触碰簇 2**。

### 合规 / 落位

- **F2（P2）D6 字面微超授权**：删 L806 直写槽特例属「统一写入路径」的合理推论（`send` 已等价实现 busy 排队），但严格超出「单槽改数组＋唯一 flush 点」字面 → 保留并**明示可否决**。
- **F5/F6（P2）DoD 自相矛盾**：A8 写「T1–T4 全绿」，§7 又承认 p035/p098/T4 因口径未改「仍可能失败」。→ A8 注记「预期内残留 → 停等裁决，不判 RC1b 无效」；补「收口失败=0 / 环境失败≤2」入矩阵。
- **F7（P2）写口未声明**：Task 6 改 p000125、更新决策指针必须走 handoff CLI（AGENTS 规则 4 单一写口）；d000006 正文仍指向 v1 → 必须改指 v2.1，防后人按旧链接执行。
- **F8/F9（P2）自检与编号失真**：`grep "处理中\|思考中\|生成中"` 在 BRE 下语义错（当前命中纯属源码正则文本含字面 `处理中|思考中`，改后零命中，与「仅剩 uat-force1.mjs:41」自相矛盾）→ 改 `grep -rnE '思考中|生成中|正在回复|Streaming'`；`forcedClarify.interaction.ts` 实测仅 T-FORCE-1..3（非 1..4）→ 新用例编号 T-FORCE-4；A2 缺基线数值口径。
- **F10（P2）引用错误**：方案头部「ADR-010（四级梯度）」挂错号——`docs/decisions/010` 是多源 Provider 目录，四级梯度**无对应 ADR 正文**（`ConversationPanel.tsx:2141` 与上批审计同样误标）。→ 改引 `src/domain/conversationState.ts:244-259` + 单测；误标订正列入「本批不做」（涉多份历史文档口径，与 d000002 设计动刀门槛一并处理）。
- **ADR-012 合规确认**：Task 0 取证属裁决后处置轮的必要动作（非测中临修）；Task 5 明写「只记不改 + 完成态＝汇总等裁决」；硬闸四项数字与上批完全一致，**无降标**。

## 4. 分歧与不采纳项

| 主张 | 出处 | 主审裁定 | 依据 |
|------|------|----------|------|
| 「T-FORCE-5/4 改前不会红（第三次文本回复只进 loop-guard，不进 forced-clarify）」 | 技术面审计初判 | **不采纳** | `forcedClarify.interaction.ts` T-FORCE-1 用**同一 `loopScript()`** 断言 `.nf-forcedcard` 出现，且该用例在当前 70 passed 中**通过** ⇒ mock 下确进裸退 B；另一路独立复核（C5）同结论。红/绿仍以实施 Step 1 实跑为准，并保留「改前即绿 → 记覆盖不足、禁弱化断言」的分支 |
| 「§0.3 关于 `maybeContinue` 无 flush 点，故 H3b 不成立」 | 技术面审计 | **部分采纳** | 混淆两条链：`runChat` 内嵌的 `maybeContinue` 确由 `send` finally 覆盖；但 `useToolApproval` L168-175 的 **setTimeout 独立续聊链**不经 `send` 包体，旧代码该链收口时确无 flush 点 ⇒ H3b 成立。v2.1 已在 §0.3/影响面表把措辞限定为「独立续聊链」 |
| 「`anchor<0` 只由 compaction 触发，而 tail 保留 id 故不会发生」 | 技术面 B3 | **采纳其事实，不改结论** | compaction 确实保留 tail 占位 id（L2546）；但 B2 的并发覆盖路径同样可致 anchor 语义错位，`anchor<0` 仍须安全 return（保守优先，不作可达性赌注） |

## 5. 转用户裁决（本批不自行决定）

1. **D6 删 L806 直写槽特例**是否接受（F2 字面微超，理由＝消灭第二写入口）。
2. **状态栏文案子串作为 harness 契约**的长期方案：是否下批改 `data-nf-status` 属性锚定（R7/F11）。
3. **`t000069`：L3 预存在 3 红**是否另开修批（与本批同域，建议紧随其后；若本批意外转绿也须单独裁决）。
4. **簇 2 门闩放行口径**（依回归轮采集的 busy 真/假比例，按裁决「先只做 RC1a 再定」）。

## 6. 结论

v2 **判定为不可照抄执行**（F1/B2/C4 三处会导致漏修、误删他人状态、测试假绿/假红）；**v2.1 修毕 14 项 finding 后可执行**，Task 1/2/3 的边界与 ADR-012/013、领域 §4.12 一致，未越 `d000006` 授权。实施前须先答复 §5 第 1 项（D6），其余三项不阻塞开工。
