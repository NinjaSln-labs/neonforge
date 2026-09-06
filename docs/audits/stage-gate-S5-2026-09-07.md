# Stage Gate S5 报告

- 日期：2026-09-07
- spec 路径：docs/design/stage-specs/S5.md（DoD 节全部 10 条主断言 + 5 条行为子断言逐条执行）
- 基线 commit：HEAD 782f278（A-023 修复，已 push origin/main，0 diff）
- 结论：**全绿 ✅**（无 FAIL、无未验证）

## 断言结果

| # | 断言 | 判定 | 证据（本次运行新鲜输出） |
|---|------|------|--------------------------|
| 1 | L1 全量绿（新增 ≥14 条） | PASS | `npx vitest run`：**565 passed (565)**，41 files，exit 0；S5 新增承载：progressGuarantee.test.ts 16 用例（12 S5 新建 + 状态空间迁移 5——见覆盖矩阵表 6）≥ 14 |
| 2 | L2 契约双 tsc 0 错（turnPolicy 移除后无悬挂引用） | PASS | `tsc -p tsconfig.json --noEmit` + `tsc -p tsconfig.main.json --noEmit` 均 0 error；`src/domain/turnPolicy.ts` 已不存在，renderer 仅注释引用（ConversationPanel.tsx:56） |
| 3 | L3 交互 ≥40 全量回归 | PASS | `playwright test --project=interaction`：**66 passed (2.6m)**（含 forceTool 链切换 + S5 新场景 S5-1/S5-2） |
| 4 | Lint 门禁 0 errors + format:check | PASS | `npx eslint .`：0 errors / 6 warnings（既有基线告警）；`npm run format:check`：All matched files use Prettier code style! |
| 5a | decideProgressGuarantee 唯一判定器（吸收 turnPolicy 状态空间；turnPolicy.ts 与 forceToolInput 移除） | PASS | progressGuarantee.test.ts 16/16（定向跑）；turnPolicy.ts 不存在；renderer 无 turnPolicy/forceToolInput 消费（grep 仅注释）；渲染侧调用点 ConversationPanel.tsx:1825-1845（decideProgressGuarantee(stateRef.current,…)——坑 93 ref 读保持） |
| 5b | 推进检测统一（proposed + providedEvidence；「无推进」= 三无） | PASS | agentLoop.ts:38-39 字段 + :157-172 isStructuredProposal/parseCompletionClaim 判定；agentLoop.test.ts evaluateTurnProgress 用例随 L1 全量绿 |
| 5c | StuckDetector 对齐（提议/证据轮重置；纯文本承诺仍不算推进） | PASS | agentLoop.ts:210（artifactProduced/sideEffectSucceeded/proposed/providedEvidence → 推进）；:190- StuckDetector 纯函数；agentLoop.test.ts detectStuck 用例 + L3 S5-1/S5-2 随 L3 全量绿 |
| 5d | renderer 切换（decideProgressGuarantee ref 读 + mode→forceTool 映射 + toolsAvailable 快照） | PASS | ConversationPanel.tsx:1825-1845 渲染调用点（evaluateTurnProgress 组装 turnInput → decideProgressGuarantee）；require-action→true / require-advance·auto→false 映射见 agentLoop 状态机；真机实证：execution.forced detail 带 mode（real-device-s5-20260906.md timeline seq 232/240/451/459） |
| 5e | execution.forced/released 事件语义（detail 带 mode/reason） | PASS | timeline.ts:157 `'execution.forced': { domain:'execution', role:'system', detailKeys:['reason','?mode'] }`；真机 timeline 实测 `{"mode":"require-action","reason":"goal-exec-until-achieved"}` |
| 6 | 审计状态：本阶段 open 项 fixed/recorded；覆盖矩阵已更新 | PASS | audit-items/README.md 索引：A-020/021/022/023 全 fixed（本轮补齐入账——020/021/022 条目文件新建，023 已有）；无 open 项；coverage-matrix.md 表 6 S5 行抽查 3 条与测试一致（progressGuarantee/agentLoop/L3 S5 场景） |
| 7 | 决策日志同步（本阶段裁定 → ADR，如有） | PASS | 本阶段无新增强制 ADR 裁定；V1.5 协议工具链承 ADR-009、目标重确认承 006-goal-reconfirm（plannedFiles 双形态注册规范化为 recorded 候选「建议 ADR」——不阻塞门禁，列 follow-up） |
| 8 | 已 push + CI 绿（qa.yml run） | PASS | `git status -sb` = `## main`（0 commit 差异 origin/main）；CI run 34041650869（head=782f278 fix: A-023…）**success** 3m30s |

## 差异清单（交回开发，不修）

- 无 FAIL / 无未验证。

## recorded 跟随项（不阻塞本门禁——转后续 backlog）

- plannedFiles 双形态注册根因（rootPath 注入时序）——注册侧规范化建议 ADR（A-021 附带）
- verification 证据混入工具调用（×2 真机复现）——sysPrompt + 回填引导约束
- bash mv 不更新 producedFiles——对账合并磁盘快照
- approve-files 卡显示完整落盘路径
- force 轮模型纯文本回应后循环停摆
- 工具路径中文尾巴剥离（工具路径侧）

（全 8 项清单见 `.scratch/neonforge-v1/real-device-s5-20260906.md`「缺陷候选裁决」节）
