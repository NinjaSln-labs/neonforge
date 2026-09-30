# Domain design ↔ implementation drift audit

- Date: 2026-10-01
- Auditor: independent (did not author ADR-013 / UAT residue plan)
- Scope: `docs/domain/00-domain-authority.md` + `docs/domain/02-domain-model.md` (+ overriding ADRs) vs `apps/desktop/src/`
- Mode: read-only except this file

## 1. Verdict headline

**DRIFT confirmed.** Seed drifts (C / G / H) still present with file:line evidence. ADR-013 is accepted but product + UAT harness have not been updated.

| Severity | Count | IDs |
|----------|------:|-----|
| **P0** | **3** | C-silent, C-uat-busy, G-ask-index |
| **P1** | **3** | A-text-card, B-escalate-silent, H-start-server-desc |
| P2 / notes | 2 | I-gate.denied-name, C-working-comments |

Overall matrix: **3 DRIFT-P0 + 3 DRIFT-P1** across A–K (several areas ALIGNED).

---

## 2. Matrix A–K

| ID | Area | Design claim | Implementation locus | Verdict | Evidence (1–3) | Severity |
|----|------|--------------|----------------------|---------|----------------|----------|
| A | Decision points / PENDING | A0 §3.2–3.6：单一 PENDING；`deriveDecisionPoint` 确定性派生；模型措辞不直接弹卡 | `conversationState.ts` `deriveDecisionPoint`；`ConversationPanel.tsx` done 路径 + 渲染兜底 | **DRIFT** | (1) Done 路径确用 `deriveDecisionPoint`（~L1068）。(2) 渲染仍用 `pendingCardToShow` / `goalFallbackTrigger` 文本征询弹卡（~L2928–2953）。(3) `pending` 单字段 + `canExecute`/`sessionGate` 在 pending≠none 拦全工具（~L501–503）—单 PENDING 本身对齐。 | **P1** |
| B | ProgressGuarantee / stuck / escalate | A0 §4：pending 恒不强制；StuckDetector/escalate 循环层；ADR-013：escalate 硬恢复须显式打断路径 | `decideProgressGuarantee`；`agentLoop.ts` `detectStuck`；Panel silent escalate | **DRIFT** | (1) `decideProgressGuarantee` pending→auto（~L868–869）对齐。(2) StuckDetector 存在且认 proposed/evidence（~L229）。(3) escalate 仍 `send({silent})` → 走 C-silent 打断，**非** ADR-013「显式恢复打断」。 | **P1** |
| C | Input queue / busy / silent / interrupt | ADR-013 + §4.12：busy＝在飞回合；普通/silent 默认排队；打断仅停止 | `ConversationPanel.tsx` send/stop；`uat-lib.mjs` | **DRIFT** | (1) `working && silent → stopGeneration('silent')`（L2411–2416）。(2) UAT `modelBusy` 只喂 `stuckIdle`（uat-lib L994–1001），决策点击链无 busy 门闩（~L668+）。(3) 注释仍写流式 done「及时释放 working / 快速确认推进」（L1479、L2204）。 | **P0** |
| D | ActionGate / classifyReadonly / sessionGate | A0 §3.5b：pending 优先；classifyReadonly；deny/ask | `conversationState.ts` `sessionGate`/`actionGate`/`canExecute`；`tools.ts` preApproval | **ALIGNED** | (1) `canExecute`：sessionGate 先于 actionGate（L611–612）。(2) `classifyReadonly` 单源，main bash preApproval 同源（tools ~L483）。(3) pending 时不入属性判定（sessionGate L501–503）。 | — |
| E | Plan / PlannedFiles / approve-files | A0 §5 / ADR-005：清单由已确认 PlanProposal 派生；approve-files 追加；清单注入 prompt | `derivePlannedFiles`；`plannedFilesStore`；`approvePlan`；sysHint planHint | **ALIGNED** | (1) `derivePlannedFiles` + plan 确认并入（conversationState ~L200、L837）。(2) approve-files 追加 + main 落盘（ADR-005）。(3) planHint 注入（Panel ~L2060–2065）。 | — |
| F | Completion evidence / verifyCompletion | A0 §4.2 / ADR-011：无证据不对账；stdout 对齐；内层 ok:false；unverifiable 仅标注 | `verifyCompletion`；`verification.ts`；`tools.ts` execute | **ALIGNED** | (1) `evidenceVerifiable`/`verifyCompletion` ADR-011 口径（~L687–775）。(2) V1a 保留非0退出 stdout（verification.ts L58–61）；领域 `outputAligns`（L696–703）。(3) Registry 内层 `{ok:false}` 透传（tools L179–182）。 | — |
| G | ask_user / clarify /「本消息之后已回应」 | UI/candidates 契约：承载澄清的 **assistant 消息**下标之后出现 user＝已回应；ask_user 与 candidates 同语义 | `ConversationPanel.tsx` candidates vs ask_user；`CandidateButtons.tsx` | **DRIFT** | (1) candidates：`messages.map((m,i)` → `slice(i+1)`（L2871）正确。(2) ask_user：在 `m.toolCalls.map((tc,i)` 内用同一 `i` 去 `messages.slice(i+1)`（L3209、L3245）＝**toolCall 下标**。(3) 注释仍写「本消息之后」（L3234–3235）与代码不符。 | **P0** |
| H | Service mgmt isServerCommand vs ServerLike / open vs start-server | §4.10：严格白名单 vs 宽松；start-server 管进程；open 开 URL | `serviceManager.ts`；`gateway.ts` tool defs | **DRIFT** | (1) 双函数分工与 §4.10 **设计一致**（L104–117、L133）。(2) `start-server` description「npm run dev / npx vite **等**」「起服务/**打开网页前**用它」（gateway L381–382）相对白名单过宽且与 `open`（L187–190）语义重叠。(3) ServerLike 含 python/http-server；白名单无 → 模型易误调 start-server。 | **P1** |
| I | Timeline registry vs logged types | A2：事件名权威＝`TIMELINE_EVENT_SPECS`（约 56）；A0 另提 `gate.denied` | `timeline.ts`；emit 分散 main/renderer | **UNCLEAR**→偏 **ALIGNED**（命名 P2） | (1) 注册表完整约 56 型；`diffState` 发 `session.pending_*` / `decision.requested`。(2) renderer `tlog` 直调子集 ~20，其余经 main/diffState——非必然漏登记。(3) A0 §3.5b 写 `gate.denied`，代码无此 type，拦截走 `tool.blocked`——**命名漂移 P2**。 | **P2** |
| J | Capability / env injection | A0 §6 / §4.7：一次检测；能力视图；注入 sysPrompt；Ledger 回填 | `envManager.ts`；Panel check-capability 注入；tools ledger | **ALIGNED** | (1) 每轮 send 调 check-capability → `envHint` + `environment.injected`（~L2018–2051）。(2) CapabilityRegistry 从 env 推导（envManager）。(3) bash 失败 → `capability.ledger_updated`（tools ~L387–392）。 | — |
| K | Trust / authorization remember | §4.8：deny>allow>ask；记住仅 path 类沙箱内；goal 确认清信任 | `tools.ts` rules；`addTrust`/`clearTrust`；`useToolApproval` | **ALIGNED** | (1) fail-closed + preApproval（tools）。(2) `addTrust` 拒 bash 无 path、拒沙箱外（Panel L2313–2320）。(3) `goalSeq` → `clearTrust`（L700）+ main plannedFiles reset。 | — |

---

## 3. P0 / P1 drift detail

### P0-C-silent — silent＝打断（违背 ADR-013 / §4.12）

**Design（ADR-013 Decision 3 / §4.12）**  
> silent＝非用户通道；busy 时与用户相同——排队；废除「凡 silent 即可 `stopGeneration`」。

**Code**

```2411:2416:apps/desktop/src/renderer/ConversationPanel.tsx
    if (workingRef.current) {
      if (silent) {
        // 系统自动消息（StuckDetector escalate/执行确认触发——非用户输入）：直接处理（打断当前——内部机制干预卡住，
        // 不受「输入≠打断」约束；排队会让修正消息延迟到当前轮完成——卡住时正是要立即干预）
        console.log('[conversation] 处理中 silent 发送——打断当前（系统自动续聊/修正）')
        await stopGeneration('silent')
```

**Impact**  
系统 nudge / 对账引导 / escalate 在 busy 时硬打断在飞流与工具链；与「输入≠打断」及 ADR-013 排队语义矛盾；时间线 `conversation.interrupted` source=`silent` 仍把 silent 当打断源（timeline L26；stopGeneration L2370–2371）。

---

### P0-C-uat-busy — UAT `modelBusy` 与 ADR-013 busy 不同源且不挡决策

**Design（ADR-013 Decision 1 / Consequences）**  
> UI `working` / UAT `modelBusy` 必须与 busy 同源；harness 同源后再 `continue` 跳过决策/nudge。

**Code**

```994:1001:apps/desktop/scripts-cdp/uat-lib.mjs
      let modelBusy = false
      try {
        const uiBusy = await dump(page)
        modelBusy = /搭档处理中|处理中|思考中|生成中|正在回复|Streaming/i.test(uiBusy)
      } catch {
        modelBusy = false
      }
      if (!decisionPending && !modelBusy) stuckIdle += 1
```

决策点击路径（同文件 ~L668+ `acted` / `personaAct` / 确认执行）**不**读取 `modelBusy`。

**Impact**  
UAT 可在文案未显示「搭档处理中」或 busy 误判窗口点确认/发 nudge——表现为「思考/工具未收口就被推进」；与真人模拟契约及 ADR-013 冲突。

---

### P0-G-ask-index — ask_user `replied` 用 toolCall 下标

**Design（UI/candidates 契约；与 plan 审计一致）**  
「本消息之后出现用户消息＝已回应」锚点＝**messages[] 中承载澄清的 assistant 下标**，不是 `toolCalls[]` 下标。

**Code**

```3209:3245:apps/desktop/src/renderer/ConversationPanel.tsx
                {m.toolCalls.map((tc, i) => {
                  // ...
                          const replied = messages.slice(i + 1).some((mm) => mm.role === 'user')
```

对照正确路径（candidates，外层 `messages.map((m, i)`）：

```2871:2871:apps/desktop/src/renderer/ConversationPanel.tsx
                const replied = messages.slice(i + 1).some((mm) => mm.role === 'user')
```

**Impact**  
`i===0` 时 `slice(1)` 常扫到**更早轮次**的 user → 选项过早「已回复」/不可点（UAT「提前选好」）。多 toolCall 时下标更偏。用户可见错误语义 → **P0**。

---

### P1-A-text-card — 文本征询兜底仍弹决策卡

**Design（A0 §3.6）**  
决策点＝状态×提议×动作属性的纯函数；模型措辞不直接弹卡。

**Code**  
Done 分支主路径已切 `deriveDecisionPoint`（~L990–1068），但消息列表渲染仍：

- `goalFallbackTrigger(m.content)`（~L2928）
- `pendingCardToShow(... m.content ...)` → `execFallback`（~L2946–2953）

**Impact**  
澄清问句 /「等你确认」类文本仍可产卡，与协议工具结构化提议双轨；不等价于「废除文本触发」的完整落地。

---

### P1-B-escalate-silent — escalate 硬恢复挂在 silent 打断上

**Design（ADR-013 Decision 3）**  
StuckDetector escalate 等硬恢复须**显式恢复打断**（可复用停止语义 + `conversation.interrupted` 标恢复来源），不得冒充普通 silent send。

**Code**  
escalate 事件 → `sendRef.current({ silent: true, text: event.message })`（Panel ~L1412）→ 落入 P0-C-silent。

**Impact**  
恢复与普通系统通道未分离；修 C-silent 排队化后，若不另开显式恢复入口，escalate 会变成「排队延期」而非即时恢复。

---

### P1-H-start-server-desc — 工具描述相对白名单过宽 / 与 open 混淆

**Design（§4.10）**  
`isServerCommand`＝严格白名单（start-server 命令选择）；`isServerLikeCommand`＝宽松（bash 超时/端口保护）。open ≠ start-server。

**Code**  
白名单：npx vite / vite / npm|pnpm|yarn run dev|… / node.*server（serviceManager L92–106）。  
Loose 另含 python http.server、http-server、php、ruby（L113–117）。  
gateway `start-server` description（L381–382）：「**等**」「**打开网页前用它**」——暗示宽于白名单，并侵占 `open` 职责。

**Impact**  
模型易对 python/http-server 调 start-server → 硬失败；或把「打开」误绑 start-server。双函数本身**不是** drift（设计有意分层）。

---

## 4. ALIGNED notable（brief）

- **D**：sessionGate × actionGate × classifyReadonly 单源；pending 优先——与 A0 §3.5/3.5b 一致。
- **E**：PlannedFiles 派生/追加/落盘/注入闭环完整（含 ADR-005）。
- **F**：ADR-011 核心谓词与 Registry 内层失败、V1a stdout 对齐已接线。
- **J / K**：环境注入 + Ledger；任务级信任边界与 clearTrust 与 §4.7/§4.8 一致。
- **H 分层**：`isServerCommand` / `isServerLikeCommand` 分工与 §4.10 叙述一致（漂移在描述面，不在双函数存在本身）。
- **A 单 PENDING**：`ConversationState.pending` 单值 + 门控全拦——§3.2/3.4 核心不变式对齐（漂移在触发源双轨）。

---

## 5. Recommendations（no code）

| ID | Prefer | Note |
|----|--------|------|
| C-silent / C-uat-busy | **impl fix**（另开修批；ADR-012） | 产品：busy 时 silent→`pendingSend`；打断仅 stop / 显式恢复。UAT：`modelBusy` 与产品 busy 同源后 `continue` 跳过 act+nudge。设计已有 ADR-013，**不必再写 ADR**。 |
| G-ask-index | **impl fix** | `replied` 改用 message 下标（与 candidates 同函数）；可补 UI 契约一句到 domain/02 或 candidates 注释，避免再绑错 §3.6。 |
| B-escalate-silent | **impl fix**（可随 C） | 显式 `recoverInterrupt`（或 stop 等价）+ timeline 恢复来源字段；禁止默认 silent send。 |
| A-text-card | **impl fix** 为主；可选 **design-doc** 标明「过渡兜底」期限 | 若保留文本兜底，须在 A0 §3.6 写清例外；否则删生产路径只留协议提议。 |
| H-start-server-desc | **impl fix**（文案/schema） | description 枚举白名单；删「打开网页前」；引导 open vs start-server。不扩白名单除非新 ADR。 |
| I-gate.denied | **design-doc fix** | A0 改为 `tool.blocked`（或登记 `gate.denied` 别名）——消灭幽灵事件名。 |

---

## 6. OUT OF SCOPE this pass

- 不改代码 / 不跑修批 / 不关 ADR-012 测批。
- 不写 UAT residue 方案、不评估 plan 任务拆分是否正确。
- 不全量 diff 56 个 timeline 类型的每个 emit 点（仅 spot-check）。
- 不审计 Delivery/DoD V2、Problem 跨会话、Provider/ADR-010、视觉/a11y。
- 不验证 Mac UAT 人格池实跑结果（只读 harness 源）。
- 不把「注释与代码短暂不一致但行为已对齐」升为 P0（例：Panel L1561–1563 旧注释 vs L1588+ canExecute 全拦——行为对齐 §3.4）。

---

## Seed verification summary

| Seed | Still true? | File:line |
|------|-------------|-----------|
| (1) busy/`working` early release vs §4.12/ADR-013 | **Yes**（产品意图注释 + silent 打断；UAT busy 门缺失） | Panel L1479, L2204, L2411–2416；uat-lib L994–1001 |
| (2) silent→stopGeneration vs silent=channel | **Yes** | Panel L2412–2416；stopGeneration L2370 |
| (3) ask_user `replied` uses toolCall index | **Yes** | Panel L3209 + L3245（vs candidates L2871） |
| (4) start-server whitelist vs ServerLike + over-broad description | **Yes**（分层有意；描述过宽） | serviceManager L92–117, L133；gateway L381–382 |
