# ADR-008: 遗留问题不阻塞完成对账（S4 证据语义修订）

## Status

Accepted（2026-08-30）

## Context

#6 真机体验第二轮（2026-08-30，番茄钟任务全流程取证 `.scratch/neonforge-v1/real-device-findings-20260830.md` P1-1）实测发现 S4 完成对账结构性死锁：

- 不变量 4 原文：「verification 空或 pendingQuestions 非空 → 不进入 resolution 决策点」
- sysPrompt ⑮ 要求模型【已达成】必须带「遗留问题：」节（无则「- 无」）
- 两者复合：诚实列遗留的声明**永不可达**已解决卡。真机三轮【已达成】全部被 `completion.evidence_missing` 拒绝——含遗留问题为真实用户决策项（「要不要自动循环」）的声明
- 同轮取证另发现解析缺陷：「- 无」（规定的空标记）被解析成名为「无」的 pending question；验证证据「- 命令（中文结果）」格式系统代跑时整串执行（非法 shell）恒失败

## Decision

1. **pendingQuestions 不再阻塞对账**（不变量 4 修订）：blockers 收窄为 verification 空 / passed=false / 存在 unverifiable。遗留问题是「呈给用户的知情项」，由解决卡显式呈现（渲染层列出），用户知情决策——符合 D0 用户主权定位
2. **解析器**：「- 无/暂无/没有/none」空标记不入 pendingQuestions；验证证据命令剥离任意尾随括号注释（全/半角）作为结果文本，passed 从结果文本判定
3. **passed=false 仍判不通过**（语义保留：失败的验证=达成未证明；诚实模型应把失败检查移入遗留问题/说明节——回填引导文本已明确此路径）
4. 回填引导文本同步：明示「不确定事项写入遗留问题节（不影响对账）」

## Consequences

- 诚实模型可达已解决：证据全过 + 遗留如实列出 → 卡弹 → 用户看着遗留问题拍板
- 失败的验证仍拒：报喜不报忧的「全过」证据若与系统代跑矛盾仍会被 V1a 复核拦截
- 渲染层解决卡新增遗留问题展示（知情决策的 UI 承载）
- 设计文档 §值对象 Evidence + 不变量 4 已同步修订；L1 测试同步更新

## Evidence

- 真机时间线 `timeline-7405a0d4…jsonl`（Mac）/ `chat-…jsonl`——三轮 evidence_missing 记录
- 取证合集 `.scratch/neonforge-v1/real-device-findings-20260830.md` P1-1
