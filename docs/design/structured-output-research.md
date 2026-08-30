# 结构化输出约束方案调研（2026-08-31——复验轮用户决策：约束强制单一结构化输出，评估重构）

> 触发：#6 真机两轮 7×P1 的公共根因收敛于一点——**确认协议 = 模型自由文本标记（【目标确认】/【执行方案】/【已达成】）+ 宽松解析**。
> 同模型同任务跨轮行为漂移实证：8-30 轮无候选卡直出方案；8-31 轮出 <candidates> 澄清；方案块格式三变
> （冒号位置/动词前缀/括号内冒号）→ 解析器三补丁仍 malformed。**单点修复不收敛**。

## 1. 问题定性（证据链）

| 真机证据 | 根因层 |
|----------|--------|
| 方案块三种格式漂移 → malformed → 空卡（P1-4） | 自由文本形状不受控 |
| 旁白/空文本被兜底词表误判为目标卡（遥测假象三例） | 文本探测固有歧义 |
| 模型跳过【目标确认】直出【执行方案】/提前调 approve-files | 文本协议无机器可查的时序约束 |
| 「已解决」词表与 sysPrompt 脱节 | 引导词与解析词表双源 |
| isLikelyPath 三轮补丁仍漏（中文句读边界） | 自然语言 vs 路径的边界不可判定 |

**对照**：同一模型同期的**工具调用**（read/bash/write/approve-files）JSON 参数**零失败**——
结构化通道（provider 原生 function calling）已被真机充分验证可靠。

## 2. 方案空间

### 方案 A：协议工具化（确认协议迁移到 tool-call 通道）——**推荐**
把三个文本标记改为三个虚拟工具，模型以 function calling 输出 JSON args：
- `propose_goal(statement, assumptions[])`
- `propose_plan(files[{path,reason}], summary, assumptions[], verification_plan[])`
- `report_completion(summary, verification[{command,result,passed}], pending_questions[])`
- （候选澄清已有 <candidates> 文本协议 → 一并迁移 `ask_user(question, options[])`）

机制：gateway 拦截这三个工具 → 不执行 → 转决策点事件（pending + 结构化载荷直挂 decisionContent——
**解析层整体退役**）。schema 即契约：缺字段/类型错 = provider 层面格式保证（DeepSeek function calling
对 JSON args 做语法约束；字段级校验仍需门控，但「整行当路径」「句读腰斩」类失败模式消失）。

- 依据：Claude Code（AskUserQuestion/TodoWrite/ExitPlanMode 全 tool 化）、Codex、Cursor 同构——
  行业共识「用户交互点 = 工具调用」
- 复用已验证通道：不需要 response_format（Command Code 已实证 400——坑 107 记录），不需要
  grammar 约束（仅本地模型可行）；function calling 是唯一既结构化又已真机验证的通道
- 时序可强制：gateway 按（goalConfirmed/planConfirmed）拒绝乱序调用（现有 approve-files 硬序门模式推广）
- 兜底：文本标记解析保留一个版本作为降级（模型偶尔忘调工具时引导而非断流）

### 方案 B：JSON mode / response_format 约束
DeepSeek API 有 `json_object` 模式但**非 schema 约束**（只保证合法 JSON 不保证结构）；且
Command Code 网关对 response_format 实测 400。**不可行**（V4 也拒 tool_choice required——同族限制）。

### 方案 C：grammar 约束解码（outlines/xgrammar）
仅本地模型推理栈可行；API 网关无法用。**排除**。

### 方案 D：现状修补（解析器继续打补丁）
复验轮又添两补丁（候选制拆分/硬序门）——边际收益递减，格式空间无限。**不收敛，否决**。

## 3. 方案 A 迁移草图（供 stage-spec 展开）

1. **工具注册**：gateway 注册 3+1 协议工具（schema 严格、requiresApproval: false、virtual: true）
2. **拦截→决策点**：gateway 捕获调用 → 校验 args → 发 decision.requested/pending_set（载荷=args）
   → 与现有 pending 状态机对接（乱序调用 → 拒绝原因回模型——硬序门推广）
3. **sysPrompt 重写**：⑬⑭⑮ 的文本标记契约 → 工具调用契约（必须以工具发起确认，禁止纯文本标记）
4. **解析层退役**：parsePlanProposal/parseCompletionClaim/goalFallbackTrigger 降级为
   「文本兜底探测」（模型忘调工具时打引导事件，不再直接产卡）
5. **renderer 不动**：decisionContent 快照结构不变（卡渲染零改动——这是现有架构的红利）
6. **测试迁移**：L1 场景助手（scenarios.ts）改为工具调用 chunk；L3 卡流程断言不变

## 4. 风险与验证项（拍板前需真机/spike 确认）

| 风险 | 验证方式 |
|------|----------|
| Command Code 网关对**新增工具定义**的透传（现 TOOL_DEFS 9 个——加 3 个是否截断/限流） | spike：dev 环境 10 轮工具调用探测 |
| V4 对嵌套数组 schema（files[{path,reason}]）的 args 质量 | spike：propose_plan 50 次采样看 args 合格率 |
| 模型忘调工具的频率（文本兜底触发率） | 真机一轮全程打点 |
| provider 可切换（ADR-007——模型 DeepSeek-only 接入方可切）后 schema 行为漂移 | 接入方抽象保持（工具定义不动） |

## 5. 与现有修复的关系

8-30/31 的 7 commit 修复**不白做**：门控时序（approve-files 硬序）、授权粒度（文件级绑定）、
路径规范化（resolveSandboxPath）、对账语义（ADR-008）是**机制层**修复——与输出形态无关，重构后继续有效。
被重构吸收的是**解析层**（今天三连补丁的所在）。

## 6. 建议拍板

- [ ] 拍板 1：采纳方案 A（协议工具化）作为 V1.5 重构立项（stage-spec + ADR-009）
- [ ] 拍板 2：先跑 §4 两项 spike（半天）再定排期
- [ ] 拍板 3：当前 #6 复验继续走完（本轮验证机制层修复有效性），重构不在 #6 范围内
