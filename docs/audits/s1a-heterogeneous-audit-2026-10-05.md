# S1a 异构审计：领域核心批（11 commit，HEAD dac12a7）

- 审计者：`command-code@deepseek/deepseek-v4.1-flash`（异构渠道，非当前主；调遣见技能 agent-dispatch）
- 当前主：`qodercn`（模型未披露）——不自审亲笔，故本批由外部审计者覆核
- 范围：`64ded06~1..dac12a7`（11 commit／41 文件／+2563−14）＝段6 S1a 领域核心＋归档轨道
- 依据工件：详设 v0.3 §2–§6／stage-spec V1-S1 DoD／段3 v1.2 §2–§5／段2 §4 附录 A／S1a 计划
- 审计者限制（其自述）：本会话 shell 被权限挡死，`git`／`vitest`／`tsc`／`eslint` 一律未跑，
  故 commit 自述的闸数字未独立复现；其对代码的判断全部来自通读。
- 主会话采纳（署名，2026-10-05）：结论「可采纳·无阻断项」**接受**；八条 finding 逐条读码核实——
  N1/N2/N6 三条已当场复核为事实（`as AnyPayload` 九处在位、`TimelineLog` 构造器为公开默认构造器、
  三处 payload 字段类型为 `string`），N4/N5/N7/N8 为判据面与命名问题成立。修入 commit `870556b`。
  **N3 不属主会话可自裁项**（四处签名偏离仅注释登记，未回段5／未出 ADR ⇒ 段5 工件与语义裁定＝用户亲裁），
  随本报告呈报待裁。
- 主会话补记两处审计者存疑项的实况：
  1) 「scoped tsc 范围」＝显式新域清单（src/domain 新树 24 源＋scoped 测试＋tests/static），
     确不含 `src/main/**`——因 `src/main/timelineLogger.ts:12` 仍 import 已被重写掉的
     `TimelineLogger`／`TimelineEventType`，main 面在本窗不编译＝ADR-028 负面①预期，该文件随 A2.5 归档。
  2) 审计口径＝HEAD 全树而非严格 11 commit 区间（前 7 个 S1a 提交的产物同处该树）——
     对「域内出口闸」的审计而言全树才是正确射程，本报告结论按全树成立。

---

I couldn't run shell (permission-gated in this session), so I verified everything by reading the HEAD tree and the frozen artifacts directly. Here's my audit.

---

## 结论（一行）：可采纳 —— 无阻断项；但 B2 的「类型即契约」与三处静态闸的判据面存在有界假绿，需登记而非回炉

批次对 §2–§6／I-x／C-x／D-x 的实现总体忠实：22 事件闭集逐字同序、17 发射事件载荷键集与 §5/§6 逐条相等、11 条不变量有聚合内判据且测试达标、三处 skip 与指定延后段一一对应。**未发现「该拦未拦」的运行时路径或 DoD 未达标项**。下列为不影响 S1a 出口、但会让「闸绿」比字面更弱的点。

> 前置声明：本会话 `shell_command` 被权限挡死，`git`／`vitest`／`tsc`／`eslint`／`desens-scan` 一律未跑。commit 自述的「148 绿 / scoped tsc rc=0 / eslint rc=0 / desens rc=0 / 41 文件 +2563−14」我**未独立复现**，仅据 `.git/logs/HEAD` 核出区间 `64ded06~1..dac12a7` 恰为 11 提交（`64ded06~1`=4f8bf1f）。

## 阻断项（必须修才算 S1a 完成）
无。

## 非阻断建议（按性价比排序）

### N1 B2「载荷键禁增禁减」只验手写样本，不验发射器；判别联合被 `AnyPayload` 抹平
- 位置：`src/domain/timeline.ts:239`（`TimelineEvent.detail: AnyPayload`）、`:253`（`AppendInput.detail`）、`:260`（`EventDraft.detail`）
- 证据：`tests/unit/timeline.payloadKeys.test.ts` 的 `samples` 是手写对象，仅以 `satisfies XxxPayload` 绑接口 + `Object.keys` 比快照；**从不执行任何聚合的发射语句**。而各聚合发射处一律 `as AnyPayload` 强转（如 `Delegation.ts` 的 `detail: {...} as AnyPayload`），把 `PayloadOf<type>` 的判别收口抹掉。§6 明写「`detail` 由 `PayloadOf<type>` 判别联合收口；TS 类型面＝契约面」。
- 影响：违反 §6 的收口意图（B2 的「契约面」名存实亡）。反例：给 `Turn.terminal` 的 `detail` 多加一键，`timeline.payloadKeys.test.ts` 全绿（只有 `turn.terminal.test.ts:43` 的键集子测会红——没覆盖到的发射器则无人拦）。
- 建议：把 `EventDraft` 改为按 `type` 的判别联合（`{type:'TurnEnded'; detail:TurnEndedPayload} | ...`），或在每个聚合发射语句用 `satisfies PayloadOf<'X'>` 替代 `as AnyPayload`。

### N2 appendSingleWriter 注释里的「私有构造器已挡 new」与代码不符，且判据可复现被绕
- 位置：`tests/static/appendSingleWriter.test.ts:26-28`（判据）；`src/domain/timeline.ts:268`（`export class TimelineLog {`，**无 `private constructor`**）
- 证据：`grep 'private constructor' src/domain` 命中 5 个聚合（DecisionPoint/Delegation/Scope/EvidenceItem/Turn），**唯独 TimelineLog 不在内**——其构造器是公开默认构造器。判据只在文本上认字面 `new TimelineLog` 或「具名 `TimelineLog` ∧ `.record(`」。
- 影响：判据自述的天花板（「私有构造器已挡 new」）不成立，非具名路径可绕（附录中已登记 duck-typing，但 `new` 面比登记宽）。反例：
  - `a.ts`：`import { TimelineLog as TL } from '../timeline.js'; export const mk = () => new TL()`
  - `b.ts`：`import { mk } from './a.js'; (mk() as any).record(e)` —— 两文件都不命中，闸仍绿。
- 建议：删掉不准确的注释；或给 `TimelineLog` 构造函数加机制口专用 token（让 new 面有类型护栏后文本判据才成立）。

### N3 四处接口签名偏离冻结 §3／段3 §7，仅在代码注释登记，未回段5 未出 ADR
- 位置：`src/domain/repos/index.ts:43-44`（`ScopeRepo.save` 取代 `appendVersion`）、`:50-51`（`InstructionQueueRepo.save/find` 取代 `enqueue/pending/markAdmitted/markWithdrawn`）；`src/domain/projection/waitingItems.ts:38-41`（去 `turns` 参）；`spec/requiresApproval.ts`（参数 `scopeVersion`→`Scope`）
- 证据：§3 逐条给出 `ScopeRepo{findByDelegation,appendVersion}`、`InstructionQueueRepo{enqueue,pending,markAdmitted,markWithdrawn}`；§5 给 `deriveWaitingItems(delegations,decisionPoints,turns,queue)`。实现全部改形。
- 影响：AGENTS 规则 5「禁止跨段作业——实现段发现设计错，回退设计段改工件重过闸，不就地打补丁」；DoD G4「S1 内语义裁定→出 ADR」。偏离语义可辩护（I-4 校验位置＝聚合，段3 §4 已定），但「注释登记」≠ 改工件。
- 建议：补一条 ADR（或段5 出 v0.4）把四处正名为设计决定；代码可不动。

### N4 s1WritePath 只匹配静态 `from '...'`，漏动态 import／barrel
- 位置：`tests/static/s1WritePath.test.ts` 的 `importSpecifiers`（`/from\s+['"]/`）
- 证据：主断言遍历 `src/renderer`＋`src/main` 的 `from` 说明符。
- 影响：D1 判据面偏窄。反例：`src/renderer/x.ts: const m = await import('../domain/delegation/Delegation.js')` 主断言仍绿。
- 建议：补 `import(`／`require(` 的 specifier 提取（与既有 fixture 同风格）。

### N5 s2ProviderName 的 ProviderId 解析对多行联合脆弱（当前单行故正确）
- 位置：`src/main/providers/types.ts:5`（单行联合）＋ `tests/static/s2ProviderName.test.ts` 的 `providerIds()`
- 证据：`find(l => /^export type ProviderId\s*=/.test(l))` 只取一行。当前 `export type ProviderId = 'deepseek' | 'commandcode' | 'opencode-zen' | 'opencode-go'` 单行，解析得 4 名，`length>=4`＋`not.toContain('pro')` 守卫有效。
- 影响：潜在假绿——若联合被拆成
  ```
  export type ProviderId = 'deepseek' | 'commandcode' | 'opencode-zen' | 'opencode-go'
    | 'gemini'
  ```
  解析仍得首行 4 名、守卫（≥4）照过，`gemini` 逃出黑名单。
- 建议：解析整段联合（截到下一个顶层 `export`/`;`），而非单行。

### N6 载荷值域未收口（string 取代闭集）
- 位置：`src/domain/timeline.ts:97`（`triggerSource: string`）、`:116`（`resolution: string`）、`:137`（`type: string`）
- 证据：§3 §3／§2 定义 `TriggerSource` 三值、`Resolution` 值三值、`EvidenceType` 四值；payloadKeys 样本还用英文 `'userInput'`（:41）／`'approved'`，与领域中文值并存。
- 影响：§6「TS 类型面＝契约面」下值域未钉。
- 建议：以 `TriggerSource`/`ResolutionValue`/`EvidenceType` 联合替换 `string`，样本值改中文闭集。

### N7 B4「对外发布=0」扫描面只到 timeline.ts 单文件；两处静态闸缺「扫描集非空」守卫
- 位置：`tests/unit/timeline.publishDiscipline.test.ts`（只读 `src/domain/timeline.ts` 源码）；`noLegacyImport.test.ts`（守名单解析，不守 `collect()` 非空）；`appendSingleWriter.test.ts`（靠读机制口文件兜底）
- 影响：若 `process.send`/`fetch` 出现在 domain 其它文件不被拦；若 SCAN_ROOTS 整体缺位，主断言可空跑（appendSingleWriter 有兜底读文件，noLegacyImport 无）。
- 建议：发布扫描面扩到 `src/domain/**`；两闸补 `expect(collect(...).length).toBeGreaterThan(0)`（s1WritePath 已有此守卫，可对齐）。

### N8 命名重复／未用参数
- 位置：`Delegation.ts` 与 `spec/validClaim.ts` 各定义一个签名不同的 `ClaimInput`；`Delegation.reject(_reason?)` 参数未用
- 影响：同名不同形易误读；`reject` 的 reason 不入 payload（符合 §5 DelegationRejected 仅 `delegationId,去向`），但未注释说明其入回执。
- 建议：validClaim 入参改名（如 `ClaimRef`）或复用；`reject` 参数保留并注明入回执、不进 timeline。

## 查过且没问题的地方
- 22 事件闭集名与 §5 逐字同序（`EVENT_NAMES` vs §5 表，含顺序）——逐名核对一致。
- 17 发射事件 payload 键集与 §5/§6 逐条相等，含两个易错点：`InputAcknowledged`「归宿」作**单键** `disposition`、`DecisionRaised` 的 `requestReason` 作**单键**（内含 reason+requestedBy）。
- I-1（全局单飞，异委托同拒，`turn.admission.test.ts` 有例）、I-3、I-4（幂等 no-op/撤回终态）、I-5（类型恒等＋显式判据）、I-6、I-7、I-10、I-13、I-14、I-15、I-16 均有聚合内判据＋测试；I-8/I-17→S2、I-12→S3 正确未实现。
- 三条 `it.skip`（acceptance→S4、waitingItems→S5、negativeFacts→S3+S5）与 C13/C9/M-10 指定的延后段一一对应，无第二个 skip 掩盖未实现。
- DoD 用例数全部达标（我逐文件数）：C1=5≥4、C2=6≥3、C3=7≥4、C4=6≥5、C6=7≥4、C7=9≥6、C8=5≥4、C9=3≥2、C10=5≥4、C11=3≥3、C12=6≥4、C13=6≥3、C15=7≥4、F3=6≥4。
- 高影响清单 5 行与段2 §4／附录 A 逐字一致（`highImpactList.ts` vs `02-domain-strategy.md:200`）。
- S-2 扫描面 `src/domain/**` 对 4 个专名 0 命中——我独立 grep 复核（含 S1a 期未归档的旧领域文件，确无命中）。
- 单一写者当前树 0 命中——我独立 grep `.record(`，仅 `timelineRepo.ts:11`（允许面）与 `applyChange.ts:58`（`EvidenceItem.record`，异聚合）两处。
- 证据订阅采集「落 EvidenceItem 与追加 EvidenceRecorded 同事务」（`append(event, tx)`，失败回滚且缓冲可重试）实现正确。
- e2e 九事件全序 `seq[1..9]` 无重无跳、I-15 与 I-1 用 `codeOf` 区分拦截者（防次序假绿），终态 `accepted∧reopenCount 0∧证据 1 条`。
- `vitest.config.ts:5` 已纳入 `tests/static/**`（否则静态闸本不会被执行——这是本批次修的一个真空跑）。
- 批次边界：据 commit 清单，除 `timeline.ts`（加 `EventDraft`）、`eslint.config.js`（加 S-1 块）、`acceptance.test.ts`（扩例）外未触旧 app 文件，符合 S1a「只增不删」。

## 你没看懂或依据不足的地方
- **未能跑任何命令**（shell 权限挡），故 `148 绿 / scoped tsc rc=0 / eslint rc=0 / desens rc=0` 与「41 文件 +2563/−14」全部采信 commit 自述，未独立复现；我对代码一致性的判断均来自通读，非执行。
- **「scoped tsc」的确切范围/命令**在计划出口闸里没有写死（只写「新域类型面由 vitest(esbuild) 加载即验」＋双 tsc 归 S1b），我无法判定它是否真覆盖全部 24 个新域源文件与 26 个测试文件，尤其 `timeline.ts` 改写后 `src/main/timelineLogger.ts` 已 import 不存在的 `TimelineLogger/TimelineEventType`（`src/main/timelineLogger.ts:12`）——这正是「非编译窗」的证据，但也意味着 scoped tsc 必须排除 main 才能绿。
- **本批次宣告「S1a 域内出口」但区间不含前 7 个 S1a 提交**（timeline 重写/EvidenceItem/validClaim/acceptance/noLegacyImport 等落在 `64ded06~1` 之前）：我按 HEAD 全树审，但若审计口径严格限于这 11 提交，则 `timeline.ts`/`EvidenceItem.ts`/`noLegacyImport.test.ts` 的产物不算「本批次」。这一点任务书与输入工件清单存在口径差，我未擅自裁定。
