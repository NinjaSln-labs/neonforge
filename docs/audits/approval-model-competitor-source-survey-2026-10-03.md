# 授权模型竞品源码取证（22 家，F 盘语料 /mnt/f/neonforge-competitors）

日期: 2026-10-03 ｜ 方法: 两路 agent 源码级取证（A 组 12 家＋B 组 11 家）＋实现清点轴＋产品原意考古轴。历史报告 reports/neonforge-intent-confirmation-research.md 仅覆盖触发逻辑，pending 对象/键/容器全部新取证。

## 跨仓库模式统计（真实 grep，file:line 见两路原始报告）

| 模式 | 计数 | 代表（file:line） |
|---|---|---|
| 待批请求＝**id 键一等对象** | ≥15/22 | codex approvals.rs:270；gemini confirmation-bus/types.ts:38（id+correlationId 双键）；kilocode permission.ts:10；hkuds domain/approval.py:20（6 态含 expired）；opencode permission/index.ts:24；openclaw exec-approval-manager.ts:110；zcode interaction-broker.ts:78（三键） |
| **Map/queue 容器**承载 N 并发待批 | ~8 | codex turn.rs:90（turn 作用域 oneshot map）；crush permission.go:97；reasonix approval.go:87；kilocode/opencode/hkuds DB 仓储 |
| 单槽状态机且**事实仍在集合** | 2 | hkuds（WAITING_APPROVAL 是线程聚合态，授权是行）；DSH（单 Promise＋late-answer 丢弃 index.ts:121） |
| 防 stale＝**id 查找 miss 即丢**（＋首答 Take 赢） | 普遍 | crush resolve:131；kilocode NotFoundError:223；opencode:113；zcode already-settled latch＋grant receipt 幂等 |
| **epoch/代次闸**（重启/换代不批旧命令） | openclaw runtimeEpoch:426,488＋storage-corrupt fail-closed:491；zcode turnId；codex turn 亡表清 |
| 三档 once/session 规则/持久规则，**后两档存于对话态之外** | ~10 | gemini TOML policy＋persistenceQueue:717；goose permission.yaml 三表；opencode v2 save→SQLite；hkuds ApprovalGrant add_if_absent；reasonix RememberRule Bash(prefix) |
| **批量级联**（N 折 1＋部分批准） | kilocode reject 级联清同 session:233-247、always 落库**反向清扫**命中 pending:250-266；opencode 同款:129-166；cline 断线全拒 approvals.ts:34-56；aider ConfirmGroup |
| 拒绝带反馈回灌 | kilocode CorrectedError、opencode reject+message、codex Denied{rejection} |
| **聊天/远程文本批准必带键** | openclaw `/approve <id> option`（:326）；deep-code messagePermissions[] 按 toolCallId 查（permissions.ts:119）；nanobot `/pairing approve <code>` |
| TOCTOU 防护 | oh-my-pi 批准即 structuredClone(args):806；reasonix 批前 diff 刷新:1748 |
| 无审批基线（复杂度反面） | swe-agent blocklist 自纠、aider 终端 y/n、pi 核心无、nanobot 沙箱代偿 |

## 关键交叉判定（对我们）

1. **无一家把"授权卡"建成与 goal/plan 同构的单一 kind 槽＋UI 卡列表为权威**。单槽只有两例且事实都在**请求集合**（行/Map），槽仅是聚合投影。我们的实现方向（toolCalls[].status 为真相、pending 为镜像、allow 不进状态机）在 22 家里**零先例**。
2. **A/B 两选项都是缓解**：二者都默认"授权=一个 kind 槽上的一个快照"。竞品证据说：槽可以是投影，**决定必须写进请求集合**（id+epoch 双键、miss 即丢、级联清扫）。真正的根治＝把授权事实从 UI 镜像翻正为领域集合——"批准第 2 拒第 1"在镜像模型里表达不了（清点轴实证），在集合模型里是两行 decided 记录。
3. **产品原意同向**（考古轴）：单 pending 槽＝决策通道互斥原语（00:101-102），当年即按"合并授权把 N 折 1"成立——**集合化是这一先例的正统延伸**；多槽并行解冻被 d000011 否决过，本方向不复活它。"用户决策是唯一输入"（00:102）被 A/B 继续违背（allow 面），被集合化真正落实。
4. 我们的 main 侧 `setRules` 零调用方（deny>allow>ask 空转）＋taskTrust 只在 renderer（main 盲信 approved:true）＝持久规则档缺失＋执行域无最终闸——根治需一并补（hkuds Grant 表/规则文件方向）。

## 最值得抄（合并两路）
1. hkuds 决定写路径三重闸（PENDING-only＋turn-WAITING＋cancel 检查，DB 事务 CAS、waiter 仅延迟优化）→ 我们：领域 reducer 内 CAS 语义＋重启 epoch。
2. kilocode/opencode 级联解算（reject 清同窗全部、always 落库反向放行）→ 我们：窗口批量决策＋规则命中自动解挂。
3. openclaw runtimeEpoch 代次闸＋crush 首答 Take 赢 → 我们：requestId+windowSeq 双键、late/double 决天然免疫。
