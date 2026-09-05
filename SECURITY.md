# 安全策略（SECURITY）

## 支持范围

NeonForge 桌面应用（`apps/desktop`：Electron main / preload / renderer）及其发布产物。

## 报告渠道

请通过 **GitHub 私有漏洞报告**（仓库页 Security → Report a vulnerability）提交，**不要**公开 issue 描述安全细节。solo 维护，响应尽力而为，修复前请勿公开披露。

## 安全基线（贡献者必读）

- **凭据零明文**：任何 API Key / Token / 密码不入库、不进日志、不进对话输出；一律走环境变量或本机凭据文件
- **preload 隔离**：renderer 不直接持有 Node 能力，桥接只经 `contextBridge` 暴露的白名单通道
- **命令执行面**：模型驱动的 bash / 工具调用必须过会话门禁（sessionGate）与方案确认流程，只读命令有独立形态识别
- 已知坑与处置记录：`HANDOFF-ARCHIVE/pits.md`（本机私有，不入库）
