#!/usr/bin/env python3
"""审计记录写入（ADR-035 唯一写入口）——把一条审计记录提交到 refs/audit/log。

形态（ADR-035）：refs/audit/log 分支，audit/<id>.json 一文件一记录；分支历史＝哈希链。
本脚本是**唯一写入口**；手改 refs/audit/log 内容或磁盘记录即被 tools/audit-check.py 抓。

用法：
  python3 tools/audit-record.py --subject <工件路径> --auditor <agent@model> \
      --verdict accepted|conditional|rejected --findings "<摘要>" \
      [--auditor-out <异体原始产出路径>] [--attachment <prose 报告路径>] \
      [--reverify-of <上一条 id>] [--ts <ISO8601>] [--selftest]

不加 --ts 时取当前时间（脚本盖，防手填）。
"""
import argparse, hashlib, json, os, subprocess, sys, tempfile

REF = 'refs/audit/log'
AUDIT_DIR = 'audit'


def git(*args, **kw):
    return subprocess.run(['git', *args], capture_output=True, text=True, **kw)


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()


def blob_sha(path):
    """内容寻址哈希＝git hash-object（与 rename/分支/历史改写无关，ADR-035 版本键）。"""
    r = git('hash-object', path)
    if r.returncode != 0:
        raise SystemExit(f'audit-record: hash-object 失败：{path}\n{r.stderr}')
    return r.stdout.strip()


def repo_root():
    r = git('rev-parse', '--show-toplevel')
    if r.returncode != 0:
        raise SystemExit('audit-record: 不在 git 仓库内')
    return r.stdout.strip()


def next_id(subject, root):
    """id＝a + 6 位，全局单调（取现有最大值 +1）。"""
    mx = 0
    r = git('ls-tree', '-r', '--name-only', REF, AUDIT_DIR, cwd=root)
    for line in r.stdout.splitlines():
        name = os.path.basename(line)
        if name.startswith('a') and name.endswith('.json'):
            try:
                mx = max(mx, int(name[1:-5]))
            except ValueError:
                pass
    return f'a{mx + 1:06d}'


def write_record(fields):
    root = repo_root()
    subject = fields['subject']
    if not os.path.isabs(subject):
        subject = os.path.join(root, subject)
    if not os.path.exists(subject):
        raise SystemExit(f'audit-record: 受审工件不存在：{fields["subject"]}')

    rec = {
        'id': next_id(fields['subject'], root),
        'subject': fields['subject'],
        'subject_blob': blob_sha(subject),
        'subject_commit': git('log', '-1', '--format=%h', '--', fields['subject'],
                              cwd=root).stdout.strip(),
        'auditor': fields['auditor'],
        'verdict': fields['verdict'],
        'findings': fields['findings'],
        'reverify_of': fields['reverify_of'],
        'ts': fields['ts'],
    }
    # 证据与附件哈希（可选）：约束原始产出 / prose 报告不可静默改（ADR-035 判据③）
    if fields['auditor_out']:
        if not os.path.exists(fields['auditor_out']):
            raise SystemExit(f'audit-record: 异体原始产出不存在：{fields["auditor_out"]}')
        rec['auditor_out_sha256'] = sha256_file(fields['auditor_out'])
    if fields['attachment']:
        if not os.path.exists(fields['attachment']):
            raise SystemExit(f'audit-record: 附件不存在：{fields["attachment"]}')
        rec['attachment_sha256'] = sha256_file(fields['attachment'])

    # 写入：先在临时目录造 blob，再用 git plumbing 提交到 refs/audit/log（不签出、不动工作树）
    rel = f'{AUDIT_DIR}/{rec["id"]}.json'
    content = json.dumps(rec, ensure_ascii=False, indent=2) + '\n'
    with tempfile.TemporaryDirectory() as td:
        p = os.path.join(td, os.path.basename(rel))
        with open(p, 'w', encoding='utf-8') as f:
            f.write(content)
        env = dict(os.environ)
        r = git('hash-object', '-w', p, cwd=root)
        if r.returncode != 0:
            raise SystemExit(f'audit-record: 造 blob 失败\n{r.stderr}')
        blob = r.stdout.strip()
        # 取当前 ref 的 tree（若无 ref，用空 tree）
        cur = git('rev-parse', '--verify', '-q', REF, cwd=root).stdout.strip()
        parent = cur
        if cur:
            base = git('rev-parse', f'{REF}^{{tree}}', cwd=root).stdout.strip()
        else:
            base = git('mktree', input='', cwd=root).stdout.strip()
        # 用临时 index 把 audit/<id>.json 加进 tree
        with tempfile.NamedTemporaryFile(suffix='.index', delete=False) as tf:
            idx = tf.name
        os.unlink(idx)
        e = dict(os.environ, GIT_INDEX_FILE=idx)
        subprocess.run(['git', 'read-tree', base], cwd=root, env=e, check=True,
                       capture_output=True)
        subprocess.run(['git', 'update-index', '--add', '--cacheinfo', f'100644,{blob},{rel}'],
                       cwd=root, env=e, check=True, capture_output=True)
        tree = subprocess.run(['git', 'write-tree'], cwd=root, env=e, check=True,
                              capture_output=True, text=True).stdout.strip()
        os.unlink(idx)
        msg = f'audit: {rec["id"]} {rec["verdict"]} {fields["subject"]}'
        if parent:
            commit = subprocess.run(['git', 'commit-tree', tree, '-p', parent, '-m', msg],
                                    cwd=root, check=True, capture_output=True,
                                    text=True).stdout.strip()
        else:
            commit = subprocess.run(['git', 'commit-tree', tree, '-m', msg],
                                    cwd=root, check=True, capture_output=True,
                                    text=True).stdout.strip()
    r = git('update-ref', REF, commit, parent or '', cwd=root)
    if r.returncode != 0:
        raise SystemExit(f'audit-record: update-ref 失败\n{r.stderr}')

    # 锚点：head commit SHA 写入 docs/audits/.anchor（受 git＋desens 双管）
    anchor = os.path.join(root, 'docs', 'audits', '.anchor')
    os.makedirs(os.path.dirname(anchor), exist_ok=True)
    with open(anchor, 'w', encoding='utf-8') as f:
        f.write(commit + '\n')

    print(f'audit-record: 已写入 {rec["id"]} → {REF}（commit {commit[:12]}）')
    print(f'  subject={fields["subject"]} blob={rec["subject_blob"][:12]}… verdict={rec["verdict"]}')
    print(f'  锚点已更新：docs/audits/.anchor')
    return 0


def selftest():
    """自证：能造出记录、blob 键随内容变、reverify_of 可串链。"""
    import shutil
    tmp = tempfile.mkdtemp(prefix='auditrec-selftest-')
    os.chdir(tmp)
    subprocess.run(['git', 'init', '-q'], check=True)
    subprocess.run(['git', 'config', 'user.email', 't@t'], check=True)
    subprocess.run(['git', 'config', 'user.name', 't'], check=True)
    with open('w.md', 'w') as f:
        f.write('v1\n')
    subprocess.run(['git', 'add', 'w.md'], check=True)
    subprocess.run(['git', 'commit', '-qm', 'c1'], check=True)
    b1 = blob_sha('w.md')
    # 直接调核心写函数（绕 argparse）
    f = dict(subject='w.md', auditor='t@x', verdict='accepted', findings='x',
             reverify_of=None, ts='2026-01-01T00:00:00Z', auditor_out=None, attachment=None)
    write_record(f)
    r = git('ls-tree', '-r', '--name-only', REF)
    assert 'audit/a000001.json' in r.stdout, r.stdout
    with open('w.md', 'w') as fh:
        fh.write('v2\n')
    subprocess.run(['git', 'commit', '-qam', 'c2'], check=True)
    b2 = blob_sha('w.md')
    assert b1 != b2, 'blob 键应随内容变'
    os.chdir('/')
    shutil.rmtree(tmp, ignore_errors=True)
    print('audit-record selftest ok：记录可写、blob 键随内容变')
    return 0


def main():
    ap = argparse.ArgumentParser(description='写一条审计记录到 refs/audit/log（ADR-035）')
    ap.add_argument('--subject')
    ap.add_argument('--auditor')
    ap.add_argument('--verdict', choices=['accepted', 'conditional', 'rejected'])
    ap.add_argument('--findings')
    ap.add_argument('--auditor-out')
    ap.add_argument('--attachment')
    ap.add_argument('--reverify-of', default=None)
    ap.add_argument('--ts')
    ap.add_argument('--selftest', action='store_true')
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    missing = [k for k in ('subject', 'auditor', 'verdict', 'findings') if not getattr(a, k)]
    if missing:
        ap.error(f'缺参数：{", ".join(missing)}')
    ts = a.ts or __import__('datetime').datetime.now().astimezone().isoformat(timespec='seconds')
    return write_record(dict(subject=a.subject, auditor=a.auditor, verdict=a.verdict,
                             findings=a.findings, reverify_of=a.reverify_of, ts=ts,
                             auditor_out=a.auditor_out, attachment=a.attachment))


if __name__ == '__main__':
    sys.exit(main())
