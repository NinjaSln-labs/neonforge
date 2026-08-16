# Stage Review D3（PlannedFiles 下沉 main——双轴复审）

> 复审日期：2026-08-16（D3 阶段末）
> 复审范围：`b6e30ff..5dcc98f`（9633fb6 feat / 2358f69 test / 5dcc98f docs）
> 复审方式：父会话双轴复审（Spec 轴对照 stage-specs/D3.md DoD + ADR-005 裁定；Standards 轴对照仓库规范）——subagent 复审中断后由父会话完成（subagent 已确认 L3 49/49）
> 结论：**无 open——2 fixed（含 1 合理蔓延修复）3 recorded**

## Spec 轴（对照 DoD 8 项 + ADR-005 5 条）

| DoD 断言（D3 spec） | 证据 | 判定 |
|---------------------|------|------|
| L1 全量绿（新增 ≥10） | `npx vitest run` **434/434**（新增 13：plannedFilesStore 12 + tools D3 门控 1） | PASS |
| L2 双 tsc 0 错 | tsc tsconfig.json + tsconfig.main.json **0 错**（preload types 契约、无悬挂引用） | PASS |
| L3 交互回归 ≥47 + 新场景 | `npx playwright test --project=interaction` **49/49**（D3-1 恢复接线/D3-2 任务边界重置 + S7-1 flaky 修复） | PASS |
| Lint 门禁 | `npx eslint .` 0 errors（6 既有 warnings——非 D3 引入，行号 298/578/591/613/618/1790 均不在改动区）；`npm run format:check` 全过 | PASS |
| 行为验收：store 落盘持久化 | plannedFilesStore.test.ts 12 用例（追加幂等/reset/损坏容错/approved 联动/路径注入/跨重启往返） | PASS |
| 行为验收：IPC 契约三件套 | ipc.ts planned-files:load/add/reset + preload 类型化 + tools:files-approved/-reset 移除（renderer 消费全切换） | PASS |
| 行为验收：renderer 批准写走 IPC | approvePlan → plannedFiles.add（L3 D3-1——add 恰一次 + 清单内 write 自动 done）；clearTrust → planned-files:reset（L3 D3-2）；方案块并入不同步（ADR-005 同步边界——recorded 3） | PASS |
| 行为验收：启动恢复 | 挂载 load → restorePlanned（无 emit——时间线不污染；StrictMode 双挂载 ≥1 已适配）| PASS |
| 行为验收：tools.ts 门控一致 | registerIpc syncPlanApprovedFromStore + L1 tools D3 用例（恢复 approved → 规划引导放行、needApproval 判定保留——门控语义正确：恢复 ≠ 授权放行） | PASS |
| 行为验收：三基准统一（未修 1） | plannedComplete 绝对路径断言回归 + store 不加工路径（变换归调用方 trustPath）；force_input 打点保留 | PASS |
| 审计状态/决策日志 | 覆盖矩阵表 8 更新；ADR-005 落库（000 索引登记） | PASS |
| 已 push + CI 绿 | **qa.yml run 31953219423 success**（含 L5 视觉 36——D3 无视觉改动基线未崩） | PASS |

ADR-005 5 条裁定：① 权威=main（PlannedFilesStore 落盘 userData）✓ ② 跨重启恢复（store 持久化 + 恢复窗口语义澄清——目标确认=任务边界铁律）✓ ③ IPC 三件套 ✓ ④ filesApprovedRef store 驱动 ✓ ⑤ 三基准统一 ✓

边界（防蔓延）：producedFiles 未下沉 ✓；ITaskRepository 全量快照未做 ✓；approve-files 工具语义未动 ✓；L4/L5 未跑但 CI 全链绿（L5 36）✓

## Standards 轴

| 规则 | 核查 | 判定 |
|------|------|------|
| 领域层纯函数（IO 归应用层） | PlannedFilesStore 属 main 应用层（fs 落盘）；领域层 conversationState 未引 store——纯函数保持（L1 433 不变量测试不受影响） | PASS |
| 单源原则（缝隙 4） | store=唯一落盘权威；renderer 镜像只读同步；filesApprovedRef=main 门控镜像（write 门控热路径不读盘）——无第二权威 | PASS |
| 奇数风险防御 | planned-files:add 输入 Array.isArray 防御；store 0600 权限；损坏 JSON 容错（configStore 模式） | PASS |
| 失败策略一致 | IPC 同步失败忽略（镜像优先）——与 localStorage 断点续做同策略（ADR-005 明确） | PASS |
| 可测性 | 类构造注入路径（无 electron 依赖——vitest node 可跑）；单例惰性化（instance 文件——vitest 不触 app.getPath） | PASS |
| 防双源 | spec/ADR/覆盖矩阵引用不复制 HANDOFF 内容；HANDOFF 只引用 ADR 编号 | PASS |

## 发现清单

- **[fixed, minor] S7-1 既有 flaky**（`cards-from-decision-content.interaction.ts:480`）：模型重提议延迟（默认 50ms）< Playwright 轮询间隔——「卡消失」窗口被压缩，断言等到的已是重提议后的卡（D3 回归首跑暴露——stash 自测确认非 D3 引入）。修复：streamDelay 300 拉长窗口 + 注释标明。**合理蔓延修复**（回归时暴露的既有问题，规整稳定）。
- **[fixed, minor] D3-2 场景多轮竞态**（`cards-from-decision-content.interaction.ts:607`）：write done 后 maybeContinue 自动续聊抢占用户驱动轮次 + goalConfirmed=true 时 goal 提议不弹卡（既有二确认语义）——场景简化为「目标确认 → reset 同步」独立验证（批准链由 D3-1 承载）。**简化保真**（核心断言未削弱）。
- **[recorded] D3-1 的 load 计数 StricMode 双挂载**（`cards-from-decision-content.interaction.ts:590`）：React 19 dev StrictMode 下 useEffect 双执行——load 断言用 ≥1（恢复接线发生即可），add 断言恰一次（事件处理器无双调）。记录原因 + 断言语义正确。
- **[recorded] 批准链 add fire-and-forget**（`useToolApproval.ts:230`）：`void …plannedFiles?.add(...)`——失败忽略（镜像优先——grantPlan 先行更新领域态）。与 localStorage 断点续做同策略（ADR-005 明确）——设计内，非缺陷。
- **[recorded] core.interaction.ts 局部 bridge 残留 filesApproved mock**（`:1607/1714/1821/1947`）：自定义 bridge 旧字段——renderer 已全切换（`?.` 安全），死代码无害。清理项（非阻断——下阶段顺手清）。
- **[recorded, 观察项] goal 二确认 UI**（`conversationState.ts:544` + `ConversationPanel.tsx:781`）：goalConfirmed=true 时模型输出【目标确认】不弹卡（领域层第 1 条 `!state.goalConfirmed`）——换目标流程当前无确认卡（用户打字直接换目标）。**属既有设计域（非 D3 范围）**——D3-2 简化过程中暴露——记录为观察项（V2 会话快照/任务切换设计时统一评估）。

## 结论

**无 open——可验收**。D3 实现忠实满足 spec DoD 8 项 + ADR-005 5 条裁定；Standards 轴无硬违规；边界未蔓延；CI 绿（run 31953219423）。3 recorded 项后续处理：核心清理（core.interaction.ts 死 mock）随手清；goal 二确认 UI 观察项 V2 评估。