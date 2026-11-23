# 产品级任务成功探针

固定剧本驱动**真实产品流程**，测量产品编排成功率（目标确认 → 方案确认 → 授权 → 工具执行 → 完成对账 → 已解决卡），并核验真实产物。

- `task-suite.cjs`：16 个任务与产物检查（纯数据，不依赖 Electron）——6 个正向任务、1 个顺序违规恢复任务（`direct-write-after-goal`）、3 个拒绝路径任务（`reject-goal` / `reject-plan` / `reject-approval`）、2 个信任模式任务（`strict-first-write` / `delegated-edit`）、1 个「允许并记住」任务（`remember-edit`：首次 edit 点记住 → 同文件第二次修改来源 auto 不弹卡）、2 个 mock-only 失败注入任务（`evidence-gap` 证据不足回填、`tool-failure-recovery` 工具失败后改写入恢复）与 1 个根外写入约束任务（`root-out-write`，mock-only：首写被规划门控拦截 → 批次卡显式授权 → 执行）。
- `task-success.cjs`：Electron 探针，隔离 userData/HOME；默认本地 mock SSE；`NF_TASK_SUCCESS_REAL=1` 时改为真实 OpenAI 兼容端点（本机 Magpie）。按剧本发协议工具与真实工具调用，脚本点击确认/授权卡，结束后核验文件并审计隔离 userData 时间线（`approvalSource`、`completion.evidence_missing`、委托越界）。`mockOnly` 任务（失败注入类）在真实模式下跳过。
- `run-task-success.cjs`：每任务独立进程运行器，报告写 `.scratch/evals/product/`。

```bash
# 仓库根（需先构建 apps/desktop）
node evals/product/run-task-success.cjs
node evals/product/run-task-success.cjs --tasks write-single,script-bash
node evals/product/run-task-success.cjs --repeat 3 --timeout-ms 120000
# 信任模式覆盖（strict/standard/delegated；任务自带 trustMode 时以任务为准）
node evals/product/run-task-success.cjs --tasks strict-first-write --trust-mode strict
node evals/product/run-task-success.cjs --tasks delegated-edit --trust-mode delegated
# 真实模型 pilot（凭据只从环境变量读取，不写值；默认 http://127.0.0.1:3425/v1）
node evals/product/run-task-success.cjs --mode real --tasks approve-files-write --timeout-ms 600000
```

- 退出码：`0` 全部通过；`1` 有任务失败；`2` 参数/环境错误。
- **非人类**：mock 剧本固定，点击由脚本完成；`real` 模式虽由真实模型生成工具调用，但仍是固定剧本驱动与小样本 pilot，不代表模型能力或真人任务成功率。
- 授权卡出现时脚本点「允许执行」；剧本内清单写由产品默认 `standard` 信任模式自动放行。拒绝路径任务（`reject-*`）按任务标记点第一次出现的拒绝按钮（目标「重新描述」/ 方案「修改方案」/ 授权卡「拒绝」），之后由脚本代表用户发送恢复文本（「继续」），验证拒绝后产品能回到正向流程并完成。
- 原始数据与任务产物只在 `.scratch/`（gitignored）；凭据类环境变量在子进程启动前剔除；`real` 模式仅把 `MAGPIE_GATEWAY_KEY` 值注入子进程的 `NEONFORGE_API_KEY`。
