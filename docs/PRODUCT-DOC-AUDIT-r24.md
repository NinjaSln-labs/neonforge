# 产品/领域文档审计报告：NeonForge（第 24 轮——2026-08-21 · provider 兼容改造文档同步审计）

- 审计对象：provider 切换（ADR-007：DeepSeek 官方 → Command Code）+ V4 拒 `tool_choice: required` 发现后的**文档同步完整性**（A0/02/03/04/05/07 领域文档 + intent-confirmation-domain-design + ADR-007 + README 中英 + D0/05-visual-spec 产品文档 + 调研纪要）
- 审计日期：2026-08-21
- 审计方式：跨文档口径一致性核查（tool_choice 恒 auto / reasoning 多源兼容）+ 文档↔实现一致性核查（gateway.ts 现状 vs 文档语义）+ 误导性 key 指引全库扫描
- 结论：**文档层同步完成**——跨文档口径一致、误导性表述已清除；3 项实现侧待修（文档先行编排的正常中间态）已入账

---

## 一、跨文档口径一致性（层①）

**核心口径（8 处统一）**：`tool_choice` API 层恒 `auto`（V4 全系拒 `required`——官方 issue #1376 + 真机实测）；推进保障 `require-advance/require-action` 领域判定不变；强制语义由循环层（StuckDetector/escalate）+ prompt 层（sysPrompt ⑨）兜底。

| 文档                                     | tool_choice 表述                          | reasoning 字段                                       | 判定 |
| ---------------------------------------- | ----------------------------------------- | ---------------------------------------------------- | ---- |
| `00-domain-authority` §1/§4/v4.1         | 恒 auto + V4 拒 required + 兜底           | —                                                    | ✅   |
| `07-api-gateway` §1/§1.1/§2              | 恒 auto + forceTool 标记 + 场景表         | 多源兼容（读 3 字段取非空 / 回放 reasoning_content） | ✅   |
| `04-tactical` §3.1                       | require-action/advance 均映射 auto        | —                                                    | ✅   |
| `05-architecture` §3                     | 恒 auto + 注记                            | —                                                    | ✅   |
| `03-strategic` Gateway BC                | 恒 auto + forceTool 标记 + 兜底           | —                                                    | ✅   |
| `02-domain-model` L106/服务表            | API 层 auto 注记                          | —                                                    | ✅   |
| `intent-confirmation-domain-design` §8.4 | 网关 tool_choice 需同步注记（路由仍不动） | —                                                    | ✅   |
| `ADR-007`                                | 更正：required 不再使用 + 已验证代价      | 多源兼容 + 回放 reasoning_content                    | ✅   |

**历史对照保留（正确）**：intent-confirmation-domain-design L31/192/194/268 的「forceTool=required」是重设计前历史语义对照；PRODUCT-DOC-AUDIT-r6/r16、08-domain-design-audit 是历史审计快照——均不改（审计链完整）。

## 二、文档↔实现一致性（层②）

| #   | 文档语义                           | 代码现状（gateway.ts）                                                                               | 判定                                      |
| --- | ---------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 1   | tool_choice 恒 auto                | L427 仍 `opts.forceTool ? 'required' : 'auto'` + L403 注释「required 可用（实测成功）」              | ❌ **待实现**（文档先行编排——实现阶段改） |
| 2   | reasoning 多源兼容（取第一个非空） | L465-466 只抓 `delta.reasoning_content`                                                              | ❌ **待实现**                             |
| 3   | 回放统一 `reasoning_content`       | ConversationPanel L1428 已用 `reasoning_content` 字段名 ✓（但注释 L1643「DeepSeek 要求」需同步语义） | ⚠️ 部分待实现                             |

## 三、误导性 key 指引扫描（层③——审计中直接修复）

全库扫描「platform.deepseek / 需要 DeepSeek API Key」——**会误导用户去错地方拿 key** 的表述（排除历史审计/Blog 发布物/竞品分析/定位文档）：

| 位置                                                                             | 修复                                                                          |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `README.md` L56 快速上手                                                         | ✅ 改为 Command Code API Key（commandcode.ai → Studio → API Keys → Generate） |
| `README.en.md` L56 Quick Start                                                   | ✅ 同上（英文）                                                               |
| `docs/product/00-product-design.md` 首次使用前提 / 触发条件 / 配置页示意（3 处） | ✅ 改为 Command Code                                                          |
| `docs/product/05-visual-spec.md` 配置页视觉稿                                    | ✅ 改为 Command Code                                                          |

## 四、问题

**待实现修复（3 项——入账 audit-items，实现阶段闭环）**：

1. **[high] gateway.ts tool_choice 恒 auto**——文档已同步，实现未改（L427 `required` 分支 + L403 注释）
2. **[high] gateway.ts SSE reasoning 多源兼容**——文档已同步，实现未改（L465-466 只抓 `reasoning_content`）
3. **[medium] ConversationPanel 回传语义注释同步**——字段名已对，注释「DeepSeek 要求 tool 消息带 reasoning_content」语义需补「Command Code 亦需」说明

**信息项（不改——可辩护）**：

1. `04-alignment`「DeepSeek API 对接」×3——07 文档仍为 DeepSeek API 网关（模型仍 V4 系列），措辞准确
2. `.agents/product-marketing.md`「DeepSeek API 用户」定位——模型仍是 DeepSeek V4（经 Command Code），定位不变
3. Blog `01-cache-preheating.md`「真实 DeepSeek API」——历史发布物，不改
4. `01-reference-analysis.md` DeepSeek 优化对比——竞品分析历史，不改

## 五、建议

- **文档层达标**——跨文档口径统一、误导性表述清除
- **下一步**：实现阶段修复待实现 3 项（gateway tool_choice → auto + reasoning 多源 + ConversationPanel 注释）→ L1/L2/L3 + lint 验证 → 闭环 audit-items

## 六、验收标准

- [x] 跨文档口径一致（tool_choice 恒 auto + reasoning 多源——8 文档统一）
- [x] 误导性 key 指引全库清除（README 中英 / D0 / 05-visual-spec / ConfigPage 已改）
- [ ] 实现侧 3 项待修（gateway/ConversationPanel）——实现阶段闭环（本审计记录为 open）
- [x] 历史对照/历史审计/Blog/定位文档保留（审计链完整）
