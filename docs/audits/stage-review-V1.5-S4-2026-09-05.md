# 阶段评审报告：V1.5-S4 解析层退役 + 测试迁移 + 收尾（efe417f..81266bf，2026-09-05）

> 双轴评审（code-review 阶段末模式）。质量门：L1 561 / L3 66（T0 自测 4/4 恢复 + S3-4/S4-3b 新增）/ 双 tsc / lint 0 errors / CI run 33970076555 绿。
> 固定点：487daf4（S3 收口 commit）→ HEAD 81266bf。评审对象 = S4 七个 commit：
> efe417f（4.1 grep 清零）/ 3a4cb7e（4.4 A-015）/ 7a85930（4.2 T0 恢复）/ 8cc5108（4.5 ⑧ 清理）/ 5d859a4（4.6 ask_user 按钮化）/ 1b778e4（4.3 表 9）/ 81266bf（本次评审修复）。

## Standards 轴

| # | 发现 | 级别 | 状态 |
|---|------|------|------|
| S4-St-1 | ask_user 选项按钮块与既有 candidates 块重复（NUMS 常量两份 / replied 判定重复 / .nf-candidates 结构重复）——建议提取共享 CandidateButtons 组件 | 轻微 | **open** → audit-item A-019（组件提取涉渲染回归——S5 前收口） |
| S4-St-2 | 同 hunk 内 `tc.args.options` 断言转型出现两次（label/description 缺命名类型） | 轻微 | **recorded**（随 S4-St-1 组件提取一并消除） |
| S4-St-3 | ConversationPanel.tsx 3100+ 行、本轮因 4 个不相关原因被改（Divergent Change 长期信号） | 轻微 | **recorded**（结构性拆分超出阶段范围——组件化方向已有先例 useToolApproval/useConversationState） |
| S4-St-4 | 测试断言放宽（forceToolCalls[2]→includes / chatCount===4→≥4 / done 卡 toHaveCount(1)→first visible）——StrictMode 双发使 send 序号漂移，均附坑 32 注释 | 轻微 | **recorded**（manualEmit 重写属 S3 约定的可靠形态；语义断言保留） |
| S4-St-5 | ADR-009 一致性：文本标记降为兜底 / 协议工具主通道 / UI 不退场——6 commit 全部符合；注释惯例（中文+日期+来源）遵守 | — | ✅ |

## Spec 轴

| # | 发现 | 级别 | 状态 |
|---|------|------|------|
| S4-Sp-1 | S4-3b（状态栏提示 L3 场景）在 commit 3a4cb7e 中缺失——开发中途隔离实验 `git checkout` 还原测试文件后未重新加回 | 可能（DoD gap） | **fixed**（81266bf——场景补回 + 回归 3×66 全绿） |
| S4-Sp-2 | A-015 提示文案语义矛盾：「正在要求搭档补充证据（不再自动重试）」——该分支实际已停止自动 send，前半句与行为不符 | 轻微 | **fixed**（81266bf——改为「已停止自动补充证据，可手动继续对话（或核对证据后重新提交完成声明）」） |
| S4-Sp-3 | audit-items A-015 证据行引用 S4-3b（当时不存在） | 轻微 | **fixed**（随 S4-Sp-1 补回后证据成立——本报告入库同步修正 A-015 证据文本） |
| S4-Sp-4 | T0 自测 1/3 未按计划「streamDelay 调参 + 保持断言不变」，而是 manualEmit 可靠形态重写（计划自身允许的回退路径——S3 评审 S3-St-4 约定「用 mockBridge 可靠形态重写」） | 实现偏差 | **recorded**（探针实证：脚本轮次下 auto-continue 与协议 pending 置位存在边缘竞态（轮次被静默 send 抢占——S3-St-4/坑 112 根因），streamDelay 调参 100/300/800ms 均不能消除；manualEmit + chatCount 对齐为确定性形态。语义（forceTool/approved 捕获 + 清单内 write 放行 + P2 双卡）全部保留，4/4 ×3 回归全绿） |
| S4-Sp-5 | DoD 逐条核对：4.1 grep 清零（9 处退役标注——✅）/ 4.2 T0 4/4（manualEmit 形态——✅）/ 4.3 表 9（✅——断言锚点 grep 实证：protocolTools 63 处 / L3 卡渲染 11 处）/ 4.4 A-015 双通道提示 + A-016 审计状态（✅）/ 4.5 ⑧ 清理（✅）/ 4.6 ask_user 按钮化（✅——L3 S3-4 点选/备选/已回应态） | — | ✅ |
| S4-Sp-6 | 范围纪律：ask_user「已回应禁用态」（messages.slice(i+1) 推导）超出计划代码骨架（`const done = false` 占位）——对齐 candidates 既有语义的合理增强 | — | ✅（轻微 scope creep，已声明） |
| S4-Sp-7 | stage-spec「scenarios 工具化」已于 S3（6e4f5f3）先行完成，本阶段不重复涉及 | — | ✅ |

## 汇总

- **Standards**：fixed 0 / recorded 3 / open 1（S4-St-1 → A-019）/ 无硬违规
- **Spec**：fixed 3（S4-Sp-1/2/3）/ recorded 2 / open 0
- 质量门终态：L1 561 / L3 66 / 双 tsc 0 错 / ESLint 0 errors / Prettier / CI 待本次 push 确认
