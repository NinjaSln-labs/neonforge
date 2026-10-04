# 第十二轴三向并行审计：干净版修订定稿（β 修法）

日期: 2026-10-02 ｜ 被审物: `docs/design/domain-model-amendment-decision-point-instance-2026-10-02.md`（final 规范文本）
方法: 三独立 agent 并行——①领域设计符合轴 ②根因对抗击穿轴 ③施工单可落地轴。结论汇总后修已直接应用于定稿/计划/ADR-015（本文件保原始发现）。

## 总判定

- **轴一（设计符合）：GO-with-fixes**——提案转写忠实；不变量 2 未破（activeDescriptor 显式状态+纯判等）；"含 passed"判**必要防御非死重**（conversationState.ts:41 `passed?` 可选、verifyCompletion 只计 `passed===false`:741、undefined-passed 弱证据卡可弹 ConversationPanel:780-793——undefined→true 重呈现仅 passed 字段可区分）。
- **轴二（击穿）：命门闭合，但揪出 1 真穿透（P2）**——β 原始根因（同 kind 续提议 A→B + 迟到"行"）在领域门上确认关死；攻击序列 2/4/5/7（迁移面/任务边界/approval 重开/system_clarify）均闭合。**穿透＝useConversationState.ts:60-67 `confirm('plan')` wrapper 在 transition 后无条件执行 main 镜像 `setPlanConfirmed(true)`——门 no-op（prev===next，领域未推进）时 main planConfirmedRef 仍翻真 → approve-files 硬序门（tools.ts:615）打开**。门关住了领域面，镜像从门旁漏出去。
- **轴三（施工单）：修后可落**——三处"落稿即坏"（A2 区间含推翻/继承清单会静默丢段；B1"两处"实为 1 处；B1 缺"存在活 pending"限定与"none 跳门"自相矛盾＝单源反成错源）＋引用漂移（A3 引实现计划、行号 :217 歧义）。

## 原始发现清单（修前编号，修后见下节）

**blocking→已修**
- P2 main 镜像旁路（轴二①）→ 计划 T3 新增"镜像仅随转换真生效"。
- B1 措辞源缺 pending 限定（轴三 3）→ 定稿 B1 补。
- A2 静默丢段（轴一 4／轴三 1）→ 落位表改"仅替代码块 :54-75，:77-81 保留＋追加"。

**major→已裁定并修**
- approvalDecided 进门 vs 提案 §3"本批不强求"（轴一 1）：裁定＝**兼容**——门随 `answers` 在场才生效；本批 approval 面拒绝按钮接门、allow/文本批准天然无 answers＝旁路（提案 §3＋t000073），定稿加注选边依据。
- `answers` 缺省跳门与不变量 1 无条件措辞矛盾（轴一 2）：裁定＝**领域法律必填、缺省是迁移期实现豁免**——A3 措辞明写"非领域语义，T4 零缺省审计后收紧"；A5/B1 保持无条件。
- A3"拒时⇒发 stale 事件"纯函数不可实现（轴二②）：措辞下移——域门＝静默 no-op 兜底；事件+可见重提示＝应用层调用前前置探测义务。
- X6 不彻底（轴一 3／轴三 7）：02/04:14,56,91/coverage-matrix:11 旧"唯一输入"措辞列进落位表 D 行（改引编号）。

**minor→已修**
- kind 槽枚举漏 system_clarify（沿袭原稿 :61 缺陷、定稿内部矛盾）→ 加注"委派槽（ADR-010 强制卡），非四类原生 kind"。
- :250 承载映射行同步（Inv1 承载＝身份门+setPending）→ 落位表补。
- "见实现计划 T3"→ 改引 ADR-015 #4；":217"→ 去行号引 §。
- A4 stale 事件补 union+SPEC 双写义务注（timeline.ts:116）＋014#6 `wantEpoch/curEpoch` 术语作废指针。
- 四文档分叉：ADR-015 #7 补 `passed`、#6 restorePending 补 activeDescriptor。
- C1 行宽收短。

## 存留（明示，不再修）
- 队列宽度 1（pendingSendRef 覆盖丢文）＝既有独立缺陷，计划明示不做（p 系列坑）。
- 回声 none 窗形态：门救不了（入队时 pending 已 none→无 answers→C2 reject 分支误拒），**唯一解＝opts.echo 旁路（T3.3 已排）**——T3.3 前该形态 β 仍活，修批内完成。
- approval allow/文本批准绕过＝t000073 另批（已裁）。
- stale 文本仍推 T2 计数（noteUserTextReply 直写 :2488）＝十一轴 D 已裁"梯度兜住"，有意不改。
- 旧强制卡 `confirm('system_clarify')` 委派 goal 不触发 main 镜像 goal 复位（wrapper 只认 point==='goal'）＝既有坑，与 β 正交，另记。

> 修复应用对象：定稿（重写落位表+A3/A4/B1/C1+加注）、计划 T1/T3、ADR-015 两条勘误。轴二对未修前的版本成立——修后镜像旁路封堵进计划，实现批须验证（L3 新增镜像联动断言）。
