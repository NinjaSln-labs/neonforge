# 外部基准 → 产品 ToolRegistry 桥接设计（初版，2026-11-19）

> 目的：评估是否把 AgentDojo / BFCL 的工具执行点接到 NeonForge 真实 `ToolRegistry`，而不是继续只用 Python 进程内策略门。
> 性质：设计评估，不是已实现功能；未改产品代码。

## 1. 现状

- 外部基准使用 `evals/sandbox/neonforge_gate.py`，在 AgentDojo `FunctionsRuntime.run_function` 处做 Python monkey-patch；实现 `deny > ask > allow`、信任阶梯、`PermissionRule(specifier)`、模拟审批端。
- 产品审批在 Electron main 的 `apps/desktop/src/main/tools.ts`：真实 `ToolRegistry`、`preApproval`、delegate 边界、`realpath`/symlink 防护、写前快照；renderer 通过 `needApproval` 显示授权卡。
- 两者语义相近但实现独立；现有能力卡已明确不能互相背书。产品侧证据见 `2026-11-19-neonforge-approval-boundary.md`。
- 关键结构差异：`ToolRegistry.execute` 把“规则裁决 + 委托边界 + 预检 + 执行”写在一个方法里，没有独立的纯决策函数。

## 2. 目标与非目标

**目标**
- 让外部 harness 的工具调用经过产品规则裁决，减少 Python 门与产品实现漂移。
- 保留可复现、可审计、无凭据泄漏的沙箱边界。

**非目标**
- 不在本阶段把真实 Electron UI 嵌入基准。
- 不让评估容器直接操作宿主项目目录或宿主凭据。
- 不把 AgentDojo 的 synthetic 工具与产品工具强行一一映射后宣称“完整产品覆盖”。

## 3. 方案对比

| 方案 | 做法 | 保真度 | 安全/工作量 | 结论 |
|------|------|--------|-------------|------|
| A. 保持 Python 门 | 现状 | 中（语义复刻） | 低 | 继续作为默认，能力卡注明独立实现 |
| B. 策略-only sidecar | 宿主 Node 侧车暴露 `/decide`，调用产品纯决策函数，不执行工具 | 中-高（规则/委托边界真实，执行仍模拟） | 中；需先抽取纯函数 | **推荐先做** |
| C. 执行桥 | 侧车暴露 `/execute`，在一次性临时工作区执行真实工具 | 高（真实执行） | 高；需强认证、工具白名单、临时根、禁网/禁 bash | 需专用 VM 后再评估 |
| D. 进程内嵌入 | 在 Electron main 内跑 AgentDojo | 最高 | 不可行（Python/依赖/沙箱） | 不采用 |

## 4. 推荐路线

### 阶段 1：抽取纯决策函数（产品重构）

**实现进度（2026-11-19）**：已在 `ToolRegistry` 增加 `decide(name, args, opts)`，把 planning 门、`deny > allow > ask`、delegate 边界、read 根外与 `preApproval` 裁决从 `execute` 抽出；`execute` 先裁决后执行，行为与文案不变。新增 4 项 `decide` 单测，工具单测 44/44、全量 943/943、双 tsconfig、ESLint、trustModes UI 3/3 通过（PR #60，main `9701291`）。尚未抽成模块级纯函数，也未实现 sidecar。

把 `ToolRegistry.execute` 中的裁决部分抽成纯函数，例如：

```ts
type Decision =
  | { action: 'deny'; reason: string }
  | { action: 'ask'; reason: string }
  | { action: 'allow'; reason: string; auto?: boolean }

decideToolCall(input: {
  tool: { name: string; requiresApproval: boolean; risk: ToolRisk }
  args: Record<string, unknown>
  rules: PermissionRule[]
  approved?: boolean
  approvalSource?: 'user' | 'auto' | 'delegate'
  rootPath?: string
  plannedFiles?: string[]
}): Promise<Decision>
```

要求：
- 纯决策不读写文件、不执行工具；路径/symlink 校验仍可调用现有 pure helpers。
- 现有 40 项 `tools.test.ts` 全部保持通过；新增决策函数单测，覆盖 deny/ask/allow、delegate、symlink、ask 仅 user。
- `execute` 改为调用同一函数，避免双源。

### 阶段 2：策略-only sidecar

**可行性复核（2026-11-19，暂不做）**：AgentDojo/BFCL 的工具名与参数是 synthetic 的（`create_file`、`send_email`、`share_file`、`create_calendar_event` 等），产品 `ToolRegistry` 只认识已注册的 `write/edit/read/bash/...`，且 `delegationBoundaryViolation`/`isInSandboxRealpath` 依赖真实路径。若做 sidecar，需要额外写一层“synthetic 工具 → 产品工具/规则”的映射；该映射本身会决定裁决结果，测到的是新映射而不是产品真实行为。`send_email`/`share_file` 等外部副作用在产品中没有等价工具，只能模拟。

**结论**：暂不为 AgentDojo/BFCL 实现阶段 2 sidecar。保留 Python 门作为外部基准的独立控制，产品侧以 `ToolRegistry` 单测 + UI 测试为证据；两者在能力卡中分开表述。若未来有“直接调用 NeonForge 产品工具”的 native 基准，再按本设计实现 sidecar。

- 宿主 Node 进程加载构建后的决策函数，暴露 `POST /decide`。
- 输入只接受：tool name、args（JSON 大小上限）、rootPath（必须是专用 fixture 目录）、规则快照。
- 输出：`allow/ask/deny + reason`；不返回文件内容、不执行工具。
- 容器通过单目标 relay 访问；共享 token 只从环境变量读取；不挂宿主项目/Home/SSH/云凭据。
- AgentDojo 的 `run_function` 改为调用 `/decide`，`allow` 才执行 synthetic 工具；`ask` 走现有模拟审批端；`deny` 直接拒绝。
- 结果仍标为“产品规则裁决 + synthetic 工具执行”，不能声称完整产品链路。

### 阶段 3（可选）：执行桥

仅在以下条件满足后做：
- 专用 VM + 一次性容器，宿主项目目录不挂载；
- 每次运行一个临时工作区，结束即销毁；
- `/execute` 仅允许文件读写/编辑等白名单工具，禁 `bash`、禁外网、禁 MCP；
- 强认证、请求审计、速率限制、kill switch；
- 先做威胁建模更新与一次演练。

## 5. 安全控制（阶段 2 最小集）

- 监听 Docker bridge 网关地址，不监听 0.0.0.0；只允许 `nf-eval-internal` 网段。
- Bearer token 从宿主环境变量注入 sidecar 与容器；不写仓库、不进日志。
- 请求 schema 校验、body 大小上限、超时、并发限制。
- `rootPath` 只接受 `.scratch/evals/.../fixture` 下的专用目录；拒绝项目根、Home、`/`。
- 拒绝绝对路径/`..` 逃逸；路径仍走产品 realpath 逻辑。
- 审计：每次决策写 `tool.decision` JSONL，含 tool/args keys/decision/reason，不含文件内容或 Key。
- 失败关闭：sidecar 不可达时 `ask`/deny，不允许静默放行。

## 6. 验收标准

1. 决策函数单测与现有 40 项测试全绿；`execute` 行为无回归。
2. AgentDojo 6 任务 × 2 注入 × 四档可复现；结果同时记录 Python 门与 sidecar 的决策差异。
3. 决策差异可解释：路径、规则、delegate、ask 来源。
4. 容器无法读取宿主项目、Key 或非 fixture 路径；网络只到 sidecar。
5. 能力卡明确“规则真实、执行 synthetic、UI 未接入”。

## 7. 风险与不做的理由

- 直接做执行桥会把宿主文件系统暴露给基准工具调用，违反当前“评估容器不挂宿主仓库”的硬边界。
- AgentDojo 工具（`send_email`/`share_file`/`create_calendar_event`）没有产品等价工具，执行桥只能模拟，保真度提升有限。
- 抽取纯函数会触碰产品核心授权代码，必须先测后改、保持 ADR-012 硬闸；不能在基准运行中改码。

## 8. 结论

- 当前外部基准仍是 Python 门 + synthetic 工具；产品 ToolRegistry 有独立测试证据，但未接入外部 harness。
- 阶段 1 已完成 `decide` 方法抽取与回归测试（2026-11-19）；仍未抽成模块级纯函数。
- 阶段 2 经复核暂不做：synthetic 工具映射会取代产品真实语义，sidecar 测到的是映射层而不是产品行为。
- 阶段 3 执行桥暂不做。
- 因此不更新“真实审批 UI 已接入外部基准”的表述；外部基准继续使用 Python 门。
