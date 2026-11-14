# Spec · 平台运行（platform-runtime）

> Bounded Context：BC-09 平台运行
> 聚合：A12 AppRuntime
> 本 Spec 只描述业务规则与不变量；Electron/OS 细节见 `../../design.md`。

---

## Requirement: 生命周期与单实例

系统应保证同一时刻只有一个应用实例；重复启动只聚焦已有窗口。

### Scenario: 首次启动

- **Given** 没有运行中的实例
- **When** 启动
- **Then** 创建主窗口并加载界面

### Scenario: 重复启动

- **Given** 已有实例运行
- **When** 再次启动
- **Then** 新实例退出，已有窗口被聚焦
- **And** 不产生第二个主进程

### Scenario: 关窗

- **Given** 用户关闭主窗口
- **When** 应用退出
- **Then** 执行退出清理后再结束进程

---

## Requirement: 渲染进程隔离

系统应通过预加载桥接向渲染进程暴露最小能力集；渲染进程不得直接访问文件系统、进程或网络。

### Scenario: 能力经桥接

- **Given** 渲染进程需要文件/命令/模型能力
- **When** 调用
- **Then** 只能通过预加载暴露的通道
- **And** 直接访问 Node 能力被拒绝

### Scenario: 通道白名单

- **Given** 渲染进程请求一个未暴露的通道
- **When** 调用
- **Then** 请求失败，不穿透到主进程

### Scenario: 参数校验

- **Given** 通道收到不合法参数
- **When** 主进程处理
- **Then** 返回结构化错误，不执行副作用

---

## Requirement: 退出清理

系统应在应用退出时清理自己启动的子进程、服务与端口，并且只清理自己记录的进程。

### Scenario: 退出清理

- **Given** 应用启动过服务与命令
- **When** 应用退出
- **Then** 这些进程被终止，端口被释放
- **And** 用户自己的进程不受影响

### Scenario: 无效进程标识

- **Given** 记录的进程标识缺失或非正数
- **When** 清理
- **Then** 跳过该标识，不向当前进程组发信号

### Scenario: 清理失败

- **Given** 某个进程无法终止
- **When** 清理
- **Then** 记录失败并继续清理其余进程
- **And** 不阻断应用退出

---

## Requirement: 插件注册表

系统应维护插件注册表，插件只能通过受控入口注册能力；未知或损坏插件不影响主应用。

### Scenario: 注册插件

- **Given** 插件声明合法
- **When** 应用启动加载插件
- **Then** 插件能力进入注册表
- **And** 界面可查看已加载插件

### Scenario: 插件损坏

- **Given** 插件清单无法解析
- **When** 加载
- **Then** 跳过该插件并记录错误
- **And** 应用正常启动

### Scenario: 未注册能力

- **Given** 代码引用未注册的插件能力
- **When** 调用
- **Then** 返回“能力不存在”，不动态加载未知代码

---

## Requirement: 日志与可观测

系统应记录运行日志与时间线，日志不得包含凭据值；日志故障不得阻断业务。

### Scenario: 写入日志

- **Given** 应用运行中
- **When** 产生运行事件
- **Then** 日志按会话/时间写入本机
- **And** 日志中不出现凭据值

### Scenario: 日志目录不可写

- **Given** 日志目录不可写
- **When** 写入
- **Then** 业务继续运行，错误被降级处理
- **And** 不因此崩溃

---

## 校验

- [x] Requirement 粒度：生命周期、隔离、清理、插件、日志各自独立
- [x] 每个 Requirement 的 Scenario 数 ≤ 5（生命周期 3、隔离 3、清理 3、插件 3、日志 2）
- [x] P0-04（无效 pid 清理）在退出清理 Requirement 中有独立 Scenario
- [x] Scenario 未渗入 Electron API 名称等技术细节
