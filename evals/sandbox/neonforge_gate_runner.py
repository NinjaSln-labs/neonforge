#!/usr/bin/env python3
"""AgentDojo benchmark 入口包装：先安装 NeonForge 策略门，再运行官方 CLI。

NF_GATE_APPROVAL_MODE=approve-all|approve-local|deny-all 时，在容器内启动
模拟审批端（只监听 127.0.0.1），并设置 NF_GATE_APPROVAL_URL 指向它。
"""

import os
import sys

import neonforge_gate

_approval_mode = os.environ.get("NF_GATE_APPROVAL_MODE", "off")
if _approval_mode != "off":
    import neonforge_approval_server

    neonforge_approval_server.start_server(_approval_mode)
    print(f"[gate] simulated approval server: {_approval_mode}", file=sys.stderr, flush=True)

neonforge_gate.install()

from agentdojo.scripts import benchmark  # noqa: E402

if __name__ == "__main__":
    benchmark.main()
