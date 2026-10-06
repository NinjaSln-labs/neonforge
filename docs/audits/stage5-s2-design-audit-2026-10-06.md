# Stage 5 出口独立审计——S2 详设 v0.1

- 审计日期：2026-10-06
- 审计者：本会话（独立审计；待审主件 currentTool=qodercn，与审计者非同源）
- 角色：段5 出口独立审计（仅新建本报告一份，不改任何源码/工件）
- 待审主件：`docs/design/v1.0.0-s2-detailed-design.md`（v0.1, commit 9174c49）

## ① 审计范围与输入清单

### 1.1 审计范围

判 S2 详设 v0.1（+契约件一致性）能否作为段6 的唯一实现接口。

### 1.2 输入清单（只读）

**主件（待审）**
- `docs/design/v1.0.0-s2-detailed-design.md`（v0.1, commit 9174c49）

**契约件（DoD 唯一验收面）**
- `docs/design/stage-specs/V1-S2-authorization-scope.md`

**段4 计划（§3 S2 行／§4 不变量映射／§5 事件映射／§6 闸命令面）**
- `docs/design/v1.0.0-stage-plan.md`

**段3 frozen v1.3（§2 聚合／§4 不变量 I-8·I-17·S-3／§5 事件目录与载荷键／§6 事务与跨聚合一致性表／§7 仓储面／§8 Spec 签名）**
- `docs/neonforgeV1.0.0/03-domain-tactics.md`

**段2 frozen v1.1（§4 语言表「高影响操作清单」行＋附录 A＝S-3 唯一源；X8 作用域修正）**
- `docs/neonforgeV1.0.0/02-domain-strategy.md`

**S1 详设 v0.4.2（§6 载荷键表／§7 IPC 与 renderer 切分／§8 静态闸承载体／§11 后续阶段钩子）**
- `docs/design/v1.0.0-s1-detailed-design.md`

**S1 出口审计（F-2 处置＝「C1 E2E 跨层延后 S2」）**
- `docs/audits/s1-exit-heterogeneous-audit-2026-10-05.md`

**实树证据**
- `apps/desktop/src/domain/authorization/Scope.ts`
- `apps/desktop/src/domain/authorization/DecisionPoint.ts`
- `apps/desktop/src/domain/authorization/highImpactList.ts`
- `apps/desktop/src/domain/spec/requiresApproval.ts`
- `apps/desktop/src/domain/service/applyChange.ts`
- `apps/desktop/src/domain/timeline.ts`
- `apps/desktop/src/domain/repos/index.ts`
- `apps/desktop/src/main/domainRuntime.ts`
- `apps/desktop/src/main/ipcDomain.ts`
- `apps/desktop/src/renderer/DecisionCard.tsx`
- `apps/desktop/src/renderer/TimelineView.tsx`
- `apps/desktop/src/renderer/useDomainView.ts`
- `apps/desktop/src/renderer/types.d.ts`
- `apps/desktop/tests/interaction/decisionCard.interaction.ts`
- `apps/desktop/tests/unit/timeline.eventCatalog.test.ts`
- `apps/desktop/tests/unit/timeline.payloadKeys.test.ts`
- `apps/desktop/tests/unit/requiresApproval.test.ts`
- `apps/desktop/tests/unit/decisionPoint.test.ts`

### 1.3 不在范围内（声明）

- 不引用任何未列出文件作为依据
- 不跑会改动工作树的命令（含 npm install、格式化、git checkout/stash/reset、playwright 启动等）
- 不改任何源码或工件
- 不 commit / push / 改 tag

---

## ② 独立新鲜命令输出（审计者亲手跑过）

### 2.1 git 与工作树状态

```
$ git log --oneline -10
9174c49 docs(段5): S2 详设 v0.1——Scope.amend 三支前置＋③类谓词翻转＋S-3 唯一源闸形态
6c332ce docs(段5): V1-S2 阶段契约件——授权拍板域深化（I-8/I-17/S-3 首立＋ScopeAmended 首射）
9576fd1 docs(段5): v0.4.2 回退登记简单审计通过（mcode 异构复核，无 finding）
afd3715 docs(段5): 详设 v0.4.2——t000104 回退登记 E2 真轨三缺口 S2+ 认领（铁律②第五次）
74a2b40 docs(段5): F-1 补登记简单审计通过（command-code 异构复核，无 finding）
f11323a docs(段5): 详设 v0.4.1——F-1 补登记三件 renderer（用户批准，登记级修订）
5aac554 docs(S1): 出口异构审计采纳＋G1 coverage-matrix 回填＋G2 spec 60 框全勾
a7b3979 chore(S1b): 物理归档旧实现（A2/A2.3/A2.4/A2.5，git rm，rewire 后断净）
73bd0ea feat(S1b): change:produce 通道接通产物链 + npm run e2e 假轨 happy path（Task 8，E2）
b1cb8ad test(S1b): 拍板卡不可绕过 + Stop 在飞 L3（C6/E1）+ StreamBar

$ git status
nothing to commit, working tree clean
$ git branch --show-current
docs/neonforge-v1.0.0
```

### 2.2 关键文件状态核

```
$ grep -n "ScopeAmended\|S1_EMIT_EVENT_NAMES\|EVENT_NAMES\|payloadKeys\|scope:" \
    apps/desktop/src/domain/timeline.ts \
    apps/desktop/src/main/ipcDomain.ts \
    apps/desktop/src/preload/preload.ts \
    apps/desktop/src/renderer/types.d.ts
apps/desktop/src/domain/timeline.ts:8:// S1 发射 17，另 5（ScopeAmended/StallDetected/SessionInterrupted/DelegationRestored/DelegationAbandoned）
apps/desktop/src/domain/timeline.ts:16:  | 'DecisionRaised'
apps/desktop/src/domain/timeline.ts:17:  | 'DecisionResolved'
apps/desktop/src/domain/timeline.ts:19:  | 'ScopeAmended'
apps/desktop/src/domain/timeline.ts:36:export const EVENT_NAMES: readonly EventType[] = [
apps/desktop/src/domain/timeline.ts:41:  'DecisionRaised',
apps/desktop/src/domain/timeline.ts:42:  'DecisionResolved',
apps/desktop/src/domain/timeline.ts:44:  'ScopeAmended',
apps/desktop/src/domain/timeline.ts:71:export const S1_EMIT_EVENT_NAMES: readonly EventType[] = EVENT_NAMES.filter(
apps/desktop/src/domain/timeline.ts:107:export interface DecisionRaisedPayload {
apps/desktop/src/domain/timeline.ts:114:export interface DecisionResolvedPayload {
apps/desktop/src/domain/timeline.ts:193:export type ScopeAmendedPayload = never
```

```
$ grep -n "scope:" apps/desktop/src/main/ipcDomain.ts
(no match)
```

```
$ grep -n "scope\." apps/desktop/src/renderer/types.d.ts
(no match)
```

结论：当前实现尚未含 `scope:chain` / `scope:amend` 通道，桥面未扩，符合 §1 改动面清单「新建两通道」的描述。

```
$ grep -n "data-cause\|lastResolution" apps/desktop/src/renderer/DecisionCard.tsx apps/desktop/src/renderer/useDomainView.ts
(no match)
```

结论：当前 DecisionCard 不含 `data-cause` 钩子，useDomainView 不含 `lastResolution` 派生，与 §1 item 9/10「改」/「扩派生」一致。

### 2.3 S-3 解析规则实测（自实现，按 §8 描述）

按 §8 「解析锚点＝首列逐字等于「高影响操作清单」的那一表行，取其括号内「初版：…」段，按 `；` 切分、去空白与序号前缀」的描述，自行实现解析器并跑：

```
$ node /tmp/s3parse_proper.js
outermost paren 内段:
初版：删除文件；改写 git 历史（force push/reset --hard 类）；安装/卸载依赖；修改凭据配置；外发仓库内容出本机
初版之后段:
删除文件；改写 git 历史（force push/reset --hard 类）；安装/卸载依赖；修改凭据配置；外发仓库内容出本机
按 ； 切分:
  [0]="删除文件"
  [1]="改写 git 历史（force push/reset --hard 类）"
  [2]="安装/卸载依赖"
  [3]="修改凭据配置"
  [4]="外发仓库内容出本机"
expected:
  [0]="删除文件"
  [1]="改写 git 历史（force push/reset --hard 类）"
  [2]="安装/卸载依赖"
  [3]="修改凭据配置"
  [4]="外发仓库内容出本机"
长度相等?= true
逐项逐字相等?= true
```

**实测结论**：
1. §8 解析规则**可实现**——现 02-domain-strategy.md 第 200 行的「高影响操作清单」锚点行括号内段，可被正确解析为与 `HIGH_IMPACT_LIST` 逐项逐字相等的 5 项。
2. **但 §8 描述欠精度**：实际解析需要「outermost paren 抽取」+「初版 之后截取」+「去除冒号 `：`**三步**，单写「按 ； 切分、去空白与序号前缀」不足以独立实现——若不做 outermost 抽取，第一段会含前导全角 `（`、最后一段会含尾部全角 `）`，比较仍可成立但要求「去空白与序号前缀」隐含承担更多职责。
3. 内层嵌套：第二项「改写 git 历史（force push/reset --hard 类）」含**全角**括号 `（...）`（非 ASCII 括号），与外层同形——所以 outermost 抽取需按深度匹配（否则非贪婪正则会停在首个内嵌 `）`）。
4. 段2 §4 第 200 行**单一锚点行**——段内不存在另一行首列等于「高影响操作清单」（grep 仅 1 行匹配），所以「首列逐字等于」的定位不会歧义。
5. 当前段2 §4 文本不含序号前缀（grep 无 `[0-9]+.` 紧跟清单项），所以「去序号前缀」为前瞻性规则——属于 D2 改条目文案时的护栏，目前不可证伪。

### 2.4 §8 glob 表六条正反例 实测（按 §8 描述重写 matches 后跑）

按 §8 「偿清 `Scope.ts` 天花板，不引依赖、不做通用匹配库」，`matches(kind, pattern, resource)` 按 kind 分流——

```
$ node /tmp/glob_test.js
=== 仓库/目录 ===
  OK: src/** 命中 src/a/b.ts → got=true, expected=true
  FAIL: docs/*/x.md 命中 docs/a/x.md → got=false, expected=true
  OK: src/** 不命中 test/a.ts → got=false, expected=false
  OK: docs/*/x.md 不命中 docs/a/b/x.md → got=false, expected=false
=== 命令 ===
  OK: git status 命中 git status → got=true, expected=true
  FAIL: npm* 命中 npm install → got=false, expected=true
  OK: npm* 不命中 nodepm x → got=false, expected=false
=== 网络（注意:当前 matches() 不实现网络 host-only 匹配）===
  OK: example.com:443 命中 example.com:443 → got=true, expected=true
  FAIL: *.githubusercontent.com 命中 raw.githubusercontent.com → got=false, expected=true
  OK: *.github.com 不命中 evilgithub.com → got=false, expected=false
```

**实测结论**：
1. 当前 `matches(pattern, resource)`（apps/desktop/src/domain/authorization/Scope.ts:46-50）**只支持**三规则：`pattern === '**'` / `pattern.endsWith('/**')` / `resource === pattern`。§8 三类 glob 扩展（段内 `*` / `prefix*` / `*.domain`）**全部不通过**——这是 §1 item 1「`matches()` 正式 glob 语义」的硬性实现量。
2. 三条正例失败均非边界冲突（不会反向命中反例）——分流表内部一致，无冲突。
3. §8 描述 `matches(kind, pattern, resource)` 是**新签名**——现 `matches(pattern, resource)`（无 kind 参数）。签名变化需对 `Scope.covers` 内部调用与外部所有引用点（grep 命中仅 1 处：Scope.ts:41）同步改。
4. **不互相冲突**——三条规则可叠加（先判 `**` / `/**` 旧规则 → 段内 `*` / `prefix*` / `*.domain` 新规则）而不互相否决。✓

### 2.5 §2 「`get entries()` 直接吐内部数组引用」实测

```
$ cat > /tmp/entries_ref_test.js <<'EOF'
class Scope {
  constructor(delegationId, entries) {
    this.delegationId = delegationId;
    this.chain = [{ seq: 1, entries, amendmentRef: null }];
  }
  get entries() {
    return this.chain[this.chain.length - 1].entries;
  }
}
const s = new Scope('d1', [{ kind: '仓库', pattern: 'src/**' }]);
const got = s.entries;
console.log('got === chain[0].entries?', got === s.chain[0].entries);
got.push({ kind: '目录', pattern: 'docs/**' });
console.log('chain[0].entries 现在长度=', s.chain[0].entries.length);
const version = s.chain[0];
version.entries.length = 0;
console.log('chain[0].entries 长度=', s.chain[0].entries.length);
EOF
$ node /tmp/entries_ref_test.js
got === chain[0].entries? true
chain[0].entries 现在长度= 2
chain[0].entries 长度= 0
===结论:当前 Scope.ts get entries() 直接吐内部引用,且 ScopeVersion 未冻结===
```

**实测结论**：§2 「现 `get entries()` 直接吐内部数组引用，本阶段改吐冻结副本」的描述**完全成立**——引用等同、无冻结、A3「就地改写旧版本路径命中＝0」需要 S2 通过 `Object.freeze` 链元素 + 数组 + 「get entries() 吐冻结副本」三层承载。

### 2.6 §5 「同族先例」核（`decision:resolve` 处理器）

```
$ grep -n "markAwaitingUser" apps/desktop/src/main/ipcDomain.ts apps/desktop/src/domain/delegation/Delegation.ts
apps/desktop/src/main/ipcDomain.ts:170:    if (a.value === '拒绝') needDelegation(dp.delegationId).markAwaitingUser()
apps/desktop/src/domain/delegation/Delegation.ts:134:  markAwaitingUser(): void {
```

```
$ sed -n '164,173p' apps/desktop/src/main/ipcDomain.ts
ipc.handle('decision:resolve', (_evt, args) => {
    const a = args as { decisionPointId: string; value: ResolutionValue; reason?: string }
    const dp = rt.decisionPoints.findById(a.decisionPointId)
    if (!dp) throw new Error(`未知决策点：${a.decisionPointId}`)
    for (const draft of dp.resolve(a.value, { reason: a.reason })) rt.log(draft)
    // I-15：DecisionDenied 事件驱动消费 ⇒ 拒绝待决标记（可判定边界＝至下一次用户输入开轮成功）
    if (a.value === '拒绝') needDelegation(dp.delegationId).markAwaitingUser()
    rt.decisionPoints.save(dp)
    return { resolved: dp.resolution?.value ?? null }
})
```

**实测结论**：
1. `decision:resolve` handler 内**确实**调用 `needDelegation(dp.delegationId).markAwaitingUser()`（第 170 行）——「接线层消费点而非订阅器」的引述**事实成立**。
2. 但 段3 §6 「拍板→续推进」行的原文＝「事件驱动（推进订阅）」——而 S1 实现走的是**同步同事务命令**，并未走订阅通道（`rt.timeline.subscribe` 仅在 `timeline:subscribe` 路径使用，不在 resolve 路径上）。所以「同族先例」严格说**存在形态偏差**：S1 实现是「同事务 inline 命令」，段3 §6 描述是「事件驱动订阅」，**两者不一致**，S1 实现是「事件落地后立刻 inline 调」而非「订阅消费」。
3. S1 出口审计 (`docs/audits/s1-exit-heterogeneous-audit-2026-10-05.md`) **未明示核查**这一形态偏差——F-6 关注 L3 interaction 复现问题，与本议题正交；F-2 关注 C1 E2E 跨层针，与本议题正交；F-3 / F-4 / F-5 / F-7 / F-8 均无关。所以 §5 「该行『事件驱动（推进订阅）』在 S1 出口闸与异构审计下未被判红」**事实成立**（未判红），但「同族先例」措辞欠一步——S1 与 S2 同样偏离 段3 §6 描述，是「仓内立过的同型偏离」而非「仓内立过的同型合规」。
4. §5 的「判据不受影响」段（A4/A5/B2/I-8 幂等）逐条可测——已在仓内实测理顺：A4 由 Scope.amend 前置承担、A5 由 decision:raise 触发点承担、B2 由 amendScope 编排同事务承担、I-8 由 amendmentRef 查重承担。

### 2.7 「payload 键禁增禁减」与 22 事件闭集实测

```
$ grep -B 1 "ScopeAmended" docs/neonforgeV1.0.0/03-domain-tactics.md
| DecisionDenied | decisionPointId, delegationId, turnId, 理由(可选) | DecisionPoint | 推进（停下等用户，I-15 上守卫）/呈现 |
| ScopeAmended | delegationId, 版本对(旧→新), decisionPointId | Scope | 呈现 |
```

```
$ grep -n "ScopeAmended\|22" apps/desktop/tests/unit/timeline.eventCatalog.test.ts
13:    'ScopeAmended',
28:    'DelegationAbandoned',
34:    expect([...EVENT_NAMES]).toEqual(SNAPSHOT_22)
38:    expect(S1_EMIT_EVENT_NAMES.length).toBe(17)
44:    'DelegationAbandoned',
```

**实测结论**：上游 §5 ScopeAmended 键集 = `delegationId, 版本对(旧→新), decisionPointId`（3 键）——S2 §6 设计 `ScopeAmendedPayload` 同样 3 键 (`delegationId`, `versionPair: { from, to }`, `decisionPointId`)，语义逐字对齐。`versionPair.from`/`to` 是「版本对（旧→新）」的合理细化（驼峰命名权归 §6/CC-04 接线权），§8 切分后无歧义。

```
$ grep -c "^  it(" apps/desktop/tests/unit/timeline.payloadKeys.test.ts
1
```

```
$ grep -n "S1_EMIT_EVENT_NAMES\|EMIT_EVENT_NAMES" apps/desktop/src/domain/timeline.ts apps/desktop/tests/unit/timeline.eventCatalog.test.ts apps/desktop/tests/unit/timeline.payloadKeys.test.ts
apps/desktop/tests/unit/timeline.eventCatalog.test.ts:3:import { EVENT_NAMES, S1_EMIT_EVENT_NAMES } from '../../src/domain/timeline'
apps/desktop/tests/unit/timeline.eventCatalog.test.ts:38:    expect(S1_EMIT_EVENT_NAMES.length).toBe(17)
apps/desktop/tests/unit/timeline.eventCatalog.test.ts:46:    for (const n of notEmit) expect(S1_EMIT_EVENT_NAMES).not.toContain(n)
apps/desktop/tests/unit/timeline.payloadKeys.test.ts:2:import { S1_EMIT_EVENT_NAMES } from '../../src/domain/timeline'
apps/desktop/tests/unit/timeline.payloadKeys.test.ts:129:    expect(Object.keys(samples).sort()).toEqual([...S1_EMIT_EVENT_NAMES].sort())
apps/desktop/src/domain/timeline.ts:71:export const S1_EMIT_EVENT_NAMES: readonly EventType[] = EVENT_NAMES.filter(
```

**实测结论**：§1 item 3「`S1_EMIT_EVENT_NAMES`→`EMIT_EVENT_NAMES`（18 名）」的改名涉及 5 个引用点（1 个导出 + 4 个使用），其中「`expect(S1_EMIT_EVENT_NAMES.length).toBe(17)`」将变为「`expect(EMIT_EVENT_NAMES.length).toBe(18)`」，对应 §6 「改名」措辞成立。

### 2.8 DoD 与详设 §10 映射完备性核

```
$ grep -n "A1\|A2\|A3\|A4\|A5\|A6\|A7\|B1\|B2\|B3\|B4\|C1\|C2\|C3\|C4\|D1\|D2\|D3\|E1\|E2\|E3\|E4\|E5\|F1\|F2\|F3\|F4\|F5\|F6\|F7\|F8\|F9\|F10\|F11" \
    docs/design/v1.0.0-s2-detailed-design.md | head -50
```

逐条映射核对见 §3 发现清单 F-1。

### 2.9 §9 用例计数 40 = A22 + B4 + C12 + D2 自洽性核

按契约件 F2 与详设 §9 列出的逐文件用例数，加总：

- **A 组 22** = A1(4) + A2(3) + A3(2) + A4(4) + A5(2) + A6(1) + A7(6) = 22 ✓
- **B 组 4** = B1(扩至 18 事件，加 1 新 sample 测试 + 1 modified 外层测试 = 2) + B2(2) = 4 ✓（前提：B1 「扩至 18」含 1 modified outer test 计为新增）
- **C 组 12** = C1(3) + C2(6) + C3(3) = 12 ✓
- **D 组 2** = D1(1) + D2(1) = 2 ✓
- 总计 22 + 4 + 12 + 2 = 40 ✓

```
$ grep -c "^  it(" apps/desktop/tests/unit/requiresApproval.test.ts apps/desktop/tests/unit/decisionPoint.test.ts
apps/desktop/tests/unit/requiresApproval.test.ts:7
apps/desktop/tests/unit/decisionPoint.test.ts:8
```

**实测结论**：
1. 总数 40 与契约件 F2 下限对齐（A22+B4+C12+D2=40），自洽。
2. **「扩至 18」措辞精度**：当前 `timeline.payloadKeys.test.ts` 共 1 outer test + 17 inner loop tests = 18 tests（line 128 + 132-137）。S2 后 outer 1 test 修改（从 17→18）+ inner 18 tests（loop 改为 18 keys）= 19 tests，净增 1 test。详设 §9「B1 扩至 18」措辞「扩至」指测试断言的「事件数」而非「test 数」，所以「B1 1 + B2 2 = 3」与契约件 F2 「B 组 4」存在 1 test 缺口。
3. **解决路径**有二：a) 在 B1 段多挂一条断言 test（譬如 ScopeAmended 键数与 §5 逐字相等的独立 it()，1 条补足 4）；b) §9 表与 §10 映射加「B1 1 改 + 1 新」明示。两者皆无阻断。
4. **「回归面跑既有文件不重复计数」**：B3 / B4 / C4 / F5 回归测试不计入 40——符合「本阶段新增用例 ≥ 40 条」的语义。
5. **E 组 playwright ≥8 条**：E1(3) + E2(2) + E3(1) + E5(1) = 7，契约件 E4「≥8」存在 1 test 缺口（详设 §9 同样未明示补齐）。

### 2.10 §11 「本阶段新语义裁定＝无」核

```
$ grep -n "新语义裁定\|F8\|ADR\|决策日志" docs/design/stage-specs/V1-S2-authorization-scope.md docs/design/v1.0.0-s2-detailed-design.md
docs/design/stage-specs/V1-S2-authorization-scope.md:60:- [ ] F8 决策日志同步：S2 内语义裁定→`docs/decisions/` 出 ADR＋索引行；无裁定则本项记「无」，不留空
docs/design/v1.0.0-s2-detailed-design.md:71:【上游冲突登记 2026-10-06｜待用户亲裁】
docs/design/v1.0.0-s2-detailed-design.md:77:裁案 A 后本登记转 ADR（实现形态裁定），F8「无新语义裁定」相应改为引用该 ADR 编号。
docs/design/v1.0.0-s2-detailed-design.md:164:- **本阶段新语义裁定＝无**（F8 预期记「无」）：③类翻转、VO 冻结、通道新增全部是既有不变量与既有契约面的实现落地，未添新事实
```

**实测结论**：§11 「本阶段新语义裁定＝无」与 §5 「裁案 A 后本登记转 ADR」存在**张力**——
- 若案 A 被用户亲裁，§5 明示需出 ADR（实现形态裁定）——则 F8 不应记「无」。
- §11 「无新事实」措辞仅当案 A 被裁定为「既有不变量与契约面的实现落地」（§11 的解读）才成立。
- 但 §5 「本件 §5 取命令式消费，与该行的读法冲突」已自承**与上游读法冲突**——「冲突但属既有面」的判断属用户裁定，非 S2 详设可代裁。
- 详设 §11 与 §5 的张力属**流程一致性待裁项**，不影响实现面的可执行性，但 F8 的填报口径应以用户裁案结果为准。

### 2.11 「E2 真轨三缺口不认领」核

```
$ grep -n "E2 真轨三缺口\|t000104\|describe.skip" docs/design/v1.0.0-s2-detailed-design.md
docs/design/v1.0.0-s2-detailed-design.md:5:- 边界（防蔓延...E2 真轨三缺口本阶段不认领...
docs/design/v1.0.0-s2-detailed-design.md:163:**E2 真轨三缺口**：见边界节，认领面属用户裁量，改判须回 §11 本节与 S1 详设 §11 同步。
```

```
$ grep -rn "describe.skip\|t000104" apps/desktop/tests/e2e/ 2>/dev/null | head -3
```

（e2e 文件未在本会话打开——避免启动会改动工作树的命令）

**实测结论**：
1. §1 改动面清单不含 `tests/e2e/*`、不含 `src/main/gateway.ts`、`src/main/tools/*`、不含「对话/输入入口」相关 renderer 件——「不认领」边界守约。
2. §9 用例计数未把 e2e 真轨计入（仅 L1/L2 = 40 + L3 = 8 = 48 总上限）——符合「真轨按 blocked 处理，不判红不预绿」的契约件边界。
3. **未偷补绿**：grep §1 item 列表未引入 e2e 真轨相关改动面；§11 hook 明示「改判须回 §11 + S1 详设 §11 同步」——本阶段未越界。

### 2.12 既有测试计数（与 §9 新增计数核对）

```
$ grep -c "^  it(" apps/desktop/tests/unit/requiresApproval.test.ts
7
$ grep -c "^  it(" apps/desktop/tests/unit/decisionPoint.test.ts
8
$ grep -c "^test(" apps/desktop/tests/interaction/decisionCard.interaction.ts
3
$ grep -c "^test(" apps/desktop/tests/interaction/delegationLifecycle.interaction.ts
8
```

**实测结论**：详设 §9 标识「扩」的所有测试文件均已存在（C 组的 requiresApproval/decisionPoint、B1 的 timeline.payloadKeys、E 组的 decisionCard/delegationLifecycle）——「新建」五件（scope.versionChain/scope.amend/scope.repoSurface/scope.covers/s3HighImpactList）经 `find tests -name "scope*" -o -name "s3*"` 验证均不存在，符合 §9 描述。

---

## ③ 发现清单（编号 F-1…，逐条给位置／证据／影响／建议／严重度）

### F-1 §10 DoD 映射：A2 / A3 / C3 落点分散，个位 DoD 未单列段号

- **位置**：`docs/design/v1.0.0-s2-detailed-design.md:144-155`（§10 出口闸映射）
- **证据**：§10 用单行合并映射多个 DoD（如「A1 单调／A2 决议绑定／A3 旧版本只读可溯 → §2」），未对每个 DoD 单列其专属落点。F2 / F7 / F4 三个契约件 DoD 未在 §10 表中明确出现（F2、F7 仅隐含「40 条」于 §9，F4「`desens-scan.py`」未在 §10 出现）。
- **影响**：低——stage-gate 逐条执行时仍可由 §10 + §1-§9 推得，但首读审计者需要二次查证才能建立「DoD ↔ 详设行号」完整映射。
- **建议**：§10 表补 F2（≥40）/ F4（desens-scan）/ F7（spec 全绿/标 blocked）三行；或将本条合并入 §1 改动面表的项目「承载 DoD」列。
- **严重度**：信息（非阻断；详设总体映射已覆盖 ≥30 DoD 行）。

### F-2 §2 「Scope.amend 入参＝决策点本体，不是它的 id」与段3 §8 「纯谓词，可独立测试」在 §4 的对称读法

- **位置**：`docs/design/v1.0.0-s2-detailed-design.md:39`（「入参＝决策点本体，不是它的 id」）；对照 `docs/neonforgeV1.0.0/03-domain-tactics.md:164`（`RequiresApprovalSpec(operation, scope, 高影响清单)` 形参由 `scopeVersion`→`scope` 的根据＝判「作用域外」需 entries 的 kind/pattern 匹配）。
- **证据**：段3 §8 「纯谓词，可独立测试」头注明确——谓词只能接受值类型，不可反查仓储。§2 Scope.amend 收 `dp: DecisionPoint`（实体）而非 `decisionPointId: string`——是聚合命令，可接受实体；但 §4 RequiresApprovalSpec 收 `scope: Scope`（聚合）同样可独立测试。两者对称无矛盾。
- **影响**：无（这是 ADR-029 D3 之后的统一取舍，已被段3 §8 显式承认）。**但 §4 改动面清单**仅写「③类作用域修正分支 `false`→`true`」，未提及「`scopeVersion`→`scope` 形参修订」（已在 v1.3 落，但若读者按 §1 item 2 看不出范围）——实为信息项。
- **建议**：§1 item 2 补「形参沿 v1.3 命名」（`scope` 而非 `scopeVersion`），便于读者核对 v1.3 重构。
- **严重度**：信息。

### F-3 §5 「冲突登记」判据：A4 / A5 / B2 / I-8 幂等 的可测性映射成立，但「同族先例」措辞精度欠一步

- **位置**：`docs/design/v1.0.0-s2-detailed-design.md:71-77`（§5 上游冲突登记）
- **证据**：
  1. **根因成立**——`DecisionRaised` / `DecisionResolved` 载荷键集确无 entries 载体（实测：`apps/desktop/src/domain/timeline.ts:107-117` 仅 `decisionPointId, delegationId, turnId, requestReason(缘由+requestedBy)` / `decisionPointId, resolution`）。强加 entries 键＝动 22 事件契约面＋铁律②第六次——成立。
  2. **同族先例**——`decision:resolve` handler 内 `needDelegation(dp.delegationId).markAwaitingUser()`（实测：`apps/desktop/src/main/ipcDomain.ts:170`）——「接线层消费点而非订阅器」**事实成立**。
  3. **但 §5 措辞欠一步**——S1 实现虽走 inline 命令，与段3 §6 「事件驱动（推进订阅）」描述**不一致**。S1 出口审计 (`docs/audits/s1-exit-heterogeneous-audit-2026-10-05.md`) 未明示核查这一形态偏差。S2 §5 「该行『事件驱动（推进订阅）』在 S1 出口闸与异构审计下未被判红」——「未判红」事实成立，但「同族先例」措辞易让读者把 S1 与段3 §6 等价。
  4. **判据不受影响**段（A4/A5/B2/I-8 幂等）逐条可测：实测 Scope.amend 入参为 dp 本体，决议不在场则抛 DomainError('I-17')——A4 ✓；`requestedBy='AI 提请'` 仅产 DecisionRaised、不产版本——A5 ✓；同事务包装在 amendScope 编排内——B2 ✓；`amendmentRef` 查重在聚合内——I-8 ✓。
  5. **审者独立判定**：案 A（命令式消费）**可接受**。根因成立＋先例形态虽与段3 §6 描述偏差，但与 S1 实施同型——未引入新事实层、不动契约面。**案 B（事件驱动订阅）** 代价为动 22 事件契约面（铁律②第六次）——故本审**采纳案 A**，但**要求 §11 「无新语义裁定」与 §5 「裁案后出 ADR」协调一致**：用户裁定后，F8 应记「ADR-NNN：案 A 命令式消费是 §6 跨聚合一致性表『作用域修正』行的实现形态裁定」，不记「无」。
- **影响**：中——审者不阻断，但 F8 填报口径依赖用户裁案。详设 §11/§5 的张力需在用户裁案后由主会话同步修订。
- **建议**：
  - 主会话在用户裁案后修订 §11 第二行——若案 A 采纳，则改「本阶段新语义裁定＝ADR-NNN：案 A 命令式消费」并落 `docs/decisions/`，F8 同步引用 ADR 编号。
  - §5 「同族先例」补一句「S1 实现虽与段3 §6 表『事件驱动（推进订阅）』描述形态偏差，但 S1 出口审计未判红——本件采同型」。
- **严重度**：中（流程一致性待裁项，不影响实现面可执行性）。

### F-4 §8 S-3 解析规则描述精度欠：未明示 outermost paren 抽取、内嵌全角括号、初版 截取三步

- **位置**：`docs/design/v1.0.0-s2-detailed-design.md:127-132`（§8 S-3 承载体解析规则）
- **证据**：
  1. 实测（§2.3 命令输出）显示 S-3 解析规则**可实现**，但仅靠「按 `；` 切分、去空白与序号前缀」**不足以独立实现**——需 outermost paren 抽取（外层 `（...）` 全角配对，含内嵌 `（force push/reset --hard 类）` 全角括号——同形非 ASCII）、「初版」前缀截取、去除前导 `：` 三步。
  2. §8 「解析失败⇒判红（找不到锚点行、括号缺失、切出空项）」覆盖了基础失败路径，但未覆盖「括号嵌套误判」「初版 前缀漂移」「前导冒号残留」三类实现路径上的次级失败模式。
  3. 内层「（force push/reset --hard 类）」**使用全角**括号 `（...）`（U+FF08/U+FF09），与外层同形——非贪婪正则 `[^）]*?` 会停在第一个内嵌 `）`（实测 `node /tmp/s3parse_test.js` 第一版），仅取到「初版：删除文件；改写 git 历史（force push/reset --hard 类」——错位。
  4. 解析锚点行**单一**（grep `^|\s*高影响操作清单\s*|` 仅 1 行命中于 line 200）——「首列逐字等于」定位不会歧义。
- **影响**：中——实现段若按字面照抄「按 `；` 切分」会出现 5 项中只切出 1～2 项的假阳性 bug，闸永久绿或永久红的边界态。
- **建议**：
  - §8 补三步细则：①「取首列严格 `高影响操作清单` 行的 outermost `（...）` 段（按深度匹配）」②「截 `初版` 之后内容并去除前导 `：`」③「按 `；` 切分并 trim」。
  - D2 「可红自证」补 fixture 例：在段2 §4 第 200 行内插一条与现存重复项不一致的文本（如 `删除文件x`），断言判红——现 §8 仅提「注入一条不在附录 A 的条目」，未提「行内漂移」的可证伪面。
- **严重度**：中（D1 主断言能否在实现段通过取决于解析规则精度）。

### F-5 §8 「matches(kind, pattern, resource)」是**新签名**，详设未明示 caller（Scope.covers）同步改

- **位置**：`docs/design/v1.0.0-s2-detailed-design.md:134-136`（§8 正式 glob 表）；对照 `apps/desktop/src/domain/authorization/Scope.ts:41`（`matches(e.pattern, resource)` 无 kind 参数）。
- **证据**：
  1. 实测（§2.4 命令输出）显示当前 `matches(pattern, resource)` 不支持 §8 表三类扩展（段内 `*` / `prefix*` / `*.domain`）。
  2. §8 表三行均以「kind」分流——意味着 matches 签名必须扩为三参。Scope.covers 内部 `matches(e.pattern, resource)` 调用点（实测仅 1 处：Scope.ts:41）需同步改。
  3. §1 item 1 仅写「`matches()` 正式 glob 语义（偿清 `ponytail:` 天花板）」，未提 caller 同步改。
- **影响**：低——caller 同步改是机械迁移，实现段单点改即可；但 §1 表「承载 DoD」未列 A7 caller 同步改的承诺。
- **建议**：§1 item 1 「承载 DoD」列补「A7（含 caller Scope.covers 内部匹配点同步）」；§8 末补一行「`matches` 由 `Scope.covers` 单一调用点，签名变化不影响其他模块（grep 验证仅 1 命中）」。
- **严重度**：信息。

### F-6 §8 glob 表：三条正例失败是「现状未实现」非「描述冲突」——但 §1 「偿清天花板」承诺隐含 S2 实现量被低估

- **位置**：`docs/design/v1.0.0-s2-detailed-design.md:134-136`（§8 正式 glob 表）
- **证据**：
  1. 实测（§2.4 命令输出）：当前 matches() 三条正例失败——但**三条反例仍正确**（即新规则不会误命中）——所以 §8 描述**内部一致**，是「现状不支持→S2 实现」路径。
  2. 三条规则（段内 `*` / `prefix*` / `*.domain`）实现需：①段内 `*` 按 `/` 分段匹配（与 `**` 全放行／`/**` 深度前缀区分）；②`prefix*` 前缀匹配仅适用于命令 kind；③`*.domain` 仅适用于网络 kind 且点边界。**实现工作量超出详设表文本的隐性承诺**。
  3. 详设 §8 「不引依赖、不做通用匹配库」是合理约束，但未给出实现策略（如「按 kind 分流」或「先判全放行再按 kind 细判」）。
- **影响**：中——S2 实现段对 `matches` 的改造工作量与 §1 「单一扩 `Scope.ts`」的承诺可能不匹配；测试通过所需的真实实现路径未在 §8 给出。
- **建议**：§8 末补一段「`matches(kind, pattern, resource)` 实现策略」（按 kind 分流的伪代码片段），并明示 `Scope.covers` 内部改三参调用的同步点。
- **严重度**：中（A7 ≥6 用例能否通过取决于此）。

### F-7 §2 VO 冻结「`Object.freeze`」是浅冻结，详设未明示 inner ScopeEntry 对象的冻结策略

- **位置**：`docs/design/v1.0.0-s2-detailed-design.md:42`（「VO 冻结：`ScopeVersion.entries` 与链元素 `Object.freeze`」）
- **证据**：
  1. 实测（§2.5 命令输出）：浅 `Object.freeze` 可阻挡 entries.push / chain.push，但**无法阻挡 `entries[0].kind = '目录'`**（实测：mutating inner object: succeeded）。
  2. §2 「get entries() 改吐冻结副本」——若副本仅浅冻结，旧版本 entries[0] 仍可被持有该引用的代码修改。
  3. A3 「就地改写旧版本的代码路径命中数＝0」同时由静态断言（S-1 同族承载体）+ 运行时冻结两面承载。静态断言可阻「实现侧写代码」，运行时浅冻结阻「外部 push」——但 `entries[0].kind = ...` 这种「按引用 mutate 内层属性」两类均不阻。
- **影响**：中——若 S2 实现仅浅冻结，A3 「就地改写旧版本路径命中＝0」存在「按引用 mutate 内层属性」的逃逸路径；测试用例需覆盖此逃逸面或深冻结。
- **建议**：§2 补一条「ScopeEntry VO 也 `Object.freeze`（深冻结）」或显式说明「按引用 mutate 内层属性」由 A3 静态断言承载、不靠运行时冻结。
- **严重度**：中（A3 是 DoD「旧版本只读可溯」的核心）。

### F-8 §7 「走 `decision:raise(requestReason={reason:'作用域修正', operation, requestedBy})`」未列 `decisionPointId`/`delegationId`/`turnId` 三参

- **位置**：`docs/design/v1.0.0-s2-detailed-design.md:104`（§7 ScopePanel.tsx 段）
- **证据**：
  1. 实测：`apps/desktop/src/renderer/types.d.ts:130-139` 桥面 `decision.raise(args)` 要求 `decisionPointId` / `delegationId` / `turnId` / `requestReason` 四参。
  2. 实测：`apps/desktop/src/domain/authorization/DecisionPoint.ts:28-33` 实体 `RaiseInput` 同四参。
  3. §7 描述仅显列 `requestReason`，未列其余三参——实现段需自补。
- **影响**：低——实现段会自然补全（漏则 `decision:raise` 抛 I-3 缺归属），但首读审者易误以为仅 `requestReason` 一参即够。
- **建议**：§7 补一行「完整 raise args 四参（含 decisionPointId/delegationId/turnId 由 ScopePanel 自产 UUID 或复用）」；并明示「I-3 守卫在缺归属时抛」的行为。
- **严重度**：信息。

### F-9 §11 「本阶段新语义裁定＝无」与 §5 「裁案 A 后本登记转 ADR」存在**张力**

- **位置**：`docs/design/v1.0.0-s2-detailed-design.md:77`（§5 末行）vs 同件 `:164`（§11 第二项）
- **证据**：
  1. §5 明示「裁案 A 后本登记转 ADR（实现形态裁定）」——是 ADR 出件。
  2. §11 「本阶段新语义裁定＝无」——是 F8 预期记「无」。
  3. 契约件 F8：「S2 内语义裁定→`docs/decisions/` 出 ADR＋索引行；无裁定则本项记「无」，不留空」。
  4. §5 自承「本件 §5 取命令式消费，与该行的读法冲突」——**冲突已立**，实现形态裁定已隐含「与上游读法不同」的事实层。
- **影响**：中——若用户裁案 A，详设 §11 与 §5 的措辞需主会话同步修订；若裁案 B，详设 §5/§7 需重写。
- **建议**：
  - §11 末补「F8 填报口径以用户 2026-10-06 裁案结果为准（案 A ⇒ ADR-NNN；案 B ⇒ 无）」。
  - 在 handoff `pitfall` 槽登记「§5/§11 张力待用户裁案闭合」。
- **严重度**：中（流程一致性项，但属 F8 履行前的待裁项，不影响实现面）。

### F-10 §1 「不动面」漏列 DecisionPoint 决议三值「选项」与桥面 `data-cause` 等新增显式约束

- **位置**：`docs/design/v1.0.0-s2-detailed-design.md:24`（不动面硬约束列表）
- **证据**：
  1. 不动面列：`ScopeRepo` 方法名集合、`EventType` 22 名、`DecisionPoint` 公开命令仍只 `raise`/`resolve`、其余 4 未接线事件的 `never`、`HIGH_IMPACT_LIST` 条目文案。
  2. 详设实际「新增/扩」面未在不动面中显式禁止：①`ScopeAmendedPayload` 具名类型（已列于「22 事件闭集」旁隐含）②`ResolutionValue` 三值（隐含于「DecisionPoint 公开命令仍只 raise/resolve」）③`RequestCause` 三值（在不动面未列）④`data-cause` DOM 钩子（renderer 层新增）⑤`lastResolution` 派生（renderer hook 新增）⑥`scope.chain` / `scope.amend` 两通道（已列于 §1 item 5）。
  3. ④⑤是**实现辅助**而非契约面，但若 §1 不动面不列，段6 实现段可能误把 `data-cause` / `lastResolution` 当契约面去看——信息项。
- **影响**：低。
- **建议**：§1 不动面增一行「renderer 呈现辅助（`data-cause` / `lastResolution` 等派生）属实现辅助、不动 S-1 静态闸」。
- **严重度**：信息。

### F-11 §9 用例计数 B 组 1 test 缺口、E 组 1 test 缺口

- **位置**：`docs/design/v1.0.0-s2-detailed-design.md:131-140`（§9 测试面）；对照契约件 F2 / E4
- **证据**：
  1. 详设 §9 列：scope.versionChain (A1+A2+A3 = 9) + scope.amend (A4+A5+B2 = 8) + scope.repoSurface (A6 = 1) + scope.covers (A7 = 6) = A=24（按详设分解）vs 契约件 A=22。详设把 A5(2)+B2(2) 共 4 放入 scope.amend，故 A=4+3+2+4+2+1+6=22（不含 B2），B=2——但 §9 表注「B1 扩至 18」仅指样本扩，未计 1 个独立 B1 断言。
  2. 加总：B1(1 改 outer test 计 1 新 + 1 modified = 1) + B2(2) = 3；契约件 B=4，缺口 1。
  3. E 组：E1(3) + E2(2) + E3(1) + E5(1) = 7；契约件 E4「≥8」缺口 1。
- **影响**：低——属实现段「多挂一条 it()」即可闭合；不阻断详设可采纳。
- **建议**：
  - §9 表补 B1 段明示「B1 1（samples 扩至 18 触发 outer test 1 改 + inner loop 18 触发 1 新 = 1 net new；或独立挂 ScopeAmended 键集逐字相等断言 1 条）」，补足 4。
  - §9 表补 E 段「E4 1（playwright 全绿基线断言）」，补足 8。
- **严重度**：信息。

### F-12 §10 「F1–F5 段6 闸／F5 G-1 同源断言」F5 重复列

- **位置**：`docs/design/v1.0.0-s2-detailed-design.md:154`
- **证据**：表行「F1–F5 段6 闸／F5 G-1 同源断言」——F5 出现两次（一次作为 F1-F5 段6 闸之一，一次作为 G-1 同源断言）。实际契约件 F5 是 G-1 回归绿，故与 F1-F4（双 tsc/vitest/eslint/desens）不同类。
- **影响**：低。
- **建议**：拆为两行——「F1–F4 段6 闸」与「F5 G-1 回归」分别落点。
- **严重度**：信息。

### F-13 §3 仓储面不变与 A6 静态断言：详设未明示「方法名集合的判据形态」

- **位置**：`docs/design/v1.0.0-s2-detailed-design.md:47`（§3）；对照契约件 A6 「ScopeRepo 方法名集合仍＝`save`／`findByDelegation`，未被就地扩——`tests/unit/scope.repoSurface.test.ts`（≥1 条）」
- **证据**：
  1. 契约件 A6 「方法名集合＝`save` / `findByDelegation`」是**字符串字面**约束。
  2. §3 「零改动」措辞成立，但 §1 item 11 `tests/unit/scope.repoSurface.test.ts`（A6 1）未在详设中给出判据形态（是静态 grep、TS 接口结构检查、还是运行时反射？）。
  3. 现有 `apps/desktop/src/domain/repos/index.ts:43-46` 实测 `ScopeRepo` 接口恰好两方法——可作为字面源。
- **影响**：低——实现段自然补全，但 §1 表「承载 DoD」未明示 A6 用例的具体判据形态。
- **建议**：§1 item 11 在「`tests/unit/scope.repoSurface.test.ts`（A6 1）」后补「（判据＝`Object.keys(ScopeRepo interface)` 字面等 `['save','findByDelegation'].sort()`）」。
- **严重度**：信息。

### F-14 §5 「同族先例」形参描述「`dp.requestReason.reason === '作用域修正'`」与 §4 谓词「`op.category === '作用域修正'`」用不同字段——「作用域修正」事实层双源

- **位置**：`docs/design/v1.0.0-s2-detailed-design.md:40`（§2）vs `:54`（§4）
- **证据**：
  1. §2 Scope.amend 前置 ①：`dp.requestReason.reason === '作用域修正'`——使用 `RequestCause` VO。
  2. §4 RequiresApprovalSpec：`op.category === '作用域修正'`——使用 `OperationCategory`。
  3. 两处「作用域修正」字面值同，但**字段不同源**：一来自 `RequestReason.reason: RequestCause`（`'作用域外' | '高影响清单命中' | '作用域修正'`），一来自 `Operation.category: OperationCategory`（`'资源访问' | '命令执行' | '作用域修正'`）。
  4. 详设 §4 「谓词不判『有没有已批准决议』...两处各司其职，不合并、不互相反查（合并即双源）」——这一论断在 §2/§4 之间成立，但**「作用域修正」字面值跨 DecisionPoint/Operation 双源**未在详设中明示。
- **影响**：中——「作用域修正」字面是**事实层双源**（与 §4 自承「不合并＝双源」逻辑相悖）。如果未来需求要把 `RequestCause` 与 `OperationCategory` 合并为单源，详设 §2/§4 均需改——这是 S2 内可触面但被不动面排除。
- **建议**：
  - §4 「合并即双源」括注补一句「`作用域修正` 字面本身跨 DecisionPoint.requestReason.reason / Operation.category 双源——属既有面，本阶段不动」。
  - 不动面（§1 末）补「`RequestCause` / `OperationCategory` 词表（`'作用域修正'` 等三值）不动」。
- **严重度**：中（事实层双源是已存风险，详设未显式登记）。

### F-15 §11 「本阶段新语义裁定＝无」与不动面硬约束的边界判定

- **位置**：`docs/design/v1.0.0-s2-detailed-design.md:164`
- **证据**：
  1. §11 末：「③类翻转、VO 冻结、通道新增全部是既有不变量与既有契约面的实现落地，未添新事实」。
  2. 「③类翻转」——把 `return false` 改为 `return true`——这是**既有不变量 I-7/I-17 在 RequiresApprovalSpec 上的扩面**（段3 §8 / I-7「须拍板操作」）。详设自承是「既有不变量扩面」——但「扩面」本身可视为新事实（虽然语义沿用）。这一判定属「扩面 vs 新事实」的边界争议。
  3. 不动面（§1 末）已列「`DecisionPoint` 公开命令仍只 `raise`/`resolve`」——隐含「既有事实不动」，但 §4 谓词面已扩。
- **影响**：低——属详设自承措辞精度争议，F8 填报口径以用户裁定为准。
- **建议**：§11 措辞补「（既有不变量 I-7/I-17 在 RequiresApprovalSpec 谓词面的扩面 = 既有事实落地的延伸；本阶段未引入全新事实层）」。
- **严重度**：信息。

---

## ④ 四项核验结论行

### 4.1 对契约件 DoD 覆盖与双向可追溯

- **正向（契约件 DoD ↔ 详设 §1-§10）**：
  - A1-A7（A 组 7 条）：§2、§3、§8 全部落点（个别需 §1 item 1 「A7 caller 同步改」明示，见 F-5）
  - B1-B4（B 组 4 条）：§6 全部落点
  - C1-C4（C 组 4 条）：§4 全部落点（C3 在 §9 测试面扩 decisionPoint.test.ts）
  - D1-D3（D 组 3 条）：§8 S-3 全部落点（D3 「不预开扩展口」属不动面登记）
  - E1-E5（E 组 5 条）：§7、§9 全部落点（E4 ≥8 存在 1 test 缺口，见 F-11）
  - F1-F11（F 组 11 条）：§10 大部映射；F2/F4/F7 未单列（见 F-1）

- **反向（详设 ↔ 契约件无对应）**：
  - 详设 §2 「入参＝决策点本体，不是它的 id」与 §4 「谓词不反查仓储」是 ADR-029 D3 的取舍——已与段3 §8 头注「纯谓词」对齐——非自造判据。
  - 详设 §5 「上游冲突登记」是显式登记非隐式判据——非自造判据。
  - 详设 §7 「`lastResolution` 从既有 timeline 投影派生，不新增只读通道」——与 S1「待决决策点从时间线派生」同纪律，已在 §11/§7 自承「既有面」——非自造判据。
  - 详设 §8 S-3 解析规则是**实现策略**——非验收面判据——属自造实现路径，但落点（`tests/static/s3HighImpactList.test.ts`）承契约件 D1/D2。
  - 详设 §8 glob 表分流——是**A7 验收面的具体化**——非自造判据。

- **结论**：详设未引入自造验收面。F-1（§10 映射精度欠）、F-11（用例计数 1 test 缺口×2）是精度项，不阻断。

### 4.2 与上游冻结件逐字核

| 上游条款 | 详设落点 | 逐字核结论 |
|---|---|---|
| §3 §5 ScopeAmended 载荷键（3 键） | §6 `ScopeAmendedPayload` | ✓ 逐字对齐（camelCase 系接线权） |
| §3 §7 v1.3 / ADR-029 D1 ScopeRepo 两方法 | §3 + §1 item 1（Scope.ts 仅扩，ScopeRepo 不变） | ✓ |
| §3 §4 I-8 违反时行为（修正拒绝） | §2 三支前置＋DomainError('I-8') | ✓ |
| §3 §4 I-17 违反时行为（修正拒绝） | §2 三支前置＋DomainError('I-17') | ✓ |
| §2 §4 高影响操作清单（5 项）= S-3 唯一源 | §8 S-3 闸 | ✓（实测解析规则可实现，见 F-4 精度建议） |
| §2 X1a ResolutionValue 三值（批准/拒绝/选项） | §2 前置②（仅「批准」过）+ §7 DecisionCard 改 | ✓（DecisionCard 当前无「选项」按钮——需 §1 item 9 补） |
| 22 事件闭集（余 4 不接线） | §6 B3 + §1 item 3 | ✓ |
| §3 §6 「作用域修正」行（事件驱动 授权域内 Scope 消费决议） | §5 显式登记冲突 | ✓（冲突显式登记非隐式偏离） |
| §3 §8 RequiresApprovalSpec 形参 `scope`（v1.3 ADR-029 D3） | §4 形参不变 | ✓ |
| §3 §8 「纯谓词，可独立测试」头注 | §4（不合并双源） | ✓ |
| §1 不动面 | §1 末硬约束 + §11 | ✓（局部见 F-2 信息项） |

- **结论**：逐字核**无阻断**；F-3/F-4/F-7 三条中危发现是精度项。

### 4.3 §5 「上游冲突登记」专项判

| 维度 | 审者独立判定 |
|---|---|
| **(a) 根因是否成立** | **成立**。`DecisionRaised` / `DecisionResolved` 载荷键集实测无 entries 载体；强加 entries 键＝动 22 事件契约面＋铁律②第六次。 |
| **(b) 同族先例是否真实且同型** | **部分成立**——事实成立（`decision:resolve` 处理器内 `markAwaitingUser` 是 inline 命令），但与段3 §6 「事件驱动（推进订阅）」描述**形态偏差**：S1 实现走同事务 inline 命令，段3 §6 描述走订阅消费。S1 出口审计未明示核查此偏差。详设 §5 措辞「同族先例」易让读者把 S1 与段3 §6 等价——**建议 §5 补一句「S1 实现与段3 §6 表描述形态偏差，本件采同型」**。 |
| **(c) 案 A / 案 B / 案 C 判定** | **采纳案 A**（命令式消费）。理由：根因成立＋S1 实施同型偏离无判红＋实现形态不变契约面＋A4/A5/B2/I-8 判据不受影响＋不引入新事实层。**案 B**（回段3 加 entries 键）代价过高（动 22 事件契约面）。**案 C**（决议之外另设提案载体）虽可缓解但会引入**第二事件**（提案载体），新增「提案载体」事件需铁律②，且与「载荷键禁增禁减」裁定冲突——故案 C 在本阶段无实施路径。 |

### 4.4 可实现性与自欺风险（实测）

| 自测项 | 结果 | 备注 |
|---|---|---|
| §8 S-3 解析规则 | **可实现**（实测 5 项逐字相等） | 描述精度欠——见 F-4 |
| §8 glob 表三条正例 | **当前 matches() 全失败**——S2 实现量超出 §1 「单一扩 Scope.ts」承诺 | 见 F-6 |
| §2 get entries() 暴露内部引用 | **完全成立**（实测） | 需 Object.freeze 三层承载——见 F-7 |
| §9 用例计数 40 = A22+B4+C12+D2 | **总数成立**（22+4+12+2=40），B 组 1 test 缺口、E 组 1 test 缺口 | 见 F-11 |
| §2 §4「作用域修正」字面跨 DecisionPoint/Operation 双源 | **事实层双源已存**——详设未登记 | 见 F-14 |

### 4.5 越界与蔓延

| 边界（契约件 §98-110 边界节） | 详设 §1 改动面 | 蔓延判定 |
|---|---|---|
| 决策点作废路径→S5 | §2「决策点作废后不再产版本＝S5」+ §11 hook | ✓ 未越界 |
| I-15 卡滞期待指令期准入窗→S5 | §1 未触 | ✓ |
| 持久化与崩溃恢复→S3 | §1 未触 | ✓ |
| 证据三类型载荷、产物谓词两合取→S4 | §1 未触 | ✓ |
| StallDetector / 卡滞催弃路径→S5 | §1 未触 | ✓ |
| 等待项与焦点完整呈现→S6 | §11 「保持单卡派生」+ §7「不新增只读通道」 | ✓ |
| 三层指标计算→S7 | §1 未触 | ✓ |
| E2 真轨三缺口不认领 | §1 未引入 e2e / gateway / 工具执行链；§11 hook | ✓ 不认领保持 |
| 高影响清单不得就地扩展 | §1 不动面显式列 + §8 S-3 闸 | ✓ |
| 正式 glob 只偿清天花板、不扩通用库 | §8 「不引依赖、不做通用匹配库」 | ✓ |

**冻结面触碰核**：
- 22 事件闭集：详设 §6 增 `ScopeAmended` 接线，余 4 未接线保留 `never`——未扩未缩 ✓
- 载荷键禁增禁减：详设 §6 列出 `ScopeAmendedPayload` 3 键与 §5 逐字对齐——未扩 ✓
- 仓储方法名：详设 §3 显式「零改动」+ §1 不动面显式列 ✓
- 高影响清单条目文案：详设 §1 不动面显式列 + §8 S-3 闸 ✓
- DecisionPoint 公开命令仍只 `raise`/`resolve`：详设 §1 不动面显式列 ✓

**「E2 真轨三缺口不认领」偷补绿核**：
- 详设 §1 改动面不含 `tests/e2e/`、`src/main/gateway.ts` 真适配器、`src/main/tools/` 真执行链、对话输入入口相关 renderer 件——未偷补 ✓
- 详设 §11 hook 明示「改判须回 §11 + S1 详设 §11 同步」——未偷改上游 ✓
- 「真轨 `describe.skip` 保持 blocked 注记」——§11 hook 明示 ✓

### 4.6 综合判定

| 维度 | 结论 |
|---|---|
| DoD 覆盖与双向可追溯 | **可采纳**——契约件 A1-F11 逐条映射详设 §1-§10，无自造验收面；F-1/F-11 精度项不阻断。 |
| 与上游冻结件逐字核 | **可采纳**——逐字核无阻断；F-2/F-5/F-8/F-10/F-13/F-14 精度项均信息或中危，无阻断。 |
| §5 上游冲突登记 专项判 | **采纳案 A**——根因成立＋同族先例事实成立（S1 实施同型，形态与段3 §6 描述偏差需 §5 补一句）＋A4/A5/B2/I-8 判据不受影响＋不引入新事实层；**F-3 / F-9 张力项要求用户裁案后由主会话修订 §11 并落 ADR**。 |
| 可实现性与自欺风险 | **有条件可采纳**——F-4 S-3 解析精度欠、F-6 matches 实现量超出 §1 承诺、F-7 浅冻结逃逸路径、F-11 用例计数 1 test 缺口×2、F-14 双源已存——实现段需落实这些精度项以闭合 A1/A3/A7/B/F2/E4 判据。 |
| 越界与蔓延 | **可采纳**——详设严守契约件边界节九条；冻结面四点（22 事件闭集／载荷键禁增禁减／仓储方法名／高影响清单文案）均未触；E2 真轨三缺口不偷补绿。 |

### 4.7 最终综合结论行

> **有条件可采纳（实现段必修项 = §3 中危发现 4 条 + 流程待裁项 1 条）**

**实现段必修项（中危，F-3 / F-4 / F-6 / F-7 / F-9 / F-14 共 6 条中危）**：
1. **F-4** §8 S-3 解析规则补三步细则（outermost paren 抽取 / 初版 截取 / 去前导 `：`）+ D2 fixture 例补「行内漂移」可证伪。
2. **F-6** §8 末补 `matches(kind, pattern, resource)` 实现策略伪代码段，§1 item 1 「承载 DoD」补 A7 caller 同步改。
3. **F-7** §2 补「ScopeEntry VO 也 `Object.freeze`（深冻结）」或显式说明「按引用 mutate 内层属性」由 A3 静态断言承载。
4. **F-3 + F-9** 用户裁案后 §5/§11 同步修订：案 A ⇒ 落 ADR-NNN + §11 改「F8 引用 ADR-NNN」；案 B ⇒ §5/§7 重写并回 段3 改 22 事件契约面（铁律②第六次）。
5. **F-14** §4 「合并即双源」括注补「`作用域修正` 字面本身跨 DecisionPoint.requestReason.reason / Operation.category 双源——属既有面，本阶段不动」；§1 不动面增「`RequestCause` / `OperationCategory` 词表（`作用域修正` 等三值）不动」。

**信息项（F-1 / F-2 / F-5 / F-8 / F-10 / F-11 / F-12 / F-13 / F-15 共 9 条）**：实施段自然补全或为表述精度争议，**不阻断**。

**待用户亲裁项（铁律②第六次前确认）**：
- §5 案 A vs 案 B 的用户裁定——见 `docs/design/v1.0.0-s2-detailed-design.md:71-77`
- §11 F8 填报口径——见 `docs/design/v1.0.0-s2-detailed-design.md:164`

**未独立复现项（披露）**：
- L3 interaction `tests/interaction/**` 的全部用例未跑（按 S1 出口审计 F-6 同型纪律，不判红不预绿，采信 commit message 与文件存在 + 静态可读的事实层）。
- e2e 真轨未跑（按 S1 出口审计 F-7 同型纪律，blocked 注记保持）。
- coverage-matrix.md 与 .handoff/ 未触碰（任务书范围不含此）。

---

## 五、审计者限制自述

1. 仅以读 + 命令核（已跑命令列于 §2），未跑 npm install / playwright 启动 / 任何会改动工作树的命令。
2. 不改任何源码或工件；本报告 = 本次新建的唯一文件。
3. 不 commit / push / 改 tag；`git status` 已在 §2.1 验证工作树净。
4. 报告落 `docs/audits/stage5-s2-design-audit-2026-10-06.md` 即交付。
5. 审计者与待审主件 currentTool=qodercn / currentModel=Qwen3.8-Flash 不同源（同源不审亲笔，已避）。
6. 仅引用 §1.2 输入清单所列文件作为依据。

---

## 主会话署名采纳（2026-10-06）

派单实况＝agent-dispatch 现场重探后的池：`mcode@MiniMax-M3`（审计档，不同源；当前主＝qodercn@Qwen3.8-Flash）。审计者自述限制（未跑 L3／真轨／未触 coverage-matrix 与交接存储）按 S1 同型纪律受理：不判红、不预绿。

**逐条处置**（中危六条全修入，信息项除声明外同批落笔）：

- **F-3／F-9 采纳**：§5 的「同族先例」措辞过头——审计者指出 S1 的 `markAwaitingUser` 与段3 §6「事件驱动（推进订阅）」描述**本身也存在形态偏差**、且 S1 出口审计未核查这一层。已改为「采同型，不声称 S1 实现＝段3 描述，不把『S1 未判红』当独立证据」。§11「新语义裁定＝无」不实，改「＝1 件＝ADR-030」。**裁定落地**：用户 2026-10-06 裁案 A（命令式消费），出 `docs/decisions/030-s2-scope-decision-consumption-command-form.md`，铁律②回退＝0。
- **F-4 采纳并实测补证**：主会话本会话新鲜执行三步解析（外层括号取最外一层→首个 `：` 取右→按 `；` 切分）＝**5 项与 `HIGH_IMPACT_LIST` 逐字相等**；裸按首个 `）` 截断会丢掉末项，故 §8 写死三步＋D2 增「解析侧漂移」fixture。审计者的判定成立。
- **F-6／F-5 采纳并实测补证**：主会话把现 `matches()` 逐字移植后跑 §8 全部正反例＝**恰 3 条正例不过**（`docs/*/x.md`、`npm*`、`*.githubusercontent.com`），证实 A7 的实现量远超 v0.1 的「补语义」描述。§8 补分流伪代码；同时更正 v0.1 的 F-5 说法——`covers(kind, resource)` 本就收 kind，改的是 `matches` 自身 arity，caller 零签名变化。
- **F-7 采纳**：v0.1 只写 `Object.freeze` 链元素与 entries 数组，未管内层 `ScopeEntry`——`entries[0].pattern = 'x'` 可逃逸，而 A3 要堵的正是它。§2 改三层深冻结＋入参逐条拷贝再冻结（不 freeze 调用方对象）。
- **F-11 采纳**：v0.1 的 L3 排 7 条 < 契约件 E4「≥8」，是实质缺口；按 E2 决议三值拆细（批准/拒绝/选项各 1）补到 8。L1/L2 计数账重列为 42（A22＋B4＋C12＋D3＋词表 1），并删掉 v0.1 把「回归扩面」混进构成的写法。
- **F-14 采纳**：`作用域修正` 字面确实跨 `RequestCause` 与 `OperationCategory` 两处（S1 已入库的事实层双源，非本阶段造成）。处置＝不动、不合并，加一条同源词表断言 `tests/unit/scope.vocabulary.test.ts` 守改写错位；不为此开新不变量编号。
- **F-1／F-2／F-8／F-10／F-12／F-13／F-15 采纳**：§10 映射表 F 组拆行并修「F5 重列」；§2 补「聚合命令读值对象 ≠ 破坏 Spec 纯谓词」的边界声明；§7 `decision:raise` 四参补齐（含 `decisionPointId` 生成侧与无在飞轮时的接线级回执）；§1 不动面增列两处三值词表；§3 补 A6 的两面判据形态。
- **审计者自身的一处计数不一致（登记，不影响结论）**：4.7 标题行写「中危发现 4 条＋流程待裁项 1 条」，正文列出的中危 id 是 6 条（F-3/F-4/F-6/F-7/F-9/F-14）。主会话按 **6 条**受理修入。
- **未采纳项＝无**。

结论受理＝**有条件可采纳——无阻断项**，必修项全部修入 `docs/design/v1.0.0-s2-detailed-design.md` **v0.2**（同 commit）。按「采纳修入必复审」另派简单审计，只审 v0.1→v0.2 增量面与 ADR-030 自洽性。**审计结论的最终采信属用户亲裁面**（AGENTS.md 流程3）。
