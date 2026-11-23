# 产品级任务成功率基线（初版，2026-11-23）

> 性质：**产品编排成功率**基线——不是模型能力成绩，不是人类任务成功率，也不是 SLO 达成声明。
> 固定剧本由本地 mock 模型通过产品的协议工具与真实工具执行驱动；覆盖目标确认、方案确认、审批与完成对账全链路。

## 基本信息

| 字段     | 值                                                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 测量日期 | 2026-11-23 06:59 UTC（WSL）/ 2026-11-23 07:02 UTC（Mac）                                                                                         |
| 产品代码 | `e01977c`（main；产品任务成功基线 PR #113 合并后；探针为 6 任务扩版，未改产品代码）                                                              |
| 测量脚本 | `evals/product/task-success.cjs` + `task-suite.cjs` + `run-task-success.cjs`（仅测量，不改产品代码；本轮扩为 6 任务并新增 `--mode real`）        |
| 运行环境 | WSL2 `6.18.33.2-microsoft-standard-WSL2`；Intel i5-14400（12 线程）；16 GB；`xvfb` 1280×800；`--disable-gpu --no-sandbox`                        |
| 目标机   | 2018 MacBook Pro（`MacBookPro15,1`）；i9-8950HK（12 线程）；32 GB；macOS 15.8.3（Darwin 24.6.0）；默认 GPU                                       |
| 运行时   | Electron 43.4.0 / Chrome 150.0.7871.224 / Node 24.18.1                                                                                           |
| 上游     | 本机 OpenAI 兼容 mock（固定剧本：协议工具调用 / 真实工具调用 / 完成声明；非流式文本）                                                            |
| 凭据     | 仅假 Key；真实凭据环境变量在启动前剔除                                                                                                           |
| 原始数据 | WSL `.scratch/evals/product/task-success-2026-11-23T06-59-39-916Z.jsonl`；Mac `.../task-success-2026-11-23T07-02-49-178Z.jsonl`（均 gitignored） |

## 测量方法

- 加载真实 `dist/main/main.js`，隔离 `userData`/`HOME`/`XDG`；三个产品 provider 固定 origin 在探针进程内路由到本地 mock（不改产品代码/注册表）。
- 启动页填入任务 prompt → 点「从零开始」→ 产品真实创建项目目录并自动发送首轮。
- mock 按固定剧本返回：`propose_goal` → 用户脚本点击「确认目标」→ `propose_plan` → 点击「确认执行」→ 真实 `write/edit/bash` 调用（命中授权卡时点击「允许执行」）→ `report_completion` → 系统代跑只读证据 → 「已解决」卡 → 点击。
- mock 路由只按「用户确认文本」「普通工具结果」「协议工具结果」区分，不依赖请求序号猜测；协议工具的合成 `role: tool` 结果不会推进动作轮。
- 任务集 6 个：单文件写入、两文件脚本 + `bash` 运行、`edit` 授权卡 + README 标题替换、HTML + grep 证据、三行笔记精确内容、`approve-files` 清单申报后写入（授权卡 → 写入）。
- 每个任务在独立 Electron 进程与独立 HOME/userData 中运行；产物在任务结束后由探针按内容逐项核验（含 `node check.js` 真实运行）。
- 全部 18 次运行（每平台 3 轮 ×6 任务）都点击到「已解决」卡并完成。

## 结果

| 平台 | 轮次 |  通过 | 失败 | 每任务耗时中位 | 目标卡中位 | 方案卡中位 | 首次授权卡中位 | 已解决卡中位 |
| ---- | ---: | ----: | ---: | -------------: | ---------: | ---------: | -------------: | -----------: |
| WSL  |    3 | 18/18 |    0 |       约 4.3 s |     203 ms |    1122 ms |        1980 ms |      2726 ms |
| Mac  |    3 | 18/18 |    0 |      约 11.6 s |     869 ms |    3538 ms |        6516 ms |      8295 ms |

- WSL 单任务耗时 4.2–7.6 s，Mac 11.0–13.5 s；差异主要来自 Electron/渲染器固定开销（与启动、工具基线一致）。
- Mac 的目标卡/方案卡/授权卡/已解决卡都晚约 2–4 倍，但顺序与点击成功率不受影响。
- 各任务检查：`write-single` 1/1、`approve-files-write` 1/1、`script-bash` 3/3、`edit-readme` 2/2、`write-html` 1/1、`write-notes` 1/1；0 次产物核验失败。
- 授权卡点击次数：`approve-files-write`、`script-bash` 与 `edit-readme` 每个进程 1 次（符合剧本），其余任务 0 次（清单内写由标准信任模式自动放行）。

## 真实模型 pilot（小样本，未计入基线）

- 配置：本机 Magpie `http://127.0.0.1:3425/v1`，模型 `opendesign/deepseek-v4.1-flash-eco`；凭据只从 `MAGPIE_GATEWAY_KEY` 环境变量注入子进程 `NEONFORGE_API_KEY`，不落盘；任务脚本、点击与产物核验同 mock 基线。
- 原始数据：套内 `.scratch/evals/product/task-success-2026-11-23T07-02-21-746Z.jsonl`；单任务 `approve-files-write`（通过）`.../task-success-2026-11-23T07-01-13-758Z.jsonl`；`write-single` 600 s 重跑 `.../task-success-2026-11-23T06-45-42-801Z.jsonl`（均 gitignored）。
- 独立单任务 `approve-files-write`（超时 600 s）：**通过**，36 s 完成——目标卡 12.1 s → 方案卡 20.1 s → `approve-files` → 授权卡点击 → `write` → `report_completion` → 已解决卡 34.7 s。说明真实模型下产品链路本身可以走通。
- 6 任务顺序跑（每任务 300 s 超时）：**0/6 到达已解决卡**，全部 301 s 超时；其中 `write-single` 与 `write-notes` 产物核验完全正确，仍停在收口前——
  - `write-single`：目标卡 23.6 s、方案卡 29.5 s 均确认，`fileCheck result.txt` 通过（真实写成功），但随后产品重弹无新提议的方案决策点（`session.pending_set kind=plan`），模型停在等待，始终未发 `report_completion`，300 s 超时（单独 600 s 重跑同样超时）。
  - `approve-files-write`（套内）：目标确认后模型直接 `write`，产品按规则拦截（`tool.blocked gate=confirm`）并置方案决策点，但模型未再 `propose_plan`，`planCardMs` 为空、无产物，300 s 超时。
  - `write-notes`：目标卡 7.4 s、方案卡 21.9 s 均确认，`notes.md` 三行内容精确通过，但同样停在收口前。
  - `script-bash`：两文件写入后 `node check.js` 运行通过（检查项 2/3 通过，`check.js` 内容与剧本断言行不同），随后同样未收口。
  - `edit-readme` / `write-html`：`edit`/`write` 与授权卡都已发生（`firstApprovalMs` ≈28 s / 27 s），但产物内容与剧本不完全一致（模型改写标题句式、说明句措辞），且未到已解决卡。注意：`write-html` 的逐字说明句、`script-bash` 的逐字断言都未在任务 prompt 中要求，属探针沿用 mock 内容带来的严格性，不作模型能力结论；`edit-readme` 的标题则是 prompt 明确要求的文案。
- 结论：阻塞点在「`write` 成功后产品重新置位方案决策点、模型据此停等」，属产品与真实模型交互的问题，不是探针剧本；单任务 `approve-files-write` 的一次通过证明链路可完成。修复该决策点重弹后应重取真实模型证据，本轮不把 pilot 计入成功率。
- **修复后回归（2026-11-23 08:45–08:58 UTC，PR #115）**：
  - 首批三任务（同一模型，300 s 超时）：`write-single` **32 s**（目标卡 9.0 s → 方案卡 16.1 s → 已解决卡 30.7 s，`result.txt` 核验通过）、`approve-files-write` **45 s**（18.8 / 27.2 / 43.3 s，`approved.txt` 核验通过，1 次目标前催促）、`write-notes` **37 s**（9.9 / 16.3 / 35.1 s，三行精确通过），**3/3 通过**；修复前同任务 300/600 s 均超时。原始数据 `.../task-success-2026-11-23T08-45-14-707Z.jsonl`。
  - 剩余三任务：`edit-readme` **通过**（46 s；11.6 / 22.8 / 44.7 s，1 次授权卡点击，首行 `# 任务三交付`、正文保留，2/2 检查）；`script-bash`、`write-html` 都到达并确认了已解决卡（53 s / 38 s），但产物核验各差一项——`check.js` 未含逐字断言串 `add(2, 3) !== 5`（模型写成等价先取 `actual` 再判断；`node check.js` 仍输出 PASS），`index.html` 说明句被改写（`<h1>` 正确）。两处逐字串本就不在任务 prompt 里，属探针沿用 mock 内容的严格性，不作模型能力结论。原始数据 `.../task-success-2026-11-23T08-51-25-097Z.jsonl`。
  - 合计 4/6 任务全项通过、6/6 到达并确认已解决卡（修复前 0/6 到卡）。mock 修复后回归：WSL 18/18（`.../2026-11-23T08-43-34-658Z.jsonl`）与 Mac 18/18（`.../2026-11-23T08-50-28-120Z.jsonl`）。仍是单机小样本，不作模型能力或真人成功率结论。
- **修复后回归 #2（2026-11-23 10:13–10:24 UTC，渲染守卫生效）**：
  - 根因：目标确认后模型直接 `write`（未 `propose_plan`），产品拦截（`tool.blocked gate=confirm`）并置 `pending=plan`，占位执行确认卡挂在**该条 assistant 消息**上；该消息 `content` 为空、无协议工具调用，被卡渲染外层门 `(m.content || hasProtoCall(...))` 整体排除 → 卡不渲染（`card.shown exec-confirm` 遥测照常打点，是诊断混淆源），模型停等（修复前 301 s 超时）。修复：外层门同时接受「含副作用工具调用」的消息（`ConversationPanel.tsx`）。
  - 确定性复现：任务集扩为 **7**，新增 `direct-write-after-goal`（mock 目标确认后直接 `write`，被政策拦后走 `approve-files` → `write` 恢复）。修复前同一剧本 45 s 超时、`planCardMs` 空（`.../2026-11-23T09-16-44-319Z.jsonl`）；修复后 **通过** 5 s（目标 203 / 方案 1130 / 授权 2723 / 已解决 3841 ms；`.../2026-11-23T10-13-43-636Z.jsonl`）。
  - L3 回归：`cards-from-decision-content::S3-3c`（目标确认后直写被拦 → 占位「确认执行」可见）；临时回退修复该用例必失败。
  - mock 回归：7 任务 ×1 轮 **7/7**（`.../2026-11-23T10-14-37-328Z.jsonl`）、×3 轮 WSL **21/21**（`.../2026-11-23T10-15-37-058Z.jsonl`）；Mac 重建后 ×3 轮 **21/21**（Mac `.../2026-11-23T10-41-29-754Z.jsonl`）；单测 944/944、双 tsc 0、eslint 0 error、Prettier 通过。
  - 真实模型：修复前 301 s 超时的 `approve-files-write` **通过** 38 s（8.8 / 17.9 / 授权 23.0 / 已解决 36.0 s，0 错误工具调用；`.../2026-11-23T10-21-53-724Z.jsonl`）。全 6 任务套跑：**3/6 全项通过、6/6 到达并确认已解决卡**（`write-single` 68 s、`approve-files-write` 31 s、`script-bash` 68 s、`edit-readme` 57 s、`write-html` 49 s、`write-notes` 38 s；`.../2026-11-23T10-22-49-709Z.jsonl`）。
  - 剩余失败形态（均未再出现停等/死锁）：
    - `write-single`：模型把目标路径解释为项目根**上一级**的绝对路径（`~/Documents/NeonForge/result.txt`），`approve-files` 申报同名绝对路径后脚本批准，产品按批准执行；文件内容正确但不在会话项目目录，探针按项目目录核验故缺失。当前产品对 write 无「必须在项目根内」的硬约束（用户批准即权威），记为后续加固候选。
    - `script-bash` / `write-html`：仅逐字串检查未过（`check.js` 断言等价改写，`node check.js` 仍 PASS；`index.html` 说明句改写，`<h1>` 正确）。两处逐字串不在任务 prompt，属探针沿用 mock 内容的严格性。
  - 结论：两个已知停等死锁（write 成功后重弹方案决策点、直写被拦后无卡）在真实模型复测中均已消失；剩余失败为路径解释与探针逐字串严格性，不是产品编排阻塞。
  - **测量对齐（2026-11-23 10:42–11:00 UTC）**：把历史「prompt 外逐字串」检查写入任务 prompt——`script-bash` 的 prompt 现逐字给出断言语句 `if (add(2, 3) !== 5) { console.log('FAIL'); process.exit(1) }` 与 PASS 要求；`write-html` 的 prompt 现要求正文包含原句「这是任务四的说明文字。」。历史轮次数字不追溯修改。对齐后 mock 7 任务 ×3 轮仍 **21/21**（`.../2026-11-23T10-42-48-796Z.jsonl`、`.../2026-11-23T10-51-49-864Z.jsonl`）；真实模型 `write-html` **2/2 通过**（75 s / 40 s）、`script-bash` 独立复测 **2/2 通过**（48 s / 67 s，均 3/3 检查；`.../2026-11-23T10-54-09-897Z.jsonl`）。
  - 对齐过程中 `script-bash` 曾出现一次 301 s 未收口（第 1 轮、prompt v1 歧义）：模型逐字用了 `add(2, 3) !== 5` 但写成「取反后当通过条件」（`const passed = add(2, 3) !== 5` → 断言失败 → `node check.js` 退出码 1），随后自我发现矛盾，多次 `report_completion` 被证据门拒绝、反复授权重跑 `node check.js`；prompt 明确方向后不复现。结论：对齐后两任务的产物核验可直接由 prompt 判定，属模型生成质量范畴，不是产品死锁。
- **拒绝路径任务（2026-11-23 11:50–13:00 UTC，任务集扩为 10）**：
  - 新增 `reject-goal`（目标被否 → 重新描述 → 确认 → 执行 → 已解决）、`reject-plan`（首个方案故意偏离 → 修改方案 → 修正方案执行，检查「偏离文件未创建」）、`reject-approval`（`bash` 写文件弹授权卡 → 拒绝 → 用户「继续」→ `approve-files` 批次批准 → `write` → 已解决）。
  - 探针新增拒绝/恢复驱动：按任务标记点第一次拒绝按钮（「重新描述」/「修改方案」/授权卡「拒绝」）；授权卡拒绝后空闲 2 s 发送「继续」；拒绝后模型追问方向时点第一个 `ask_user`/`<candidates>` 选项；ADR-010 强制澄清卡点「确认执行」继续 underlying。
  - mock：修复后 10 任务 ×3 轮 **30/30**（WSL `.../2026-11-23T13-05-58-079Z.jsonl`；Mac 重建后 30/30，Mac `.../2026-11-23T13-15-58-987Z.jsonl`；修复前同类轮次亦 30/30，`.../2026-11-23T12-04-48-976Z.jsonl`）；拒绝三任务 ×2 轮 6/6（`.../2026-11-23T12-56-38-961Z.jsonl`）。
  - 拒绝链路暴露并修复第三个「pending 冻结」形态：方案确认后模型再次 `propose_plan`（真实模型在拒绝后常重提修订方案），协议层幂等覆盖置 `pending=plan` + 新快照，但卡渲染条件仍要求 `!planConfirmed` → 卡不渲染、模型停等（真实模型 `reject-goal` 301 s）。修复：**结构化方案快照（`dcKind==='plan'`）在 `planConfirmed` 后仍渲染**（新提议需再确认，与 ADR-006 目标重提议对称）；信号兜底/占位卡仍只在方案未确认时显示。L3 新增 `S3-3d`（方案确认后重提议 → 新方案卡可见；临时回退修复该用例必失败）。全文件 L3 36/36、单测 944/944、双 tsc 0、eslint 0 error。
  - 真实模型：`reject-plan` **通过** 66 s（目标 7.9 / 首个方案 14.4（点「修改方案」）/ 修正方案 32.1 / 授权 44.8 / 已解决 64.7 s，2/2 检查；`.../2026-11-23T12-38-01-546Z.jsonl`）；`reject-approval` **通过** 44 s（`.../2026-11-23T12-52-48-385Z.jsonl`；标准信任模式下模型跳过 bash 直接 write，拒绝分支未触发，路径仍完整）。`reject-goal` 首次 301 s：拒绝后模型用 `ask_user` 追问方向，探针当时未作答 → 停等；探针补答选项（点第一个 `ask_user` 选项）后复测 **通过** 247 s（目标卡 207.5 s 才出现——模型先做长探索，拒绝 207.5 s → 重提议确认 214.2 s → 方案 230.8 s → 已解决 245.0 s；`.../2026-11-23T12-57-19-749Z.jsonl`）。拒绝路径真实模型 3/3 任务到达已解决卡（`reject-approval` 本次未触发授权卡，属模型选择差异）。

## 解释

- 这组数字说明：在固定剧本下，产品的「目标 → 方案 → 授权 → 执行 → 证据对账 → 已解决」链路可重复走通，且产物内容与任务要求一致。
- **不是模型能力成绩**：剧本由 mock 提供，模型生成质量、澄清质量、方案合理性都未参与。
- **不是人类任务成功率**：点击由页面脚本完成，没有真人阅读、犹豫、误点或中断恢复。
- 早期失败暴露的是探针剧本与产品语义不一致（完成证据必须拆成 `command` + `output`，否则系统代跑把整串括号文案当 shell 命令），不是产品缺陷；修正剧本后稳定通过。
- Mac 首轮失败是 mock 路由把协议工具的合成结果当成动作轮结果，导致 `write` 在目标确认后立刻发出并被正确拦截；修正路由后稳定通过——这条也说明产品的「目标确认前不执行副作用工具」门控是生效的。

## 限制

- **固定剧本（基线部分）**：基线为 6 个短任务，2026-11-23 后扩为 10 个（新增顺序违规恢复任务 `direct-write-after-goal` 与三个拒绝路径任务 `reject-goal`/`reject-plan`/`reject-approval`）；mock 回复固定；不代表真实模型、长任务、多文件项目、工具失败或网络。真实模型 pilot 是小样本探索，未计入基线。
- **脚本非人类**：无阅读时间、犹豫、误点、拒绝路径或中断/恢复；不产生 SUS/HEART 或真人审批数据。
- **单机单版本**：WSL2+xvfb 与一台 2018 MacBook Pro；无 Windows、Apple Silicon 或其他 macOS 版本。
- **信任模式固定**：使用默认 `standard`；`strict` / `delegated` 与「允许并记住」路径未覆盖。
- **拒绝路径已覆盖，失败路径部分**：2026-11-23 起覆盖拒绝目标（`reject-goal`）、拒绝方案（`reject-plan`）、拒绝授权卡（`reject-approval`）及拒绝后的恢复；证据不足回填引导仅由 mock 剧本间接覆盖（`script-bash` 证据门拒绝重试路径），工具执行失败/网络失败仍未覆盖。
- **不是 SLO**：没有提案阈值对应「任务成功率」；本轮只建立基线。

## 安全与边界

- 仅假 Key 与隔离用户数据；真实凭据环境变量在启动前剔除；原始 JSONL 与任务产物只落 `.scratch/`（gitignored）。
- 项目目录建在隔离 HOME 的 `Documents/NeonForge` 下，退出后不残留到用户真实目录。
- 剧本不包含外部网络请求；`web_search`/`web_fetch` 未使用。

## 关联

- 工具与审批基线：`baselines/2026-11-22-product-tool-execution-baseline.md`、`baselines/2026-11-22-product-tool-ipc-baseline.md`、`baselines/2026-11-22-product-approval-ui-baseline.md`
- 信任模式与授权边界：`baselines/2026-11-19-neonforge-approval-boundary.md`
- SLO 计划：`../slo-and-performance-plan-2026-11-19.md`
