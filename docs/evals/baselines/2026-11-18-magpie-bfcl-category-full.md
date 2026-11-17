# 能力卡：BFCL v4 四类单轮全量（Magpie DSV4.1F，NeonForge 适配器）

> 本卡把 BFCL 从 24 题子集扩展到四个单轮类别的**全量**题目（共 1040 题），使用非 partial-eval 的类别分数。
> 仍不是 BFCL v4 全量 4706 题，也不等同于官方榜单排名。

## 基本信息

| 字段 | 值 |
|------|----|
| 产品版本 / commit | NeonForge `465d160` + BFCL 类别全量脚本（commit 见 PR） |
| 模型 / Provider | 本机 Magpie（`http://127.0.0.1:3425/v1`）；API model id `opendesign/deepseek-v4.1-flash` |
| 适配器 | NeonForge 无头适配器 v0（`prompt=product`） |
| Harness 版本 | `bfcl-eval==2026.3.23`（BFCL v4） |
| 评估日期（UTC） | 2026-11-18 |
| 沙箱镜像 | `nf-eval-bfcl@sha256:0aeb737c70ec3519d955b3cf31e79ef951274d8291515ee6c820ceed6333b2c1` |
| 类别与题量 | `simple_python` 400；`multiple` 200；`parallel` 200；`irrelevance` 240；合计 1040 |
| 运行方式 | `bfcl generate --test-category ... --num-threads 1` + `bfcl evaluate`；无 `--run-ids`，无 `--partial-eval` |
| 运行次数 | 每个类别 1 次（`simple_python` 单独一次；其余三类别合并一次） |
| 运行成本 | 本地模型无外部 API 计费；输入约 2,446,105 tokens、输出约 229,810 tokens |

## 结果

| 类别 | 正确/总数 | 准确率 | 输入 tokens | 输出 tokens | 平均延迟 |
|------|-----------|--------|-------------|-------------|----------|
| `simple_python` | 369/400 | **92.25%** | 919,193 | 49,393 | 2.02s |
| `multiple` | 177/200 | **88.50%** | 510,042 | 24,853 | 2.11s |
| `parallel` | 180/200 | **90.00%** | 466,641 | 52,304 | 2.55s |
| `irrelevance` | 171/240 | **71.25%** | 550,229 | 103,260 | 4.49s |
| **四类合计** | **897/1040** | **86.25%** | 2,446,105 | 229,810 | — |

- `simple_python` 单题平均 2.02s（p95 2.70s），生成阶段 13 分 28 秒。
- `irrelevance` 是四类中最低项（71.25%），同时输出 token 与延迟最高；模型在“不应调用函数”的判定上更弱。
- `parallel` 准确率 90.00%，但输出 token 明显高于 `multiple`，说明多函数调用的输出更长。
- 四类合计按题量加权，不是官方 leaderboard 的 Non-Live Overall（后者还包含 Java/JavaScript 等类别）。

## 与 24 题子集基线的关系

- 24 题子集（`simple_python` 10 + `multiple` 4 + `parallel` 5 + `irrelevance` 5）此前记录 product 模式 87.5-91.7%；本次四类全量为 86.25%，量级接近但不能直接比较（题集不同、单次运行、不同日期）。
- 子集使用 `--run-ids` + `--partial-eval`；本卡为类别全量、非 partial-eval，因此本卡分数更适合作为类别级能力信号。

## 失败/边界样例

| 现象 | 归因 | 是否产品问题 |
|------|------|--------------|
| `irrelevance` 71.25% | 模型对“无需调用工具”的抑制较弱 | 模型能力信号，非适配器故障 |
| 未跑 Java/JavaScript/live/multi-turn/web_search/memory | 需要额外类别、外部服务或多轮环境 | 未覆盖，不能外推 |
| 单次运行、单模型 | 无重复与置信区间 | 只能作方向性参考 |

## 安全与限制

- 评估容器：只读根、非 root、`--cap-drop=ALL`、`no-new-privileges`、PID/内存/CPU 限制；只加入 `nf-eval-internal`；Magpie 仍经单目标适配器中继。
- 适配器只覆盖产品系统提示、provider 传输与工具参数修复；不是完整 Electron 工具注册表。
- BFCL 类别全量仍可能受数据集污染、模型版本漂移与单次采样影响。
- `format_sensitivity` 对 FC 模型会被 BFCL 跳过；本卡未包含该类别。
- 未与官方榜单横比：模型别名、适配器和本地 Magpie 路由均与官方评测不同。

## 结论

- 可用结论：在四个单轮类别全量上，模型 + 产品适配器取得 86.25%（897/1040）；`simple_python` 92.25%、`multiple` 88.50%、`parallel` 90.00%、`irrelevance` 71.25%。可作为类别级能力信号。
- 不可用结论：不能称为“完整 BFCL v4 成绩”（仅 4/20 类、1040/4706 题）；不能与官方榜单直接横比；不能由单次运行推断统计显著性；不能把适配器结果当作完整产品能力认证。
- 下一步：重复四类全量 ≥3 次；再评估 `parallel_multiple`、Java/JavaScript、live 系列与 multi-turn；最后才讨论是否值得跑完整 4706 题。
