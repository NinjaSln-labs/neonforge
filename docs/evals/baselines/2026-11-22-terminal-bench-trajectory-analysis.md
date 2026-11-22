# 证据卡：Terminal-Bench 2.0 失败轨迹分析（v4 trace，2026-11-22）

> 本卡使用 `NeonForgeTerminalAgentV4` 的 `commands_log` 元数据，对 4 个稳定失败任务做逐命令轨迹分析。它不是新的模型能力结论，也不含模型内部推理，只能看到命令、退出码和失败输出尾部。
> v4 为 40 轮基线配置（无 v2 最终自检、无 v3 验证阶段），用于复现 v1 失败并记录轨迹。

## 基本信息

| 字段 | 值 |
|------|----|
| 分析日期 | 2026-11-22（UTC job 2026-11-22T01:09–01:38Z） |
| 模型 / Provider | 本机 Magpie `opendesign/deepseek-v4.1-flash-eco`（DSV4.1FE-OD） |
| Harness | Harbor `0.26.0` |
| 数据集 | `terminal-bench@2.0`（git commit `69671fbaac6d67a7ef0dfec016cc38a64ef7a77c`；任务镜像 tag `alexgshaw/*:20251031`） |
| v4 agent | `neonforge-terminal-v4-trace` 0.4.0（commit `4f004c7`）：v1 基线 40 轮 + `commands_log`（命令截断 2000 字符；失败输出尾 800 字符） |
| 配置 | 300 秒单命令、40 轮、2 并发；`--agent-timeout-multiplier 4`、`--verifier-timeout-multiplier 4` |
| 沙箱 | 同一专用 QEMU/KVM VM：Ubuntu 24.04.5、6 vCPU、8 GB、100 GB；任务容器不挂宿主 Docker socket |
| 凭据 | Magpie Key 只在宿主环境；任务/验证容器不持有；原始轨迹只留在 VM/`.scratch` |

## 结果总览

| 任务 | Reward | 测试通过 | 命令数 | 失败命令 | tokens（输入 / 输出） | 用时 | 轨迹 |
|------|-------:|----------|-------:|---------:|----------------------|------|------|
| `make-doom-for-mips` | 0.0 | 0/3 | 52 | 2 | 2,418,743 / 20,041 | 11m32 | 有 |
| `pytorch-model-cli` | 0.0 | 5/6 | 32 | 2 | 262,964 / 17,477 | 5m40 | 有 |
| `video-processing` | 0.0 | 2/5 | 39 | 4 | 2,721,622 / 38,345 | 14m27 | 有 |
| `mteb-leaderboard` | 0.0（异常） | 0/2 | 未记录 | — | 未记录 | 13m40 | **无**（300 秒命令超时；v5 补跑见追加节） |

- Job：4 trials、1 个 `RuntimeError`（mteb 单命令 300 秒超时）、0 通过；总运行 29m31。
- 已知 3 个 trial 合计 5,403,329 / 75,863 tokens；mteb 异常 trial 的用量未汇总。
- mteb 的 `commands_log` 为空：v4 只在 `run()` 结束时写入 metadata，异常抛出时尚未写入；这是当前 instrumentation 的缺口，不代表 mteb 没有执行命令。

## 逐任务轨迹

### `make-doom-for-mips`：规划跑偏到“构建 newlib/MIPS 工具链”

- 前 10 条命令在阅读 `/app/vm.js` 与 `doomgeneric` 源码，属于合理的任务理解。
- 第 11–15 条开始检查系统工具链，第 21 条安装 `gcc-mipsel-linux-gnu`、`newlib-source`。
- 第 24–35 条把大量轮次用于解包并构建 newlib（`newlib-salsa`），第 26 条 `../newlib-3.3.0/configure` 不存在（exit 127），第 29 条 `make` 失败（exit 2）；随后继续修改 `config.h`、重新 `make`、检查符号。
- 第 36–43 条短暂回到 `doomgeneric` 源码，第 44–52 条又回到 newlib 构建与符号检查。
- **52 条命令中没有任何一条提到或创建 `/tmp/frame.bmp`**；模型在 40 轮内没有进入“运行 DOOM 并产生帧”的阶段。
- 归因：不是“忘了自检”，而是**任务规划错误/工具链构建兔子洞**。这解释了为什么 v2/v3 的验证阶段无法补出 `frame.bmp`。

### `video-processing`：39 条探索命令，始终没有写出 `jump_analyzer.py`

- 第 1–29 条几乎全部是 `cv2` 读帧、灰度/阈值/背景差分、颜色网格、ASCII 可视化等探索命令；多次打印帧统计，但没有落地 `/app/jump_analyzer.py`。
- 第 26 条出现 `OverflowError: Python integer 256 out of bounds for uint8`，第 28 条 `strings: command not found`，第 1 条 `file: command not found`。
- 第 30–38 条继续用 `cv2` 试不同的跳跃检测算法。
- 第 39 条尝试写 `/tmp/proto.py`，但 heredoc 中 `SyntaxError: '(' was never closed`；随后达到轮次上限，没有生成要求的 `/app/jump_analyzer.py`。
- 评审测试仍为 2/5（v1 为 2/5–3/5；v2 为 4/5；v3 为 2/5，单次波动）。
- 归因：**探索循环 + 交付物迟迟未落盘**；最后还出现脚本语法错误。验证阶段即使存在，也只能在剩余轮次里继续探索，无法替代缺失的实现。

### `pytorch-model-cli`：CLI 与产物已落盘，失败在数值正确性

- 早期第 4/7 条因 `file`、`xxd` 不存在而失败（exit 127/1），但后续改用 Python/`xxd` 替代。
- 第 21–28 条解析 `model.pth`、`cJSON`/`lodepng` 头文件并写出 `main.cpp`；第 29–30 条运行 `cli_tool`，生成 `prediction.txt`；第 31 条用测试数据自检；第 32 条修改 `main.cpp` 的隐藏层计算。
- 6 项测试中 5 项通过；唯一失败是 `test_cli_tool_output` 的预测值与期望不匹配。
- 归因：**实现/数值正确性**，不是文件缺失或缺少自检。v2/v3 的验证阶段对此类失败最多只能多跑几次，无法保证算法正确。

### `mteb-leaderboard`：异常前无轨迹

- 该 trial 在某个单命令上超过 300 秒，抛出 `RuntimeError`；由于 metadata 只在 `run()` 末尾写入，`commands_log` 为空。
- verifier 仍运行并确认 `/app/result.txt` 不存在（0/2）。
- 归因：至少有一个长命令；无法从现有数据判断是网络抓取、数据处理还是其他操作。不能把该 trial 当作模型可验证失败，也不能从中得出任务根因。
- 后续用 v5 exception-safe trace 在 600 秒配置下补跑 1 次，见下节。

### 追加：`mteb-leaderboard` 600 秒 v5 trace

`tbench2-v5-mteb-trace-600`：600 秒单命令、1 并发、1 次；0 异常、reward 0.0；39 条命令（3 条失败），950,372 / 16,395 tokens，agent 11m23，job 12m02。

- 第 1–3 条：尝试 `curl`/`wget`/`urllib` 访问 huggingface、Google、DuckDuckGo，并查找本地 `mteb` 包与依赖。
- 第 4–10 条：在 `site-packages/mteb` 中搜索 Scandinavian/Nordic/leaderboard/results，阅读 `load_results`/`table.py`。
- 第 11–22 条：搜索 pip 缓存、环境变量/代理、DNS/路由、socket、`host.docker.internal` 端口、`.git` 目录、本机 wheel/tar 包。
- 第 23–29 条：检查模型定义、release date、模型名，检查 pip 配置，继续查找结果文件。
- 第 30–39 条：再次尝试 huggingface 直连 IP、代理/端口探测、磁盘与 pip cache、shell history、`git ls-remote` 到 GitHub 的 `embeddings-benchmark/results` 仓库、GitHub API。
- **没有任何命令写出 `/app/result.txt`**；没有找到可用的本地 leaderboard 数据。轨迹指向“任务所需结果数据不可达/未找到”这一类环境或数据依赖问题，而不是缺少收尾自检。
- 该 trial 无异常，说明 v5 的 exception-safe 路径没有在本轮触发；v5 的代码路径与 v4 在成功时一致。

## 横向结论

1. **主要失败模式不是“缺少收尾验证”**：`make-doom-for-mips` 的 52 条命令全部围绕工具链构建，`video-processing` 的 39 条命令全部是探索，二者都没有创建必需产物。v2/v3 的验证阶段无法修复这一点。
2. **任务规划/范围控制是主要瓶颈**：make-doom 在已有 `vm.js` 的情况下选择构建 newlib 工具链；video 在没有落地脚本前反复做帧分析。二者都在 40 轮内耗尽预算。
3. **局部正确性失败需要任务特定实现**：`pytorch-model-cli` 已有产物，只差预测值；`video-processing` 即使接近阈值也需要正确的跳跃检测算法。单纯加轮次或加自检不解决。
4. **instrumentation 缺口已部分修复**：v4 的异常 trial 丢失轨迹；v5 在 `finally`/progress 路径写回 metadata，并用 600 秒补跑 mteb 获得 39 条命令轨迹。异常样本应在 metadata 中记录 `terminated_by_exception` 与执行中命令（`exit=null`）。
5. **mteb 指向外部数据依赖**：600 秒补跑仍未写出 `/app/result.txt`；轨迹显示 agent 反复检查网络、pip 缓存、site-packages 和 GitHub 结果仓库，但没有找到可用 leaderboard 数据。该失败更像任务数据/网络依赖或数据发现失败，不是“缺最后一步验证”。
6. 这与 v2/v3 的负结果一致：提示/验证阶段没有带来 reward 提升；失败是模型规划、实现与数值正确性问题。

## 后续建议

- 若继续 Terminal-Bench：优先尝试**更强模型**或**任务特定计划/工具**（例如为 make-doom 提供明确的“使用 vm.js 运行现有 ELF”提示/工具，而不是让模型自建工具链）；不要再单纯增加验证轮次。
- 若要继续轨迹分析：先修复异常路径的 metadata 写入（`finally` 或增量），再补跑 mteb 等异常样本。
- 也可按优先级转入其他计划项（SWE-bench 适配器、治理、产品级性能基线等）。

## 安全与边界

- 仅在专用 VM 的一次性任务容器内执行；不挂宿主 Docker socket，不暴露宿主 Home、SSH 私钥或仓库源码。
- 任务/验证容器不持有 `MAGPIE_GATEWAY_KEY`；本卡不记录任何凭据值。
- 原始 `commands_log` 与输出尾部只留在 VM trial `result.json` 与宿主 `.scratch/`；本卡只摘录分析所需片段。

## 限制

- **无模型推理**：只能看到命令与输出，不知道模型为何选择该计划。
- **每任务 1 次**：不能估计稳定性或置信区间。
- **输出只留失败命令尾部**：成功命令的完整输出未保存；可能遗漏关键上下文。
- **mteb 轨迹补充**：v4 异常 trial 的 metadata 丢失；v5 600 秒补跑已获得 39 条命令轨迹，但仍未写出 `result.txt`，且无法判定任务期望的本地数据位置。不能把该次轨迹当作完整根因。
- **不是官方成绩**：Harbor 版本、数据集 commit、自定义 agent 与 Magpie 路由均与官方评测不同。
</content>
</file_path>
