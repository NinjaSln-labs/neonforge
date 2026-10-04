# ADR-017 阶段 A＋B 完成报告（授权窗口一等化——施工收口）

日期: 2026-10-03 ｜ 计划: `docs/superpowers/plans/2026-10-03-approval-window-journal.md` ｜ 执行: Subagent 驱动（每刀一 agent＋主会话双段评审：报告↔diff 核对＋独立复跑）｜ 分支: `test/uat-persona-3round`（本报告后共 **15 提交待推/已推**，见 §4）

## 1. 交付总览

| 阶段 | 提交（时序） | 内容 | 性质 |
|---|---|---|---|
| A | `b524a9b` → `3ca62a7` → `8217164` | approvalJournal 模块（bootNonce-in-id 防撞/JSONL 容错/键序无关指纹）；needApproval 咽喉签发（ToolResult 两可选字段向后兼容）；执行阶段链 issued/approved/started/done（只记不判） | 行为零改动，可独立发 |
| B | `dc10287` → `c9e9256` → `8137249` → `ec970db` → `b714f88` → `3c5a70f` → `3e511c3`＋`53b23f7` → `0593f25` → `e9e66c6` → `e60ccd5` | 窗类型面→八函数→事件派生→hook+IPC→四入口接线→评审修→**D5 退役**→双 id/停止=denied→**盲信面关闭+规则显式序**→L3 收口 | 原子对（中途不可发，现整对完成） |

## 2. 出口门禁（fresh 证据）

- **L1**：48 文件 / **769/769** 绿（阶段起点 727 → 净增 42 案，零删改语义）
- **双 tsc**（renderer+main）：通过 ｜ **eslint**：0 error（6 既有 react-hooks warning 与本批无关）
- **L3 interaction**：B8 三轮（68/73/72）＋主会话独立第四轮 **72/74**——**逻辑红 0**；全部红同一签名：`.nf-start` 5s expect 在冷 vite/负载轮的挂载超时（flake 家族 S7-1/#7-2/v4:1372/retry/:173/:775/S4-3/factory——各案单跑或他轮均绿）。对照阶段 A 基线 74/74：无新增稳定红。
- **ADR-012 合规**：每轮测批间零改动；间歇红单跑复核、未修断言。

## 3. 施工期发现与处置（超出计划的部分，均有裁定依据）

1. **B1 误报纠偏**：主会话曾误报 B1 已入库；B2 子代理 git 核实缺失后先行补提交 `dc10287`——Subagent 独立核实价值实证。
2. **合并授权劫持（B5 真 bug）**：execute 回填按 name 匹配，同轮兄弟卡被首个 resolve 全量劫持共用一个 approvalRequestId→第二张闸 miss；同刀改 tcId 精确定位。
3. **file-approval 入窗统一提前（B5）**：approve-files 弹卡即 main 签发入窗（v11 审计必修 #4、提案定稿 §30 行"虚拟工具同样签发"）——文本批准路由随 kind 分派。
4. **盲信面关闭的清单内 write 例外（B7 处置 (b)）**：`write ∧ filesApprovedRef ∧ 清单内` 由 main 自证放行（零 IPC 往返）；bash/edit 的 renderer 布尔无 id 一律拒——"renderer 不判断"（02:188）自此有执行面 teeth。真机行为变更清单已录 B7 报告（未点卡时布尔直批线终结→模型经卡重批；C3 sessionGrants 归位后免卡线另承）。
5. **计划自审级错误两处由实现期测试语义纠正**：`by?` 可选与 decidedBy 断言矛盾（改默认参）；decision 联合逗号语法（改分号）。
6. **journal 换指纹拒（批 A 行 B TOCTOU）**未在本批启用——journal 仍只记不判，归 C2 恢复判（观察项在册）。

## 4. 推送与遗留

- **推送**：本报告提交后 `test/uat-persona-3round` 全量推 origin（用户 2026-10-03 明确授权）。
- **遗留（不阻塞阶 C）**：① flake 治理（`.nf-start` 超时 5s 偏紧/warmup——待裁）；② `conversation.error` detailKeys 主面已修（B4.2 修复刀），dev console 残余 warn 复核归阶 C 收口；③ t000011–013/065–070 fresh-queue 关单仪式（发布轴旧账，与本批无关）。
- **阶段 C 待开工**：C1 会话信封（数组→`{messages, approvalWindow?}`＋旧档兼容）→ C2 恢复三判对账＋uncertain 用户裁决卡（含 TOCTOU 核验启用）→ C3 规则三档权威归 main（clearSessionGrants/sessionGrants 免卡线承接）。

## 5. 手顺账

handoff `t000075` 已录 A/B 全链进度；决策链 d000043–d000046；审计链 final-review-v3.1-* 三轴＋stage-a-report-stage-b-precheck。
