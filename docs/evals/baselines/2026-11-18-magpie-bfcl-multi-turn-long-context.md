# 能力卡：BFCL `multi_turn_long_context` 全量（DSV4.1FE-OD）

> 本卡记录 BFCL v4 `multi_turn_long_context` 200 题全量结果。
> 结果是模型 + BFCL handler + NeonForge 适配器的信号，不是完整产品能力或官方榜单成绩。

## 基本信息

| 字段 | 值 |
|------|----|
| 产品版本 / commit | NeonForge `ef464f4`（评估默认模型切换后） |
| 模型 / Provider | 本机 Magpie；DSV4.1FE-OD（API model id `opendesign/deepseek-v4.1-flash-eco`，与原 flash 同一模型的 eco/慢速模式） |
| BFCL handler | `openbmb/MiniCPM-SALA-FC`（BFCL 通用 OpenAI-compatible FC handler） |
| 适配器 | NeonForge 无头适配器 v0（`prompt=product`，默认参数修复，无容忍模式） |
| 评估日期（UTC） | 2026-11-18 |
| Harness 版本 | `bfcl-eval==2026.3.23`（BFCL v4） |
| 沙箱镜像 | `nf-eval-bfcl@sha256:0aeb737c70ec3519d955b3cf31e79ef951274d8291515ee6c820ceed6333b2c1` |
| 类别 / 题量 | `multi_turn_long_context` / 200；非 `--partial-eval`；`--num-threads 1` |
| 运行成本 | 本地模型无外部 API 计费；生成阶段 4 小时 34 分；输入 47,780,156 tokens，输出 705,479 tokens；2,819 次模型调用 |

## 结果

| 指标 | 值 |
|------|----|
| 正确 / 总数 | **92 / 200** |
| 准确率 | **46.00%** |
| 每题延迟（含多轮） | 均值 82.2 秒、中位 72.6 秒、最大 309.4 秒 |
| 无效题 | 108 / 200 |

### 无效题归因（BFCL 评分器）

| 原因 | 数量 |
|------|------|
| `VehicleControlAPI` 状态与 ground truth 不一致 | 33 |
| 缺少全部 ground truth 执行结果 | 19 |
| `TravelAPI` 状态不一致 | 12 |
| `TwitterAPI` 状态不一致 | 9 |
| `GorillaFileSystem` 状态不一致 | 6 |
| `MessageAPI` 状态不一致 | 6 |
| `TicketAPI` 状态不一致 | 5 |
| `TradingBot` 状态不一致 | 5 |
| 其他 | 13 |

### 解码失败

- 日志中有 **731 次** `Error decoding the model response. Proceed to next turn.`。
- **199/200** 题至少出现 1 次；每题失败次数分布：2 次 40 题、3 次 49 题、4 次 50 题、5 次 43 题、6 次 12 题、7 次 2 题。
- 典型原因：模型在轮次结束时输出自然语言总结（如“已经移动完成……”），handler 期望可解析的工具调用结构，记录 `'str' object has no attribute 'items'`。
- 因此 **46.00% 是当前 handler/适配器组合下的下界信号**，不能直接解释为模型长上下文能力上限。

## 与前序 multi-turn 对照

| 类别 | 正确/总数 | 准确率 | 每题平均延迟 | 备注 |
|------|-----------|--------|--------------|------|
| `multi_turn_base`（flash 模式） | 112/200 | 56.00% | 41.0 秒 | 2026-11-18 早先运行 |
| `multi_turn_long_context`（eco 模式） | 92/200 | 46.00% | 82.2 秒 | 本卡；731 次解码失败 |

- 两者是同一模型的不同路由模式；长上下文类别本身更长，且解码失败显著更多，分数差异不能单独归因于长上下文能力。

## 失败/边界样例

| 用例 | 现象 | 归因 | 是否产品问题 |
|------|------|------|--------------|
| 199/200 题 | 至少 1 次 `Error decoding` | 最终自然语言响应与 BFCL handler 预期不符 | 适配器/handler 兼容性缺口 |
| 33 题 | `VehicleControlAPI` 状态不一致 | 工具执行序列与 ground truth 不一致 | 模型任务执行 + 解码问题混合 |
| 19 题 | 缺少全部 ground truth 执行结果 | 未完成必要工具调用 | 模型任务执行 |
| `multi_turn_long_context_199` | 最后一轮连续 2 次解码失败 | 自然语言总结无法解析 | 适配器/handler 兼容性 |

## 安全与限制

- 评估容器：只读根、非 root、`--cap-drop=ALL`、`no-new-privileges`、PID/内存/CPU 限制；只加入 `nf-eval-internal`。
- 单次运行，无重复；不能作为稳定准确率或置信区间。
- 46.00% 受 731 次解码失败影响，不能与官方 BFCL 榜单或其他 handler 的结果直接横比。
- eco/慢速模式比 flash 慢，延迟数据只代表该模式。
- 未覆盖 `multi_turn_miss_func`、`multi_turn_miss_param`、memory、web_search、format_sensitivity。

## 结论

- 可用结论：在当前 BFCL handler + NeonForge 适配器下，`multi_turn_long_context` 200 题得 92/200（46.00%），平均 82.2 秒/题，输入约 4778 万 tokens；无效题主要为状态不一致与缺少执行结果。
- 不可用结论：不能把 46.00% 当作模型长上下文能力的干净分数；不能称为 BFCL v4 完整成绩；不能与官方榜单横比。
- 下一步：先修多轮最终自然语言响应的解码/适配（或改用能接受纯文本结束轮的 handler），再重跑本类别；随后补 `multi_turn_miss_func`、`multi_turn_miss_param`、memory、web_search。
