# 阶段 C 开工前置审计：确认轮归属无权威（S7-1/#7-1 稳定红族的真根因）

日期：2026-10-03（深夜）· 分支 `test/uat-persona-3round` @ `ddbbc20`（治理刀已 push）
裁决链：d000050（取证）→ d000051（合流开一刀＋授权插桩）→ d000052（修批内容与首轮回归分布）→ d000053（单变量二分）→ d000054（core 补 mock／retry 重标）→ d000056（A 守卫形状三轮分布）→ d000058（换形状＝回声直送）→ d000059（本审计：全回 HEAD＋写阶 C 前置审计）。d000055/d000057 因字段写坏作废入 `.handoff/trash/`，id 不复用。
候选补丁留存：`.scratch/neonforge-v1/audit-items/2026-10-03-confirm-round-ownership-shape-A-guard.patch`、`…shape-B-echo-direct.patch`

---

## 1 结论

`S7-1`/`#7-1` 稳定红的根因**不在 send 的任一分支上**，而是**"用户做出决策后，下一模型轮归谁驱动"在产品里没有权威归属**：

- 旧链（决策卡产生那条）在 `maybeContinue` 的 500ms poll 里重读 `pending`，读到用户点选已把它清成 `none` ⇒ 判定"无决策点"→ **抢跑一模型轮**；
- 点选自身的**确认回声**（`opts.echo`）常落在旧链 poll 窗口内 ⇒ 按 ADR-013 的 busy 排队语义**先入队**，待旧链 `finally`（:2840 唯一 drain 位）再投 ⇒ 于是"旧链抢跑的一轮"与"回声驱动的一轮"**并发先后出现**；
- 另有一处独立放大因子（非本族必要条件）：`send` 链尾只 `setWorking(false)`，门闩 `workingRef` 靠 effect 镜像（:2444-2446，滞后 ≈100ms）——落进这 100ms 的 send 会被误判 busy 入队，而此时本链 flush 已过 ⇒ **死信**（t000067 同根，见 §5 第三项）。
- 两轮回声之间，`decisionInstanceSeq` 已被推进 ⇒ 用户真正打字的**新意图文本**（迟到、经队列 flush）按 ADR-014 #1「flush 时按当时决策点走 C2」把它**从未针对过的新实例**拒绝掉 ⇒ 卡消失且不再回来；
- 脚本/网关若在此刻给出零 chunk 轮，占位不 finalize ⇒ 幽灵「搭档处理中…」而状态栏「就绪」（＝RC1a/t000065 签名）。

⇒ 两行级修补必然改"全局轮序"，而既有桩（多例）把轮序当标定用，所以**微修必产生新红**。归属权威＝阶段 C（journal 执行日志＋决策实例归属）的正题。

## 2 两形状实测代价（同口径＝整项目冷启 3 轮、`retries:0`、`--project=interaction`）

例数口径（防误读）：HEAD ＝ interaction **74 例** ＋ warmup setup 1 ＝ 75 步；本批加 T-FORCE-5 候选后为 75 例＋warmup＝76 步（`npx playwright test --project=interaction --list` 在 HEAD 报 `Total: 75 tests`）。

| 形状 | 族（S7-1/#7-1） | 其余红 | 机理副作用 |
|---|---|---|---|
| **改前基线**（出处＝上一会话归因批 d000048） | 3/3 轮红 | P2 双卡 1/3、core:423 1/3 | — |
| **A 守卫**：`shouldStopContinuation` 增补「本轮置过决策点」(`decisionRoundSidRef` 逐轮复位) | **0/3（治好）** | `retry:188` **3/3** ＋每轮 1 例轮换：r1 `S6-2`+`core:2166`、r2 `V1.5-S2-1`、r3 `core:598` | 改了"决策轮后是否续跑"的全局时序；多例桩的 chat 轮序与该时序耦合（`retry:188` 经单变量二分确认：关守卫即绿 8.2s，开守卫即红） |
| **B 直送**：`shouldQueueWhileBusy` 对 `opts.echo` 放行（旧链由其既有 sid 陈旧检查自停——ConversationPanel.tsx:1974 入口与 :1992 poll 内） | 0/3 | `core:388` 3/3、`factory.self:30`+`:73` 3/3、`retry:188` 3/3、r1 `S6-2`、r3 `S4-3b`+`core:1525` | **观察**＝三类"批准后仍需继续跑工具链"的用例三轮全红。**推断（本批未插桩坐实）**＝回声直送把 `sessionRef` 提前自增，使正在执行工具的旧链撞上 sid 陈旧检查而中止（:1992 那条即 `releaseWorking; return`）——入库前须先证这条链，别当已证事实用 |

判定：A 优于 B；两者都**不可作为收口形态入库**（本批已全回 HEAD）。

## 3 确定性复现（可直接复用）

`S7-1` 孤例跑法**必绿、不能证伪**（p000154）；判稳定红须整轮冷启。已在插桩副本上把红**做成确定性**（用例本体 10~15s 即红；含 vite 冷编译＋warmup 的单跑约 2.5 分钟）：克隆 S7-1，并在点击与打字之间加一次 `page.evaluate` 往返（≈300ms），使打字必然落进 `working` 未释放窗口 ⇒ 孤例即红。

事件流来源＝该插桩副本（`bridge.timeline.log` → console，经用户授权 d000051 的临时插桩，修后已全撤；`--trace=retain-on-failure` 取回）。首轮取证 R-a/R-b/R-c 三轮则**完全未改仓库**，只靠 CLI 开关与 `test-results/<案>/error-context.md` 快照。关键四行：

```
+2850 decision.requested kind=plan instanceId=3      ← 抢跑轮凭空造新实例（用户从未见过）
+3405 decision.resolved action=reject answeredInstanceId=3 reason=direction text="换个思路，做桌面版"
+3406 conversation.assistant_start …                 ← 迟到文本的轮
（其后零 chunk → 占位未 finalize → 快照末态「搭档处理中…」＋状态栏「就绪」）
```

## 4 阶 C 落点要求（开工时逐条验收）

1. **C1 信封**必须携带归属字段，使"哪条链有权驱动下一轮"成为可读事实而非时序巧合：`decisionInstanceId`、`driver`（`echo` / `user-text` / `tool-continue` / `nudge`）、`answers`（ADR-015 冻结语义）、`roundOrdinal`＋`requestId` 随行（B8 已有面）。
2. **C2 恢复三判**（≤approved 存续可决 / done 收敛 / `started ∧ ¬done → uncertain` 用户裁决、禁自动重放）与 **journal TOCTOU 核验同批**（B7 观察项）——本审计的"抢跑多烧一回合"正是 journal `started/…` 缺位导致的不可见副作用，恢复三判落地后该现象应可被日志直接观测。
3. **C3 规则权威归 main**：确认动作的台账/标题类副作用（如 `MainWorkspace.tsx:194` 的 `workspace.updateProjectTitle` 硬调用）**不得位于确认进门的关键路径**——实测该调用一抛即掐断回声 send（旧行为靠抢跑掩盖，见 `core.interaction.ts:42` 局部 mock 缺桩案）。归 main 时请把此类旁路副作用移出关键路径或显式降级。
4. **回声语义定形**：`ADR-014 #2`「回声退出用户决策通道、只渲染气泡＋驱动续跑」需要配上**投递去重**——同一 `answers` 的回声在一轮内至多驱动一个模型轮（当前形态：排队 flush 与旧链抢跑可同时驱动两轮）。
5. **验收口径**（不得放宽；2026-10-04 依实测改写）：
   - **轮数下限＝≥6 轮**整项目冷启 0 红。原写「≥3 轮」**已被实测证伪**：治理 A 落地后 6 轮实测＝r1/r2/r3 全绿、r4/r5/r6 各红 1 例且签名同为 `getByRole('button', {name:'确认执行'})`——3 轮样本会把间歇竞态读成"已收口"。
   - **必须另附确定性复现判据**（纯 L3 绿不足以证明归属缺陷已修）：克隆 S7-1，在点击确认卡与打字之间插一次 `page.evaluate` 往返（≈300ms），把"回声落在旧链 poll 窗口"逼成必然 ⇒ 孤例即红（约 10~15s 级）。收口标准＝该复现不再红，**且**事件流中不再出现「同轮内 `decision.requested` 新实例被随后的 `decision.resolved reject` 打掉」。
   - **两类红不得混计**：`.nf-start` 挂载红＝t000076（已闭，治理 A：6 轮 12 例 → 0 例）；`确认执行` 断言红＝本审计的归属族。
   - 不得引入本批 A/B 那两类新红（合并授权/manualEmit/决策轮时序轮换）；`retry:188`/`S6-2`/`V1.5-S2-1`/`core:388` 等**不得靠改断言或重标桩轮序来"过"**——若某例确属桩与旧缺陷标定耦合，需单独列明并附证据。
6. `T6 retries:1` 仍最后启（本批再次证明：稳定红在时上重试＝永久掩盖）。

## 5 顺带记下的既存缺陷（**三项已于 2026-10-04 入库 10b91a2**；下列行号＝写作时的 HEAD `ddbbc20`，入库后行号会位移）

- **桩缺口（已修）**：`core.interaction.ts:42` 起的第一处局部 `workspace` 块未供 `updateProjectTitle`，而同文件其余 workspace 块都供（方法行 :331/:416/:624/:706/:823/:923）——补一行即绿（实测：补后 `core:124` 孤例转绿）。
- **静默轮占位（已修）**：链尾原无 finalize（原 `finalizeOrphanStream` 仅两处调用：:2147 `depth>40` 裸退、:2330 forced-clarify 裸退）。入库判据＝**本轮零 chunk 才收尾**（`roundChunksRef` 逐轮计数），配永久用例 `forcedClarify` T-FORCE-5（断言 `.nf-msg__body--thinking`/`.nf-breath` 归零）；**宽条件（链尾无条件收尾）实测会误伤**：链尾（:2836 finally）跑在 React 提交前，会把承载确认卡的信号消息当空占位丢弃，导致"确认目标卡不再渲染"（本批踩过，务必守住窄判据）。
- **`workingRef` 未同步清（已修）**：`send` 链尾只 `setWorking(false)`，门闩靠 effect 镜像（:2444-2446，滞后 ≈100ms）——同坑在 `stopGeneration`（:2544）与 `retryFailedTurn`（:2985）已各修一次，链尾是第三处漏位；后果＝点确认卡的回声被误判 busy 入队，而唯一 drain 位（:2840）已跑完＝死信（t000067 同根）。
- **仍未修＝本审计正题**：确认轮归属无权威（§1）。三项既存缺陷的修复**没有**降低族红率（A 前后 5/6 轮 → 3/6 轮，噪声内），可见它们是独立卫生项而非该竞态的解。

## 6 自审记录（本次校错，2026-10-03 深夜）

逐条对 HEAD 复查后改动五处：①`maybeContinue` 的 sid 陈旧检查行号 `:1977/:1995` → 实测应为 **:1974/:1992**（原引自我未提交的 A/B 补丁态，回退后位移）；②口径"76 例"→ HEAD 为 74 例＋warmup＝75 步（76 是本批含 T-FORCE-5 时的数）；③B 形状的"误杀工具链"由**事实语气降为标注推断**（观察＝三例工具链用例 3/3 红，未插桩坐实链内路径）；④T-FORCE-5 明确标注"HEAD 尚无，仅在候选补丁内"，§5 桩缺口对照行号改为方法行 `:331/:416/:624/:706/:823/:923`，裁决链补 d000052 并注明 d000055/d000057 作废入 trash；⑤**§1 归因过界修正**：回声入队的主因是 ADR-013 的正常 busy 排队（点击落在旧链 poll 窗口，确定性流实测 `workingRef=true` 且 450ms 后旧链才 stop），`workingRef` 同步清那个洞只是"finally 后 ≈100ms"的独立放大因子（t000067 同根），不应写成本族必要条件。

未经复核而保留的判断仅一处：§1 的"抢跑"因果链——它由**反证**支撑（A 守卫关掉抢跑即族 0 红，d000056；关守卫即 `retry:188` 复绿），故仍列为结论而非推断。

## 7 落地后续（2026-10-04 凌晨补记）

- 本审计 §5 三项既存缺陷**已入库**＝commit `10b91a2`（HEAD 对照三轮 8 红 vs 该批三轮 9 红，签名同为挂载 6~7 ＋ 族 2~3 ⇒ 不新增红，d000062）。
- **§1 归属结论未被推翻，但支撑方式需修正**：d000056 曾以"A 守卫形状使族三轮 0 红"当作因果证据；治理 A（挂载门重导航，与归属毫无关系）落地后的 6 轮实测显示族红率为 0.5 例/轮、且 r1~r3 全绿 / r4~r6 各红 1 —— 说明**该族的红高度受负载调制，"某形状使 3 轮 0 红"不足以证伪或证实**。归属结论现改由两条更硬的依据支撑：①确定性复现（TMP 手法）取得的完整事件流——`decision.requested instanceId=3` 随后被 `decision.resolved reject answeredInstanceId=3`（reason direction）打掉，占位不收尾；②代码路径分析（旧链 poll 读 `pending` 现值 vs 点选清 pending 的窗口）。
- 挂载类另行收口＝治理 A（`0960333`，t000076 已闭：12 例/6 轮 → 0 例/6 轮）；chromium 参数版 C 实测无效已撤除。
