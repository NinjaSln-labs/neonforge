# UAT / e2e 问题汇总与收口（2026-09-30）

> 对照：`docs/audits/uat-open-issues-rootcause-2026-09-29.md`（K1–K8）  
> 关单：`t000057` · Mac 8/8（tiers T1–T4=0 + personas 四档=0）· G11 Key 路径  
> 本文件只记「发现了什么 / 原根 / 怎么收」，不含密钥。

---

## 终态

| 轴 | 结果 |
|----|------|
| `run-uat-tiers.sh` | T1=T2=T3=T4=**0** |
| `run-uat-personas.sh` | G-impatient / G-picky / G-boundary / G-web=**0** |
| 关单 Key | `NF_UAT_KEENABLE_KEY`（WSL→Mac `/tmp/nf-uat-key-keep` export 形） |

---

## 问题总表（本次 e2e 发现 → 处置）

| ID | 现象 | 原根簇 | 处置 | 证据/交接 |
|----|------|--------|------|-----------|
| **K1** T2 `multiFile=false` | 已 write 仍断言失败 | harness 只读 produced 路径 | 兼读 `tool.requested.args.path` | t000053 closed |
| **K2** T1/T4 证据门空转 | `evidence_missing` + `forced` 环 | 计划路径相对↔绝对不一致；回填不可执行 | `matchesPlannedPath` + 可执行 backfill | t000054 |
| **K3** 「交付了过不了已解决」 | 命题/对账错位 | 成功≠工具执行完 | **ADR-011** V1a / 谓词 / Registry 内透 / 真探活 / goal\|\|plan 续跑 | R2 T1+G-boundary；决策 011 |
| **K4** 调研后不提议 / 澄清卡死 | T3/G-web 无 `propose_*`；候选只答一轮或误点 | 文本 nudge≠协议推进；候选选择器过宽 | 指纹多轮 clarify（`.nf-candidates`）；禁全局 `candidate#N`；点后勿 type-ask | t000059/060/061；3a |
| **K5** Mac 外网开不了 / 脚本假阴 | `webAccessUiOk=false` 或 `webToolCount=0` | DDG 不可达；静默 `/public` 禁用后无 Key/试用；timeline 错文件 | Keenable Key 或显式试用；关单强制 Key（G11）；UD 全量 timeline 计 web 工具 | Task1 trial 诊断；Task4 key PASS |
| **K6** G-picky 拒计划后半程 | `planRejects=2` 后 timeout | 拒后不重提 / 证据后不重报 | `shouldNudgeProposeAfterPlanReject`；`shouldNudgeReportAfterEvidenceMissing` + backfill 禁纯文字 | t000058；Task2b |
| **K7** T4 残留 timeout | 曾与证据门缠在一起 | 取证后本轮 **leaf E 且脚本 PASS** | 无 2b；关单轮 T4=0 | Task2 |
| **K8** L5 视觉 flake | `.nf-start` / AA | mock 契约 / 宿主基线 / 偶发超时 | A mock 单源；B Mac-only 基线 + `fonts.ready`；C WSL solo 未复现超时 — Mac 全量 L5 仍建议复验后再称全关 | [plan](../superpowers/plans/2026-09-30-k8-l5-visual-harness.md)；fix/k8-l5-visual-harness |
| **配置页连跑挂起** | G-picky 卡「验证并开始→从零开始」180s；独跑绿 | 连跑 Electron/9222 残留；validate 一次失败 | validate≤3 重试 + 已在启动页跳过；9222 忙 `kill -9` | t000062 |
| **合规** 静默公共搜索 | 生产静默打 `/public` | 合规禁止 | 禁静默 `/public`；设置 Key + 可选显式试用 | p000134；Keenable plan |

---

## 关单轮残留链（t000057 拆单）

| Action | 症状 | 收口 |
|--------|------|------|
| t000058 | G-picky：`evidence_missing`×1 后无再 `report_completion` | 产品 nudge 重报 |
| t000059 | G-web：clarify 后无 `propose_goal` | harness 候选 + webTool 计数 |
| t000060 | T3 timeout（web-ask 后） | 与候选误点/type-ask 同修后绿 |
| t000061 | G-boundary `probeSent=false` | `candidate#6` 误点 → 收紧 `.nf-candidates` |
| t000062 | G-picky 配置页超时 | validate 重试 + 强杀 9222 |

（更早 leftover：t000053–056 已在 R1/R2 关闭。）

---

## 改动落点（代码，便于回看）

| 层 | 要点 |
|----|------|
| 产品 | ADR-011 命题成功；`shouldNudgeProposeAfterResearch` / `AfterPlanReject` / `ReportAfterEvidenceMissing`；Keenable `webTools` + Settings；多厂商 catalog |
| Harness | `scripts-cdp/uat-T*.mjs` `uat-G-*.mjs`；`uat-lib`（keenSource、候选指纹、config 重试）；`run-uat-tiers/personas.sh`（隔离 UD + key-keep source） |
| 文档 | ADR-011；Keenable / UAT open-fix 计划；本 closeout；coverage-matrix / uat-tier-baseline |

---

## 仍非本次关单范围

- **K8** L5：方案已落地（[plan](../superpowers/plans/2026-09-30-k8-l5-visual-harness.md)）；A/B 已修、C WSL solo 未复现；**Mac 全量 L5 复验前不宜称全关**  

- 发布/博客等非 UAT action（t000011–013）  
- 未要求不 commit 前的本机 `.handoff/` / `.scratch/`（不入库）

---

## 复跑（Mac）

```bash
set -a; . /tmp/nf-uat-key-keep; set +a   # 须含 NF_UAT_KEENABLE_KEY + NEONFORGE_COMMANDCODE
cd ~/Documents/ninjasin-labs/neonforge/apps/desktop
bash scripts-cdp/run-uat-tiers.sh
bash scripts-cdp/run-uat-personas.sh
# 期望两份 /tmp/nf-uat-*-results.txt 全 0
```
