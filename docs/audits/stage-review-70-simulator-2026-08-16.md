# Stage Review（补办：e2e 模拟器域 DDD 重构 + #7 换目标重新确认 + #10 清理）

> 复审日期：2026-08-16（补办——用户提醒：此三块变更 push 后漏了双轴复审闭环）
> 复审范围：`ef5681d`（整体审查）之后至 `6358bf0`：
>   - `2603afa` + `3d67990` refactor：e2e 模拟器域 DDD 重构（设计 docs/design/e2e-simulator-domain-design.md；领域层 e2e-sim/*.mjs 5 模块 + L1 44 用例；StageMachine→JourneyRunner）
>   - `6358bf0` feat(#7)：换目标重新确认（ADR-006——领域层 + renderer 渲染守卫 + L1/L3）
>   - `cad9bca` chore(#10)：死 filesApproved mock 清理 + Landing/PH 草稿
> 复审方式：父会话双轴（Spec 轴对照 ADR-006/设计文档；Standards 轴单源/纯函数/守卫一致）
> 结论：**无 open（1 观察项 recorded）**

## Spec 轴

| 裁定/断言 | 证据 | 判定 |
|-----------|------|------|
| ADR-006 ① goal 已确认后新目标提议 → goal 决策点 | conversationState.ts deriveDecisionPoint 去 `!goalConfirmed`；L1 断言 | ✅ |
| ADR-006 ② 确认=新任务边界清理 | userConfirmed('goal') 既有语义（清进度/清单/达成——L1 断言锁定）| ✅ |
| ADR-006 ③ 拒绝=回澄清（安全——不误推进） | userRejected('goal') → goalConfirmed=false；领域层 plan/completion 分支 `goalConfirmed &&` 前置 → 拒绝后只有 goal 提议可触发——**安全回澄清**（模型必须重新提议目标）；L1 断言 | ✅ |
| ADR-006 ④ 误弹防御 | goalFallback 渲染仍 `!goalConfirmed` 前置（兜底卡不误触发）；#7-2 锁定「无标记不弹」 | ✅ |
| ADR-006 ⑤ 触发权在系统 | 渲染条件仅去守卫——模型只能提议（setPending 由领域派生）——确认动作在用户按钮 | ✅ |
| e2e 设计（8 节）兑现 | 领域层 5 模块 / JourneyRunner 决策点驱动 / PHASE 终止点映射 / 单源（见 Standards）/ 44 L1 用例 | ✅ |
| #10 清理 | 4 处死 mock 移除 + L3 51 回归 | ✅ |

## Standards 轴

| 规则 | 核查 | 判定 |
|------|------|------|
| 单源（缝隙 4） | e2e：SEM_*/decide/fallback 三实现已收编 signals/decide 单一源——**无残留双实现**（grep 确认仅注释）；#7：领域条件唯一（renderer 无第二份 goal 触发） | ✅ |
| 守卫一致（issue 根因） | #7 的 bug 正是「领域改/渲染守卫没同步」双守卫不同步——已同步 + L3 锁定 | ✅（root cause 已除）|
| 纯函数/IO 分层 | e2e-sim 无 Playwright/网络/fs（L1 可测）；IO 在 SessionDriver/应用层 | ✅ |
| 失败降级 | UserSimulator LLM 失败 → 领域层确定性决策（单一兜底——不引第三实现）| ✅ |
| 收敛语义 | 停滞判定与 waitSettled 语义一致（指纹含工具卡——探索链路不误判；#9 域对象化）| ✅ |
| 测试可验证 | L1 482 / L2 0 错 / L3 51 / lint 0 errors / Prettier | ✅ |

## 风险核查

1. **#7 误弹（真实模型）**：同任务内模型重复输出【目标确认】标记 → 弹卡（换目标语义）——ADR-006 接受（sysPrompt ⑬ 契约「收敛后输出一次」为防线）——但 **L3 mock 无法覆盖真实模型是否会复述标记**——**recorded 观察项**（#6 真机体验时确认）
2. **拒绝换目标 = 回澄清**：已确认目标任务上下文丢失（goalStatement 未记录）——归 V2 会话快照（ADR-006 已注明）——recorded（接受）
3. **e2e 领域层未接产品解析器（planProposalParser）**：signals.mjs 用轻量正则（独立 .mjs 实现——.ts/.mjs 边界）——语义对齐注释 + L1 锁定——recorded（接受——e2e 独立域）◇
4. **SIM 重构后 waitSettled/execute 的 waitNew 链路**：execute 里 choose/answer 后 waitNew 等新回复——与旧实现一致（回归 L3 51 承载）——PASS

## 结论

**无 open——可验收**。#7 语义裁决（ADR-006）忠实落地，亮点是揪出并修复了**领域/渲染双守卫不同步**的根因（正是这类「改了领域忘了渲染」的隐患）；e2e 模拟器域重构单源彻底（三实现归并）+ 领域层 L1 可测；#10 清理干净。1 个 recorded 观察项（真实模型误弹确认——#6 真机时留意）。