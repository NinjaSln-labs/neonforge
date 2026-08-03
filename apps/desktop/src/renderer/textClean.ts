// 2026-08-03 v33：思考过程内容清洗——DeepSeek reasoning_content 常含 Markdown 标记（**/反引号/代码块/列表/标题）
// 非技术用户看到的「思考过程」应是可读纯文字（符号是噪音）——展示前 strip，保留内容文字
export function stripMarkdown(text: string): string {
  return text
    // 代码块：去掉 ``` 框，保留内容
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, '').trim())
    // 行内代码：去掉反引号
    .replace(/`([^`]+)`/g, '$1')
    // 加粗 / 斜体
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    // 标题标记（行首 #）
    .replace(/^#{1,6}\s+/gm, '')
    // 无序列表 → 圆点（保留结构感）
    .replace(/^\s*[-*+]\s+/gm, '· ')
    // 有序列表（去掉序号，保留内容）
    .replace(/^\s*\d+[.)]\s+/gm, '')
    // 链接：只留文字
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // 空代码块残留行清理
    .replace(/^\s*```\s*$/gm, '')
    .trim()
}
