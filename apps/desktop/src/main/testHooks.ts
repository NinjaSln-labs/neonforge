// 测试/演示钩子集中管理（2026-08-15 Q7——原散落生产路径 4 钩子 11 处无登记）
// 仅测试与本地调试使用；产品运行时全部未设（undefined/false）。
// 新增钩子必须在此登记（防散落）；HANDOFF §4 有配套文档。
export const TEST_HOOKS = {
  // 配置页验证：模拟断网/超时/5xx（gateway.validateKey 分支）
  forceNetworkError: process.env.NF_FORCE_NETWORK_ERROR as '1' | 'timeout' | 'service' | undefined,
  // 打开项目跳过系统对话框（e2e/L4）
  testProject: process.env.NF_TEST_PROJECT ?? undefined,
  // 独立 userData（e2e 隔离——main.ts import 期读取）
  testUserData: process.env.NF_TEST_USERDATA ?? undefined,
  // 打开 DevTools（本地调试）
  debug: process.env.NF_DEBUG === '1',
} as const
