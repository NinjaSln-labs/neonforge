# ADR-018：问题台账 Local-first 同步与多设备合并（GitHub #15）

- 状态: accepted
- 日期: 2026-11-17
- 相关: GitHub #15（问题台账云端同步 / 多设备）；README Roadmap V2 #5；`docs/design/stage-specs/V2-problem-ledger-sync.md`

## Context

问题台账当前只存在 renderer 的 `localStorage`（`nf-problems`，上限 20）：同一台机器可断点续做，但换设备/重装即丢失；renderer 也不是持久化权威，主进程无法在窗口未打开时参与同步。产品需要「云端同步 / 多设备」，但当前没有账号体系、后端服务与同步密钥管理。

## Decision

**先做 local-first 权威 + 用户指定同步目录的加密快照同步（可被 iCloud/Dropbox/OneDrive 等客户端带到其他设备），不引入厂商后端/账号。**

1. **权威下沉 main（BC-06/问题台账）**
   - 新增 `src/main/problemLedgerStore.ts`：`userData/config/problem-ledger.json`，0600 + 临时文件/rename 原子写；损坏文件回退空台账并记录错误，不阻断启动。
   - renderer 启动优先经 `problems:load` 读取；`localStorage` 仅保留为降级缓存/旧数据迁移源。写入经 `problems:save` 落 main，再写 localStorage 兼容缓存。
   - 台账仍上限 20 条，按 `updatedAt` 倒序；单条 `ProblemInstance` 增加 `revision`（每次本地变更 +1）与可选 `deletedAt`（tombstone——本阶段 UI 不提供删除，仅合并协议支持）。
2. **同步配置与加密**
   - 同步目录由用户选择（`problems:choose-sync-folder`）；配置只存**目录路径**，不存凭据值。
   - 同步快照文件 `neonforge-problem-ledger.sync`：`{v:1, alg:'aes-256-gcm', salt, iv, tag, data}`；`data` 为 `{schemaVersion:1, deviceId, exportedAt, problems}` 的 AES-256-GCM 密文。
   - 口令来源只允许**环境变量名**（默认 `NEONFORGE_SYNC_PASSPHRASE`）或本机凭据文件路径（`NEONFORGE_SYNC_PASSPHRASE_FILE`），不写入配置/日志/仓库；缺口令 → 同步按钮返回可执行提示，不写明文快照。
   - 派生：scrypt（N=16384, r=8, p=1, keylen=32）+ 随机 16-byte salt；每次同步新 salt/iv；GCM tag 校验失败 → 拒绝覆盖。
3. **合并语义**
   - 纯函数 `mergeProblemLedgers(local, remote)`：按 `id` 合并；`revision` 高者胜；同 revision 取 `updatedAt` 晚者；仍相同取 `deviceId` 字典序较大者（确定性 tiebreak）。
   - 删除以 `deletedAt` 传播；两端都删除保留 tombstone；合并结果按 `updatedAt` 倒序截取 20。
   - 同步流程：读本地 + 解密远端 → merge → 原子写本地 + 原子覆盖远端快照；返回 `{merged, localOnly, remoteOnly, conflicts, syncedAt}` 供 UI 显示。
   - 同步冲突不丢数据：落败版本保留在结果的 `conflicts` 摘要（id/revision），不静默覆盖本地内存态；本阶段不做逐字段人工合并 UI。
4. **IPC/UI**
   - `problems:load/save`、`problems:sync-status`、`problems:choose-sync-folder`、`problems:sync-now`；运行时 schema + preload/types 契约。
   - 设置页「问题台账同步」区块：同步目录、口令来源提示、立即同步、状态/冲突计数；未配置目录/口令时显示可执行引导。
5. **安全边界**
   - 同步目录不可指向项目根/工作区（防把台账写进受版本控制的仓库）；路径 realpath 解析 + 祖先 `.git` 检测（含 worktree 的 `.git` 文件）+ 存在性检查。
   - 远端快照最大 1 MiB；JSON 深度/字段白名单校验；拒绝未知 `schemaVersion`。
   - 不引入网络 API、账号、OAuth；不自动后台同步；用户显式点「立即同步」。

## Consequences

- 积极：台账跨设备可迁移且默认加密；main 权威使关闭窗口后仍可同步；无厂商锁定，iCloud/Dropbox 等客户端即为传输层；合并语义确定、可测试。
- 代价：用户需配置云盘目录与同步口令；首次迁移需从 localStorage 导入；冲突只给摘要，不提供逐字段合并。
- 边界（不做）：
  - 不实现厂商云 API/OAuth/账号体系（后续可加 transport adapter）。
  - 不实现实时协同/自动冲突合并 UI。
  - 不同步聊天正文、工具输出、API Key、项目文件；仅问题台账。
  - 不改变现有 Task 快照/交付包存储。
