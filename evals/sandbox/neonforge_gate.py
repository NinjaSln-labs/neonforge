#!/usr/bin/env python3
"""NeonForge 策略门 v2（AgentDojo 工具执行门）。

在 AgentDojo 进程内拦截 `FunctionsRuntime.run_function`：
- 策略 JSON：`deny > ask > allow`，支持 `PermissionRule(tool, specifier)`；
- `NF_GATE_MODE=strict|standard|delegated` 决定本地写入/日历变更的放行范围；
- 外部副作用 ask，破坏性 deny；无人类审批时 ask fail-closed；
- 可选 `NF_GATE_APPROVAL_URL` HTTP 审批回调（超时/异常均拒绝）；
- 追加 `gate.decided` JSONL（不记录正文/收件人值，只记录参数名）。

这是评估用执行门，不是 NeonForge Electron ToolRegistry / 审批 UI 的完整替代。
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from contextvars import ContextVar
from pathlib import Path
from typing import Any

VALID_MODES = ("off", "strict", "standard", "delegated")
DEFAULT_POLICY_PATH = "/eval/neonforge-policy.json"
DEFAULT_LOG_PATH = "/eval/out/neonforge-gate.jsonl"
# GroundTruthPipeline 用同一套 run_function 来构造任务前置/后置状态；它必须绕过策略门，
# 否则“合法任务的 ground truth”会被门当成 agent 的工具调用而拦截。
_IN_GROUND_TRUTH: ContextVar[bool] = ContextVar("nf_in_ground_truth", default=False)


def load_policy(path: str = DEFAULT_POLICY_PATH) -> dict[str, Any]:
    data = json.loads(Path(path).read_text())
    if not isinstance(data, dict) or "groups" not in data or "modes" not in data:
        raise ValueError(f"invalid policy: {path}")
    groups = data["groups"]
    modes = data["modes"]
    if not isinstance(groups, dict) or not isinstance(modes, dict):
        raise ValueError(f"invalid policy: {path}")
    for name in (
        "readOnly",
        "localCreate",
        "localEdit",
        "localCalendar",
        "external",
        "destructive",
    ):
        if not isinstance(groups.get(name), list):
            raise ValueError(f"policy group missing: {name}")
    for name in ("strict", "standard", "delegated"):
        if not isinstance(modes.get(name), list):
            raise ValueError(f"policy mode missing: {name}")
    if not isinstance(data.get("rules", []), list):
        raise ValueError(f"policy rules invalid: {path}")
    return data


def _values(tool: str, args: dict[str, Any], for_deny: bool) -> list[str]:
    """按工具真实执行字段取值；deny 额外扫全部参数（防 decoy 绕过）。"""
    values: list[str] = []

    def add(v: Any) -> None:
        if isinstance(v, (list, tuple, set)):
            values.extend(str(x) for x in v)
        elif v is not None:
            values.append(str(v))

    canonical_keys = {
        "create_file": ("filename",),
        "search_files_by_filename": ("filename",),
        "append_to_file": ("file_id",),
        "delete_file": ("file_id",),
        "get_file_by_id": ("file_id",),
        "share_file": ("file_id", "email"),
        "send_email": ("recipients", "cc", "bcc"),
        "delete_email": ("email_id",),
        "create_calendar_event": ("title", "event_id"),
        "reschedule_calendar_event": ("event_id",),
        "cancel_calendar_event": ("event_id",),
        "add_calendar_event_participants": ("event_id", "participants"),
    }
    for key in canonical_keys.get(tool, ()):
        add(args.get(key))
    if for_deny:
        for key, value in args.items():
            if key not in canonical_keys.get(tool, ()):
                add(value)
    return [v for v in values if v]


def _url_prefix_matches(value: str, specifier: str) -> bool:
    if not (value.startswith("http://") or value.startswith("https://")):
        return False
    try:
        base = urllib.parse.urlparse(specifier)
        target = urllib.parse.urlparse(value)
    except ValueError:
        return False
    if not base.scheme or base.scheme != target.scheme:
        return False
    if base.netloc != target.netloc:
        return False
    base_path = base.path.rstrip("/")
    return not base_path or target.path == base_path or target.path.startswith(base_path + "/")


def matches_rule(tool: str, args: dict[str, Any], rule: dict[str, Any]) -> bool:
    if str(rule.get("tool") or "") != tool:
        return False
    specifier = str(rule.get("specifier") or "")
    if not specifier:
        return True
    action = str(rule.get("action") or "")
    for value in _values(tool, args, for_deny=(action == "deny")):
        if value == specifier or value.startswith(specifier):
            return True
        if _url_prefix_matches(value, specifier):
            return True
    return False


def _calendar_has_participants(args: dict[str, Any]) -> bool:
    participants = args.get("participants")
    return isinstance(participants, (list, tuple, set)) and len(participants) > 0


def decide(
    tool: str,
    mode: str,
    policy: dict[str, Any],
    args: dict[str, Any] | None = None,
) -> tuple[str, str]:
    """返回 (decision, reason)；decision ∈ allow|ask|deny。"""
    if mode == "off":
        return "allow", "policy gate disabled"
    if mode not in ("strict", "standard", "delegated"):
        raise ValueError(f"invalid NF_GATE_MODE: {mode}")

    args = dict(args or {})
    rules = policy.get("rules", [])
    matched = [rule for rule in rules if matches_rule(tool, args, rule)]
    for action in ("deny", "ask", "allow"):
        if any(str(rule.get("action")) == action for rule in matched):
            return action, f"matched PermissionRule({action}, {tool})"

    groups = policy["groups"]
    allowed_groups = policy["modes"][mode]

    # 创建日历事件：无参与者按本地变更；有参与者视为外部副作用（会发邀请邮件）
    if tool == "create_calendar_event" and _calendar_has_participants(args):
        return "ask", "calendar event with participants is an external side effect"

    if tool in groups["destructive"]:
        return "deny", "destructive tool is always denied"
    if tool in groups["external"]:
        return "ask", "external side effect requires per-action approval"
    for group in allowed_groups:
        if tool in groups.get(group, []):
            return "allow", f"allowed by {mode} preset ({group})"
    return "ask", "tool is not covered by current trust preset (fail-closed)"


def effective_decision(decision: str, approved: bool | None = None) -> str:
    """基准没有人类审批；ask 只有在回调明确批准时才放行。"""
    if decision == "allow":
        return "allow"
    if decision == "deny":
        return "deny"
    return "allow" if approved is True else "deny"


def _approval_request(tool: str, args: dict[str, Any], mode: str) -> bool | None:
    url = os.environ.get("NF_GATE_APPROVAL_URL")
    if not url:
        return None
    payload = {
        "type": "gate.approval_request",
        "tool": tool,
        "mode": mode,
        "arg_keys": sorted(str(k) for k in args.keys()),
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=2) as response:
            data = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, ValueError, OSError):
        return None
    return data.get("approved") is True


def log_decision(
    tool: str,
    args: dict[str, Any],
    decision: str,
    reason: str,
    mode: str,
    approved: bool | None = None,
    path: str | None = None,
) -> None:
    target = path or os.environ.get("NF_GATE_LOG", DEFAULT_LOG_PATH)
    entry = {
        "type": "gate.decided",
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "mode": mode,
        "tool": tool,
        "decision": decision,
        "effective": effective_decision(decision, approved),
        "approved": approved,
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

    from agentdojo.functions_runtime import EmptyEnv, FunctionsRuntime

    if getattr(FunctionsRuntime.run_function, "_neonforge_gated", False):
        return mode
    original = FunctionsRuntime.run_function

    # GroundTruthPipeline 绕过：只在它的 query 调用栈内放行，不向 agent 工具循环开放
    from agentdojo.agent_pipeline.ground_truth_pipeline import GroundTruthPipeline

    if not getattr(GroundTruthPipeline.query, "_neonforge_gt_bypass", False):
        original_gt_query = GroundTruthPipeline.query

        def gt_query(self, query, runtime, env=None, messages=None, extra_args=None):
            token = _IN_GROUND_TRUTH.set(True)
            try:
                return original_gt_query(
                    self,
                    query,
                    runtime,
                    env if env is not None else EmptyEnv(),
                    messages if messages is not None else [],
                    extra_args if extra_args is not None else {},
                )
            finally:
                _IN_GROUND_TRUTH.reset(token)

        gt_query._neonforge_gt_bypass = True  # type: ignore[attr-defined]
        GroundTruthPipeline.query = gt_query

    def gated(self, env, function, kwargs, raise_on_error=False):
        # GroundTruthPipeline 构造任务环境时放行（见上方 ContextVar 说明）
        if _IN_GROUND_TRUTH.get():
            return original(self, env, function, kwargs, raise_on_error)
        # 未知工具交给原实现返回 ToolNotFoundError，避免把“拼错工具名”伪装成策略拒绝
        if function not in self.functions:
            return original(self, env, function, kwargs, raise_on_error)
        tool_args = dict(kwargs)
        decision, reason = decide(function, mode, policy, tool_args)
        approved = None
        if decision == "ask":
            approved = _approval_request(function, tool_args, mode)
        effective = effective_decision(decision, approved)
        log_decision(function, tool_args, decision, reason, mode, approved)
        if effective == "allow":
            return original(self, env, function, kwargs, raise_on_error)
        message = (
            f"NeonForgePolicy: {decision}->{effective} "
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
