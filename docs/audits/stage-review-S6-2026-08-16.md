# Stage Review S6（门控双维）——双轴复审

> 日期：2026-08-16；固定点：`0c7d881`（S6 唯一 commit）——`git diff 7891932...HEAD`
> 轴：Standards（仓库标准 HANDOFF-ARCHIVE/pits.md 坑 97/74/79 + 拍板 3（设计 315 行）+ Fowler smell 基线）× Spec（docs/design/stage-specs/S6.md DoD + TDD 网格）
> 方式：并行双 subagent（Standards 20215ddd / Spec 60900b1f）→ 状态化清单（fixed/recorded）——修复 commit 随本报告

## Standards 轴

### S1. [fixed] curl 写副作用标志补全不完整（硬违规——拍板 3 下成真实漏洞）

- **发现**：`-o/--output` 修复漏掉同族写标志——`curl -O/--remote-name`（落盘 CWD）、`-J`、`-T/--upload-file`（上传写远端）、`-a/--append`、`-C/--continue-at`、`wget -O`（大写——`-o\b` 大小写敏感不命中）——**S6 打开的 localhost 自动放行路径使 `curl -O http://localhost/x` 成为真实写漏洞**（改动前 curl 一律 fail-closed——本项目引入的回归）
- **修复**：hasBodyFlag 补全 `-O\b|--remote-name\b|-J\b|-T\b|--upload-file\b|-a\b|--append\b|-C\b|--continue-at\b`（含大写 -O）+ L1 7 断言锁定（-O/wget -O/-T/-a/-C/--remote-name → hazardous；纯 GET 仍 network-read）
- **回归证据**：L1 414 全绿 + L3 44/44（S6-1/2 重跑）

### S2. [fixed] isLocalhostCommand 子串误报（安全隐患——Spec 轴 60900b1f 同步发现）

- **发现**：正则 `/localhost|127\.0\.0\.1|::1/` 子串匹配——`127.0.0.1.attacker.com`、`localhost.evil.io` 误判 localhost 自动放行（S6 将判定推广到 renderer isSideEffectAction 扩大影响面）
- **修复**：host 精确匹配（`(?:https?://)?(?:localhost|127.0.0.1|\[::1\])(?::\d+)?(?:\/|$|\s)`——host 段边界）+ L1 4 断言（子串误报不命中/端口路径命中）
- **回归证据**：L1 414 全绿

### S3. [recorded] classifyAction 移除——注释/描述残留（判断项）

- **发现**：代码移除干净（tsc 0 错无活引用），但 conversationState.test.ts:272 用例描述「运行时仍由 classifyAction 壳 fail-closed 兜底」（壳已删——描述失真）、tools.ts:469 注释、agentLoop.ts:6 注释混用旧名
- **修复**：三处注释/描述同步更新（记录不修——注释级）

### S4. [recorded] T4 假绿风险——S6-1/S6-2 不接线 main preApproval（关键判断项）

- **发现**：mock bridge 完全不执行 main preApproval——S6-1 的 localhost「自动」实为 bash 不在 write-edit 门控（mock 恒 ok），S6-2 用 executeResults 伪造 needApproval——isReadOnlyBash 单测与 UI 卡渲染互不接线——「拍板 3 全链」无端到端证据
- **裁决**：recorded——L1 tools.test.ts 锁 isReadOnlyBash 判定（localhost true/外网 false/-O hazardous）+ L3 锁 UI 渲染（done 无卡/need-approval 弹卡）——两层分别锁定；真实 main preApproval 端到端 = L4 真实 API 场景（S7 全链时覆盖——e2e-suite 授权路径）
- **备注**：测试注释已明示边界（「main preApproval 模拟——L1 tools.test.ts 已锁……此处 UI 层验证 ask 路径」）

### S5. [recorded] Repeated Switches / kind→verdict 映射三处近似（判断项）

- **观察**：classifyReadonly → kind → allow/ask 在 isSideEffectAction/actionGate/isReadOnlyBash 三处形态不同功能等价——跨进程（renderer/main）各自实现——坑 97 缝隙 4 语义；已由单源判定函数（isLocalhostCommand/classifyReadonly）收敛核心，映射层差异可接受——记录不修（isSideEffectAction 与 isReadOnlyBash 命名/形态差异 = 进程边界自然形态）

### S6. [recorded] Divergent Change——agentLoop localhost curl 进展语义静默变化（判断项）

- **观察**：evaluateTurnProgress/isProgressing 改用 isSideEffectAction 后 localhost curl 不再计「进展」——语义正确（curl localhost = 读——activity 非 progress——与 read 同级——坑 81）——但静默变化无测试锁定——记录不修（正确语义；S7 审校时若需补测试）

### S7. [recorded] isReadOnlyBash 命名（低——判断项）

- **观察**：名字「只读」实为「main 自动放行」语义（localhost 网络读也放行）——改名涟漪大——记录不修（S7 审校统一命名）

## Spec 轴

### P1. [fixed] classifyReadonly -o 修复超边界（蔓延——已补记）

- **发现**：`-o/--output` 写副作用标记非 S6 spec 所列（S6 暴露缺口修复——超边界）
- **裁决**：合理蔓延（安全正面——S1 已补全同族标志 + L1 锁定）——S6.md 边界节补记

### P2. [recorded] 端到端接线缺口（拍板 3 全链 DoD 断言）

- **观察**：DoD「拍板 3 全链落地」的端到端证据 = L1（isReadOnlyBash）+ L3（UI）两层分离——与 S4 同源——recorded（L4 真实 API S7 覆盖）

**核对通过**：DoD 5 行为断言全部落地（main preApproval 改引用/6 处同源/拍板 3 全链/classifyAction 移除零消费/actionGate 保持）；冒烟四路径由既有 L3 承载（只读自动 S6-1/白名单、清单内自动根因3/T0-2、越界 ask S6-2/write 需授权、高危 deny write→回滚）；边界遵守（授权疲劳/拒绝记忆/gate.denied/风险分级 UI 均未动）；renderer/main 拍板 3 语义一致（isLocalhostCommand 单源）

## 汇总

- Standards：7 发现（2 fixed / 5 recorded）——最重 S1（curl -O/wget -O 写洞——本项目引入回归）
- Spec：2 发现（1 fixed / 1 recorded）——P1 蔓延补记
- 本阶段无 open 项——S6 复审闭环完成
