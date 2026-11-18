# 能力卡：BFCL `multi_turn_miss_func` 全量（DSV4.1FE-OD）

> 本卡记录 BFCL v4 `multi_turn_miss_func` 200 题全量结果。
> 结果是模型 + BFCL handler + NeonForge 适配器的信号，不是完整产品能力或官方榜单成绩。

## 基本信息

| 字段 | 值 |
|------|----|
| 产品版本 / commit | NeonForge `712ad49`（main） |
| 模型 / Provider | 本机 Magpie；DSV4.1FE-OD（API model id `opendesign/deepseek-v4.1-flash-eco`，与原 flash 同一模型的 eco/慢速模式） |
| BFCL handler | `openbmb/MiniCPM-SALA-FC`（BFCL 通用 OpenAI-compatible FC handler） |
| 适配器 | NeonForge 无头适配器 v0（`prompt=product`，默认参数修复，无容忍模式） |
| 评估日期（UTC） | 2026-11-18 |
| Harness 版本 | `bfcl-eval==2026.3.23`（BFCL v4） |
| 沙箱镜像 | `nf-eval-bfcl@sha256:0aeb737c70ec3519d955b3cf31e79ef951274d8291515ee6c820ceed6333b2c1` |
| 类别 / 题量 | `multi_turn_miss_func` / 200；非 `--partial-eval`；`--num-threads 1` |
| 运行成本 | 本地模型无外部 API 计费；生成阶段 5 小时 45 分；输入 29,105,725 tokens，输出 869,458 tokens；3,538 次模型调用 |

## 结果

| 指标 | 值 |
|------|----|
| 正确 / 总数 | **89 / 200** |
| 准确率 | **44.50%** |
| 每题延迟（含多轮） | 均值 103.5 秒、中位 87.7 秒、最大 409.0 秒 |
| 无效题 | 111 / 200 |

### 无效题归因（BFCL 评分器）

| 原因 | 数量 |
|------|------|
| `VehicleControlAPI` 状态与 ground truth 不一致 | 41 |
| 缺少全部 ground truth 执行结果 | 15 |
| `GorillaFileSystem` 状态不一致 | 9 |
| `TicketAPI` 状态不一致 | 8 |
| `TravelAPI` 状态不一致 | 8 |
| `TradingBot` 状态不一致 | 7 |
| `TwitterAPI` 状态不一致 | 6 |
| `MessageAPI` 状态不一致 | 3 |
| 其他 | 29 |

### 轮次结束行为

- 日志中有 **928 次** `Error decoding the model response. Proceed to next turn.`，全部 200 题共 **930 个用户轮次**，两者基本 1:1。
- 198/200 题至少出现 1 次；2 题轮次数多于日志次数。该日志与 `multi_turn_long_context` 中一样，是模型用自然语言结束每轮后 handler 进入下一轮的预期路径，**不是崩溃**。
- 111 题无效的原因是状态不一致或缺少执行结果，属于任务执行差异，不是解码故障。

## 与前序 multi-turn 对照

| 类别 | 正确/总数 | 准确率 | 每题平均延迟 | 备注 |
|------|-----------|--------|--------------|------|
| `multi_turn_base`（flash 模式） | 112/200 | 56.00% | 41.0 秒 | 单次运行 |
| `multi_turn_long_context`（eco 模式） | 92/200 | 46.00% | 82.2 秒 | 单次运行 |
| `multi_turn_miss_func`（eco 模式） | 89/200 | 44.50% | 103.5 秒 | 本卡；单次运行 |

- 三个类别都是同一模型；`miss_func` 与 `long_context` 的分数接近，延迟更高。差异可能来自题目结构与输出长度，不能单独归因于某一能力。

## 失败/边界样例

| 用例 | 现象 | 归因 | 是否产品问题 |
|------|------|------|--------------|
| 41 题 | `VehicleControlAPI` 状态不一致 | 工具执行序列与 ground truth 不一致 | 模型任务执行 |
| 15 题 | 缺少全部 ground truth 执行结果 | 未完成必要工具调用 | 模型任务执行 |
| 198/200 题 | 轮次结束日志 | 自然语言结束轮次的预期路径 | 非异常 |
| 2 题 | 轮次数多于日志次数 | 单次自然语言响应未被解析 | 需抽查，未影响主结论 |

## 安全与限制

- 评估容器：只读根、非 root、`--cap-drop=ALL`、`no-new-privileges`、PID/内存/CPU 限制；只加入 `nf-eval-internal`。
- 单次运行，无重复；不能作为稳定准确率或置信区间。
- 44.50% 不能与官方 BFCL 榜单或其他 handler 的结果直接横比；handler、适配器与 Magpie 路由均与官方设置不同。
- eco/慢速模式比 flash 慢，延迟数据只代表该模式。
- 未覆盖 `multi_turn_miss_param`、memory、web_search、format_sensitivity。

## 结论

- 可用结论：在当前 BFCL handler + NeonForge 适配器下，`multi_turn_miss_func` 200 题得 89/200（44.50%），平均 103.5 秒/题，输入约 2911 万 tokens；无效题主要为状态不一致与缺少执行结果。
- 不可用结论：不能把 44.50% 当作官方口径分数；不能称为 BFCL v4 完整成绩；不能与官方榜单横比。
- 下一步：抽查 2 题轮次/日志不一致与 111 个无效题；补 `multi_turn_miss_param`、memory、web_search；对本类别做 ≥3 次重复。
