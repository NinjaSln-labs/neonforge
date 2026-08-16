# Stage Gate S6 报告（门控双维）

- 日期: 2026-08-16
- spec: docs/design/stage-specs/S6.md（定稿——随 0c7d881 入库，蔓延补记 3ebc4e5）
- 基线: 阶段 commit 0c7d881 + 复审修复 3ebc4e5——实际验证 HEAD 3ebc4e5
- 结论: **全绿 ✅**（CI run 31942369869 success）

## 断言结果

| # | 断言 | 判定 | 证据（新鲜输出） |
|---|------|------|-----------------|
| 1 | L1 全量绿（新增 ≥10 条） | PASS | vitest: **414 passed / 0 failed**（33 文件——新增 11：isSideEffectAction 5 + isLocalhostCommand 3（含子串误报）+ curl 写标志补全 7 + 继承迁移 1——S6-2 旧断言更新） |
| 2 | L2 契约 0 错（classifyAction 移除无悬挂引用） | PASS | 双 tsc 0 errors（renderer 6 处 + main isReadOnlyBash + agentLoop + isProgressing 全切换——零消费） |
| 3 | L3 交互（相关场景重写 + 全量 ≥42） | PASS | playwright interaction: **44 passed**（42 旧 + 2 新 S6 场景——零回归） |
| 4 | 冒烟（四路径——只读自动/清单内自动/越界 ask/高危 deny） | PASS | L3 承载：只读自动 S6-1 + bash 白名单既有；清单内自动 根因3/T0-2；越界 ask S6-2 + write 需授权既有；高危 deny write→回滚既有 |
| 5 | Lint 门禁 | PASS | eslint: 0 errors（6 既有 warnings）；prettier: All matched files |
| 6 | main preApproval 改引用 classifyReadonly（拍板 3 main 侧同步） | PASS | tools.ts isReadOnlyBash 改调 classifyReadonly + isLocalhostCommand（readonly auto/network-read localhost auto/外网非 auto/-O 写副作用 hazardous）+ tools.test.ts 升级断言 |
| 7 | renderer side-effect 判定统一领域层同源（坑 97） | PASS | 6 处 classifyAction === 'side-effect' 全切 isSideEffectAction（readonly/localhost 非副作用/外网与写类副作用）+ agentLoop/isProgressing 同步——classifyAction 兼容壳移除零消费 |
| 8 | 拍板 3 全链（curl localhost 自动/外网 ask） | PASS | L3 S6-1（localhost done 无授权卡）/S6-2（外网 need-approval 弹卡）+ L1 isLocalhostCommand/写标志补全断言（子串误报不自动放行——复审修复） |
| 9 | classifyAction 兼容壳移除 | PASS | conversationState.classifyAction 删除——renderer/main/agentLoop/tests 零活引用（L2 双 tsc 守卫） |
| 10 | 审计状态 | PASS | audit-items：A-001~010 全 fixed；无 open（本阶段无新增审计项——复审 3 fixed 5 recorded 全闭环） |
| 11 | 覆盖矩阵已更新 | PASS | docs/tests/coverage-matrix.md（表 7 S6↔测试 6 行 + 缺口清单） |
| 12 | 决策日志同步 | PASS | 无新语义裁定（拍板 3 已有设计来源——actionGate 策略 S1 已实现，S6 为接线）——无需新 ADR |
| 13 | 已 push + CI 绿 | PASS | 已 push（0c7d881 + 3ebc4e5）；qa.yml run 31942369869 **success** |

## 差异清单（交回开发）

- 无 FAIL。复审闭环已并入本 gate：S6 阶段末双轴复审（docs/audits/stage-review-S6-2026-08-16.md）发现 9 项（Standards 2 fixed：curl 写标志补全（-O/wget -O 写洞——本项目引入回归）+ isLocalhostCommand host 精确匹配（子串误报）；5 recorded；Spec 1 fixed 蔓延补记 + 1 recorded）——全部在 gate 前闭环，无 open。

## 备注

- 红→绿实证：L1 先红 5（isSideEffectAction/isLocalhostCommand 不存在）→ 全绿 414；红阶段 2 处 oracle 修正：S6-2 mock 不模拟 main preApproval（executeResults 伪造 need-approval——UI 层验证 ask 路径——main 判定由 L1 tools.test 锁定——分层明确）+ classifyReadonly curl 分支漏 `-o`（S6 暴露缺口——补全 -O/-T/-a/-C/-J/wget -O 同族标志——复审 S1）
- S6 核心语义落地：**main preApproval 与 renderer 判定同源**（坑 97 缝隙 4 收口——classifyReadonly/isLocalhostCommand 领域单源跨进程共享）+ **拍板 3 全链**（curl localhost 自动放行/外网 ask——安全默认）+ classifyAction 兼容壳终结（S1 起的三阶段演进：classifyAction 壳 → 内部同源 → 直连取代）
- 复审 S4/P2 记录：mock bridge 不接线 main preApproval——「拍板 3 全链」端到端证据 = L1（判定）+ L3（渲染）两层分离——L4 真实 API（S7）时补授权路径端到端
