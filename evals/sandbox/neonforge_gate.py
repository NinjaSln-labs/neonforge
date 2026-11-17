#!/usr/bin/env python3
"""NeonForge 策略门 v1（AgentDojo 工具执行门）。

在 AgentDojo 进程内拦截 `FunctionsRuntime.run_function`：
- 读取 `NF_GATE_MODE=strict|standard|delegated` 与策略 JSON；
- 按 `deny > ask > allow` 裁决；
- `ask` 在无人类审批的基准中按 fail-closed 视为拒绝；
- 追加 `gate.decided` JSONL（不记录完整参数，只记录参数名）。

这不是 NeonForge Electron ToolRegistry 的替代实现；它把同一套策略语义
（`ask` / `deny` / 信任预设 / 默认拒绝）映射到 AgentDojo 的工具执行点。
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

VALID_MODES = ("off", "strict", "standard", "delegated")
DEFAULT_POLICY_PATH = "/eval/neonforge-policy.json"
DEFAULT_LOG_PATH = "/eval/out/neonforge-gate.jsonl"


def load_policy(path: str = DEFAULT_POLICY_PATH) -> dict[str, Any]:
    data = json.loads(Path(path).read_text())
    if not isinstance(data, dict) or "groups" not in data or "modes" not in data:
        raise ValueError(f"invalid policy: {path}")
    groups = data["groups"]
    modes = data["modes"]
    if not isinstance(groups, dict) or not isinstance(modes, dict):
        raise ValueError(f"invalid policy: {path}")
    for name in ("readOnly", "localWrite", "external", "destructive"):
        if not isinstance(groups.get(name), list):
            raise ValueError(f"policy group missing: {name}")
    for name in ("strict", "standard", "delegated"):
        if not isinstance(modes.get(name), list):
            raise ValueError(f"policy mode missing: {name}")
    return data


def decide(
    tool: str,
    mode: str,
    policy: dict[str, Any],
) -> tuple[str, str]:
    """返回 (decision, reason)；decision ∈ allow|ask|deny。"""
    if mode == "off":
        return "allow", "policy gate disabled"
    if mode not in ("strict", "standard", "delegated"):
        raise ValueError(f"invalid NF_GATE_MODE: {mode}")

    groups = policy["groups"]
    allowed_groups = policy["modes"][mode]

    if tool in groups["destructive"]:
        return "deny", "destructive tool is always denied"
    if tool in groups["external"]:
        return "ask", "external side effect requires per-action approval"
    for group in allowed_groups:
        if tool in groups.get(group, []):
            return "allow", f"allowed by {mode} preset ({group})"
    return "ask", "tool is not covered by current trust preset (fail-closed)"


def effective_decision(decision: str) -> str:
    """基准没有人类审批；ask 按 fail-closed 视为拒绝。"""
    return "allow" if decision == "allow" else "deny"


def log_decision(
    tool: str,
    args: dict[str, Any],
    decision: str,
    reason: str,
    mode: str,
    path: str | None = None,
) -> None:
    target = path or os.environ.get("NF_GATE_LOG", DEFAULT_LOG_PATH)
    entry = {
        "type": "gate.decided",
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "mode": mode,
        "tool": tool,
        "decision": decision,
        "effective": effective_decision(decision),
        "reason": reason,
        # 不记录正文/收件人等内容，只保留参数名，降低注入内容入库风险
        "arg_keys": sorted(str(k) for k in args.keys()),
    }
    line = json.dumps(entry, ensure_ascii=False, separators=(",", ":")) + "\n"
    Path(target).parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
    try:
        os.write(fd, line.encode("utf-8"))
    finally:
        os.close(fd)


def install() -> str:
    """安装执行门；返回当前模式。重复调用是幂等的。"""
    mode = os.environ.get("NF_GATE_MODE", "off")
    if mode == "off":
        return mode
    if mode not in VALID_MODES:
        raise SystemExit(f"invalid NF_GATE_MODE: {mode}")
    policy = load_policy(os.environ.get("NF_GATE_POLICY", DEFAULT_POLICY_PATH))

    from agentdojo.functions_runtime import FunctionsRuntime

    if getattr(FunctionsRuntime.run_function, "_neonforge_gated", False):
        return mode
    original = FunctionsRuntime.run_function

    def gated(self, env, function, kwargs, raise_on_error=False):
        # 未知工具交给原实现返回 ToolNotFoundError，避免把“拼错工具名”伪装成策略拒绝
        if function not in self.functions:
            return original(self, env, function, kwargs, raise_on_error)
        decision, reason = decide(function, mode, policy)
        log_decision(function, dict(kwargs), decision, reason, mode)
        if effective_decision(decision) == "allow":
            return original(self, env, function, kwargs, raise_on_error)
        message = (
            f"NeonForgePolicy: {decision}->{effective_decision(decision)} "
            f"({reason}); tool '{function}' was not executed."
        )
        if raise_on_error:
            raise PermissionError(message)
        return "", message

    gated._neonforge_gated = True  # type: ignore[attr-defined]
    FunctionsRuntime.run_function = gated
    return mode


if __name__ == "__main__":
    print(install())
