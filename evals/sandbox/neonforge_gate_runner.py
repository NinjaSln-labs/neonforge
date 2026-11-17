#!/usr/bin/env python3
"""AgentDojo benchmark 入口包装：先安装 NeonForge 策略门，再运行官方 CLI。"""

import sys

import neonforge_gate

neonforge_gate.install()

from agentdojo.scripts import benchmark  # noqa: E402

if __name__ == "__main__":
    benchmark.main()
