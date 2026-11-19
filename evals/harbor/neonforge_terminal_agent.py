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

    @staticmethod
    def name() -> str:
        return "neonforge-terminal"

    def version(self) -> str | None:
        return "0.1.0"

    async def setup(self, environment: BaseEnvironment) -> None:
        # No container-side agent installation; the shell tool uses the task image.
        return None

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
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": instruction},
        ]
        input_tokens = 0
        output_tokens = 0
        commands = 0

        for _ in range(max_iterations):
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
            message = response.choices[0].message
            messages.append(message.model_dump(exclude_none=True))
            if not message.tool_calls:
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
                result = await environment.exec(command, timeout_sec=command_timeout)
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

        context.n_input_tokens = input_tokens
        context.n_output_tokens = output_tokens
        context.metadata = {"commands_executed": commands}
