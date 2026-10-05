# 工作区规则

工程实体在 `apps/desktop`（仓库根无 `package.json`）。人类向介绍见 `README.md`。

## 通用规则

1. 凭据只引用环境变量或本机凭据文件路径，不写值（防入库泄密）。
2. 入库/推送前一律脱敏（本仓 PUBLIC）：家目录与用户名、内网 IP 与主机名、SSH 别名与密钥路径、邮箱、本地盘路径都不写；闸＝`python3 tools/desens-scan.py`（pre-commit 自动跑，命中即改）；`docs/frozen-be6e299/` 逐字冻结件不为此重写。
3. 提交用 Conventional Commits（feat/fix/docs/test/refactor/chore/perf），走 lefthook → lint-staged（钩子与历史一致）。
4. 测试与回归遵守 ADR-012 测完再修（防测中改码与擅自开修），正文 `docs/decisions/012-test-batch-then-fix.md`。
5. 单步预计超过 60s 时中途报告进度（防会话假死）。
6. 专属入口文件只留一行指针到本文件；规则全文只在本文件、`docs/decisions/` 或软链外挂技能内（技能正文归 agent-skills 仓）。
7. 交接纪律以下方「## 交接」块为准（块由 handoff CLI 维护，勿手填；漂移用 agents-block --check 抓）。

## 流程（0→1 流水线，全文＝ADR-026，推进机制＝pipeline-0to1 技能）

1. 用户负责方向（最终裁定权）；AI 负责补充（用户给的框架默认不是穷举，先补盲区再讨论）、纠偏（与既定目标冲突直说，不迎合）、把控 0→1 全程直至交付。
2. 段序：0 问题定义 → 1 产品定义 → 2 领域战略 → 3 领域战术 → 4 计划制定 → 5 详细设计 → 6 实现落地 → 7 测试验收 → 8 部署发布；横切独立审计（每段出口）与经验沉淀（.handoff）。
3. 用户亲裁段 0/1/2/7 与全部审计结论；段 3/4/5/6/8 AI 过闸＋报告备案；闸红不放行，闸结果记 .handoff。
4. 工件即接口：下段只认上段冻结的工件文件，不认会话口头约定；声明前先核 diff。
5. 禁止跨段作业：实现段发现设计错，回退设计段改工件重过闸，不就地打补丁。
6. 无豁免通道：一切变更走流水线；小修补（typo/脱敏/格式）从段 6 进入，段 6 闸与记录照走。
7. 外部 agent 调遣走 agent-dispatch 技能（软链外挂；机制全文见技能，权威源 ADR-026 D3）。产出过段6闸（见「## 命令」）才合入，合并权在主会话。任务书只给已入库工件路径；凭据与 `.handoff/`、`.scratch/` 不给。当前主不审本会话亲笔（当前主可轮换）。
8. 方向问题给建议并等用户裁定后执行；手段问题与既定目标无冲突直接做，不逐项请示。

## 命令

```bash
# cwd: apps/desktop（根 node_modules 不是依赖根）
npx vitest run                                                          # L1 单测
npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.main.json --noEmit  # 双 tsconfig 类型检查
npx playwright test --project=interaction                               # L3 interaction
npx eslint .                                                            # lint
npm run e2e   # 依赖 /tmp/nf-e2e-test（入口会建）；改 main/preload 后会重 build

# cwd: 仓库根
python3 "$HOME/.agents/skills/project-handoff/scripts/handoff.py" check  # 交接门禁
python3 "$HOME/.agents/skills/project-handoff/scripts/handoff.py" agents-block --check .  # 交接块漂移校验
python3 tools/desens-scan.py --selftest                                  # 脱敏闸自检
```

## 内容落位

1. 产品与领域设计（段 0–3 工件，现行唯一写入处）→ `docs/neonforgeV1.0.0/`（V1.0.0 射程；工作分支 `docs/neonforge-v1.0.0`）。
2. 设计提案与阶段契约（段 4/5）→ `docs/design/`（stage-spec 进 `stage-specs/` 子目录）。
3. 实现计划（writing-plans 产物）→ `docs/superpowers/plans/`。
4. 语义裁定与流程硬闸全文 → `docs/decisions/`（索引 `000-decision-log.md`）。
5. 审计报告（横切独立审计产物）→ `docs/audits/`。
6. 覆盖矩阵与追溯登记 → `docs/tests/coverage-matrix.md`。
7. Timeline 事件注册表 → `apps/desktop/src/domain/timeline.ts`。
8. 交接台账经验汇总（可迁移部分，属经验不属依据）→ `docs/experience/`。
9. 本机草稿与中间产物 → `.scratch/`（不入库）。
10. 只读经验层（不得编辑、不作依据，新版从零设计＝ADR-026）：旧设计文在 `docs/domain/`、`docs/product/` 原路径，冻结基线 be6e299 版在 `docs/frozen-be6e299/`（调阅等价 `git show be6e299:<路径>`），历史产品文档审计在 `docs/PRODUCT-DOC-AUDIT*`；索引与冻结评级见 `docs/neonforgeV1.0.0/ARCHIVE-INDEX.md`。
11. 本地私有 → `.git/info/exclude` 列明；`.handoff/` 在内（禁止入库，调阅走 CLI：view/log/next/check）。

## 交接

<!-- handoff:begin -->
- 条目只经 project-handoff 技能自带的 CLI 写；存储索引由脚本重建，勿手写。**手改不再「绕过门禁」**——`check` 逐文件对内容哈希，对不上即报「未经 CLI 记录的写入」，连「同字节覆写后补个手续」也会被写前旁证抓出来。
- 一条待办的**完成判据被满足时立刻 `close`**，别等提交。`close` 写的是交接事实，commit 写的是版本事实，**先落账再进版本**；攒着不提交会让已完成的条目一直挂 open，「还剩多少没做」当场失真（09-22 t000070 实测：活干完了、commit 标题里还带着该 id，却靠用户问「还剩什么」清点才发现没关）。一批活拆成多次提交、或结论要复验才能定终态时，以**判据满足**为准，不以提交次数为准。
- 收尾前跑该技能的 `check`（结构 ＋ 通用对账：各槽数量、status 闭集、引用闭合、`next` 存在且 open、文本槽无死指针；不判已作废 id 与 `c`/`d` 型）。`check rc=0` 只说明**可机械判定的部分**没问题，**不代表散文里的结论是实况**。
- 本轮有实质改动（闭条目／开条目／换 next）时刷新 `exit`；`exit`/`summary` 是给下一班的**陈述**，不是历史记录。
- `exit`/`summary` 等文本槽是**整槽覆写、无追加语义**：改前先 `--dry-run` 看将丢哪些行，别只把新段落喂进去。
- `check` 报出一批「写入**之前**发现被改动过」而你确信没手改：多半是判据缺陷留下的历史误报（修判据也消不掉已记的事件）。**先核对那几个文件确实没被手改**，再用 `rebase --force` 把基线对齐现实——它逐条打印「已结案」清单且**不可追回**，所以核对在前。
- 提及已闭条目时写 `t000095（已闭）` 这类显式标记——已闭与未闭不能靠读者推断。
<!-- handoff:end -->
