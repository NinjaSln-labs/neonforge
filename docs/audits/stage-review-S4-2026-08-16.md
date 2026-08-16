# Stage Review S4（完成证据对账）——双轴复审

> 日期：2026-08-16；固定点：`20e2f7f`（S4 唯一 commit）——`git diff 5441f59...HEAD`
> 轴：Standards（仓库标准 HANDOFF-ARCHIVE/pits.md 坑 54/93/97/100/103 + ADR-004 + Fowler smell 基线）× Spec（docs/design/stage-specs/S4.md DoD + TDD 网格）
> 方式：并行双 subagent（Standards 7bf5a8ce / Spec e491ea0c）→ 状态化清单（open/fixed/recorded）

## Standards 轴

### S1. [fixed] runVerificationCommands 与 tools.ts spawn 重复 + 进程组安全回归（硬违规——坑 54）

- **发现**：`verification.ts::runOne` 另起 spawn+超时+截断管道，未继承 `spawn(detached)` 进程组——`&`/nohup 后台验证命令成孤儿（坑 54「退出路径全覆盖 + killTree 进程组」回归）；S4 spec TDD 网格明示「复用 tools.ts spawn 模式」但未落实
- **修复**：`runOne` 加 `detached: true`（新进程组）+ `process.kill(-pid, 'SIGKILL')` 杀整组（超时/结束统一路径）——与 tools.ts bash 执行同模式
- **回归证据**：L1 integration 7 用例（真实命令代跑）+ L3 S4 四场景 + 双 tsc 全绿

### S2. [fixed] S4-1a 假绿风险（waitForTimeout 固定 sleep + chatCount===5 硬编码）（硬违规——坑 53/99）

- **发现**：`waitForTimeout(2000)` +「已解决 count 0」只证明 2s 窗口；chatCount===5 依赖空 defaultRound 恰好一轮——注释自认「窗口太窄」
- **修复**：结构性保证（脚本无后续轮次 → 卡恒不出现）+ chatCount 断言语义升级为**引导护栏验证**（脚本追加第二轮不足声明 → 断言 chatCount 停 5——护栏生效而非巧合）
- **回归证据**：S4-1a 重跑绿

### S3. [fixed] 回填引导死循环风险（潜在——坑 103 同构）

- **发现**：verifyThenResolve else 分支引导 send 无上限——模型持续输出不足声明 → 无限引导循环（S4-1a 用无 defaultRound 脚本掩盖，非真实模型路径）
- **修复**：`evidenceGuideCountRef` 连续引导计数——≥2 次证据不足不再自动 send（证据通过时计数重置）；引导消息已注入一次用户可见，超限停自动引导
- **回归证据**：S4-1a（第二次不足声明 chatCount 停 5）+ S4-1b/S4-3（第二次完整声明通过后弹卡——计数重置路径）重跑绿

### S4. [recorded] completion domain 与 proposal domain 语义趋同（判断项）

- **观察**：`completion.evidence_missing` 登记 `domain:'completion'`——与 `proposal.*`（domain 'proposal'）type 前缀/domain 维度语义重叠；单文件单用途、与既有 schema 模式一致——记录观察不修（设计 §3.5 明示 completion.* 独立域；S6 gate.denied 登记时统一审视）

### S5. [recorded] SystemVerifier 桥接绕（判断项）

- **观察**：plannedFiles/producedFiles 由 renderer 快照注入、deriveDiffs 经接口间接传入——功能正确（领域单源非双源），字段够但桥接绕——记录观察不修（ADR-004 裁定 IO 归应用层的必要形态）

**复核通过**：verifyThenResolve 与 ADR-004 边界正确（IO 应用层 + 快照进纯函数 + ref 重查防竞态——坑 93/97）；deriveDiffs 领域层单源复用；buildEvidenceBackfill 与 verifyCompletion 解耦；事件登记一致性

## Spec 轴

### P1. [fixed] A-010 审计项未入账 fixed（硬缺口——DoD「审计状态：A-010 fixed」）

- **发现**：commit 交付了关闭证据（integration 测试），但审计项文件 `010-s4-v1a-integration-test.md` 与 README 索引仍 open——关闭未入账
- **修复**：审计项更新 fixed（commit 20e2f7f + 回归测试 + 关闭证据）+ README 索引同步
- **回归证据**：台账核对

### P2. [recorded] V1b 测试文件位置偏离 spec TDD 网格（轻度）

- **发现**：spec 网格写「verifyCompletionSystem.test.ts 扩展」，实际 deriveDiffs 单测在 integration 测试文件
- **裁决**：deriveDiffs 单测与 A-010 闭环同文件聚集（同一系统核验主题）——合理；spec 网格已同步修正（记录不修）

**核对通过**：5 条行为验收子断言全部真实落地（ok=true 置决策点 / ok=false 不置决策点 / systemState 缺省纯逻辑 S1 兼容 / V1a 被 renderer 消费（L3 S4-2 verifyCount 断言锁定）/ evidence_missing 打点 + 引导闭环）；无蔓延（S6 边界 classifyReadonly/preApproval/actionGate/tools.ts 未触碰；未新增 ADR；未做 L4/L5；未登记 gate.denied）；L1 396 + L3 40/40 + 双 tsc 0 错 + CI 绿（run 31939544026）

## 汇总

- Standards：5 发现（3 fixed / 2 recorded）——最重 S1（进程组安全回归）
- Spec：2 发现（1 fixed / 1 recorded）——最重 P1（A-010 入账遗漏）
- 本阶段无 open 项——S4 复审闭环完成
