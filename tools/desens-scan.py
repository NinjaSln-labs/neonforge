#!/usr/bin/env python3
"""入库前脱敏闸（AGENTS.md 脱敏条）——只扫本次暂存的**新增行**。

用法：python3 tools/desens-scan.py [--selftest]
命中即 exit 1（lefthook pre-commit 调用）。豁免：docs/frozen-be6e299/ 逐字冻结件、本脚本与 lefthook.yml（规则自身含样本）。
"""
import os, re, subprocess, sys

USER = os.environ.get('USER') or os.path.basename(os.path.expanduser('~')) or 'shadow'
SKIP_DIRS = ('docs/frozen-be6e299/',)
SKIP_FILES = ('tools/desens-scan.py', 'lefthook.yml', 'apps/desktop/package-lock.json')

# 排除形状：转义字母后面**不是**另一个路径字母＝独立转义（`t:\d{2}`、`\n`、`e:\.`、`C:\\s`）。
# `F:\neonforge…` 里 'n' 后紧跟 'e'（路径字母），是真路径，不排除。
DRIVE = r'(?<![A-Za-z0-9])[A-Wa-w]:[\\/](?!([sSdDwWbBnNtTrRfFmM$\.])(?:[^A-Za-z0-9_.$ -]|$))[A-Za-z0-9_.$ -]{3,}'
PATTERNS = [
    ('凭据值', re.compile(r'(?i)(?:\bsk|ghp|gho|xox[bp])[-_][A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,}'
                          r'|AKIA[0-9A-Z]{12,}'
                          r'|Bearer\s+[A-Za-z0-9._-]{20,}'
                          r'|(api[_-]?key|secret|passwd|password|access_token|refresh_token)\s*[:=＝]\s*["\x27][A-Za-z0-9+/._-]{12,}["\x27]')),
    ('私钥块', re.compile(r'-----BEGIN [A-Z ]*PRIVATE KEY-----')),
    ('内网地址', re.compile(r'\b(?:192\.168|10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b')),
    ('主机名与账号', re.compile(r'(?<![\w.])(?!(?:CLAUDE|claude)\.local)[A-Za-z0-9-]+\.local(?![.\w-])'
                             r'|\b[A-Za-z0-9._-]+@(?:(?!github\.com|npmjs\.org|localhost|anthropic\.com|openai\.com|deepseek\.com)[A-Za-z0-9.-]+\.[A-Za-z]{2,})')),
    ('本机用户目录', re.compile(rf'(/home/{re.escape(USER)}\b|/Users/{re.escape(USER)}\b|[A-Za-z]:[\\/]Users[\\/]{re.escape(USER)}\b)')),
    ('本地盘路径', re.compile(DRIVE)),
    ('个人号码', re.compile(r'\b1[3-9]\d{9}\b|\b[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:[0-2]\d|3[01])\d{3}[\dXx]\b')),
]
# 凭据类命中要压掉误报：环境变量引用与占位符不是值
BENIGN = re.compile(r'(?i)(your[-_ ]?key[-_ ]?here|<[^>]+>|\$\{?[A-Z_][A-Z0-9_]*\}?'
                    r'|process\.env\.[A-Z_]+|os\.environ|getenv|\bundefined\b|\bnull\b|placeholder|示例)')


def scan_text(text):
    out = []
    for cat, rx in PATTERNS:
        for m in rx.finditer(text):
            if cat == '凭据值' and BENIGN.search(m.group(0)):
                continue
            out.append((cat, m.group(0)))
    return out


def staged_added_lines():
    diff = subprocess.run(['git', 'diff', '--cached', '-U0', '--diff-filter=ACM'],
                          capture_output=True, text=True).stdout
    cur, lineno, hits = None, 0, []
    for line in diff.splitlines():
        if line.startswith('+++ b/'):
            cur = line[6:].strip()
            if cur in SKIP_FILES or any(cur.startswith(d) for d in SKIP_DIRS):
                cur = None
            continue
        if cur is None:
            continue
        if line.startswith('@@'):
            m = re.search(r'\+(\d+)', line)
            lineno = int(m.group(1)) if m else lineno
            continue
        if line.startswith('+') and not line.startswith('+++'):
            for cat, s in scan_text(line[1:]):
                hits.append((cur, lineno, cat, s))
            lineno += 1
    return hits


def mask(s):
    s = s.replace('\n', ' ')
    return s if len(s) <= 6 else s[:4] + '…' + f'（{len(s)} 字符，值已掩码）'


def selftest():
    assert PATTERNS, '模式表为空'
    bad = [f'/home/{USER}/x', f'/Users/{USER}/x', 'F:\\neonforge-competitors\\reports',
           '192.168.31.229', 'sin@mac.local', '-----BEGIN RSA PRIVATE KEY-----',
           'sk-abcdefghijklmnopqrstuvwxyz0', 'AKIAABCDEFGHIJKLMNOP', '13800138000',
           'api_key = "abc123DEF456ghi789"', 'password＝"SuperSecret12345"']
    good = ['/Users/tester/x', '/home/demo/y', 't:\\d{2}', 'C:\\\\s', 'e:\\.',
            'if (/^file:/i.test(url))', '/usr/bin:/bin', 'CLAUDE.local.md',
            'git@github.com', 'api_key = process.env.API_KEY', 'your-key-here', '10.0.0.1x9',
            'CLAUDE.local', 'this.config.apiKey = safeStorage.encryptString(key).toString("base64")',
            'keenableApiKey: w.keenableApiKey']
    for s in bad:
        assert scan_text(s), f'漏检：{s}'
    for s in good:
        assert not scan_text(s), f'误报：{s}'
    hits = scan_text(f'sk-abcdefghijklmnopqrstuvwxyz0')
    assert '值已掩码' in mask(hits[0][1])
    print(f'selftest ok：正例 {len(bad)} 全中，负例 {len(good)} 全不误报')
    return 0


def main():
    if '--selftest' in sys.argv:
        return selftest()
    hits = staged_added_lines()
    if not hits:
        return 0
    print(f'脱敏闸拦下 {len(hits)} 处（AGENTS.md 脱敏条：本仓 PUBLIC，入库前不写机器标识与凭据）：\n')
    for f, ln, cat, s in hits[:20]:
        print(f'  {f}:{ln}  [{cat}]  {mask(s)}')
    if len(hits) > 20:
        print(f'  …另 {len(hits) - 20} 处')
    print('\n改法：路径改成中性描述（"本机快照目录，不入库"），凭据改环境变量引用；'
          '确属逐字冻结件请把它移出本次暂存。')
    return 1


if __name__ == '__main__':
    sys.exit(main())
