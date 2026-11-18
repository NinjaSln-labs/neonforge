# 能力卡：BFCL `multi_turn_miss_param` 全量（DSV4.1FE-OD）

> 本卡记录 BFCL v4 `multi_turn_miss_param` 200 题全量结果。
> 结果是模型 + BFCL handler + NeonForge 适配器的信号，不是完整产品能力或官方榜单成绩。

## 基本信息

| 字段 | 值 |
|------|----|
| 产品版本 / commit | NeonForge `f855e7f`（main） |
| 模型 / Provider | 本机 Magpie；DSV4.1FE-OD（API model id `opendesign/deepseek-v4.1-flash-eco`，与原 flash 同一模型的 eco/慢速模式） |
| BFCL handler | `openbmb/MiniCPM-SALA-FC`（BFCL 通用 OpenAI-compatible FC handler） |
| 适配器 | NeonForge 无头适配器 v0（`prompt=product`，默认参数修复，无容忍模式） |
| 评估日期（UTC） | 2026-11-18 |
| Harness 版本 | `bfcl-eval==2026.3.23`（BFCL v4） |
| 沙箱镜像 | `nf-eval-bfcl@sha256:0aeb737c70ec3519d955b3cf31e79ef951274d8291515ee6c820ceed6333b2c1` |
| 类别 / 题量 | `multi_turn_miss_param` / 200；非 `--partial-eval`；`--num-threads 1` |
| 运行成本 | 本地模型无外部 API 计费；生成阶段 4 小时 18 分；输入 25,201,002 tokens，输出 750,879 tokens；3,270 次模型调用 |

## 结果

| 指标 | 值 |
|------|----|
| 正确 / 总数 | **79 / 200** |
| 准确率 | **39.50%** |
| 每题延迟（含多轮） | 均值 77.3 秒、中位 67.5 秒、最大 319.7 秒 |
| 无效题 | 121 / 200 |

### 无效题归因（BFCL 评分器）

| 原因 | 数量 |
|------|------|
| `VehicleControlAPI` 状态与 ground truth 不一致 | 33 |
| 缺少全部 ground truth 执行结果 | 16 |
| `TravelAPI` 状态不一致 | 12 |
| `TradingBot` 状态不一致 | 8 |
| `GorillaFileSystem` 状态不一致 | 7 |
| `TwitterAPI` 状态不一致 | 7 |
| `TicketAPI` 状态不一致 | 6 |
| `MessageAPI` 状态不一致 | 3 |
| 其他（含 `Model response list is empty for turn 1` 12 题） | 45 |

### 轮次结束行为

- 日志中有 **930 次** `Error decoding the model response. Proceed to next turn.`，全部 200 题共 **931 个用户轮次**，基本 1:1。
- 199/200 题至少出现 1 次；1 题轮次数多于日志次数。该日志是模型用自然语言结束每轮后 handler 进入下一轮的预期路径，**不是崩溃**。
- 另有 12 题被评分器记为 `Model response list is empty for turn 1`，这是空响应而非轮次结束日志，需单独抽查。

## 与前序 multi-turn 对照

| 类别 | 正确/总数 | 准确率 | 每题平均延迟 | 备注 |
|------|-----------|--------|--------------|------|
| `multi_turn_base`（flash 模式） | 112/200 | 56.00% | 41.0 秒 | 单次运行 |
| `multi_turn_long_context`（eco 模式） | 92/200 | 46.00% | 82.2 秒 | 单次运行 |
| `multi_turn_miss_func`（eco 模式） | 89/200 | 44.50% | 103.5 秒 | 单次运行 |
| `multi_turn_miss_param`（eco 模式） | 79/200 | 39.50% | 77.3 秒 | 本卡；单次运行 |

- 四个类别都是同一模型；`miss_param` 在四个多轮类别中最低，且 121 题无效、12 题首轮空响应。差异可能来自题目结构、参数缺失处理和输出长度，不能单独归因于某一能力。

## 失败/边界样例

| 用例 | 现象 | 归因 | 是否产品问题 |
|------|------|------|--------------|
| 33 题 | `VehicleControlAPI` 状态不一致 | 工具执行序列与 ground truth 不一致 | 模型任务执行 |
| 16 题 | 缺少全部 ground truth 执行结果 | 未完成必要工具调用 | 模型任务执行 |
| 12 题 | `Model response list is empty for turn 1` | 模型返回空响应 | 模型/适配器需抽查 |
| 199/200 题 | 轮次结束日志 | 自然语言结束轮次的预期路径 | 非异常 |

## 安全与限制

- 评估容器：只读根、非 root、`--cap-drop=ALL`、`no-new-privileges`、PID/内存/CPU 限制；只加入 `nf-eval-internal`。
- 单次运行，无重复；不能作为稳定准确率或置信区间。
- 39.50% 不能与官方 BFCL 榜单或其他 handler 的结果直接横比；handler、适配器与 Magpie 路由均与官方设置不同。
- eco/慢速模式比 flash 慢，延迟数据只代表该模式。
- 12 题首轮空响应需要抽查，可能影响类别结论。
- 未覆盖 memory、web_search、format_sensitivity。

## 结论

- 可用结论：在当前 BFCL handler + NeonForge 适配器下，`multi_turn_miss_param` 200 题得 79/200（39.50%），平均 77.3 秒/题，输入约 2520 万 tokens；无效题主要为状态不一致、缺少执行结果与首轮空响应。
- 不可用结论：不能把 39.50% 当作官方口径分数；不能称为 BFCL v4 完整成绩；不能与官方榜单横比。
- 下一步：抽查 12 题首轮空响应与 121 个无效题；补 memory、web_search；对本类别做 ≥3 次重复。
