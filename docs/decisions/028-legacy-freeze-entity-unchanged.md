# 028 — 旧实现冻结归档·工程实体不变（B 路线：不回退上游工件、不做包内物理隔离）

- Status: accepted（用户 2026-10-05 裁定）
- Date: 2026-10-05
- 相关：`docs/design/v1.0.0-stage-plan.md` §2/§3 S1 行/§4 G-1 行；`docs/neonforgeV1.0.0/00-problem-and-scope.md` §3 C1＋§7 裁定 C（**零改动**）；`01-l0-product-master.md` §9（工程实体与版本唯一源，**零改动**）；`03-domain-tactics.md` §5/§9（timeline.ts 就地重写授权，**零改动**）；`AGENTS.md` 命令节与内容落位第 10 条；ADR-026（旧树降经验件、新版从零设计）

## Context

1. 段4 开工勘查（实测非印象）：既有实现 `apps/desktop` 约 15k 行（`src/domain` 2449／`src/main` 5222／`src/preload` 250／`src/renderer` 7073）、45 个测试文件（L1 769 用例）、`src/domain/timeline.ts` 旧注册表约 56 个事件类型——与新树 22 事件闭集、7 聚合、I-1–I-17 **不同源**（新树从零设计＝ADR-026 Context 3）。
2. 勘查的可复用面判定：真正需重写的只有三块——`conversationState.ts`(958)、`timeline.ts`(376)、持久化（现只有 JSONL 诊断日志与 localStorage，**无重放/重建能力**）；其余为设计无关管道（窗口壳、桥、网关、凭据、diff/工作区工具、UI 原语）。
3. 路线冲突已机械核对：`apps/desktop` 在冻结工件中共 **9 处**（段0 `:46`/`:105`、段1 `:49`/`:87`/`:90`、段2 `:211`、段3 `:100`/`:184`、`ARCHIVE-INDEX.md` `:4`）＋`AGENTS.md` 3 处。改工程实体＝回退四份工件并重过段0/段1 **用户亲裁**闸（含发布版本唯一源条款）。
4. 三案摆裁（A 回退四份工件改实体／B 实体不变＋旧实现冻结归档／C 新 package 仍在本仓），用户 2026-10-05 裁 **B**，原话要点：「旧的直接冻结归档，这样也不需要物理隔离，也不改变段0」。

## Decision

1. **工程实体不变**＝`apps/desktop`；发布版本唯一源仍＝`apps/desktop/package.json`（L0 §9 版本纪律逐字不动）；上游四份冻结工件与 ARCHIVE-INDEX **零改动**。
2. **旧实现冻结归档**：基线 tag＝`legacy-freeze-v0.1.0`（**轻量 tag**，无 tagger 身份面，避署名/邮箱入库＝C3/C4）；调阅＝`git show legacy-freeze-v0.1.0:apps/desktop/<路径>`；纪律同 `docs/frozen-be6e299/`——只读、只作经验不作依据、引用带基线号。与既有发行 tag `v0.1.0` 并存不冲突。
3. **归档范围**（以 git 删除落地，历史即档案，不留死目录腐烂面）：旧领域文件（`conversationState.ts`、`agentLoop.ts`、`protocolTools.ts`、`planProposalParser.ts`、`completionClaimParser.ts`）；对话中心呈现（`src/renderer/ConversationPanel.tsx` 等旧组件；renderer 为扁平目录，无 `components/` 层；**逐个文件的确定清单＝`docs/design/stage-specs/V1-S1-legacy-freeze-vertical-skeleton.md` DoD A2.2（24 文件，经现场 `ls`＋import 图核实）**，本件只定范围不定外延）；旧测试面（`tests/unit/**` 45 文件、`tests/interaction/**`、`tests/visual/**`，以及视觉基线目录 `apps/desktop/snapshots/**`——由 `playwright.config.ts` 的 `snapshotDir: './snapshots'` 定位，不在 `tests/` 下）；旧 UAT/e2e 面（`scripts-cdp/`、`apps/desktop/e2e-*.mjs`（6 个，在包内非仓库根）、`e2e-sim/`）。以上路径均经 2026-10-05 现场 `ls`/`find` 核实。
4. **保留复用面**（移植进新树接线位）：`src/main/main.ts`（窗口壳）、`src/preload/preload.ts`（类型化桥模式）、`src/main/gateway.ts`＋`src/main/providers/**`（网关与重试/分类/修复；**缺流级取消令牌，须新建**）、`configStore.ts`＋`envManager.ts`（凭据 safeStorage）、`applyDiff.ts`＋`workspace.ts`＋`sandboxPath.ts`＋`diffRender.ts`（文件/diff 工具）、`styles.css`＋`icons.tsx`（UI 原语）、`src/renderer/ConfigPage.tsx`（**凭据配置 UI**——非对话中心组件，S1 真网关移植的凭据入口；段4 出口审计 CC-04 澄清补入，不属归档面）。壳与入口（`main.tsx`／`index.html`／`App.tsx`／`types.d.ts`／`assets/`）既非归档面也非"原样复用"——S1 **就地重写**为委托单中心呈现。
5. **不做包内物理隔离**：不设并行目录、不留双份构建面；新旧不共存于构建面——归档批与新树骨架批同属 **S1**，S1 出口一次过闸（段6 闸＋S1 spec DoD）。
6. **防回流检查项 G-1（段4 新立，非段3 S-1 内容）**：新树模块不得 import 已归档旧领域文件；承载＝依赖静态检查（形态段5 定），违反即 CI 红。G-1 与段3 S-1–S-4 并列登记，**不扩写段3 冻结条文**。
7. **旧树待办处置（待用户确认，不擅自 close）**：失去执行对象者——`t000075`/`t000078`（旧实现批与主线）、`t000065`–`t000070`（旧 UAT 池）、`t000077`（阶 C 内容票）——建议**作废**，其 RCA 结论降为经验层（可迁移教训入 `docs/experience/`）；发布轴 `t000011`–`t000013` 维持 blocked（L0 §9 轴12 商业分发射程外）。
8. **命令面与基线**：`AGENTS.md` 命令节五条闸命令（cwd `apps/desktop`）逐字有效；L1 基线由 769 用例**归零重建**——诚实反映从零设计，不保留旧用例充当"覆盖"。

## Consequences

- 正面：上游四份冻结工件零改动（段0 C1/裁定 C、段1 §9 工程实体与版本源全不动），无需重开段0/段1 用户亲裁闸；无并行目录腐烂面；旧资产仍可按 tag 调阅；省下设计无关管道的重写量（网关 834 行、凭据/环境 602 行、diff/工作区 270 行、UI 原语约 1100 行）。
- 负面/代价：①S1 归档批至骨架接线前存在「应用不可跑」窗（缓解＝同批过闸＋计划件 §3 的 S1a/S1b 拆分警语）；②L1 用例数从 769 归零，短期覆盖观感下降（缓解＝表 N 段7 列渐进回填＋禁预先标绿）；③旧 UAT/e2e 真机验收面退役，须自 S1 起重建（`/tmp/nf-e2e-test` 与 `NF_*` 环境约定沿用，Key 不入库）；④旧树 UAT 池已坐实的产品级缺陷（幽灵气泡、busy 误判死锁、nudge 死信等）随归档失去修复对象，其教训只能以经验层身份影响新树设计（新树对应判据＝I-9 无归宿等待、I-13 过期令牌写入、I-1 单飞与队列归宿）。
- 后续：①S1 spec 首节即归档批 DoD（tag 存在／旧路径不在 `src/`／闸绿）；②`AGENTS.md` 内容落位第 10 条追加 legacy tag 指针一行（摘要面同步，随本裁定）；③用户确认旧树票作废后经 handoff CLI 落账；④段6 开工前核 tag 已推远端（归档可复现）。
