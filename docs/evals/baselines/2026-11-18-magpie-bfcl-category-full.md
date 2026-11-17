# 能力卡：BFCL v4 十三类单轮/实时全量（Magpie DSV4.1F，NeonForge 适配器）

> 本卡把 BFCL 从 24 题子集扩展到十三个单轮/实时类别的**全量**题目（共 3641 题），使用非 partial-eval 的类别分数。
> 仍不是 BFCL v4 全量 4706 题（缺 multi-turn、memory、web_search 与 format_sensitivity），也不等同于官方榜单排名。

## 基本信息

| 字段 | 值 |
|------|----|
| 产品版本 / commit | NeonForge `da3cc95` + BFCL 类别全量脚本（commit 见 PR） |
| 模型 / Provider | 本机 Magpie（`http://127.0.0.1:3425/v1`）；API model id `opendesign/deepseek-v4.1-flash` |
| 适配器 | NeonForge 无头适配器 v0（`prompt=product`） |
| Harness 版本 | `bfcl-eval==2026.3.23`（BFCL v4） |
| 评估日期（UTC） | 2026-11-18 |
| 沙箱镜像 | `nf-eval-bfcl@sha256:0aeb737c70ec3519d955b3cf31e79ef951274d8291515ee6c820ceed6333b2c1` |
| 类别与题量 | `simple_python` 400；`multiple` 200；`parallel` 200；`irrelevance` 240；`parallel_multiple` 200；`simple_java` 100；`simple_javascript` 50；`live_simple` 258；`live_parallel` 16；`live_parallel_multiple` 24；`live_relevance` 16；`live_multiple` 1053；`live_irrelevance` 884；合计 3641 |
| 运行方式 | `bfcl generate --test-category ... --num-threads 1` + `bfcl evaluate`；无 `--run-ids`，无 `--partial-eval` |
| 运行次数 | 每个类别 1 次（分三批：核心四类；扩展七类；剩余两个 live 大类） |
| 运行成本 | 本地模型无外部 API 计费；输入约 9,807,006 tokens、输出约 988,619 tokens |

## 结果

| 类别 | 正确/总数 | 准确率 | 输入 tokens | 输出 tokens | 平均延迟 |
|------|-----------|--------|-------------|-------------|----------|
| `simple_python` | 369/400 | **92.25%** | 919,193 | 49,393 | 2.02s |
| `multiple` | 177/200 | **88.50%** | 510,042 | 24,853 | 2.11s |
| `parallel` | 180/200 | **90.00%** | 466,641 | 52,304 | 2.55s |
| `irrelevance` | 171/240 | **71.25%** | 550,229 | 103,260 | 4.49s |
| `parallel_multiple` | 161/200 | **80.50%** | 516,145 | 57,198 | 2.76s |
| `simple_java` | 57/100 | **57.00%** | 235,799 | 29,636 | 3.10s |
| `simple_javascript` | 22/50 | **44.00%** | 118,419 | 23,683 | 4.23s |
| `live_simple` | 198/258 | **76.74%** | 611,742 | 44,566 | 2.39s |
| `live_parallel` | 12/16 | **75.00%** | 37,849 | 3,923 | 2.60s |
| `live_parallel_multiple` | 15/24 | **62.50%** | 72,395 | 5,137 | 2.52s |
| `live_relevance` | 13/16 | **81.25%** | 46,224 | 5,519 | 3.70s |
| `live_multiple` | 772/1053 | **73.31%** | 3,278,740 | 181,435 | 2.39s |
| `live_irrelevance` | 637/884 | **72.06%** | 2,443,588 | 407,712 | 4.74s |
| **十三类合计** | **2784/3641** | **76.46%** | 9,807,006 | 988,619 | — |

- 核心四类（1040 题）合计 897/1040 = 86.25%；扩展七类（664 题）合计 478/664 = 71.99%；两个 live 大类（1937 题）合计 1409/1937 = 72.74%。
- 最强项：`simple_python` 92.25%、`parallel` 90.00%、`multiple` 88.50%、`live_relevance` 81.25%。
- 最弱项：`simple_javascript` 44.00%、`simple_java` 57.00%、`live_parallel_multiple` 62.50%、`irrelevance` 71.25%、`live_irrelevance` 72.06%。
- `live_multiple`（73.31%）与 `multiple`（88.50%）差距明显，实时/真实分布的多函数任务更难。
- `live_irrelevance`（72.06%）与 `irrelevance`（71.25%）接近，均说明“不应调用函数”的抑制较弱；两者输出 token 与延迟都高。

## 与 24 题子集基线的关系

- 24 题子集（`simple_python` 10 + `multiple` 4 + `parallel` 5 + `irrelevance` 5）此前记录 product 模式 87.5-91.7%；本次十三类全量为 76.46%，差异主要来自新增的 Java/JavaScript/live/parallel_multiple 类别，不能直接比较（题集不同、单次运行、不同日期）。
- 子集使用 `--run-ids` + `--partial-eval`；本卡为类别全量、非 partial-eval，因此本卡分数更适合作为类别级能力信号。

## 失败/边界样例

| 现象 | 归因 | 是否产品问题 |
|------|------|--------------|
| `simple_javascript` 44.00% | 模型对 JavaScript 参数/类型生成明显弱于 Python | 模型能力信号，非适配器故障 |
| `simple_java` 57.00% | 同上；Java 类型与调用格式更复杂 | 模型能力信号 |
| `live_parallel_multiple` 62.50% | 实时多函数、多调用点组合更难 | 模型能力信号 |
| `irrelevance` 71.25% / `live_irrelevance` 72.06% | “无需调用工具”的抑制较弱，输出 token 偏高 | 模型能力信号 |
| 未跑 multi-turn / memory / web_search | 需多轮环境、记忆前置数据或外部服务 | 未覆盖，不能外推 |

## 安全与限制

- 评估容器：只读根、非 root、`--cap-drop=ALL`、`no-new-privileges`、PID/内存/CPU 限制；只加入 `nf-eval-internal`；Magpie 仍经单目标适配器中继。
- 适配器只覆盖产品系统提示、provider 传输与工具参数修复；不是完整 Electron 工具注册表。
- 每个类别仅 1 次运行，无重复与置信区间；模型版本、Magpie 路由与本地负载均可能影响分数。
- `format_sensitivity` 对 FC 模型会被 BFCL 跳过；本卡未包含该类别。
- 未与官方榜单横比：模型别名、适配器和本地 Magpie 路由均与官方评测不同。
- 十三类覆盖 3641/4706 题；剩余 1065 题（multi-turn 800、memory 155、web_search 100、format 10）不能由本卡推断。

## 结论

- 可用结论：在十三个单轮/实时类别全量上，模型 + 产品适配器取得 76.46%（2784/3641）；Python 工具调用与并行调用较强（92.25%、90.00%），Java/JavaScript、实时多函数组合与 irrelevance 判定明显较弱（44.00%、57.00%、62.50%、72% 左右）。可作为类别级能力信号与后续优化方向。
- 不可用结论：不能称为“完整 BFCL v4 成绩”（仅 13/20 类、3641/4706 题）；不能与官方榜单直接横比；不能由单次运行推断统计显著性；不能把适配器结果当作完整产品能力认证。
- 下一步：评估 multi-turn（800）、memory（155）、web_search（100）；重复十三类全量 ≥3 次；最后才讨论是否值得跑完整 4706 题。
