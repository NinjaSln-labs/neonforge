"""Harbor custom terminal agent for NeonForge adapter evaluation.

This is intentionally small: it talks to the NeonForge OpenAI-compatible adapter
and executes a single `execute_bash` tool through Harbor's environment. It does
not install tmux/asciinema, so task containers with slow apt/network do not fail
during agent setup.
"""

from __future__ import annotations

import json
import os
from typing import Any

from openai import AsyncOpenAI

from harbor.agents.base import BaseAgent
from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext

_SYSTEM_PROMPT = """You are a terminal agent solving a command-line task in a Linux container.
Use the execute_bash tool to inspect the environment, run commands, and create files.
Work in /app unless the task says otherwise. Commands are executed verbatim with a shell.

When the task is complete, reply without calling any tool and briefly state what you did.
If a command fails, inspect the error and adjust the next command."""

_SYSTEM_PROMPT_V2 = """You are a terminal agent solving a command-line task in a Linux container.
Use the execute_bash tool to inspect the environment, run commands, and create files.
Work in /app unless the task says otherwise. Commands are executed verbatim with a shell.

Delivery discipline (required):
1. Before acting, extract the exact deliverables from the task: file paths, formats, service/port states, and any checker commands.
2. Do not stop after writing an implementation. Verify the deliverable from a shell: check existence, permissions, and content/format.
3. If the task requires a service or daemon, leave it running and verify it answers on the required port.
4. If a command fails, inspect stderr and fix the cause; do not assume success.
5. Only reply without calling a tool after every deliverable has been verified. In the final reply, state the paths checked and the verification commands used.
"""

_FINAL_CHECK_PROMPT = """Before finalizing, run a last verification pass. Re-read the task's required outputs and test each with shell commands (existence, format/content, and service/port state). If any required file or service is missing or incorrect, continue fixing it. Only reply without a tool call after all deliverables pass."""

_VERIFICATION_PHASE_PROMPT = """The main execution phase is over. Verification phase: re-read the original task and verify every required deliverable (file paths, formats, services/ports) using execute_bash. If anything is missing or incorrect, fix it now. You have {iterations} additional turns; use them to check and repair the deliverables. Only reply without a tool call after the required outputs have been verified or you have exhausted the repair attempts."""


_BASH_TOOL: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "execute_bash",
        "description": (
            "Execute a shell command in the task container. Returns stdout, stderr, "
            "and the exit code. Use this for reading files, writing files, and verification."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "Shell command to execute. A trailing newline is optional.",
                }
            },
            "required": ["command"],
        },
    },
}


class NeonForgeTerminalAgent(BaseAgent):
    """Minimal Harbor agent using NeonForge's adapter as the model endpoint."""

    system_prompt_text = _SYSTEM_PROMPT
    final_check = False
    strategy = "baseline"
    verification_iterations = 0
    trace_commands = False
    exception_safe = False

    @staticmethod
    def name() -> str:
        return "neonforge-terminal"

    def version(self) -> str | None:
        return "0.1.0"

    async def setup(self, environment: BaseEnvironment) -> None:
        # No container-side agent installation; the shell tool uses the task image.
        return None

    async def _run_phase(
        self,
        client: AsyncOpenAI,
        model: str,
        messages: list[dict[str, Any]],
        max_iterations: int,
        allow_final_check: bool,
        command_timeout: int,
        environment: BaseEnvironment,
        phase: int,
        progress: dict[str, Any] | None = None,
    ) -> tuple[int, int, int, list[dict[str, Any]]]:
        input_tokens = 0
        output_tokens = 0
        commands = 0
        trace: list[dict[str, Any]] = [] if progress is None else progress.setdefault("trace", [])
        nudged = False

        for iteration in range(max_iterations):
            response = await client.chat.completions.create(
                model=model,
                messages=messages,
                tools=[_BASH_TOOL],
                tool_choice="auto",
            )
            usage = response.usage
            if usage is not None:
                input_tokens += usage.prompt_tokens
                output_tokens += usage.completion_tokens
                if progress is not None:
                    progress["input_tokens"] = input_tokens
                    progress["output_tokens"] = output_tokens
            message = response.choices[0].message
            messages.append(message.model_dump(exclude_none=True))
            if not message.tool_calls:
                if (
                    allow_final_check
                    and not nudged
                    and iteration < max_iterations - 1
                ):
                    messages.append({"role": "user", "content": _FINAL_CHECK_PROMPT})
                    nudged = True
                    continue
                break
            for call in message.tool_calls:
                if call.function.name != "execute_bash":
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": call.id,
                            "content": f"unknown tool: {call.function.name}",
                        }
                    )
                    continue
                try:
                    args = json.loads(call.function.arguments or "{}")
                except json.JSONDecodeError as exc:
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": call.id,
                            "content": f"invalid JSON arguments: {exc}",
                        }
                    )
                    continue
                command = args.get("command")
                if not isinstance(command, str) or not command.strip():
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": call.id,
                            "content": "command must be a non-empty string",
                        }
                    )
                    continue
                commands += 1
                entry: dict[str, Any] | None = None
                if self.trace_commands:
                    entry = {
                        "i": commands,
                        "phase": phase,
                        "command": command[:2000],
                        "exit": None,
                    }
                    trace.append(entry)
                    if progress is not None:
                        progress["commands"] = commands
                result = await environment.exec(command, timeout_sec=command_timeout)
                if entry is not None:
                    entry["exit"] = result.return_code
                    if result.return_code != 0:
                        combined = f"{result.stdout or ''}{result.stderr or ''}"
                        entry["output_tail"] = combined[-800:]
                parts = []
                if result.stdout:
                    parts.append(result.stdout)
                if result.stderr:
                    parts.append(f"[stderr]\n{result.stderr}")
                parts.append(f"[exit {result.return_code}]")
                output = "\n".join(parts)
                # Keep individual tool results bounded; the model can inspect further.
                if len(output) > 16000:
                    output = output[:16000] + "\n...[truncated]"
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.id,
                        "content": output,
                    }
                )
        return input_tokens, output_tokens, commands, trace

    async def run(
        self,
        instruction: str,
        environment: BaseEnvironment,
        context: AgentContext,
    ) -> None:
        base_url = os.environ.get("NEONFORGE_BASE_URL", "http://172.17.0.1:18082/v1")
        model = os.environ.get("NEONFORGE_MODEL", self.model_name or "opendesign/deepseek-v4.1-flash-eco")
        client = AsyncOpenAI(
            base_url=base_url,
            api_key=os.environ.get("OPENAI_API_KEY", "nf-eval"),
            timeout=900.0,
            max_retries=0,
        )
        max_iterations = int(os.environ.get("NEONFORGE_MAX_ITERATIONS", "40"))
        command_timeout = int(os.environ.get("NEONFORGE_COMMAND_TIMEOUT_SEC", "300"))
        verification_iterations = self.verification_iterations
        if verification_iterations > 0:
            verification_iterations = int(
                os.environ.get("NEONFORGE_VERIFY_ITERATIONS", str(verification_iterations))
            )
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": self.system_prompt_text},
            {"role": "user", "content": instruction},
        ]
        completed = False
        progress: dict[str, Any] | None = {} if self.exception_safe else None
        try:
            input_tokens, output_tokens, phase1_commands, trace1 = await self._run_phase(
                client,
                model,
                messages,
                max_iterations,
                self.final_check,
                command_timeout,
                environment,
                1,
                progress,
            )
            total_commands = phase1_commands
            phase2_commands = 0
            trace2: list[dict[str, Any]] = []
            if verification_iterations > 0:
                messages.append(
                    {
                        "role": "user",
                        "content": _VERIFICATION_PHASE_PROMPT.format(iterations=verification_iterations),
                    }
                )
                extra_in, extra_out, phase2_commands, trace2 = await self._run_phase(
                    client,
                    model,
                    messages,
                    verification_iterations,
                    False,
                    command_timeout,
                    environment,
                    2,
                )
                input_tokens += extra_in
                output_tokens += extra_out
                total_commands += phase2_commands

            context.n_input_tokens = input_tokens
            context.n_output_tokens = output_tokens
            metadata: dict[str, Any] = {"commands_executed": total_commands}
            if self.strategy != "baseline":
                metadata["strategy"] = self.strategy
            if self.verification_iterations > 0:
                metadata["phase1_commands"] = phase1_commands
                metadata["phase2_commands"] = phase2_commands
            if self.trace_commands:
                metadata["commands_log"] = trace1 + trace2
            context.metadata = metadata
            completed = True
        finally:
            if not completed and progress is not None:
                context.n_input_tokens = progress.get("input_tokens", 0)
                context.n_output_tokens = progress.get("output_tokens", 0)
                context.metadata = {
                    "commands_executed": progress.get("commands", 0),
                    "strategy": self.strategy,
                    "commands_log": progress.get("trace", []),
                    "terminated_by_exception": True,
                }


class NeonForgeTerminalAgentV2(NeonForgeTerminalAgent):
    """Variant requiring explicit deliverable verification before finishing."""

    system_prompt_text = _SYSTEM_PROMPT_V2
    final_check = True
    strategy = "deliverable-check"

    @staticmethod
    def name() -> str:
        return "neonforge-terminal-v2"

    def version(self) -> str | None:
        return "0.2.0"


class NeonForgeTerminalAgentV3(NeonForgeTerminalAgentV2):
    """Two-phase variant: main loop, then a dedicated verification/fix phase."""

    final_check = False
    strategy = "two-phase-10"
    verification_iterations = 10

    @staticmethod
    def name() -> str:
        return "neonforge-terminal-v3"

    def version(self) -> str | None:
        return "0.3.0"


class NeonForgeTerminalAgentV4(NeonForgeTerminalAgent):
    """Baseline 40-round agent with bounded per-command trajectory metadata."""

    strategy = "trace-baseline"
    trace_commands = True

    @staticmethod
    def name() -> str:
        return "neonforge-terminal-v4-trace"

    def version(self) -> str | None:
        return "0.4.0"


class NeonForgeTerminalAgentV5(NeonForgeTerminalAgentV4):
    """Trace variant that persists partial metadata even when a command raises."""

    exception_safe = True

    @staticmethod
    def name() -> str:
        return "neonforge-terminal-v5-trace"

    def version(self) -> str | None:
        return "0.5.0"
