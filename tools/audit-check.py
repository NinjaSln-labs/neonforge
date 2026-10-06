#!/usr/bin/env python3
"""审计闭环机械判据（ADR-035）——一道脚本解三症状。

判据（对 refs/audit/log 上每条最新记录）：
  ① 绑定新鲜：subject_blob ≠ 当前 git hash-object <subject> ⇒ STALE
  ② 复验链完整：有 STALE 的 subject 且无 reverify_of 指向它的更新记录 ⇒ 红
  ③ 凭证对账：记录条目 sha256 与锚点链（docs/audits/.anchor）对不上 ⇒ 未经登记的写入
               附件（docs/audits/*.md 等）sha256 ≠ attachment_sha256 ⇒ 未经登记的写入

用法：python3 tools/audit-check.py [--selftest]
命中即 exit 1（挂 AGENTS.md 命令节 / 段6 拦截 / 可选 lefthook）。
"""
import hashlib, json, os, subprocess, sys

REF = 'refs/audit/log'
AUDIT_DIR = 'audit'
ANCHOR = 'docs/audits/.anchor'


def git(*args, cwd=None):
    return subprocess.run(['git', *args], capture_output=True, text=True, cwd=cwd)


def root():
    r = git('rev-parse', '--show-toplevel')
    if r.returncode != 0:
        raise SystemExit('audit-check: 不在 git 仓库内')
    return r.stdout.strip()


def entries(rt):
    """取 refs/audit/log 上全部记录（id → dict），按 id 升序。"""
    r = git('ls-tree', '-r', '--name-only', REF, AUDIT_DIR, cwd=rt)
    out = {}
    for line in r.stdout.splitlines():
        if not line.endswith('.json'):
            continue
        blob = git('show', f'{REF}:{line}', cwd=rt).stdout
        try:
            rec = json.loads(blob)
            out[rec['id']] = rec
        except Exception as e:
            raise SystemExit(f'audit-check: {line} 解析失败：{e}')
    return dict(sorted(out.items()))


def blob_sha(path, rt):
    return git('hash-object', path, cwd=rt).stdout.strip()


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for c in iter(lambda: f.read(65536), b''):
            h.update(c)
    return h.hexdigest()


def check(rt=None):
    """返回 (问题清单, 摘要计数)。"""
    rt = rt or root()
    recs = entries(rt)
    problems = []

    # ③ 凭证对账：锚点 = refs/audit/log head commit SHA
    anchor_path = os.path.join(rt, ANCHOR)
    head = git('rev-parse', '--verify', '-q', REF, cwd=rt).stdout.strip()
    if recs:
        if not os.path.exists(anchor_path):
            problems.append(('③', '锚点缺失：docs/audits/.anchor 不存在，refs/audit/log 无外部锚'))
        else:
            with open(anchor_path, encoding='utf-8') as f:
                recorded = f.read().strip()
            if recorded != head:
                problems.append(('③', f'审计历史被改写：refs/audit/log head={head[:12]} ≠ 锚点={recorded[:12]}（未更新锚点的改写）'))

    # ③ 附件哈希对账
    for rid, rec in recs.items():
        att = rec.get('attachment_sha256')
        # attachment 路径未存路径字段——按 subject 约定或跳过（见 ADR-035：附件哈希可选）
        if att is None:
            continue
        # 附件路径＝记录可扩展字段 attachment（本仓首批回填会带上）
        p = rec.get('attachment')
        if p and os.path.exists(os.path.join(rt, p)):
            if sha256_file(os.path.join(rt, p)) != att:
                problems.append(('③', f'{rid} 附件被改动：{p} 哈希 ≠ 记录（未经登记的写入）'))

    # ① + ② 绑定新鲜 & 复验链（按 subject 取最新记录）
    latest = {}
    for rid, rec in recs.items():          # recs 已按 id 升序，后写覆盖
        latest[rec['subject']] = rec
    stale_subjects = []
    for subject, rec in latest.items():
        p = os.path.join(rt, subject)
        if not os.path.exists(p):
            problems.append(('①', f'{rec["id"]} 受审工件已不存在：{subject}'))
            continue
        cur = blob_sha(p, rt)
        if rec['subject_blob'] != cur:
            stale_subjects.append(subject)
            # ② 是否已有 reverify_of 指向它
            has_reverify = any(r.get('reverify_of') == rec['id'] for r in recs.values()
                               if r['subject'] == subject)
            if not has_reverify:
                problems.append(('②', f'{subject} STALE（记录绑 {rec["subject_blob"][:10]}… ≠ 当前 {cur[:10]}…）且无复验记录（reverify_of 后继缺失）'))
            else:
                problems.append(('①', f'{subject} 虽 STALE 但有复验记录（记录链未收口到最新）'))

    summary = {'records': len(recs), 'subjects': len(latest), 'stale': len(stale_subjects)}
    return problems, summary


def selftest():
    """自证：四幕——改工件⇒STALE、不补⇒②红、补⇒消、改附件⇒③红。"""
    import shutil, tempfile
    tmp = tempfile.mkdtemp(prefix='auditcheck-selftest-')
    os.chdir(tmp)
    subprocess.run(['git', 'init', '-q'], check=True)
    subprocess.run(['git', 'config', 'user.email', 't@t'], check=True)
    subprocess.run(['git', 'config', 'user.name', 't'], check=True)
    with open('w.md', 'w') as f:
        f.write('v1\n')
    subprocess.run(['git', 'add', 'w.md'], check=True)
    subprocess.run(['git', 'commit', '-qm', 'c1'], check=True)

    rt = root()
    os.makedirs(os.path.join(rt, 'audit'), exist_ok=True)
    os.makedirs(os.path.join(rt, 'docs', 'audits'), exist_ok=True)

    def put(rec_id, subject, blob, reverify_of=None, att=None, att_sha=None):
        rec = {'id': rec_id, 'subject': subject, 'subject_blob': blob,
               'subject_commit': 'x', 'auditor': 't@x', 'verdict': 'accepted',
               'findings': 'x', 'reverify_of': reverify_of, 'ts': '2026-01-01T00:00:00Z'}
        if att:
            rec['attachment'] = att
            rec['attachment_sha256'] = att_sha
        p = os.path.join(rt, 'audit', f'{rec_id}.json')
        with open(p, 'w', encoding='utf-8') as f:
            json.dump(rec, f)
        subprocess.run(['git', 'add', f'audit/{rec_id}.json'], check=True)
        subprocess.run(['git', 'commit', '-qm', rec_id], check=True)
        # 更新锚点
        head = git('rev-parse', '--verify', '-q', REF if False else 'HEAD', cwd=rt).stdout.strip()
        # 让 refs/audit/log 指向 HEAD（selftest 简化：用 HEAD 代指 ref）
        subprocess.run(['git', 'update-ref', REF, 'HEAD'], check=True)
        with open(os.path.join(rt, ANCHOR), 'w') as f:
            f.write(git('rev-parse', '--verify', '-q', REF, cwd=rt).stdout.strip() + '\n')

    b1 = blob_sha('w.md', rt)
    put('a000001', 'w.md', b1)

    # 初始：无问题
    probs, _ = check(rt)
    assert not probs, f'初始应无问题，实得 {probs}'

    # 幕2：改工件、记录不动 ⇒ ①+② 红
    with open('w.md', 'w') as f:
        f.write('v2\n')
    subprocess.run(['git', 'commit', '-qam', 'c2'], check=True)
    probs, _ = check(rt)
    kinds = {p[0] for p in probs}
    assert '②' in kinds, f'改工件不补应报②，实得 {probs}'

    # 幕3：补 reverify 记录 ⇒ 消
    b2 = blob_sha('w.md', rt)
    put('a000002', 'w.md', b2, reverify_of='a000001')
    probs, _ = check(rt)
    assert not probs, f'补复验后应无问题，实得 {probs}'

    # 幕4：改附件 ⇒ ③ 红
    with open('att.md', 'w') as f:
        f.write('report v1\n')
    sha = sha256_file(os.path.join(rt, 'att.md'))
    b2b = blob_sha('w.md', rt)
    put('a000003', 'w.md', b2b, reverify_of='a000002', att='att.md', att_sha=sha)
    probs, _ = check(rt)
    assert not probs, f'附件未改应无问题，实得 {probs}'
    with open('att.md', 'w') as f:
        f.write('report TAMPERED\n')
    probs, _ = check(rt)
    kinds = {p[0] for p in probs}
    assert '③' in kinds, f'改附件应报③，实得 {probs}'

    os.chdir('/')
    shutil.rmtree(tmp, ignore_errors=True)
    print('audit-check selftest ok：四幕（改工件⇒②红／补⇒消／改附件⇒③红）全中')
    return 0


def main():
    if '--selftest' in sys.argv:
        return selftest()
    problems, summary = check()
    if not problems:
        print(f'audit-check: OK（记录 {summary["records"]} 条／受审对象 {summary["subjects"]} 个／STALE {summary["stale"]}）')
        return 0
    print(f'audit-check: FAIL（{len(problems)} 处）')
    for kind, msg in problems:
        print(f'  [{kind}] {msg}')
    return 1


if __name__ == '__main__':
    sys.exit(main())
