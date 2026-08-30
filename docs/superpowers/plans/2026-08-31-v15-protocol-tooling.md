# V1.5 协议工具化实施计划（动工→测试→验收→审计全路径）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 确认协议承载层从自由文本标记迁移到 schema 工具调用（ADR-009 r2 / stage-spec r2），消灭解析类 P1。

**Architecture:** 工具定义在 gateway TOOL_DEFS（模型可见面）→ 模型 tool_calls 经 SSE 流式到 renderer → renderer 协议处理器（`decideProtocolToolCall` 纯函数三分支）→ 置 pending/decisionContent（现有状态机）→ 确认卡渲染组件零改动。文本标记保留为降级通道（S3 原子降级）。

**Tech Stack:** Electron + TypeScript + Vitest (L1) + Playwright (L3 interaction, mockBridge) + Command Code 网关（DeepSeek V4）。

## Global Constraints

- 每任务完成即 commit；每阶段 push + CI 绿（run 可查）作下一阶段前置（E1）
- 回归门：L1 vitest 全绿 + L3 `--project=interaction` 全绿 + 双 tsc（tsconfig.json / tsconfig.main.json）+ ESLint 0 errors——每阶段收口必跑
- 领域层新代码纯函数、无 React/node 依赖（L1 可测）——例外：main 进程文件
- 决策点只能由 `deriveDecisionPoint` / 本计划的 `decideProtocolToolCall` 派生（不变量 2）
- Timeline 新事件先登记 `TIMELINE_EVENT_SPECS`（含载荷校验）
- schema 扁平：数组一层为限（files[]/verification[]/options[]），禁止数组套数组（NLT 方差反例）
- 大段代码/长输出不进 JSON args（aider 教训）——用文件引用
- 真机验收红线：零「解析类 P1」（stage-spec r2 S5 枚举 ①-④）
- 凭据：Command Code key 在 WSL `~/.dsh/.credentials.yaml` 的 `COMMANDCODE_API_KEY`（不写值不入库）

## 阶段总览与审计路径

| 阶段 | 内容 | 测试 | 审计门 |
|------|------|------|--------|
| S0 | 6 项 spike | spike 脚本输出即证据 | 结论入 stage-spec 附录 B；schema 细节按数据锁定 |
| S1 | 协议工具 + 拦截纯函数 + 接线 | L1 乱序矩阵 + 校验器单测 | 阶段末双轴评审（状态化报告） |
| S2 | renderer 接线（双通道并存） | L3 派生路径枚举断言（字段级相等） | 阶段末双轴评审 |
| S3 | sysPrompt 契约 + 文本降级原子落地 | L3 一轮改道断言 + 词表校验保持 | 阶段末双轴评审 |
| S4 | 解析层退役 + 测试迁移 + 覆盖矩阵 | 全量回归 + grep 清零检查 | 阶段末双轴评审 + A-015/A-016 关闭核对 |
| S5 | Mac 真机验收 | 真机 runbook（本计划 Task 5.x） | stage-gate 终局（枚举 A-015/A-016 + 全 DoD）→ #6 关闭 |

审计执行方式：每阶段收口跑 code-review skill 阶段末模式（双轴并行 agent），产出 `docs/audits/stage-review-V1.5-S{N}-<date>.md`（open/fixed/recorded 状态化）；open 项入 `.scratch/neonforge-v1/audit-items/`。

---

## S0：六项 Spike（真实 API——成本预估见各任务）

### Task 0.1：spike 脚手架（公共）

**Files:**
- Create: `scripts/spike/spike-lib.mjs`（本机私有——scripts/ 已 git-exclude）
- Create: `scripts/spike/run.sh`

**Interfaces:**
- Produces: `spikeChat(messages, tools, opts)` → `{ content, toolCalls[{name,args}], reasoning, raw }`；从 `~/.dsh/.credentials.yaml` 读 key（`grep COMMANDCODE_API_KEY`）；endpoint `https://api.commandcode.ai/provider/v1/chat/completions`，model `deepseek-v4`（以 .credentials/config 实际为准，先 `curl /models` 确认）

- [ ] **Step 1**: 写 `spike-lib.mjs`——fetch 封装：SSE 流式解析（对齐 gateway.ts:482 分片重组逻辑的简化版）+ 非流式两种模式；`tools` 参数直传请求体 `tools` 字段，`tool_choice: 'auto'`
- [ ] **Step 2**: `run.sh` 冒烟——单轮「调用 read 工具读取 /tmp/x」验证工具调用回路通
- [ ] **Step 3**: 成本记录模板——每任务记录调用次数/输入输出 token（从 response.usage 取）

### Task 0.2：Spike-1 透传（成本：~10 次调用）

- [ ] **Step 1**: TOOL_DEFS 候选（4 协议工具 + 现有 9 工具）全量放入请求，连续 10 轮探测对话（每轮「列出你可用的工具名」）
- [ ] **Step 2**: 判定：10/10 响应中模型能正确引用协议工具名（无截断/无消失）→ PASS 记附录 B；任何一轮异常 → 记录原始响应，触发 schema 瘦身重测
- [ ] **Step 3**: 结论写 `docs/design/stage-specs/V1.5-protocol-tooling.md` 附录 B（Spike-1 节）

### Task 0.3：Spike-2 采样（成本：~55 次调用）

- [ ] **Step 1**: 造 10 个差异化任务场景 prompt（单文件页/多文件改/修复 bug/重构拆分…每个触发一次 propose_plan）
- [ ] **Step 2**: 每场景跑 5 次（temperature 默认）= 50 次 propose_plan 调用；`tool_choice: {type:'function', function:{name:'propose_plan'}}` 强制触发（若网关拒 required 变体——记录并改用 prompt 引导触发，方法写入附录）
- [ ] **Step 3**: 双判合格率脚本：① 结构合法（schema 校验：required 齐/类型对/files[].path 过 isLikelyPath）② 字段语义可用（path 可解析、reason 非空）。分别记录
- [ ] **Step 4**: ≥95% → 锁定 schema；<95% → 剥掉最常错字段重测一轮；结论入附录 B

### Task 0.4：Spike-3 V4 非标参数（成本：~6 次调用）

- [ ] **Step 1**: 三种请求体对照：标准 `reasoning_effort` 顶层 vs `thinking:{type}` + `extra_body.reasoning_effort`（deep-code openai-thinking.ts 形态）vs 不带——各 2 次调用
- [ ] **Step 2**: 判定：哪种返回 200 且 `reasoning_content` 有增量（对照无思考基线）→ 记录
- [ ] **Step 3**: 结论入附录 B（若非标体必要 → S1 gateway 请求组装加适配，登记改动点）

### Task 0.5：Spike-4 并行多工具（成本：~10 次）

- [ ] **Step 1**: prompt 诱导单轮同时返回 propose_plan + read（「先看文件再给方案，一起做」）
- [ ] **Step 2**: 记录 SSE 流中 tool_calls 分片到达顺序/交叉情况 → 确定 renderer 分支处理规则（协议工具优先置 pending、普通工具挂起）是否够用
- [ ] **Step 3**: 结论入附录 B

### Task 0.6：Spike-5 分片重组 + 双重序列化 & Spike-6 tool_choice（成本：~10 次）

- [ ] **Step 1**: 构造长 args（files 8+ 条）验证流式分片重组后 JSON 完整性（对齐 gateway.ts:519 toolCallRepair 现状）
- [ ] **Step 2**: 手工构造双重序列化 args 样本注入 spike-lib 解析层，验证 crush 式回退解析（JSON.parse 结果是 string → 再 parse 一层）
- [ ] **Step 3**: Spike-6：`tool_choice:'auto'` 下协议工具触发率粗测（10 轮引导语）；`required` 变体确认仍 400/拒绝（记录）
- [ ] **Step 4**: 结论入附录 B；S0 收口 commit（stage-spec 附录 + spike 脚本不入库确认）

---

## S1：协议工具定义与 renderer 协议处理器

### Task 1.1：`protocolTools.ts` schema 单源（TDD）

**Files:**
- Create: `apps/desktop/src/domain/protocolTools.ts`
- Test: `apps/desktop/tests/unit/protocolTools.test.ts`

**Interfaces:**
- Produces:
  - `PROTOCOL_TOOL_DEFS`（gateway TOOL_DEFS 同构对象数组——name/description/parameters JSON Schema）
  - `decideProtocolToolCall(state: ConversationState, tool: string, args: unknown): { action: 'pending'; kind: DecisionKind; content: DecisionContent } | { action: 'reject'; resultText: string } | { action: 'invalid'; resultText: string }`
  - `validateProtocolArgs(tool, args): { ok: true } | { ok: false; errors: string[] }`（路径化错误：「files[2].path: 期望文件路径形态，得到『新建 index.html』——示例：index.html（新建首页）」）

- [ ] **Step 1**: 写失败测试——四工具 schema 存在性 + 扁平断言（遍历 parameters.properties，数组属性内不得再含 array 类型）
- [ ] **Step 2**: 跑 `npx vitest run tests/unit/protocolTools.test.ts` 确认 FAIL
- [ ] **Step 3**: 实现 `PROTOCOL_TOOL_DEFS`（schema 字段严格对齐 stage-spec r2 S1 清单：propose_goal{statement,assumptions[]} / propose_plan{files[{path,reason}],summary,assumptions[],verification_plan[]} / report_completion{summary,verification[{command,output,passed}],pending_questions[]} / ask_user{question,options[],type}）+ `validateProtocolArgs`（复用 isLikelyPath 于 files[].path；errors 路径化）
- [ ] **Step 4**: 测试 PASS；commit `feat(V1.5-S1): 协议工具 schema 单源 + 参数校验器`

### Task 1.2：`decideProtocolToolCall` 纯函数（TDD——乱序矩阵）

**Files:**
- Modify: `apps/desktop/src/domain/protocolTools.ts`
- Test: `apps/desktop/tests/unit/protocolTools.test.ts`（追加 describe）

- [ ] **Step 1**: 写乱序矩阵失败测试（每行一个 it）：
  - goal 未确认：propose_plan → reject（引导先 propose_goal）；report_completion → reject；ask_user → reject
  - goal 已确认 plan 未确认：propose_goal（换目标）→ pending:goal（ADR-006）；propose_plan → pending:plan；report_completion → reject
  - goal+plan 已确认：propose_goal → pending:goal（换目标）；report_completion → pending:resolution 载荷 CompletionClaim（verification 映射 evidence.verification、diffs 置 []——V1b 系统派生）
  - 同点重复：goal 已确认再 propose_goal → pending:goal（换目标弹卡）；plan 已确认再 propose_plan → 覆盖 pending:plan（幂等语义）
  - args 校验失败 → invalid + 路径化错误模板
- [ ] **Step 2**: FAIL 确认 → **Step 3**: 实现 `decideProtocolToolCall`（消费 stateRef 的状态 + `validateProtocolArgs`；pending 载荷构造对齐现有 GoalProposal/PlanProposal/CompletionClaim 接口——字段名一致）→ **Step 4**: PASS → **Step 5**: commit

### Task 1.3：gateway TOOL_DEFS 增补 + renderer chunk 分支接线

**Files:**
- Modify: `apps/desktop/src/main/gateway.ts`（TOOL_DEFS 追加 `...PROTOCOL_TOOL_DEFS`——import 自 domain）
- Modify: `apps/desktop/src/renderer/ConversationPanel.tsx`（chunk 处理器：协议工具分支在 approve-files 特例之前）

**Interfaces:**
- Consumes: Task 1.2 `decideProtocolToolCall`；现有 `setPendingState` / `tlog`
- Produces: 新 Timeline 事件 `protocol.text_fallback`（S3 用，本任务先登记 SPECS）

- [ ] **Step 1**: TOOL_DEFS 追加（四工具定义进模型请求体）
- [ ] **Step 2**: chunk 处理器：`if (PROTOCOL_TOOL_NAMES.has(chunk.toolCall.name))` → `decideProtocolToolCall(...)` → pending 分支：`setPendingState(kind, {proposal: content.proposal, since})` + toolCall 置 done（result=确认引导语）/ reject 分支：toolCall done + result=resultText / invalid 同理
- [ ] **Step 3**: 登记事件：`TIMELINE_EVENT_SPECS` 加 `protocol.text_fallback`（detail: {tool, content_snip}）与 `protocol.tool_proposed`（detail: {tool}——打点观察触发率，S5 目标 <10% 兜底率的基线数据）
- [ ] **Step 4**: L1 新增断言（事件登记校验）→ 全量回归（L1/L3/tsc/lint）→ commit `feat(V1.5-S1): 协议工具接线 + 乱序矩阵`

### Task 1.4：A-016 测试缺口关闭（审计 open 项）

- [ ] **Step 1**: L1 补断言：`syncPlanConfirmed` 三路（confirm plan=true / confirm goal=false / reject plan=false）——经 window.neonforge.session mock 捕获
- [ ] **Step 2**: L3 补断言：plan 未确认时 approve-files chunk → 无卡 + 合成结果=引导文本
- [ ] **Step 3**: 回归 + commit `test(V1.5-S1): A-016 硬序门/镜像同步断言`；`.scratch/.../audit-items/A-016*.md` 标记关闭（引用 commit）

---

## S2：renderer 接线验证（双通道并存）

### Task 2.1：派生路径枚举断言（L3）

**Files:**
- Modify: `apps/desktop/tests/interaction/cards-from-decision-content.interaction.ts`（新增 describe）

- [ ] **Step 1**: mockBridge streamChat 脚本改为协议工具形态（toolCall.proposeGoal/proposePlan/reportCompletion helper——加进 mockBridge.ts），逐条断言「工具路径 decisionContent 与文本路径字段级相等」：goal 卡 statement/assumptions；plan 卡 files/summary；resolution 卡 verification/pendingQuestions
- [ ] **Step 2**: 双通道并存断言：同会话先文本标记后工具调用（或反序）→ 状态机无冲突（deriveDecisionPoint 优先级语义）
- [ ] **Step 3**: 回归 + commit `test(V1.5-S2): 派生路径枚举断言（工具↔文本 字段级相等）`

### Task 2.2：阶段收口（S2）

- [ ] push + CI 绿 → 阶段末双轴评审（code-review skill，固定点=S1 收口 commit）→ 评审报告入库 → open 项入账

---

## S3：sysPrompt 契约改写 + 文本降级（原子落地）

### Task 3.1：sysPrompt ⑬⑭⑮ 重写

**Files:**
- Modify: `apps/desktop/src/renderer/sysPrompt.ts`

- [ ] **Step 1**: ⑬ 改「接到问题先澄清目标：用 ask_user 工具提问/给选项；收敛后必须调 propose_goal（没有它 UI 无法识别目标已确认）」；⑭ 改「动手前必须调 propose_plan（文件清单+summary+假设+验证计划）→ 等用户确认执行 → 调 approve-files 批量放行」；⑮ 改「完成后自检 → 必须调 report_completion（验证证据=真实跑过的命令+结果；不确定事项进 pending_questions）」；**保留**文本标记语法的说明段（降级通道声明）
- [ ] **Step 2**: `sysPromptConfirmWords.test.ts` 跑通（确认词「已解决」等不因重写丢失——按钮直发路径不受影响）

### Task 3.2：文本降级原子落地（与 3.1 同一 commit）

**Files:**
- Modify: `apps/desktop/src/renderer/ConversationPanel.tsx`（done 分支：标记命中 → `protocol.text_fallback` 事件 + 合成引导 result；**删除**标记直接 setPendingState 的三处路径）

- [ ] **Step 1**: L3 失败测试：文本标记消息 → 不弹卡 + toolcall result 含「请改用 propose_* 工具」+ 下一轮模型改用工具（mock 脚本两轮）
- [ ] **Step 2**: 实现 done 分支改造（标记路径 → tlog text_fallback + inputRef 注入引导 + 合成 result）——与 Task 3.1 同 commit
- [ ] **Step 3**: 全量回归（重点：既有 L3 文本标记场景测试全部改写为工具形态或降级断言）→ commit `feat(V1.5-S3): sysPrompt 工具契约 + 文本标记原子降级`

### Task 3.3：阶段收口（S3）

- [ ] push + CI 绿 → 阶段末双轴评审 → 报告入库 → open 项入账

---

## S4：解析层退役 + 测试迁移 + 收尾

### Task 4.1：直接产卡路径 grep 清零

- [ ] `grep -n "parsePlanProposal\|parseCompletionClaim\|goalFallbackTrigger" apps/desktop/src/renderer/` ——逐处确认仅剩兜底探测（text_fallback 路径）调用
- [ ] 退役注释统一（每个降级点：「V1.5-S4 退役——兜底探测，见 ADR-009」）

### Task 4.2：scenarios.ts 场景助手工具化

- [ ] goalConfirm→`toolCall.proposeGoal`、planPropose→`toolCall.proposePlan`、completeClaim→`toolCall.reportCompletion`（mockBridge 加三个 helper；保留旧 helper 供降级断言用）
- [ ] 受影响 L3 测试逐个迁移跑绿（预期 core.interaction 多处轮次结构不变、chunk 形态变）

### Task 4.3：收尾三件套

- [ ] 覆盖矩阵更新（`docs/tests/coverage-matrix.md`：协议工具 ↔ 决策点 ↔ 断言三向）
- [ ] A-015 关闭（S2 对账 UI 提示若已实现；未实现则转 V1.5 尾 open 并说明）
- [ ] push + CI 绿 → 阶段末双轴评审 → 报告入库

---

## S5：Mac 真机验收 runbook

### Task 5.1：出包与安装

- [ ] Mac：`git pull` → `npm run build && npx electron-builder -c.directories.output=/tmp/nf-release`（ELECTRON_MIRROR 备用；代理 `127.0.0.1:6696` 备用）→ 挂载替换 /Applications → 确认 mtime

### Task 5.2：验收执行（用户操作 + 我 SSH 取证）

- [ ] 新任务全流程：澄清（ask_user 卡）→ 目标卡 → 方案卡（**有内容**）→ approve-files（**确认执行后**）→ 写入免卡 → 同文件再改免卡（②）→ 起服务跨回合存活（③）→【已达成】→ **解决卡弹出 + 遗留问题可见** → 点「已解决」/打字「已解决」（①）
- [ ] 乱序观察：模型提前调协议工具 → 被引导重走（无死循环）
- [ ] 双卡不同屏（④）、edit diff 可见（⑤）
- [ ] 取证：timeline/chat 日志拉回 + `protocol.text_fallback` 触发率统计（目标 <10% 轮次）

### Task 5.3：判定与收口

- [ ] 零解析类 P1（stage-spec r2 S5 枚举 ①-④）→ #6 关闭 + V1 收尾完成判定
- [ ] 任一解析类 P1 → 回 S1-S3 修复 → 重跑 S5（不混入语义类问题扯皮）
- [ ] HANDOFF 回填 + stage-gate 终局（枚举 A-015/A-016）

---

## Self-Review 记录

- Spec 覆盖：stage-spec r2 S0 六 spike（Task 0.2-0.6）✓ / S1 六条 DoD（Task 1.1-1.4）✓ / S2 枚举断言（Task 2.1）✓ / S3 原子降级（Task 3.1+3.2 同 commit 约束）✓ / S4 三件套（Task 4.1-4.3）✓ / S5 runbook + 红线（Task 5.1-5.3）✓ / 审计路径（阶段总览表 + 各收口任务）✓ / A-015/A-016（Task 1.4 + 4.3）✓
- 类型一致性：`decideProtocolToolCall` 返回三 action 名在 Task 1.2/1.3 一致；`verification[{command,output,passed}]` 全文一致；`PROTOCOL_TOOL_NAMES`/`PROTOCOL_TOOL_DEFS` 命名一致
- 占位扫描：无 TBD/TODO；S5 真机步骤为 runbook 形态（操作序列非代码——属验收非实现）
