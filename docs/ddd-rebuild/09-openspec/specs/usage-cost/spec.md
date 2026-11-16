# Spec · 用量与成本（usage-cost）

> Bounded Context：BC-12 用量与成本（目标态）
> 聚合：A15 UsageLedger
> 本 Spec 只描述业务规则与不变量；Provider usage 字段/价格表细节见 `../../design.md`。
> 现状：gateway 未解析 usage；TaskPanel 仅显示前缀缓存；stats 插件为占位。

---

## Requirement: 用量记录

系统应记录 Provider 真实返回的 token 用量，并关联到请求、模型、任务与会话；台账不得包含内容或密钥。

### Scenario: 记录真实 usage

- **Given** Provider 响应包含 usage 字段
- **When** 流结束
- **Then** 记录 prompt/completion/reasoning token 与模型标识
- **And** 关联到当前任务/会话

### Scenario: 缺少 usage

- **Given** Provider 未返回 usage
- **When** 记录用量
- **Then** 该条目标记 `unknown`
- **And** 不用字符数伪装精确 token

### Scenario: 台账不可变

- **Given** 已存在用量条目
- **When** 需要修正
- **Then** 新增冲正/重算条目
- **And** 原条目不被修改

### Scenario: 隐私

- **Given** 任意用量条目
- **When** 查看或导出
- **Then** 不包含 prompt、文件内容、密钥
- **And** 只保留计量元数据

### Scenario: 无请求不记录

- **Given** 请求在发送前失败（无响应）
- **When** 记录用量
- **Then** 不产生伪造用量
- **And** 可记录失败原因供诊断

---

## Requirement: 成本计算

系统应按版本化价格表计算成本；未知模型价格必须标为未知，不得按 0 计算。

### Scenario: 已知模型

- **Given** 模型在价格表中有版本化价格
- **When** 计算成本
- **Then** 成本 = 各 token 类别 × 单价
- **And** 条目记录价格表版本

### Scenario: 未知模型

- **Given** 模型不在价格表
- **When** 计算成本
- **Then** 成本标记 `unknown`
- **And** 不影响 token 计量

### Scenario: 价格表更新

- **Given** 价格表发布新版本
- **When** 新请求计费
- **Then** 使用新版本
- **And** 历史条目仍引用旧版本，不重算

### Scenario: 缓存价格

- **Given** Provider 对缓存命中采用不同单价
- **When** 计算成本
- **Then** 按缓存 outcome 使用对应单价
- **And** 无法区分时标注估算

---

## Requirement: 预算提醒

系统应支持用户设置预算阈值，并在达到阈值时提醒；默认不硬中断任务。

### Scenario: 达到阈值

- **Given** 用户设置了周期预算
- **When** 累计成本达到阈值
- **Then** 产生预算提醒事件和 UI 提示
- **And** 任务默认继续执行

### Scenario: 硬限制

- **Given** 用户显式开启“达到预算即暂停”
- **When** 阈值达到
- **Then** 任务在安全点暂停
- **And** 不中途破坏正在进行的工具调用

### Scenario: 无预算

- **Given** 用户未设置预算
- **When** 用量增长
- **Then** 只记录，不提醒
- **And** 不默认限制

### Scenario: 阈值重复触发

- **Given** 同一周期已提醒过
- **When** 成本继续增长
- **Then** 按配置只提醒一次或按步长提醒
- **And** 不刷屏

---

## Requirement: 汇总与导出

系统应按会话/任务/项目/周期汇总用量，并支持脱敏导出。

### Scenario: 按任务汇总

- **Given** 一个任务有多次请求
- **When** 查看任务用量
- **Then** 返回 token 总量与成本
- **And** 标明 unknown/估算条目数

### Scenario: 按周期汇总

- **Given** 用户选择时间范围
- **When** 汇总
- **Then** 返回该范围的用量与成本
- **And** 跨模型分别列出

### Scenario: 导出

- **Given** 用户请求导出
- **When** 生成文件
- **Then** 导出计量元数据，不含内容/密钥
- **And** 重复导出覆盖旧文件

### Scenario: 数据缺失

- **Given** 台账中没有记录
- **When** 查看/导出
- **Then** 返回空结果或明确“无用量数据”
- **And** 不伪造 0 成本

---

## Requirement: 缓存计量

系统应分别记录前缀缓存命中与未命中，量化缓存收益。

### Scenario: 命中

- **Given** Provider 报告缓存命中
- **When** 记录用量
- **Then** 条目记录命中 token 与节省估算
- **And** 与普通 token 区分

### Scenario: 未命中

- **Given** Provider 报告未命中
- **When** 记录
- **Then** 条目记录未命中，不虚报收益

### Scenario: 无缓存信息

- **Given** Provider 不提供缓存字段
- **When** 记录
- **Then** 缓存 outcome 标记 `unknown`
- **And** 不做推断

---

## 校验

- [x] Requirement 粒度：记录、成本、预算、汇总导出、缓存各自独立
- [x] 每个 Requirement 的 Scenario 数 ≤ 5（记录 5、成本 4、预算 4、汇总 4、缓存 3）
- [x] I19（用量真实且不可变）在记录与成本 Requirement 中可验证
- [x] Scenario 未渗入具体价格数值或存储格式
