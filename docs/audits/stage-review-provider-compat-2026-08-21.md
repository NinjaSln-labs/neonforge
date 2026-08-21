# Stage Review：provider 兼容改造实现复审（ADR-007 + tool_choice 恒 auto + reasoning 多源）

- 日期：2026-08-21
- 固定点：cd9d708（provider 切换 commit）之后的工作区实现改动
- 范围：gateway.ts（tool_choice 恒 auto + extractReasoningText 多源）+ ConversationPanel.tsx（注释 + reasoning 回传补缺）+ compact.ts/preload/types（compaction reasoning 保留）+ gatewayReasoning.test.ts（新 8 用例）+ compact.test.ts（+1 用例）+ **e2e-build-check.mjs（坑 44 流程化——`78dfcfe`）**
- 方式：双轴复审（Spec：对照 07 §1.1 / A0 §1 / 调研文档 §7 语义契约；Standards：仓库规范 + smell 基线）+ **reasoning 回传链路全路径审计（续轮发现）**
- 结论：**无 open**——3 fixed（文档措辞同步 + buildHistory 回传补缺 + compaction 回传补缺）+ 1 recorded（forceTool 参数保留）+ **坑 44 流程化复审（1 fixed + 1 recorded）**

---

## 坑 44 流程化复审（`78dfcfe`——2026-08-21）

**Spec 轴**（对照目标：改 main/preload 后 e2e 自动用最新代码）：
- ✅ ensureMainBuild() 检测 dist/main 是否比任一 src/main/*.ts / preload.ts 旧 → 过期自动 `npm run build:main`
- ✅ 三 e2e 脚本（0to1/suite/supplement）入口接入；实测 touch 源码 → 自动 build ✓ / dist 最新 → 幂等无操作 ✓
- ✅ e2e-0to1 PHASE=req 场景 A/B 通过（修复后）
- ✅ 无 scope creep（只加启动前置，不改 e2e 逻辑）

**Standards 轴**：
- **[fixed] 注释漏 e2e-supplement**——「e2e-0to1 / e2e-suite 共用」→ 补「/ e2e-supplement」（实际已接入三脚本，注释更新）
- **[recorded] `execSync` 同步阻塞 + `statSync` 时间戳比较**——e2e 为开发工具，build 仅在过期时触发（`stdio: inherit` 输出可见），时间戳边界（同秒修改漏检）在 e2e 场景可接受（真机失败会重新触发）——裁决不修

---

## 续轮审计发现（reasoning 回传链路全路径——2026-08-21 第 2 轮）

| # | 发现 | 严重度 | 修复 |
|---|------|--------|------|
| 1 | **buildHistory（跨轮历史）assistant 消息不回传 reasoning_content**——工具循环内（L1428）回传、buildHistory 不回传，违反 07 §2「回放统一 reasoning_content」；DeepSeek V4 多轮 thinking 回放缺失可能导致 400（pi #3636）| high | **fixed**——buildHistory 工具轮 + 普通轮均回填 `reasoning_content: m.reasoning ?? ''` + 返回类型补声明 |
| 2 | **compaction 路径丢弃 reasoning_content**——L1944-1947 重建 chatHistory 显式只取 role/content；compact.ts 类型签名也不声明（运行时 slice 引用保留但类型窄化 + 重建时丢）| medium | **fixed**——renderer 重建保留 reasoning_content + compact.ts 新增 `CompactHistoryItem`（含可选 reasoning_content）+ preload/types 同步 |

**回归测试**：compact.test.ts 新增「保留 reasoning_content」用例（kept 引用保留完整字段）——L1 491（490+1）全绿。

## 续轮审计记录项（第 2 轮——不修，待真机/观察）

| # | 发现 | 判定 |
|---|------|------|
| R1 | e2e-0to1.mjs LLM 模拟用 `response_format: {type:'json_object'}`——Command Code 拒绝该参数（真机实测 400「Invalid input, param: response_format」）| **fixed**（2026-08-21 真机验证）——e2e-0to1.mjs 移除 response_format + prompt 明确 JSON 输出（LLM 模拟失败仍有 decideFallback 兜底）|
| R2 | preheat 预热经聚合代理（Command Code）的 KV 缓存命中率未验证——性能优化项，失败有降级（不阻塞）| **recorded**——真机观察项（性能）|

## 真机验证结论（2026-08-21——Command Code key）

| 项 | 结果 | 判定 |
|----|------|------|
| `tool_choice: 'auto'` + thinking disabled + 工具 | ✅ 200，正常返回 tool_calls | 改造后核心路径正常 |
| thinking enabled + reasoning_effort high | ✅ 200，`reasoning` 字段 214 字符正常读取 | extractReasoningText 多源兼容生效 |
| 多轮回放 `reasoning_content` | ✅ 200（第一轮 reasoning 有值 → 第二轮回传 200）| buildHistory/compaction 回传补缺正确 |
| `response_format: json_object` | ❌ 400「Invalid input, param: response_format」| R1 证实——e2e 已修 |

## e2e-0to1 真机复验（2026-08-21 PHASE=req——完整链路）

- **场景 A（起始页填需求）通过 78.3s**：需求澄清 → 候选 → 目标确认 → 收敛（决策轨迹 3 步可复现）
- **场景 B（对话输入）通过 58.6s**：用户纠正（设计→射击游戏）→ 模型重理解 → 目标确认 → 收敛
- 关键：Command Code key 应用内有效（无 401）；tool_choice 恒 auto 下模型正常对话+工具交互；thinking/reasoning 正常；e2e LLM 模拟（response_format 移除后）多轮正常，偶发 JSON 解析失败回退领域层（有兜底，符合预期）
- **环境注记**：e2e 首次 401 根因 = `dist/main/main.js` 旧产物（8-17 构建，无 Command Code 代码）——`npm run build:main` 编译最新后解决（**非代码 bug**；HANDOFF §4 坑 44「改 main/preload 必 build:main」）

---

## Spec 轴（对照设计文档语义契约）

| 设计契约                                               | 实现                                                                                  | 状态     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------- | -------- |
| tool_choice 恒 auto（07 §1.1 / A0 §1）                 | `tool_choice: 'auto'`（删 required 分支）                                             | ✅ fixed |
| forceTool 布尔保留（调研 §7——timeline 取证 + L3 断言） | renderer L1581 计算 + L1585 timeline 事件 + L1603 传参——保留                          | ✅ fixed |
| reasoning 多源兼容取第一个非空（07 §2 / ADR-007）      | `extractReasoningText`（`["reasoning_content","reasoning","reasoning_text"]` 取非空） | ✅ fixed |
| 回放统一 `reasoning_content`（07 §2 / ADR-007）        | ConversationPanel L1428 字段名 + L1643 注释同步                                       | ✅ fixed |
| sysPrompt ⑨ 保留（调研 §7 第 3 条）                    | sysPrompt.ts 未改（⑨ 在位）                                                           | ✅ fixed |
| 循环层兜底保留（调研 §7 第 2 条）                      | agentLoop.ts 未改（StuckDetector/escalate 在位）                                      | ✅ fixed |

**Spec 发现（本次已修）**：

- **[fixed] 07 §1.1 L28 措辞**「forceTool 标记（timeline 取证）」→ 修正为「forceTool 布尔由 renderer 在调用前输出 execution.forced 事件——timeline 取证在 renderer，gateway 仅透传参数」（文档措辞与实现对齐——取证实际在 renderer L1585，非 gateway）

## Standards 轴（仓库规范 + smell 基线）

| 检查                                      | 结果                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `extractReasoningText` 命名/职责          | ✅ 命名清晰、纯函数、单一职责（对照 smell：Mysterious Name——无）                                                                                                                                                                                                                                                        |
| 注释带依据（引用文档/issue/pi 源码）      | ✅ 符合仓库规范（改动注释均引 ADR-007 + 调研文档 + 官方 issue #1376 + pi 源码）                                                                                                                                                                                                                                         |
| Duplicated Code                           | ✅ 无（extractReasoningText 单点使用）                                                                                                                                                                                                                                                                                  |
| **死参数（forceTool——gateway 接收不用）** | ⚠️ **recorded**——裁决保留：① 文档（调研 §7）明言「forceTool 布尔语义保留」；② timeline 取证 + L3 断言在 renderer/bridge 层（L1581/1585/1603 + mock 断言），gateway 参数仅为链路透传；③ 移除会触发 preload/types/ipc 全链改动（Shotgun Surgery）且无实际收益；④ 07 §1.1 已修正措辞说明「gateway 仅透传参数」（语义透明） |
| 回归测试                                  | ✅ gatewayReasoning.test.ts 8 用例（多源提取红→绿）+ L1 490 + L3 51 + 双 tsc + lint 0 errors                                                                                                                                                                                                                            |

## 汇总

- **Spec 轴**：1 finding（fixed——07 §1.1 措辞同步）；最差：无（实现全命中）
- **Standards 轴**：1 finding（recorded——gateway forceTool 死参数，裁决保留）；最差：轻微死参数（有文档依据 + 透明化）
- **下游**：无 open 项需入账 audit-items（recorded 已有裁决理由）；A-011/012/013 已 fixed（实现前入账）
