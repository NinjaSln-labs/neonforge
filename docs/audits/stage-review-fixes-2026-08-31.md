# 阶段评审报告：#6 修复链 + 调研 + V1.5 立项（41eff19..ca965a3，2026-08-31）

> 双轴评审（code-review skill 阶段末模式）：Standards 轴 + Spec 轴并行。
> 评审范围：13 commit——P1×6/P2 修复链、真机复验轮修复、调研四源、V1.5 立项。
> 质量门基线：L1 522 / L3 51 / 双 tsc / lint / CI（修复链期间多次全绿）。

## Standards 轴

| # | 发现 | 级别 | 状态 |
|---|------|------|------|
| S-1 | 设计文档 §完成对账伪代码注释（L175-177）未随 ADR-008 同步——同协议两处矛盾 | 准硬（文档不同步） | **fixed**（本次同步两处注释） |
| S-2 | 类绝对单段路径（/package.json）trustPath/resolvePath 仍分叉——P1-6 形态残留（注释已声明） | 准硬 | **recorded**（V1.5 协议工具化时路径语义统一重设计；现状两分支各有正确语义） |
| S-3 | planConfirmed 双源镜像（state + main ref）漂移风险：reject('plan') 不复位 | smell→实锤（Spec 轴交叉确认） | **fixed**（本次 reject 同步复位） |
| S-4 | 确认词表双源（sysPrompt vs isConfirmIntent） | smell | **recorded**（已有 sysPromptConfirmWords.test.ts 机器校验兜底） |
| S-5 | ConversationPanel.tsx 膨胀（Divergent Change——同批五类不相关改动） | smell | **recorded**（结构债——V1.5 S2 接线时顺带拆分评估） |
| S-6 | 跨进程镜像裸 boolean（Primitive Obsession 轻） | smell | **recorded**（V1.5 会重设计该通道） |
| S-7 | 遥测 effect 依赖 ref 字段形同虚设（P2-2/P1-3 修复自身可靠性） | 判断题→实锤 | **fixed**（deps 改 stateVersion——异步置位后 version 重渲染补打） |

合规亮点：sandboxPath 纯函数 L1 可测；全改动带日期出处注释；无未登记 Timeline 事件；不变量 2/6/7 未触碰。

## Spec 轴

| # | 发现 | 级别 | 状态 |
|---|------|------|------|
| P-1 | **硬序门结果假成功**：!planConfirmed 时合成结果「文件已批量授权」回给模型（比静默忽略误导）；commit 声明的「main policy 分支」在流式路径不可达（approve-files 被渲染层跳过执行） | 硬伤 | **fixed**（合成结果改为引导拒绝文本——main policy 分支保留为防御纵深并修正注释） |
| P-2 | reject('plan') 不复位 main 镜像——方案拒后硬序门仍开 | 硬伤 | **fixed**（reject 同步 setPlanConfirmed(false)） |
| P-3 | P2-4 只做词表半边：对账失败时对用户的提示侧未做（吊死循环提示缺失） | 半做 | **open**（入 audit-items——随 V1.5 S2 对账 UI 一并做） |
| P-4 | P2-3 半做：前缀标记非原修向（system 角色/专用 UI） | 半做 | **recorded**（代码已自注归 V2 会话快照） |
| P-5 | syncPlanConfirmed/policy 分支无 L1/L3 测试 | 缺口 | **open**（随 V1.5 S1 乱序矩阵测试一并覆盖——该门即将被协议工具化重构吸收） |
| P-6 | sysPrompt ⑬「子步骤不重开目标确认」超出 findings 声明范围 | scope creep | **recorded**（复验轮真实需要——映射表已更新挂 P2-6 引导项） |
| P-7 | HANDOFF「P2×5 已全修」与实际不符（实修 7 项含半做、P2-1 暂缓） | 文档过称 | **fixed**（HANDOFF 本次更正） |
| P-8 | P1-1/P1-2/P1-4/P1-5/P1-6/2fcb641 与声明相符（含 addTrust/addTrust 边界/正则/回搜复用/候选制逐项核实） | — | ✅ 通过 |

## 汇总

- Standards：7 findings——fixed 3 / recorded 4 / open 0
- Spec：8 findings——fixed 3 / open 2 / recorded 3
- **open 项（2）**：P-3 对账失败用户提示、P-5 syncPlanConfirmed 测试缺口 → `audit-items` 入账
- 最重问题：P-1（硬序门假成功——本次已修）；S-7（遥测依赖失效——本次已修）

## 修复证据（本评审当场修）

- 硬序门结果文本 + reject 同步：本次 commit（见 git log）
- 设计文档伪代码同步：本次 commit
- 遥测 deps：本次 commit
- 全量回归：L1/L3/tsc/lint 见本次 commit 前跑（修复后重跑记录于 commit message）
