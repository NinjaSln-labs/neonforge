# Spec · 变更与版本（change-version）

> Bounded Context：BC-10 变更与版本（目标态）
> 聚合：A13 ChangeSet
> 本 Spec 只描述业务规则与不变量；diff/存储细节见 `../../design.md`。
> 现状：diff 解析/应用/回滚已有；变更集对象、基线校验、Git 只读桥缺失。

---

## Requirement: 变更集生成

系统应把真实文件变更组织为变更集，记录每个文件的基线、结果与差异；模型声明不得替代真实变更。

### Scenario: 从真实变更生成

- **Given** 搭档通过 write/edit 或已审核 diff 修改了至少一个文件
- **When** 系统生成变更集
- **Then** 每个文件都有基线引用、变更后内容标识与差异摘要
- **And** 变更集可被交付包与问题台账引用

### Scenario: 无真实变更

- **Given** 没有任何真实文件变化
- **When** 系统考虑生成变更集
- **Then** 不生成变更集
- **And** 不出现“已完成但无变更”的虚假记录

### Scenario: 变更项去重

- **Given** 同一文件在任务内被多次修改
- **When** 生成变更集
- **Then** 变更集按文件聚合，保留最终结果与基线
- **And** 中间修改不重复成为多个变更项

### Scenario: 大文件限制

- **Given** 单个文件超过快照上限
- **When** 生成变更集
- **Then** 系统记录“基线不可快照”并降级为哈希校验
- **And** 不阻塞变更集生成，但回滚能力标注受限

---

## Requirement: 变更审核

系统应先让用户审核变更，再允许应用；审核结论必须被记录，模型不能自行审核。

### Scenario: 逐项审核

- **Given** 变更集包含多个变更项
- **When** 用户审核
- **Then** 每个变更项记录 approved/rejected 与原因
- **And** 未审核项不得应用

### Scenario: 拒绝变更项

- **Given** 用户拒绝某个变更项
- **When** 应用变更集
- **Then** 被拒项不应用
- **And** 变更集显示该项为 rejected

### Scenario: 全部拒绝

- **Given** 用户拒绝全部变更项
- **When** 变更集收口
- **Then** 变更集进入 rejected，不产生文件变化
- **And** 任务可重新提议变更

### Scenario: 审核过期

- **Given** 变更集审核后文件被外部修改
- **When** 用户应用
- **Then** 系统检测基线不一致并拒绝应用
- **And** 要求重新审核/重新生成

---

## Requirement: 应用与冲突

系统应在授权后应用变更集，并在应用前校验基线；冲突必须显式暴露，不得静默覆盖。

### Scenario: 应用成功

- **Given** 变更集已审核且基线一致
- **When** 用户授权应用
- **Then** 文件更新为变更后内容
- **And** 变更集状态变为 applied

### Scenario: 基线冲突

- **Given** 应用前文件哈希与基线不一致
- **When** 系统校验
- **Then** 应用被拒绝，变更集标记 conflicted
- **And** 返回冲突文件与期望/实际哈希

### Scenario: 部分应用失败

- **Given** 变更集包含多个文件，其中一个写入失败
- **When** 应用
- **Then** 系统记录已成功项与失败项
- **And** 提供回滚已成功项的操作，不假装全部成功

### Scenario: 未授权应用

- **Given** 变更集未获用户授权
- **When** 应用请求到达
- **Then** 系统拒绝并返回“需要授权”
- **And** 不产生任何文件变化

### Scenario: 文件不存在

- **Given** 变更项目标文件不存在且基线为空
- **When** 应用
- **Then** 按“新建文件”规则处理
- **And** 若基线非空但文件不存在 → 冲突

---

## Requirement: 回滚与历史

系统应支持按变更集回滚到基线，并保留应用/回滚历史；回滚失败必须显式报告。

### Scenario: 回滚成功

- **Given** 变更集已应用且基线快照可用
- **When** 用户回滚
- **Then** 所有变更项恢复到基线内容
- **And** 变更集状态变为 reverted

### Scenario: 回滚部分失败

- **Given** 部分变更项无法恢复
- **When** 回滚
- **Then** 系统报告成功项与失败项
- **And** 不把失败项标记为已回滚

### Scenario: 无基线回滚

- **Given** 变更项没有基线（新建文件）
- **When** 用户回滚
- **Then** 系统删除新建文件或明确返回“无可恢复基线”
- **And** 行为必须与变更项类型一致

### Scenario: 历史不可变

- **Given** 变更集已应用/回滚
- **When** 查询历史
- **Then** 返回按时间排序的变更集记录
- **And** 已收口记录不被后续操作改写

---

## Requirement: Git 只读集成

系统应提供 Git 仓库状态与差异的只读能力；任何写操作必须经用户授权并明确标注。

### Scenario: 仓库状态

- **Given** 项目是 Git 仓库
- **When** 用户查看版本状态
- **Then** 系统返回分支、工作区变更与最近提交
- **And** 只读命令不修改仓库

### Scenario: 非 Git 项目

- **Given** 项目不是 Git 仓库
- **When** 请求版本状态
- **Then** 返回“未启用 Git”，不自动初始化仓库

### Scenario: Git 写操作

- **Given** 用户请求 commit/checkout/reset 等写操作
- **When** 系统处理
- **Then** 必须要求用户明确授权
- **And** 不得由模型自动执行

---

## 校验

- [x] Requirement 粒度：生成、审核、应用冲突、回滚、Git 各自独立
- [x] 每个 Requirement 的 Scenario 数 ≤ 5（生成 4、审核 4、应用 5、回滚 4、Git 3）
- [x] I17（变更集可追溯）在各 Requirement 中有对应 Scenario
- [x] Scenario 未渗入具体 diff 库或 Git 命令实现细节
