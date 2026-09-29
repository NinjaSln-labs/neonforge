# 主分支未预发 · 三轮多样性人格 UAT（2026-09-30）

> 产品水位：`main` @ 测前 HEAD（未 GitHub Release 预发）。  
> 硬闸：**ADR-012**——测中只记问题，三轮跑完再汇总，等用户裁决后才修。  
> 入口：`bash scripts-cdp/run-uat-persona-rounds.sh <1|2|3>`（Mac · Key 路径）。

## 轮次设计（人格跨轮不重复）

| 轮 | 人格 | 脚本 | 压什么 |
|----|------|------|--------|
| **R1** | 急躁 · 挑剔 | `uat-G-impatient.mjs` · `uat-G-picky.mjs` | 催进度插话；拒方案×2 后收敛 |
| **R2** | 小白 · 矛盾 | `uat-G-novice.mjs` · `uat-G-contradictory.mjs` | 术语不清/甩锅模型；目标深浅色摇摆 |
| **R3** | 越界 · 会查资料 | `uat-G-boundary.mjs` · `uat-G-web.mjs` | 区外探针；须外网再动手 |

每轮 2 人设，六人设全库各跑一次。结果：`/tmp/nf-uat-r{N}-results.txt`。

## 记录模板（每失败一条）

- 轮次 / 人格 / rc  
- 症状（timeout / assert / 配置页 / CDP…）  
- 日志：`/tmp/nf-live.log` · timeline UD `/tmp/nf-uat-<name>-ud` · 脚本 stdout  
- **不临修**

## 跑次日志

（执行中追加）
