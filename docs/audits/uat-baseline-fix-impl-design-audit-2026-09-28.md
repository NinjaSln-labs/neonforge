# UAT 基线修复 · 实现/设计审计

> 审计日：2026-09-28 · 范围：plan Tasks A–E 相对工作树实现（与实现会话隔离）  
> 门槛权威：`.handoff/decisions/d000002.md`、`.handoff/pitfalls/uat.jsonl` p000128 · 方案宣称零设计改动  
> 产品/领域对照：`docs/product/00-product-design.md`、`docs/domain/00-domain-authority.md`、`docs/design/intent-confirmation-domain-design.md`（verifyCompletion / 证据回填）  
> r3（`.handoff/status`）：boundary=PASS；impatient/picky/web=FAIL（timeout，红线 0）；web 已点到确认执行+webTool；impatient 无 deadlock

## 结论（一段）

本轮 A–E **没有**动 `verifyCompletion` / unverifiable 阻塞 / G-web 任务语义，相对 d000002「零设计改动」主声称**大体成立**；但存在多处「为绿 / 省事」的**实现与 harness 便宜**：证据静默引导从旧实现的实质 1 次扩到 2（unverifiable-only 3）却文案宣称「仍 2」；deadlock 判定从「同 reason 相邻无工具即死锁」放宽到 streak≥3，并额外把 `tool.executed` 算作打断；timeline 空读 `catch→[]` 可吞掉读路径失败；interaction 未覆盖「第二次 service 不再自动」。r3 三人格仍 timeout → **模块修复未收敛**，属实现/协作仍缺，**未达**设计动刀门槛（无「门/任务必然死胡同」新硬证据）。同工作树另有 ADR-010 多源 provider 设计文档改动，勿与 UAT A–E「零设计」混读。

## 便宜清单（有则条列；无则写「未发现」）——每条：现象 / 证据路径 / 便宜类型（实现捷径|契约漂移|测试松绑|设计该动未裁定）/ 严重度 high|medium|low / 建议（修实现 / recorded 不修 / 先开设计裁定）

1. **证据静默引导次数相对 HEAD 静默加宽，文案伪对齐「仍 2」**  
   - 现象：旧代码 `evidenceGuideCountRef.current++` 后 `current < 2` → 仅第 1 次失败自动引导；新代码 `current <= evidenceGuideMaxAttempts(v)` 且 missing 路径返回 2 → 自动引导最多 2 次，仅 unverifiable 再给到 3。`verifyCompletion` 未改，但回填死循环预算翻倍（+unverifiable 再 +1），注释写「其余仍 2」把阈值数字当成旧行为，掩盖相对 HEAD 的松绑。  
   - 证据：`apps/desktop/src/renderer/ConversationPanel.tsx`（verifyThenResolve 引导分支）；`apps/desktop/src/domain/conversationState.ts` `evidenceGuideMaxAttempts`；`git show HEAD:…ConversationPanel.tsx` 旧 `< 2`；plan Task A 声称「mixed missing 仍 2」。  
   - 类型：契约漂移 + 实现捷径  
   - 严重度：medium  
   - 建议：修实现——若意图仅「unverifiable-only 多一轮」，mixed/missing 应保持旧 ` < 2`（1 次），仅 unverifiable-only 用 3；或显式 recorded「引导预算从 1→2」并改注释，避免伪对齐。

2. **forceTool 死锁断言双重放宽（≥3 + mid 含 tool.executed）**  
   - 现象：旧判定「同 reason 相邻两次 forced 且中间无 `tool.requested`」即记 deadlock；新判定 streak≥3 才 FAIL，且中间有 `tool.executed` 也重置 streak。plan Task E 只写明 ≥3；`tool.executed` 属额外松绑——偶发空执行也能洗掉死锁计数。r3「impatient 无 deadlock」部分可能被断言放宽吸收，而非单靠 A 回填。  
   - 证据：`apps/desktop/scripts-cdp/uat-G-impatient.mjs` `forceToolDeadlocks`；对照 `git show HEAD` 同函数。  
   - 类型：测试松绑  
   - 严重度：medium  
   - 建议：修实现（harness）——保留 ≥3 若已裁定为噪音阈值，但 mid 打断应回到仅 `tool.requested`（或要求「有效工具推进」）；勿用 executed 空转洗死锁。

3. **`readLatestTimeline` 空目录 exit 0 + 笼统 catch→[]**  
   - 现象：空 logs 时 `exit 0`（p000129 / Task D 合理防崩）；但 `execSync` **任意失败**也 `return []`。SSH/权限/路径错时红线在空事件上跑 → `violations=[]` 假绿切片；整人格仍常因 `terminal≠resolved` FAIL，故未单独抬整轮绿率，但削弱失败可观测性。  
   - 证据：`apps/desktop/scripts-cdp/uat-lib.mjs` `readLatestTimeline`；`.handoff/pitfalls/uat.jsonl` p000129。  
   - 类型：测试松绑  
   - 严重度：medium（对红线切片）/ low（对整人格 PASS，因仍要 resolved）  
   - 建议：修实现——区分「文件尚无」与「读命令失败」；后者应记 harness 错误或非 0，勿与空时间线混淆。

4. **B 自动续跑 interaction 验收半截**  
   - 现象：有「plan 确认后首击 service → 自动续跑成功」；plan Done when 要求「第二次 service 不再自动、按钮仍在」未测。闸门 `autoRetriedServiceRef` 存在，但缺回归锁。  
   - 证据：`apps/desktop/tests/interaction/retry.interaction.ts`；plan Task B 验证条。  
   - 类型：测试松绑（半接线验收）  
   - 严重度：low  
   - 建议：修实现——补第二条 interaction（第二次 service → 仍见「重试」、用户消息仍 1、无第二击自动成功）。

5. **UAT autopilot 用 `force: true` 点「确认执行」+ idle `nudge-service`**  
   - 现象：goal 后优先 `getByRole(…确认执行).click({ force: true })`；idle 再注入「系统提示：上一轮上游超时…」走产品 silent/system 通道。可推进 web 点卡（r3 已点到），但也可能绕过「卡可见/可点」产品缺陷，并用 harness 文案补偿产品恢复不足。  
   - 证据：`apps/desktop/scripts-cdp/uat-lib.mjs` autopilot goal-后分支与 `nudge-service`；plan Task C「有证据才修幽灵卡」。  
   - 类型：测试松绑 / 实现捷径（harness 代偿）  
   - 严重度：low–medium  
   - 建议：recorded 不修 force 点击若仅为 labels 漏扫兜底；若 r3 仍 timeout 且卡曾不可见，应先用无 force 复现再修产品。nudge-service 与 B 产品 auto-retry 职责重叠——收敛后删或降为诊断。

6. **（非 UAT 便宜，边界注明）同树 ADR-010 设计文档已改**  
   - 现象：`docs/product/00-product-design.md`、`docs/domain/00-domain-authority.md`、`07-api-gateway.md`、ADR-010 等随多源 provider 改写——**不是**为抬 UAT 绿而改证据门/任务，但会使「整仓本轮零设计」表述不严谨。  
   - 证据：上述 docs diff；`docs/decisions/010-multi-provider-deepseek-catalog.md`。  
   - 类型：契约漂移（范围表述）  
   - 严重度：low（对本审计问题 2 的口径澄清）  
   - 建议：recorded——对外说清「UAT A–E 零设计」≠「工作树无任何设计 diff」。

**未发现：** 放宽/删除 `unverifiable` 阻塞 resolution；改 G-web「先调研」任务文案或删 `webToolUsed`；关闭 forceTool / `goal-exec-until-achieved`；吞 key-invalid；为 PASS 改 terminal 判定。

## 与 r3 失败对齐

| 人格 | r3 | A–E 意图 | 审计对齐 |
|------|-----|----------|----------|
| boundary | PASS | 保持 | 无对应便宜抬绿嫌疑；任务/越界探针仍在 |
| impatient | timeout；无 deadlock；红线 0 | A 回填可执行 + E 死锁噪音 | 无 deadlock **不能**单归因 A：E 断言已松。timeout → 仍未 `terminal=resolved`，引导加宽/文案强化**未治本**；更像模型反复非只读证据 + 引导耗尽后停，或推进耗时——**实现仍缺**（更可执行回填、pending flush 实证、耗时外的卡点），**非** verifyCompletion 门错误 |
| picky | timeout | B plan 后一次 service auto-retry | interaction 绿 ≠ Mac 收敛；timeout 说明首击挂以外还有半截写入/后续失败/时长。B 闸门方向对，**治标未完成** |
| web | timeout；已确认执行 + webTool | C 点卡 + 外网开关 | harness 目标部分达成；失败在确认后交付闭环未完成——与「先调研任务设计错误」无关；**禁止**为绿改任务文案 |

横切 D（timeline→userData）：与 r3「timeline 隔离可读」改进一致，属代码疏漏修复，非便宜；须警惕清单条 3 的假空读。

## 是否达设计动刀门槛的新证据（是/否 + 理由）

**否。**

理由：r3 三 FAIL 均为 `terminal=timeout` 且红线 0，伴随「无 deadlock / 已点方案卡 / 已用 webTool」——说明既定契约路径**可部分推进**，失败落在恢复强度、时长与交付闭环，而非「证据只读写门与产品定义冲突」或「先调研任务在设计上必然死胡同」。d000002 / p000128 要求的两类门槛均未出现新硬证据；后续应继续模块/代码/harness（收紧清单条 1–3 的便宜、补齐 B 验收、查 picky/web 确认后半程），**不要**借 timeout 开 verifyCompletion / G-web 任务设计变更。
