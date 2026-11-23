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
- **信任模式 strict 任务（2026-11-23 13:30–13:47 UTC，任务集扩为 11）**：
  - 新增 `strict-first-write`（任务级 `trustMode: 'strict'`，探针 `--trust-mode` 亦可全局覆盖）：方案确认后清单内 write 在 strict 档不自动放行，产品弹逐次授权卡，批准后写入。
  - 发现并修复：strict 档下 main `decide` 的「先调 approve-files」策略引导先于授权判定命中——方案已确认时模型收到的是「先审批文件清单」而非授权卡，无卡可点后直接改发完成声明、被证据门拒绝（301 s）。修复：`planConfirmed` 且信任模式为 `strict` 时 write 跳过该策略引导，落通用逐次授权（`needApproval`）；standard/delegated 语义不变。单测 +2（strict → needApproval、standard 仍 policy，946/946）。
  - mock：11 任务 ×3 轮 **33/33**（`.../2026-11-23T13-43-32-018Z.jsonl`，WSL）；Mac 重建后 11 任务 ×2 轮 **22/22**（Mac `.../2026-11-23T13-59-22-733Z.jsonl`）且 `--trust-mode strict` 单任务 12 s 通过（Mac `.../2026-11-23T14-03-59-187Z.jsonl`）；`strict-first-write` 单任务授权卡 1 次点击、5 s 通过。
  - 真实模型 strict：**通过** 41 s（目标 8.6 / 方案 16.2 / 授权卡 22.8 / 已解决 39.3 s，`strict.txt` 精确匹配；`.../2026-11-23T13-46-46-426Z.jsonl`）。
  - `delegated` 档仍由 L3 `trustModes.interaction.ts` 覆盖（清单内 edit 自动放行、来源 delegate），真实模型与任务套未覆盖。
- **信任模式 delegated 任务（2026-11-23 14:25–14:45 UTC，任务集扩为 12）**：
  - 新增 `delegated-edit`（任务级 `trustMode: 'delegated'`）：清单内 `edit` 由 renderer 自动批准（`approvalSource=delegate`）+ main 执行边界二次校验；产物核验 README 首行标题与正文保留。
  - 探针新增时间线审计：`collectDelegateAudit` 扫描隔离 userData/logs 的 `timeline-*.jsonl`，统计 `approvalSource=delegate` / `auto`（trusted 分支）的 write/edit 执行、`security.trust_delegation_denied` 与 write/edit 的授权卡请求；`delegateAuditCheck` 要求「有自动放行证据、write/edit 无授权卡」——bash 高危逐次授权不计违例（真实模型常用 bash 读取文件）。
  - 负控：同一任务临时以 `trustMode: 'standard'` 运行必失败（edit 在标准档弹授权卡、无 `delegate` 来源；`.../2026-11-23T14-42-42-311Z.jsonl`），确认检查能区分两档。
  - mock：12 任务 ×3 轮 **36/36**（WSL `.../2026-11-23T14-44-23-761Z.jsonl`；`delegated-edit` 单任务 4–7 s、3/3 检查）；Mac 重建后 12 任务 ×2 轮 **24/24**（Mac `.../2026-11-23T15-05-52-868Z.jsonl`；`delegated-edit` 单任务 11 s、3/3 检查）。
  - 真实模型：`delegated-edit` **通过** 52 s（目标 21.5 / 方案 27.8 / 已解决 50.7 s，`delegate` 执行 2 次、write/edit 授权卡 0 次、bash 授权卡 0 次；`.../2026-11-23T14-42-55-098Z.jsonl`）。两次同任务真实运行（14:35、14:39）：产物正确，但模型先发 `bash` 读文件触发授权卡、或先 `approve-files`（来源 auto）——首次审计把「任何授权点击/非 delegate 来源」判失败，按真实行为放宽为「write/edit 无授权卡 + 存在自动放行证据（delegate 或 trusted auto）」，两次运行实际也满足；审计口径变化如实记录。
  - 局限：`delegated` 与 `standard` 的差异仅在清单内 `edit`（`standard` 只自动放行 `write`）；「允许并记住」仍只有 L3 覆盖。
- **证据不足回填任务（2026-11-23 15:20–15:30 UTC，任务集扩为 13）**：
  - 新增 `evidence-gap`（`mockOnly` 失败注入）：动作轮后首次 `report_completion` 引用不存在的文件 `cat missing-evidence.txt`——系统代跑失败 → `completion.evidence_missing` 打点 + 【系统对账】回填引导；模型按引导重发正确证据 `cat evidence.txt` → 验收项通过 → 已解决卡。检查项：产物精确 + 时间线 `evidence_missing ≥ 1`（证明走了对账路径而非直通）。
  - mock：13 任务 ×3 轮 **39/39**（WSL `.../2026-11-23T15-28-27-843Z.jsonl`；`evidence-gap` 单任务 5–9 s、2/2 检查）；Mac 重建后 13 任务 ×2 轮 **26/26**（Mac `.../2026-11-23T15-35-08-772Z.jsonl`，`evidence-gap` 12 s）。单跑时间线实证：`decision.requested kind=plan → completion.evidence_missing(missing: verification:cat missing-evidence.txt) → conversation.system_nudge（系统对账）→ acceptance.item_passed(verification:cat evidence.txt) → decision.requested kind=resolution`。
  - 真实模式跳过 `mockOnly` 任务（真实模型通常首次证据即正确，无法强制注入错误声明；单跑真实 `evidence-gap` 35 s 到达已解决卡、产物正确、无 evidence_missing，不构成失败注入覆盖——运行器现在显式 SKIP 并报错当所选任务全为 mock-only）。
- **根外写入约束任务（2026-11-24 00:00–01:00 UTC，任务集扩为 14）**：
  - 新增 `root-out-write`（mock-only）：方案清单含根外 `../escaped.txt`，首个直写必须被规划门控拦截（`tool.blocked gate=policy`），随后 `approve-files` 批次卡显式授权 → 写入执行；检查上级目录产物 + 「未被自动放行」+「批次卡已批准」。
  - 真机复现（修前）：standard 信任模式下方案确认后 `plannedFiles` 含根外路径、renderer `autoApprovalSource` 判 in-plan 自动批准（`approvalSource=auto`），根外写直接执行、完成声明被 `diff:planned-not-produced` 否决后停等（124 s 未到已解决卡）。
  - 修复（PR #127）：① `authModel.shouldAutoApproveTool` 增根外硬边界（计划/委托判定对根外路径一律不自动；显式「记住/单次批准」仍优先）；② `derivePlannedFiles` 传入 rootPath 时过滤根外条目（renderer `useConversationState` 增 rootPath 选项）；③ renderer `canExecute` 动作路径统一 trustPath 规范化（根外/相对路径与绝对清单一致）；④ main `delegationBoundaryViolation` 增词法根外校验（根外字符串即使 realpath 落回根内也不委托）。单测 +3（authModel 根外、derivePlannedFiles 过滤、委托词法根外；949/949）。
  - mock 14 任务 ×3 轮 **42/42**（WSL `.../2026-11-23T16-55-27-802Z.jsonl`；`root-out-write` 5 s、3/3 检查）；Mac 重建后 14 任务 ×2 轮 **28/28**（Mac `.../2026-11-23T17-14-56-746Z.jsonl`，`root-out-write` 14 s）。
  - 真实模型：首次 301 s（模型先做长探索 + `ask_user` 追问，探针当时只对拒绝路径作答——探针已放宽为任何任务都作答候选选项），第二次 65 s 到达已解决卡但**模型把需求解释为项目根内创建**（方案 `escaped.txt`，安全自限、不在上一级写），根外路径未被触发——如实记录，任务标记 mockOnly（真实模型不会主动写根外，无法复现该约束）。
- **「允许并记住」任务（2026-11-24 01:20–01:30 UTC，任务集扩为 15）**：
  - 新增 `remember-edit`：standard 档首次 `edit` 弹授权卡，探针点「允许并记住」（`.nf-toolcall__remember`，任务信任绑定 README.md）；同文件第二次修改走 `trusted` → `approvalSource=auto`，不再弹卡。检查：产物两处 + 记住 1 次且 need-approval 点击 ≤1 + auto(trusted) ≥1。
  - mock：15 任务 ×3 轮 **45/45**（WSL `.../2026-11-23T17-26-36-622Z.jsonl`；`remember-edit` 5 s、3/3 检查）；Mac 重建后 15 任务 ×2 轮 **30/30**（Mac `.../2026-11-23T17-33-28-838Z.jsonl`，`remember-edit` 13 s）；真实模型 **通过** 52 s（记住 1 次、auto(trusted) 1 次、need-approval 1 次，README 两处检查通过；`.../2026-11-23T17-25-25-691Z.jsonl`）。
- **工具失败恢复任务（2026-11-24 01:45–02:00 UTC，任务集扩为 16）**：
  - 新增 `tool-failure-recovery`（mock-only 失败注入）：首个 `edit` 指向不存在的 failed.txt（必然失败），模型收到失败结果后改用 `write` 创建文件 → 完成声明与证据对账通过。检查：产物精确 + 时间线 `tool.failed ≥1`（证明失败被记录并恢复，而非直通）。
  - mock：16 任务 ×3 轮 **48/48**（WSL `.../2026-11-23T17-56-57-196Z.jsonl`；`tool-failure-recovery` 5–8 s、2/2 检查）；Mac 重建后 16 任务 ×2 轮 **32/32**（Mac `.../2026-11-23T18-08-26-805Z.jsonl`，`tool-failure-recovery` 13 s）。单跑时间线实证：`edit 需授权 → 批准 → edit 执行失败（找不到文件）→ write 成功 → report_completion → 已解决`。
  - 真实模式单跑 `tool-failure-recovery` 39 s 到达已解决卡且产物正确，但模型首次即用 write（未触发失败）——如实记录，任务标记 mockOnly。
- **bash 产出对账任务（2026-11-24 02:15–03:05 UTC，任务集扩为 17；产品修复合并见 PR #133）**：
  - 新增 `bash-produced-file`：模型用 `bash printf … > produced.txt` 创建计划内文件（write/edit 之外的产出途径）。真机复现**两个停机缺陷**：(a) 完成对账 `diff:planned-not-produced` 恒不通过（`producedFiles` 只记录 write/edit 的 `file`）→ 证据门反复拒绝、已解决卡不可达；(b) 修复 (a) 后 resolution 决策点已置位，但卡渲染仍要求 `producedFiles.size > 0` → `pending=resolution` 冻结、无卡可点。
  - 修复：(a) `completion:verify` 增加计划清单文件存在性核对（IPC schema/preload/types 同步扩展，`SystemVerifier.existingFiles` 参与 diff 判定——bash 途径产出也认定已产出）；(b) 已解决卡渲染去掉 `producedFiles` 二次否决（resolution 决策点只在完成对账通过后置位，卡渲染不该再用产出集合否决）。单测 +2（existingFiles 命中不 missing / 缺失仍 missing；951/951）；L3 92 passed。
  - mock：17 任务 ×3 轮 **51/51**（WSL `.../2026-11-23T18-54-10-409Z.jsonl`）；真实模型 `bash-produced-file` **通过** 44 s（`.../2026-11-23T18-46-48-127Z.jsonl`；修复前 304 s 停等）；修复后真实 `write-single`/`edit-readme` 复测 2/2 通过（`.../2026-11-23T18-58-29-077Z.jsonl`）。
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

- **固定剧本（基线部分）**：基线为 6 个短任务，2026-11-23 后扩为 17 个（新增顺序违规恢复任务 `direct-write-after-goal`、三个拒绝路径任务 `reject-goal`/`reject-plan`/`reject-approval`、strict 任务 `strict-first-write` 与 delegated 任务 `delegated-edit`、「允许并记住」任务 `remember-edit`、bash 产出对账任务 `bash-produced-file`、mock-only 失败注入任务 `evidence-gap`/`tool-failure-recovery` 与根外写入约束任务 `root-out-write`）；mock 回复固定；不代表真实模型、长任务、多文件项目或网络。真实模型 pilot 是小样本探索，未计入基线。
- **脚本非人类**：无阅读时间、犹豫、误点、拒绝路径或中断/恢复；不产生 SUS/HEART 或真人审批数据。
- **单机单版本**：WSL2+xvfb 与一台 2018 MacBook Pro；无 Windows、Apple Silicon 或其他 macOS 版本。
- **信任模式部分覆盖**：`standard` 为默认全量基线；`strict` 已有 `strict-first-write` 任务（mock 与真实模型均通过）；`delegated` 已有 `delegated-edit` 任务（mock 36/36 中含该任务、真实模型通过，审计要求 write/edit 无授权卡且自动放行来源 delegate/auto）；「允许并记住」已有 `remember-edit` 任务（mock 与真实模型均通过）。
- **拒绝路径与执行失败已覆盖；网络失败未覆盖**：2026-11-23 起覆盖拒绝目标（`reject-goal`）、拒绝方案（`reject-plan`）、拒绝授权卡（`reject-approval`）及拒绝后的恢复；证据不足回填（`evidence-gap`）与工具执行失败恢复（`tool-failure-recovery`）已有显式 mock-only 任务；网络失败仍未覆盖。
- **不是 SLO**：没有提案阈值对应「任务成功率」；本轮只建立基线。

## 安全与边界

- 仅假 Key 与隔离用户数据；真实凭据环境变量在启动前剔除；原始 JSONL 与任务产物只落 `.scratch/`（gitignored）。
- 项目目录建在隔离 HOME 的 `Documents/NeonForge` 下，退出后不残留到用户真实目录。
- 剧本不包含外部网络请求；`web_search`/`web_fetch` 未使用。

## 关联

- 工具与审批基线：`baselines/2026-11-22-product-tool-execution-baseline.md`、`baselines/2026-11-22-product-tool-ipc-baseline.md`、`baselines/2026-11-22-product-approval-ui-baseline.md`
- 信任模式与授权边界：`baselines/2026-11-19-neonforge-approval-boundary.md`
- SLO 计划：`../slo-and-performance-plan-2026-11-19.md`
