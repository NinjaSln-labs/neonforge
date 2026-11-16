# Spec · 任务编排（task-orchestration）

> Bounded Context：BC-11 任务编排（目标态）
> 聚合：A14 TaskQueueEntry
> 本 Spec 只描述业务规则与不变量；调度器/存储细节见 `../../design.md`。
> 现状：仅有“任务队列”占位文案；无队列聚合与调度。

---

## Requirement: 入队与排序

系统应允许把任务放入队列，并保持稳定的排队顺序；入队不得自动启动任务。

### Scenario: 入队

- **Given** 当前工作区已有或没有运行中的任务
- **When** 用户把新任务加入队列
- **Then** 任务条目进入 queued 状态并记录位置
- **And** 不自动开始执行

### Scenario: 同任务重复入队

- **Given** 同一任务已在队列中
- **When** 再次入队
- **Then** 系统不创建重复条目
- **And** 保持原位置或按用户显式重排

### Scenario: 优先级

- **Given** 队列中有多个任务
- **When** 用户设置优先级
- **Then** 队列按显式优先级排序
- **And** 相同优先级保持入队顺序

### Scenario: 空队列

- **Given** 队列为空
- **When** 用户查看
- **Then** 显示空态，不显示伪造的“进行中任务”

---

## Requirement: 调度与单活跃

系统应在每个工作区同时只运行一个任务；其余任务保持排队，调度依据真实 Task 状态。

### Scenario: 启动下一个

- **Given** 没有运行中的任务且队列非空
- **When** 调度器启动
- **Then** 队首任务进入 running
- **And** 其余任务仍为 queued

### Scenario: 已有运行任务

- **Given** 已有任务在运行
- **When** 尝试启动另一个任务
- **Then** 系统拒绝或保持排队
- **And** 不允许并行执行副作用

### Scenario: 任务进入决策点

- **Given** 运行中任务进入 goal/plan/approval/resolution 待决策
- **When** Task 状态事件到达
- **Then** 队列条目标记 blocked
- **And** 不自动确认、不自动跳过

### Scenario: 决策完成

- **Given** 阻塞任务收到用户决策
- **When** Task 恢复执行
- **Then** 队列条目回到 running
- **And** 队列继续按顺序推进

### Scenario: 调度依据真实状态

- **Given** UI 显示与 Task 实际状态不一致
- **When** 调度器决策
- **Then** 以 Task 状态事件为准
- **And** 修正队列显示而不是反向改 Task

---

## Requirement: 阻塞与恢复

系统应保留被阻塞任务的位置与断点，用户处理后可从原处恢复。

### Scenario: 阻塞原因

- **Given** 任务因缺少授权、缺少信息或环境缺失而阻塞
- **When** 任务进入 blocked
- **Then** 队列记录阻塞原因
- **And** 用户能看到需要做什么

### Scenario: 恢复

- **Given** 阻塞原因已解除
- **When** 用户点击恢复
- **Then** 任务从断点继续
- **And** 不重复已完成的工具调用

### Scenario: 阻塞期间队列推进

- **Given** 队首任务阻塞
- **When** 调度器继续
- **Then** 默认停在阻塞任务（保持顺序）
- **And** 若用户显式允许，可跳过并记录

### Scenario: 阻塞超时

- **Given** 任务长时间阻塞
- **When** 达到提示阈值
- **Then** 系统提示用户处理
- **And** 不自动放弃或自动确认

---

## Requirement: 取消与失败

系统应支持取消排队或运行中的任务；取消不得破坏任务状态或留下孤儿进程。

### Scenario: 取消排队任务

- **Given** 任务处于 queued
- **When** 用户取消
- **Then** 条目进入 cancelled
- **And** 不启动该任务

### Scenario: 取消运行任务

- **Given** 任务处于 running
- **When** 用户取消
- **Then** 走 BC-01/BC-02 的停止路径
- **And** 队列条目在确认停止后进入 cancelled

### Scenario: 任务失败

- **Given** 任务执行失败
- **When** 失败被确认
- **Then** 条目进入 failed 并记录原因
- **And** 队列继续下一个（若用户配置允许）

### Scenario: 应用崩溃恢复

- **Given** 应用异常退出
- **When** 重启加载队列
- **Then** 运行中任务被标记为 interrupted，不自动重放副作用
- **And** 用户可显式恢复或取消

---

## Requirement: 队列视图与审计

系统应向用户展示真实队列状态，并记录入队/启动/阻塞/完成事件。

### Scenario: 队列视图

- **Given** 队列有条目
- **When** 用户查看任务 Tab
- **Then** 显示 queued/running/blocked/failed 的真实状态
- **And** 不把占位文案当作功能

### Scenario: 事件审计

- **Given** 队列状态变化
- **When** 系统记录
- **Then** 产生 `queue.entry_*` 事件
- **And** 事件可被时间线查询

### Scenario: 队列容量

- **Given** 队列条目过多
- **When** 新增
- **Then** 按存储上限保留最近条目
- **And** 不静默删除运行中/阻塞中的条目

---

## 校验

- [x] Requirement 粒度：入队、调度、阻塞恢复、取消失败、视图审计各自独立
- [x] 每个 Requirement 的 Scenario 数 ≤ 5（入队 4、调度 5、阻塞 4、取消 4、视图 3）
- [x] I18（队列单活跃）在调度 Requirement 中可验证
- [x] Scenario 未渗入调度算法或存储实现细节
