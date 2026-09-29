# 011 — 成功＝领域命题成立（非外壳返回）

- Status: accepted
- Date: 2026-09-29（Mac 四档/人格 timeout RCA：V1a 退出码、工具 data.ok、探活≠检索）
- 相关：`docs/design/intent-confirmation-domain-design.md` §3.3 V1a / §7.1 拍板 4；ADR-003（修订其「unverifiable 阻塞 resolution」条款，公共谓词仍单源）；ADR-004；p000128（本条属「设计正文与实现/后审计条款冲突」的收口，不是为绿改门）

## Context

UAT 交付已发生仍 timeout。根因不是门太严，是 **「成功」被定义成调用返回/进程结束**，规格要的是命题为真：

- V1a 写「核对输出」，实现只认 `exit code === 0`（`grep -c` 零命中 POSIX 退出 1）
- 拍板 4：unverifiable **仅标注、不禁止**；ADR-003 为消双源改成 **unverifiable → 不进 resolution**
- `Tool.execute` 返回 `unknown`，外网工具把 `{ok:false}` 放进 data，Registry 恒 `ok:true`
- 「允许外网」探 `example.com`，搜索走 DDG；Chat `fetch failed` 自动重试只在 `planConfirmed`

## Decision

1. **V1a `verificationResults[].ok`**：以代跑 **stdout 与 claim 声明的 output 对账** 为主（规格「核对输出」）。退出码 0 仍为通过；退出码非 0 时若 stdout 非空且与声明 output 可对齐（声明包含 stdout 去空白，或相反）则通过。禁止用「进程失败」单独否决否定性证据（`grep -c`→`0`）。
2. **unverifiable（修订 ADR-003 阻塞条款，恢复拍板 4）**：清单仍打点、解决卡仍提示「未经系统核验」。`ok` **不**因存在 unverifiable 而为 false。Inv4 底线：verification 非空，且 **至少一条** `isSystemVerifiable` 的命令 V1a 通过对账；若全部不可代跑 → `ok=false`（无系统证据，不是「禁止写 node -e」）。
3. **`evidenceVerifiable` / `completionEvidenceComplete` / `verifyCompletion.ok` 仍单源**，谓词改为第 2 条，禁止再分叉。
4. **工具外壳**：`ToolRegistry.execute` 若 `data` 形如 `{ ok: false, error? }`，外层 `ok` 必须为 false（失败进 `tool.failed` 与模型 rawResult）。不改 `Promise<unknown>` 注册面。
5. **「允许外网检索」**：无覆盖端点时，探活须覆盖 **实际搜索路径**（与 `web_search` 同源失败则不可显示已开启）。不装能。
6. **service 自动续跑一次**：用户已确认 **goal 或 plan** 且 `pending=none` 即可（不限 `planConfirmed`）。澄清未确认仍不自动。
7. **不在本决策**：不放宽 `verifyCompletion` 空 verification；不改 StuckDetector；不 force `propose_goal`；不删证据门。

落实：领域 `conversationState` + main `verification.ts` / `tools.ts` / web 探活 + `finishError`；harness：`rejectPlan>0` 禁止确认执行捷径。回填文案禁止示例 `node -e`（与只读头不一致）。

## Consequences

- 正面：T1 类「无外链」证据可过；混合 `node -e` 不再单独卡死已解决；检索失败对模型/时间线诚实；goal 后 `fetch failed` 可续一次。
- 负面：仅 unverifiable、零可代跑命令的声明仍进不了对账（有意）。stdout 对齐启发式过宽时可能误过——对账用「包含关系」保持严于「忽略输出只看退出码」。
- 后续：L1 补 `grep -c` 零命中；Registry 内层失败；Mac 复跑 t000057 所指 timeout 档。
