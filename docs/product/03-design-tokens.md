# 设计令牌

> 设计系统中所有可命名的视觉属性。工程侧可用 CSS 变量或 Tailwind 配置直接映射。
> 命名空间：`--nf-{category}-{name}`

---

## 1. 色彩

### 背景色

| 令牌 | 深色值 | 用途 |
|------|--------|------|
| `--nf-bg-app` | `#1E1E1E` | 应用主背景 |
| `--nf-bg-panel` | `#252526` | 面板背景（搭档面板、详情面板） |
| `--nf-bg-input` | `#2D2D2D` | 输入框背景 |
| `--nf-bg-hover` | `#2A2D2E` | 悬停态背景 |
| `--nf-bg-selected` | `#094771` | 选中态背景（任务列表项、快捷指令项） |
| `--nf-bg-skeleton` | `#3E3E3E` | 骨架屏灰色 |
| `--nf-bg-overlay` | `rgba(0,0,0,0.5)` | （保留，系统级用） |

### 气泡背景

| 令牌 | 深色值 | 用途 |
|------|--------|------|
| `--nf-bubble-user` | `#1A3A5C` | 用户消息气泡 |
| `--nf-bubble-partner` | `#2D2D2D` | 搭档消息气泡 |

### Diff 背景

| 令牌 | 深色值 | 用途 |
|------|--------|------|
| `--nf-diff-add-bg` | `rgba(34,197,94,0.15)` | 新增行背景 |
| `--nf-diff-remove-bg` | `rgba(239,68,68,0.15)` | 删除行背景 |
| `--nf-diff-add-accent` | `rgba(34,197,94,0.3)` | 当前正在审核的新增行（增强） |
| `--nf-diff-remove-accent` | `rgba(239,68,68,0.3)` | 当前正在审核的删除行（增强） |

### 强调色

| 令牌 | 值 | 用途 |
|------|-----|------|
| `--nf-blue` | `#3B82F6` | 搭档相关：按钮主色、呼吸光条、边框聚焦、链接 |
| `--nf-green` | `#22C55E` | 成功/接受：diff 新增行、任务完成、文件待审核标记 |
| `--nf-red` | `#EF4444` | 错误/拒绝：diff 删除行、错误边框 |
| `--nf-amber` | `#F59E0B` | 警告/等待：网络断开、等待用户确认 |

### 文字色

| 令牌 | 深色值 | 用途 |
|------|--------|------|
| `--nf-text-primary` | `#D4D4D4` | 主文字：消息正文、标题、编辑器内容 |
| `--nf-text-secondary` | `#808080` | 次要文字：副标题、状态文字、时间戳 |
| `--nf-text-tertiary` | `#606060` | 占位文字、禁用态文字 |
| `--nf-text-white` | `#FFFFFF` | 白色文字（用于深色按钮上） |

### 边框

| 令牌 | 深色值 | 用途 |
|------|--------|------|
| `--nf-border` | `#3E3E3E` | 默认边框：输入框、组件卡片 |
| `--nf-border-light` | `#2D2D2D` | 分割线 |

### 状态横幅背景

| 令牌 | 深色值 | 用途 |
|------|--------|------|
| `--nf-warning-bg` | `rgba(245,158,11,0.1)` | 网络断开横幅 |
| `--nf-error-bg` | `rgba(239,68,68,0.1)` | 错误横幅 |

---

## 2. 排版

### 字体族

| 令牌 | 值 | 用途 |
|------|-----|------|
| `--nf-font-sans` | `-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif` | 界面文字 |
| `--nf-font-mono` | `"JetBrains Mono", "Menlo", "Monaco", monospace` | 代码 |

### 字号

| 令牌 | 值 | 用途 |
|------|-----|------|
| `--nf-text-xs` | `11px` | 任务副标题、状态栏文字 |
| `--nf-text-sm` | `12px` | 卡片副标题、小标签、标签栏、文件树 |
| `--nf-text-base` | `14px` | 界面正文、消息、按钮、编辑器 |
| `--nf-text-lg` | `16px` | 启动页输入框、强调按钮 |
| `--nf-text-xl` | `18px` | 启动页副标题 |
| `--nf-text-2xl` | `28px` | 启动页标题 |

### 字重

| 令牌 | 值 | 用途 |
|------|-----|------|
| `--nf-font-normal` | `400` | 正文、消息 |
| `--nf-font-medium` | `500` | 副标题 |
| `--nf-font-semibold` | `600` | 标题、任务名 |

### 行高

| 令牌 | 值 | 用途 |
|------|-----|------|
| `--nf-leading-tight` | `1.25` | 标题 |
| `--nf-leading-normal` | `1.5` | 正文、消息、输入框 |
| `--nf-leading-relaxed` | `1.75` | 长文本块（分析详情） |

---

## 3. 间距

### 基础间距（4px 基准）

| 令牌 | 值 | 用途 |
|------|-----|------|
| `--nf-space-1` | `4px` | 紧密间距 |
| `--nf-space-2` | `8px` | 按钮间距、任务列表项内间距 |
| `--nf-space-3` | `12px` | 消息间距 |
| `--nf-space-4` | `16px` | 面板内 padding、段落间距 |
| `--nf-space-5` | `20px` | 较大段间距 |
| `--nf-space-6` | `24px` | 章节间距、启动页元素间距 |
| `--nf-space-8` | `32px` | 大间距 |
| `--nf-space-12` | `48px` | 启动页上下留白 |

---

## 4. 圆角

| 令牌 | 值 | 用途 |
|------|-----|------|
| `--nf-radius-none` | `0` | 面板、编辑器 |
| `--nf-radius-sm` | `4px` | 标签、状态指示 |
| `--nf-radius-md` | `6px` | 按钮 |
| `--nf-radius-lg` | `8px` | 输入框、下拉菜单、通知卡片 |
| `--nf-radius-xl` | `12px` | 消息气泡 |

---

## 5. 阴影

| 令牌 | 值 | 用途 |
|------|-----|------|
| `--nf-shadow-focus` | `0 0 0 2px #3B82F6` | 输入框聚焦 |
| `--nf-shadow-focus-ring` | `0 0 0 3px rgba(59,130,246,0.15)` | 输入框聚焦外环 |
| `--nf-shadow-modal` | `0 8px 24px rgba(0,0,0,0.4)` | （保留，系统级确认用） |
| `--nf-shadow-notification` | `0 4px 12px rgba(0,0,0,0.3)` | 通知卡片 |

---

## 6. 动画

### 持续时间

| 令牌 | 值 | 用途 |
|------|-----|------|
| `--nf-duration-instant` | `100ms` | 即时反馈（hover、下拉菜单出现） |
| `--nf-duration-fast` | `150ms` | 消息出现、弹窗、按钮 active |
| `--nf-duration-normal` | `200ms` | 面板滑入、文件树折叠、切换视图指示器 |
| `--nf-duration-slow` | `250ms` | 详情面板滑入、错误横幅 |
| `--nf-duration-glacial` | `300ms` | 通知滑入、占位文字切换 |

### 缓动

| 令牌 | 值 | 用途 |
|------|-----|------|
| `--nf-ease-out` | `cubic-bezier(0, 0, 0.2, 1)` | 滑入、展开 |
| `--nf-ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | 滑出、收起 |
| `--nf-ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | 呼吸光条、颜色过渡 |
| `--nf-ease-bounce` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | 文件树新文件弹跳、举手动画 |

---

## 7. 尺寸

### 面板宽度

| 令牌 | 值 | 用途 |
|------|-----|------|
| `--nf-panel-partner` | `320px` | 搭档面板 |
| `--nf-panel-detail` | `360px` | 详情面板 |
| `--nf-panel-filetree` | `240px` | 文件树 |

### 窗口

| 令牌 | 值 | 用途 |
|------|-----|------|
| `--nf-window-min-w` | `1024px` | 窗口最小宽度 |
| `--nf-window-min-h` | `640px` | 窗口最小高度 |
| `--nf-window-default-w` | `1440px` | 窗口默认宽度 |
| `--nf-window-default-h` | `900px` | 窗口默认高度 |

### 输入框

| 令牌 | 值 | 用途 |
|------|-----|------|
| `--nf-input-standalone-w` | `520px` | 启动页输入框宽度 |

### 通知

| 令牌 | 值 | 用途 |
|------|-----|------|
| `--nf-notification-w` | `320px` | 通知卡片宽度 |

### 页面卡片

| 令牌 | 值 | 用途 |
|------|-----|------|
| `--nf-pagecard-w` | `200px` | 非技术视图页面卡片宽度 |
| `--nf-pagecard-h` | `160px` | 非技术视图页面卡片高度 |

---

## 8. Z-Index

| 令牌 | 值 | 用途 |
|------|-----|------|
| `--nf-z-base` | `0` | 普通内容 |
| `--nf-z-dropdown` | `100` | 快捷指令下拉 |
| `--nf-z-panel` | `200` | 通知卡片 |
| `--nf-z-overlay` | `300` | （保留，系统级用） |
| `--nf-z-modal` | `400` | （保留，系统级用） |

---

## 9. 使用方式

### CSS 变量

```css
/* 深色主题（V1 默认） */
:root {
  --nf-bg-app: #1E1E1E;
  --nf-bg-panel: #252526;
  --nf-bg-input: #2D2D2D;
  /* ... 全部令牌 ... */
}
```

### Tailwind（推荐）

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        'nf-bg-app': '#1E1E1E',
        'nf-blue': '#3B82F6',
        // ...
      },
      spacing: {
        'nf-1': '4px',
        'nf-4': '16px',
        // ...
      },
      borderRadius: {
        'nf-md': '6px',
        'nf-xl': '12px',
        // ...
      }
    }
  }
}
```

### Figma 变量

所有令牌可直接导入 Figma 作为 Color Styles、Text Styles 和 Effect Styles。命名保持一致。
