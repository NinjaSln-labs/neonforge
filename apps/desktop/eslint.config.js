// NeonForge ESLint flat config（B1——流程重构阶段 1）
// 分工：ESLint = lint（正确性/反模式），Prettier = format（eslint-config-prettier 关冲突）
// 门禁策略（process-industry-research-20260816 §四 P1-3）：只拦「快且确定」项——
// 非 type-checked（类型交 L2 tsc），复杂度交 CI。
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/release/**',
      '**/test-results/**',
      '**/snapshots/**',
      '**/coverage/**',
      '**/._*',
      // 私有 CDP 驱动脚本（.git/info/exclude 约定不入库——真机验收工具，非产品代码）
      'scripts-cdp/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      // 空 catch 是有意的容错模式（fallback 兜底——ts/mjs 通用）；其余空块仍拦
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // 少量 strict（快且确定——适合门禁）
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  // React hooks（只取「快且确定」的经典两条——rules-of-hooks/exhaustive-deps；
  // v7 新增 immutability/refs/set-state-in-effect 等启发式分析易误报，属「复杂度交 CI」）
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  // S-1 即时红面（详设 §8 M-04：flat config 分块；真判据＝tests/static/s1WritePath.test.ts，本块只是快反馈）
  // 呈现投影禁 import 聚合写命令面与写服务面——只读投影走 IPC（S-1 唯一例外 EvidenceInspected 经机制口）
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/domain/delegation/*',
                '**/domain/turn/*',
                '**/domain/queue/*',
                '**/domain/evidence/*',
                '**/domain/authorization/*',
                '**/domain/service/*',
                '**/domain/repos/memory/*',
              ],
              message:
                'S-1：呈现侧禁 import 聚合写命令面与写服务面，只读投影经 IPC（判据 s1WritePath.test.ts）。',
            },
          ],
        },
      ],
    },
  },
  // Node 环境脚本（e2e 驱动 Electron——非浏览器代码）
  {
    files: ['**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  }, // Playwright page.evaluate 回调运行在浏览器上下文——仅实际使用 window 的 e2e 文件放行
  {
    files: ['e2e-*.mjs'],
    languageOptions: {
      globals: {
        window: 'readonly',
      },
    },
  },
  // 构建/测试配置（Node 环境）
  {
    files: ['apps/desktop/{vite,vitest,playwright,eslint}.config.*'],
    languageOptions: {
      globals: globals.node,
    },
  },
)
