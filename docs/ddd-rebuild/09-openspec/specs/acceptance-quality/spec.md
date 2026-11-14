# Spec · 验收与质量门禁（acceptance-quality）

> Bounded Context：BC-14 验收与质量门禁（目标态）
> 聚合：A17 AcceptanceRecord
> 本 Spec 只描述业务规则与不变量；DoD/交付包细节见 `../../design.md`。
> 现状：`DeliveryPackage.acceptance` 字段与勾选 UI 存在，但生产路径验收为空；DoD 面板为演示。

---

## Requirement: 验收标准来源

系统应从已确认方案的验证计划、用户 DoD 或手工输入派生验收项；没有来源时必须显式为空。

### Scenario: 从方案验证计划派生

- **Given** 用户已确认方案且方案包含 verificationPlan
- **When** 派生验收标准
- **Then** 每个验证计划项成为验收项
- **And** 记录来源为 plan-verification

### Scenario: 从用户 DoD 派生

- **Given** 用户提供 DoD 清单
- **When** 派生验收标准
- **Then** 每项成为验收项
- **And** 记录来源为 user/dod

### Scenario: 无来源

- **Given** 方案没有验证计划且用户未提供 DoD
- **When** 生成交付包
- **Then** 验收项显式为空
- **And** 不显示“全部通过”或伪造验收

### Scenario: 来源冲突

- **Given** 方案验证计划与用户 DoD 同时存在
- **When** 派生
- **Then** 按用户显式选择或合并去重
- **And** 每个验收项保留唯一来源

### Scenario: 演示数据隔离

- **Given** 产品运行时没有演示注入
- **When** 渲染 DoD/验收区域
- **Then** 演示验收项不得出现
- **And** 只显示真实来源的验收记录

---

## Requirement: 验收项与证据

系统应把验收项与证据绑定；没有证据不得标记通过，手工确认必须记录理由。

### Scenario: 绑定证据

- **Given** 验收项需要验证
- **When** 系统或用户提供证据
- **Then** 验收项记录 evidenceRef
- **And** 证据可指向命令结果、diff、用户确认

### Scenario: 标记通过

- **Given** 验收项有有效证据
- **When** 标记通过
- **Then** 状态变为 passed
- **And** 记录证据与判定时间

### Scenario: 无证据通过

- **Given** 验收项没有 evidenceRef
- **When** 请求标记通过
- **Then** 系统拒绝
- **And** 提示先提供证据或走手工确认

### Scenario: 手工确认

- **Given** 无法自动验证的验收项
- **When** 用户手工确认
- **Then** 记录确认人、时间与理由
- **And** 标记为 passed(manual)

### Scenario: 豁免

- **Given** 验收项无法满足但用户接受
- **When** 用户豁免
- **Then** 必须填写豁免理由
- **And** 该项不参与门禁通过计算

---

## Requirement: 质量门禁

系统应计算质量门禁结论：所有非豁免项通过才放行；失败/待定项必须阻塞。

### Scenario: 门禁通过

- **Given** 所有非豁免验收项均为 passed
- **When** 计算门禁
- **Then** 结论为 passed
- **And** 允许后续交付关闭

### Scenario: 存在失败项

- **Given** 任一验收项为 failed
- **When** 计算门禁
- **Then** 结论为 failed，并列出阻塞项
- **And** 不允许关闭交付

### Scenario: 存在待定项

- **Given** 任一验收项为 pending
- **When** 计算门禁
- **Then** 结论为 incomplete
- **And** 提示剩余项

### Scenario: 全部豁免

- **Given** 所有验收项均被豁免
- **When** 计算门禁
- **Then** 结论为 passed-with-waivers
- **And** 交付包显著展示豁免项与理由

---

## Requirement: 交付联动

系统应把验收记录与门禁结论呈现到交付包，并作为关闭问题的前置条件。

### Scenario: 交付包展示

- **Given** 存在验收记录
- **When** 生成交付包
- **Then** 交付包展示验收项、来源、证据与门禁结论
- **And** 用户能看到“按什么验收”

### Scenario: 关闭前置

- **Given** 门禁未通过
- **When** 用户尝试关闭问题
- **Then** 系统拒绝关闭
- **And** 提示未通过的验收项

### Scenario: 门禁通过后关闭

- **Given** 门禁 passed 或 passed-with-waivers
- **When** 用户关闭问题
- **Then** 关闭成功并记录门禁结论
- **And** 问题台账与交付包状态同步

### Scenario: 验收记录缺失

- **Given** 交付包没有任何验收记录
- **When** 关闭问题
- **Then** 按“无验收来源”处理，不伪造通过
- **And** 用户需显式确认接受空验收

---

## 校验

- [x] Requirement 粒度：来源、证据、门禁、交付联动各自独立
- [x] 每个 Requirement 的 Scenario 数 ≤ 5（来源 5、证据 5、门禁 4、交付 4）
- [x] I21（验收有据）在来源、证据、门禁中可验证
- [x] Scenario 未渗入 DoD 文件格式或 UI 实现细节
