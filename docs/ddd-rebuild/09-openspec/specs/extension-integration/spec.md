# Spec · 扩展与集成（extension-integration）

> Bounded Context：BC-13 扩展与集成（目标态）
> 聚合：A16 Extension
> 本 Spec 只描述业务规则与不变量；MCP/Git 协议细节见 `../../design.md`。
> 现状：PluginRegistry 已注册内置插件；`mcp-bridge`/`git` 为占位；外部能力未接线。

---

## Requirement: 扩展注册

系统应维护扩展注册表，扩展必须有唯一标识、版本、类型与能力描述；未注册扩展不得被调用。

### Scenario: 注册内置扩展

- **Given** 应用启动
- **When** 注册内置扩展
- **Then** 扩展进入注册表并记录版本与能力
- **And** 界面可查看已注册扩展

### Scenario: 注册第三方扩展

- **Given** 用户安装或配置一个第三方扩展
- **When** 注册
- **Then** 记录来源与信任等级
- **And** 首次调用外部能力前需要用户授权

### Scenario: 重复注册

- **Given** 同一扩展 id 已注册
- **When** 再次注册
- **Then** 按版本策略拒绝或替换
- **And** 不产生两个同 id 的活动扩展

### Scenario: 损坏扩展

- **Given** 扩展描述无法解析
- **When** 加载
- **Then** 跳过该扩展并记录错误
- **And** 不影响其他扩展与应用启动

---

## Requirement: 生命周期

系统应支持扩展激活/停用，生命周期操作必须幂等且失败隔离。

### Scenario: 激活

- **Given** 扩展已注册且未激活
- **When** 用户激活
- **Then** 扩展进入 active 并初始化能力
- **And** 重复激活不重复初始化

### Scenario: 停用

- **Given** 扩展处于 active
- **When** 用户停用
- **Then** 扩展释放资源并进入 inactive
- **And** 后续能力调用被拒绝

### Scenario: 初始化失败

- **Given** 扩展初始化失败
- **When** 激活
- **Then** 扩展保持 inactive 并记录原因
- **And** 不拖垮应用或阻塞其他扩展

### Scenario: 应用退出

- **Given** 扩展处于 active
- **When** 应用退出
- **Then** 按顺序停用并清理
- **And** 不留下外部连接或子进程

---

## Requirement: 能力调用与信任

系统应只允许调用已注册且 active 的扩展能力，并让实际执行经过 BC-02 的授权/沙箱边界。

### Scenario: 调用已激活能力

- **Given** 扩展 active 且能力已声明
- **When** 搭档请求调用
- **Then** 能力描述进入工具面
- **And** 风险等级与授权策略由 BC-02 决定

### Scenario: 调用未激活扩展

- **Given** 扩展 inactive
- **When** 请求调用
- **Then** 系统拒绝并返回“扩展未激活”
- **And** 不动态加载未知代码

### Scenario: 第三方首次调用

- **Given** 第三方扩展首次请求外部能力
- **When** 用户尚未授权
- **Then** 系统要求授权并说明能力与数据流向
- **And** 用户拒绝后不得重试绕过

### Scenario: 绕过沙箱

- **Given** 扩展试图直接访问文件/进程/网络
- **When** 系统检测
- **Then** 拒绝该调用并记录安全事件
- **And** 扩展不得获得高于 BC-02 的权限

### Scenario: 能力描述不符

- **Given** 实际调用参数超出已声明能力
- **When** 校验
- **Then** 拒绝调用
- **And** 要求扩展更新描述或停用

---

## Requirement: MCP 桥

系统应支持连接 MCP 服务器，把外部工具映射为受控能力；连接失败必须隔离。

### Scenario: 连接服务器

- **Given** 用户配置了 MCP 服务器
- **When** 连接成功
- **Then** 拉取工具清单并注册为能力描述
- **And** 标记来源为 mcp

### Scenario: 连接失败

- **Given** 服务器不可达或协议不兼容
- **When** 连接
- **Then** 该扩展标记 unavailable
- **And** 其他工具与应用不受影响

### Scenario: 工具调用

- **Given** MCP 工具已注册且扩展 active
- **When** 搭档调用
- **Then** 请求经 BC-02 授权后转发
- **And** 结果结构化回传

### Scenario: 服务器变更

- **Given** 服务器工具清单发生变化
- **When** 重新连接
- **Then** 能力描述更新
- **And** 已授权范围不自动扩大

---

## Requirement: Git 集成

系统应通过扩展暴露 Git 只读能力；写操作必须显式授权，且不得由模型自动执行。

### Scenario: 只读状态

- **Given** 项目是 Git 仓库且 Git 扩展 active
- **When** 查询状态/差异/历史
- **Then** 返回只读结果
- **And** 不修改仓库

### Scenario: 非 Git 项目

- **Given** 项目不是 Git 仓库
- **When** 请求 Git 能力
- **Then** 返回“未启用 Git”
- **And** 不自动初始化仓库

### Scenario: 写操作授权

- **Given** 请求 commit/checkout/reset
- **When** 执行
- **Then** 要求用户明确授权
- **And** 记录操作与结果，可审计

---

## 校验

- [x] Requirement 粒度：注册、生命周期、调用信任、MCP、Git 各自独立
- [x] 每个 Requirement 的 Scenario 数 ≤ 5（注册 4、生命周期 4、调用 5、MCP 4、Git 3）
- [x] I20（扩展受控）在调用与信任 Requirement 中可验证
- [x] Scenario 未渗入 MCP 协议字段或 Git 命令实现细节
