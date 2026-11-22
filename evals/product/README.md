# 产品级任务成功探针

固定剧本驱动**真实产品流程**，测量产品编排成功率（目标确认 → 方案确认 → 授权 → 工具执行 → 完成对账 → 已解决卡），并核验真实产物。

- `task-suite.cjs`：5 个固定任务与产物检查（纯数据，不依赖 Electron）。
- `task-success.cjs`：Electron 探针，隔离 userData/HOME，本地 mock SSE；按剧本发协议工具与真实工具调用，脚本点击确认/授权卡，结束后核验文件。
- `run-task-success.cjs`：每任务独立进程运行器，报告写 `.scratch/evals/product/`。

```bash
# 仓库根（需先构建 apps/desktop）
node evals/product/run-task-success.cjs
node evals/product/run-task-success.cjs --tasks write-single,script-bash
node evals/product/run-task-success.cjs --repeat 3 --timeout-ms 120000
```

- 退出码：`0` 全部通过；`1` 有任务失败；`2` 参数/环境错误。
- **非人类、非模型能力**：mock 剧本固定，点击由脚本完成；结果只代表产品链路编排，不代表真实模型或真人任务成功率。
- 授权卡出现时脚本点「允许执行」；剧本内清单写由产品默认 `standard` 信任模式自动放行。
- 原始数据与任务产物只在 `.scratch/`（gitignored）；凭据类环境变量在子进程启动前剔除。
