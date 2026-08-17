# V2 会话快照前置调研：compaction 摘要基准一致性

> 2026-08-16（#7/e2e/V1.x 后——V2 前置准备；用户当晚自主推进项）
> 对应：`docs/domain/04-tactical-design.md` §5（ITaskRepository：「**V2 必做**：会话快照（含状态机序列化）持久化——**与 compaction 摘要上下文的基准一致性为 V2 实现前置约束**」）
> 本文件为**只读调研 + 方案方向**——不实现（V2 排期后按 spec-first）

## 1. 现状（证据链）

### 1.1 Compaction 链路（compact.ts + ConversationPanel）

- `decideCompact(messageCount)` / `shouldCompact(history)`：消息数 >100 或字符 >200K 触发
- `compact()`：早期段 → `summarize`（**LLM 压缩**）→ `{ summary, kept(最近 20 条) }`
- renderer（ConversationPanel 1900-1942）：
  - 压缩后 `setMessages` 写回：**占位提示**「（早期对话已压缩…）」+ kept 20 条——**summary 字符串不进入消息列表**
  - `chatHistory` = `[{role:'user', content: summary}, ...kept]`——summary 只进**本次 API 上下文**
  - 压缩写回 messages state（只触发一次——坑 96 修复）

### 1.2 基准一致性问题的精确形态

- **摘要非确定性**：`Gateway.summarize` 调 LLM（v4-flash）——每次压缩同输入可能产出不同摘要（非纯函数）
- **summary 不持久化**：占位提示替代——真实摘要只活在「本次请求 chatHistory」里；消息列表/localStorage **无 summary 字段**
- **重产漂移**：累积再次压缩时，早期段含「占位 + kept」→ 再次 summarize 早期段 → **新摘要 ≠ 旧摘要** → 注入 API 的上下文与上次不连续
- **V2 快照影响**：若状态机跨重启恢复需「摘要上下文」，而没有固化基准 → 恢复时要么重压（漂移）要么丢失早期上下文

## 2. 方案方向（V2）

### 2.1 核心原则：摘要基准固化（存储把压缩产物当作不可变事实）

```
快照 = {
  summary: string          // 压缩时固化的摘要（不可变——恢复直接复用，不重压）
  kept: StoredMsg[]        // 最近 20 条原始消息（含 decisionContent——S3 已加）
  state: StateSnapshot     // 状态机序列化（goal/plan/resolution/pending/producedFiles/…）
  plannedFilesRef: …       // 批准清单（D3 已下沉 main——恢复经 planned-files:load 接）
  props: …                 // 问题台账关联（problemId——断点续做/复跑）
}
```

- **恢复 R 用固化 summary**（作为 user 消息注入，与压缩时一致）——基准一致，不重新压缩
- 若快照缺失 summary（旧数据）→ 降级：全 kept 发送（无压缩基准——可接受，V1 现状）

### 2.2 前置改造点（V2 起步任务）

1. **summary 进入持久化**：压缩时把真实 summary 写入消息列表（新 StoredMsg 形态——如 role:'system' summary 消息 + 隐藏标记，不进 UI 展示但随会话持久化）——既解决「重压漂移」（早期已是固化 summary）也供恢复
   - 替代方案：独立快照字段（`appendix.summary`）——随 localStorage 会话存档——**推荐**（不污染消息列表渲染逻辑）
2. **状态机序列化**：`ConversationState` 叶子字段 → 可 JSON 快照（排除 ref/函数——纯数据）；恢复 = 反序列化 + `restorePlanned`（复用 D3）；pending/decisionContent 恢复后**冻结生效**（§8.2 E C5——既有语义）
3. **compaction 基准一致性契约**：压缩器产出存固定键（`nf-summary-<sessionId>`）；恢复时仅用固化值；**禁止恢复路径重压**（专门 assert）

### 2.3 依赖与顺序

```
[D3 已就绪] plannedFiles 下沉 main（恢复经 planned-files:load——批准事实跨重启）
→ V2-1 summary 固化（appendix.summary + 压缩路径写回）——基准一致性前置
→ V2-2 状态机快照（StateSnapshot 序列化 + 恢复冻结）——ITaskRepository 落地
→ V2-3 恢复时序编排（launch 时：消息+summary+状态+清单加载——pending 冻结 → 用户决策）
→ V2-4 compaction 基准一致性 assert（恢复用固化——测试锁定）
```

- 分期：V2-1 是**最小前置**（独立价值：消除重压漂移本身就是稳健性改善）——可与 V2-2 解耦
- 04 §5 的另一前置「compaction 摘要上下文」意图即 V2-1——本调研确认**先固化、后序列化**的依赖序

## 3. 风险与边界

- **摘要质量非确定不可消除**（LLM 特性）——但「固化后一致性」可保证（恢复与压缩时同基准）——接受
- **状态机快照可恢复范围**：goal/plan/resolution 确认态 + pending + decisionContent（S3）+ producedFiles + 拒绝记忆/streak——**任务边界语义保持**（换目标确认仍清——#7/ADR-006 不冲突：快照是「同一任务的恢复」，换目标是「新任务」）
- **compaction 与快照时机竞争**：压缩发生在 send 时——快照写入时机（压缩后 / 决策点后 / 定期）——V2 排期定
- **不做**：多模型网关、问题台账云端同步（V2 其他项，不在本调研）
- **安全**：快照含对话内容——本机 localStorage/userData（V1 现状）——云端同步时才引入加密/脱敏考虑

## 4. 结论

「基准一致性」= **摘要基准固化 + 恢复禁用重压**。最大前置是 **V2-1（summary 固化）**——建议 V2 首个任务（独立价值 + 消除既有重压漂移）。本调研给出方向与顺序，V2 排期后按 spec-first 落地（DoD 可执行断言 + TDD 网格）。