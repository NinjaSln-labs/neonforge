# 证据卡：Terminal-Bench 2.0 verifier 失败断言分析（2026-11-22）

> 本卡是对已有 Harbor trial 产物的**回溯分析**，不包含新的模型运行。
> 目的是把“Harbor 判为 reward_valid 的 0.0”进一步拆成“模型可验证失败”与“验证器依赖安装失败”，并修正此前的部分稳定性解读。
> 不是官方 Terminal-Bench 2.0 成绩；仅针对自定义最小 agent `neonforge-terminal`。

## 基本信息

| 字段 | 值 |
|------|----|
| 分析日期（UTC） | 2026-11-22 |
| 模型 / Provider | 本机 Magpie `opendesign/deepseek-v4.1-flash-eco`（DSV4.1FE-OD） |
| Harness | Harbor `0.26.0` |
| 数据集 | `terminal-bench@2.0`（git commit `69671fbaac6d67a7ef0dfec016cc38a64ef7a77c`；任务镜像 tag `alexgshaw/*:20251031`） |
| Agent | 自定义 `neonforge-terminal` 0.1.0：单个 `execute_bash`；40 轮；单命令超时按作业配置 |
| 数据来源 | VM `/home/nf/harbor-jobs/` 下 2026-11-20 至 2026-11-21 的 trial 目录；原始日志只留在 `.scratch/` |
| 分析对象 | `result.json`、`verifier/reward.txt`、`verifier/ctrf.json`、`verifier/test-stdout.txt` |
| 方法 | 检查 reward 为 0 的 trial：有 `ctrf.json` 视为测试已执行；无 `ctrf.json` 且 `test-stdout.txt` 出现依赖安装/网络错误时，判为 verifier 基础设施失败 |

**关键口径**：Harbor 的 `reward_valid=True` 只表示 verifier 产出了 reward；当 `test.sh` 在安装依赖时失败时，测试并未执行，Harbor 仍会写入 0.0。本卡把这种情况称为 **verifier 基础设施失败**，不计入模型可验证通过率。

## 一、verifier 基础设施失败（测试未执行）

扫描所有 trial 后，共发现 13 个 trial 无 `ctrf.json` 且 `test-stdout.txt` 含依赖/网络错误。其中 3 个原本已按异常排除，10 个此前被计为“有效 0.0”：

| 作业 | 任务 | 无 ctrf trials | verifier 证据 | 原分类 | 更正 |
|------|------|----------------|---------------|--------|------|
| `tbench2-breadth-5`、`tbench2-b5zero-repeat-3x` | `qemu-startup` | 1 + 3 = 4 | Debian bullseye-security 的 `curl`/`libcurl4`/`libnghttp2-14` 固定版本 404；`curl: command not found`；`uvx: command not found` | 初轮 1 个有效 0.0；重复 3/3 有效 0.0、0 异常 | **4/4 验证器安装失败，无模型断言**；撤销“稳定模型失败”结论 |
| `tbench2-breadth-6-timeout600`、`tbench2-600s-zero-repeat-3x` | `qemu-alpine-ssh` | 1 + 3 = 4 | 同上；另有 `/root/.local/bin/env` 缺失 | 600 秒重跑 1 个有效 0.0；重复 3/3 有效 0.0 | **4/4 验证器安装失败，无模型断言**；撤销“稳定模型失败”结论 |
| `tbench2-b6zero-repeat-3x` | `dna-insert` | 1 / 3 | `curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL ... astral.sh:443`；`uvx: command not found` | 2 × 1.0、1 × 有效 0.0 | 该 0.0 为验证器安装失败；重复中模型可验证 **2/2 通过** |
| `tbench2-b4-code-from-image-repeat-3x-1200` | `code-from-image` | 1 / 2 完成 | `curl: (18) HTTP/2 stream 1 was not closed cleanly`；`uvx: command not found` | 2 个完成 trial 均有效 0.0 | 1 个完成 trial 为验证器安装失败；另一个为模型可验证 0.0 |

另有 3 个已排除、无需修正的 trial：

| 作业 | 任务 | 说明 |
|------|------|------|
| `tbench2-breadth-5` | `extract-moves-from-video` | 初轮已因 300 秒命令超时记为异常；verifier 同时缺少 curl/uvx，不改变异常分类 |
| `tbench2-breadth-6` | `qemu-alpine-ssh` | 初轮已因 300 秒命令超时记为异常；verifier 同样缺少 curl/uvx |
| `tbench2-pilot-repeat-3x` | `regex-log` | 已按 pilot setup 异常处理，未进入模型统计 |

**成本**：这 10 个被重新分类的 trial 消耗了 **7,070,536 输入 / 266,030 输出 tokens**，却没有产生任何模型断言结果。Harbor 仍将 reward 记为 0.0 且 `reward_valid=True`。

### 典型 verifier 输出

```text
E: Failed to fetch .../libnghttp2-14_1.43.0-1+deb11u3_amd64.deb  404  Not Found
E: Failed to fetch .../curl_7.74.0-1.3+deb11u16_amd64.deb  404  Not Found
/tests/test.sh: line 8: curl: command not found
/tests/test.sh: line 10: /root/.local/bin/env: No such file or directory
/tests/test.sh: line 19: uvx: command not found
```

```text
curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL in connection to astral.sh:443
/tests/test.sh: line 18: uvx: command not found
```

两类原因相互独立：Debian bullseye-security 的包索引/文件已漂移；网络到 `astral.sh` 也可能被代理或 TLS 中断。任务测试脚本没有把依赖预装进镜像，因而验证器在测试开始前就失败。

## 二、模型可验证失败（`ctrf.json` 存在）

按断言归类，主要不是“命令跑不完”，而是**任务要求的主要交付物没有在指定路径出现**，或只差少量数值/行为断言。

### 2.1 必需产物缺失

| 任务 | 断言 | 观察 |
|------|------|------|
| `make-doom-for-mips` | `test_vm_execution` / `test_frame_bmp_exists` / `test_frame_bmp_similar_to_reference` | 3/3 trial：等待 `/tmp/frame.bmp` 30 秒超时；文件不存在 |
| `code-from-image` | `test_output_file_exists` / `test_output_is_correct` | 3 个模型可验证 trial：`/app/output.txt` 不存在 |
| `dna-assembly` | `test_primers` | 3/3 trial：引物数量为 0，或长度/坐标差超限（如 `47` 长度、`5.449687999999995 = abs(69.066729 - 63.617041)`） |
| `raman-fitting` | `test_result_file_exists` / `test_G_Peak` / `test_2D_Peak` | 有效 trial：`/app/results.json` 不存在；部分 trial 文件存在但峰值断言为 False |
| `mteb-leaderboard` | `test_result_exists` / `test_data_matches` | 3/3 trial：`/app/result.txt` 不存在；或数据与期望不符（含 `Qwen/Qwen3-Embedding-8B` 相关断言） |
| `extract-moves-from-video` | `test_solution_file_exists` / `test_solution_content_similarity` | 600 秒下 1 个有效 0.0：`/app/solution.txt` 不存在；同配置另有 1 次通过、1 次命令超时 |
| `caffe-cifar-10` | 6 项训练/模型断言 | 2400 秒：`cifar10_quick_iter_500.caffemodel` 与 `training_output.txt` 不存在；3/6 失败 |
| `sam-cell-seg` | 9 项 | `convert_masks.py` 缺失或不可运行；`test_output.csv` 缺失 |
| `protein-assembly` | `test_gblock` | 3/3 trial：`/app/gblock.txt` 不存在 |
| `gcode-to-text` / `count-dataset-tokens` | 输出文件断言 | `/app/out.txt`、`/app/answer.txt` 不存在（历史批次已记录为稳定/近稳定失败） |

### 2.2 近阈值或局部失败

| 任务 | 断言 | 观察 |
|------|------|------|
| `winning-avg-corewars` | `test_warrior_performance` / `test_warrior_exists` | 600 秒 ×3：一次 `74 >= 75`（只差 1）；两次 `my_warrior.red` 缺失；300 秒重复也有同类结果 |
| `video-processing` | 帧数断言 | `62 <= 61`、`231 <= 230`（各差 1 帧）；另有 trial 缺少 `jump_analyzer.py` |
| `pytorch-model-cli` | 6 项中 1 项 | 3/3 trial 通过 5/6，仅 `test_cli_tool_output` 的 `assert False` |
| `model-extraction-relu-logits` | `test_stolen_matrix_matches` | 2/3 trial 断言 False；1/3 通过；不是稳定失败 |
| `torch-pipeline-parallelism` | `test_pipeline_parallel` | `AttributeError: 'Tensor' object has no attribute 'get_mask_sizes'` |
| `schemelike-metacircular-eval` | `test_interp` | 1 个有效 0.0：`assert 63 == 0`；另 2 个超时 trial 验证器为 1.0 |
| `mailman` | 3 项 | 0.0 trial：MTA 未运行，`ConnectionRefusedError`，`test_mlist_exists` 为 `assert None`；同任务另 2 次干净通过 |
| `install-windows-3.11` | 网络/参数/按键反馈 | `:80` 或 `:5901` 未监听；QEMU 参数不匹配或进程未启动；按键视觉反馈断言 False |

### 2.3 需要保留的异常

`train-fasttext` 在 300/600/1200 秒均命令超时，仍属 agent 配置限制；1200 秒的 verifier 输出现实 `/app/model.bin` 缺失，但因 trial 本身是异常，不能把它当作模型可验证失败。`raman-fitting` 在 600 秒 ×3 仍全部命令超时，同理不计模型断言。

## 三、修正后的稳定性结论

| 任务 | 此前记录 | 修正后 |
|------|----------|--------|
| `qemu-startup` | 初轮有效 0.0；重复 3/3 干净 0.0，“稳定失败” | **verifier 安装失败 4/4；无模型结论**；需要修复/绕过 verifier 依赖后重跑 |
| `qemu-alpine-ssh` | 600 秒有效 0.0；重复 3/3 有效 0.0，“稳定失败” | **verifier 安装失败 4/4（另 1 个 300 秒异常）；无模型结论** |
| `dna-insert` | 初轮 0.0；重复 2/3 干净通过（1 个有效 0.0） | 初轮 0.0 为模型可验证失败；重复中 2/2 模型可验证通过；另一个 0.0 是 verifier 安装失败 |
| `code-from-image` | 1200 秒 3/3 完成 trial 均为有效 0.0，“稳定失败” | 3 个模型可验证 trial 均为 0.0（`output.txt` 缺失），稳定失败仍成立；另有 1 个 verifier 安装失败、1 个取消，不能计入 3/3 的样本 |
| `extract-moves-from-video` | 初轮异常；600 秒 1 通过、1 有效 0.0、1 超时 | 初轮 verifier 也安装失败，但已按异常排除；600 秒的模型可验证结果为 1 通过、1 失败、1 异常，不变 |
| `pytorch-model-cli` / `make-doom-for-mips` / `winning-avg-corewars` / `video-processing` / `raman-fitting` 等 | 稳定或近稳定失败 | 不变；失败断言如上 |

**统计影响**：第五批 4 个有效 0.0 的重复中，`qemu-startup` 的 3 个不再属于模型可验证尝试；该批模型可验证干净尝试由 11 个降为 8 个，干净通过仍为 3 个（`mailman` 2、`make-mips-interpreter` 1），模型可验证通过率由 3/11 = 27.3% 修正为 **3/8 = 37.5%**。第六批 `dna-insert` 的 1 个 0.0 移出模型可验证样本，其重复模型可验证通过率为 **2/2 = 100%**（加上初轮 0.0 则为 2/3）。

## 四、对后续实验的直接含义

1. **不能把 qemu 两个任务的结果当作模型能力证据**；此前“稳定失败”的表述作废。若要评估，需先让 verifier 能安装 curl/uv（例如预装依赖或使用可用的 Debian 归档源），并作为新的配置单独记录。
2. **验证器依赖是最主要的非模型失败源**：所有 0.0 trial 都应先检查 `ctrf.json` 是否存在，再看 `test-stdout.txt` 的依赖/网络错误；不能只看 `reward_valid`。
3. **模型侧的主要失败模式是“最终交付物缺失”，不是命令预算**。`make-doom-for-mips`、`code-from-image`、`dna-assembly`、`raman-fitting`、`mteb-leaderboard` 的断言都指向主要产物没有落盘；`winning-avg-corewars` 与 `video-processing` 已接近阈值。下一轮 agent 策略应优先增加**交付物自检/收尾验证**，而不是单纯扩大轮数或命令超时。
4. **保留原始结果**：本卡只做重新分类，不修改任何 Harbor reward；旧证据卡中的原始数字仍可追溯，但解释以本卡和对应更正节为准。

## 安全与边界

- 仅读取 VM 上的 trial 产物；未在任务容器内挂宿主 Docker socket，未暴露宿主 Home、SSH 私钥或仓库源码。
- 本卡不记录任何凭据值；`MAGPIE_GATEWAY_KEY` 仍只从环境变量/本机凭据文件读取。
- 原始日志、SSH 私钥与轨迹只留在 `.scratch/`，不入库。

## 限制

- **无 agent 轨迹**：自定义 agent 不持久化逐命令历史；只能依据 verifier 断言与进程状态推断，不能给出完整根因。
- **verifier 输出可能混合多个问题**：依赖失败时测试未执行；有 `ctrf.json` 时也可能同时存在环境问题和模型问题，本卡按“是否执行了断言”做主分类。
- **样本小**：多数任务 1-3 次；不能估计总体通过率或置信区间。
- **不是官方成绩**：Harbor 版本、数据集 commit、自定义 agent 与 Magpie 路由均与官方评测不同。
</content>
</file_path>
