#!/usr/bin/env python3
"""AgentDojo 沙箱内的本地 OpenAI 兼容代理。

- 仅监听 127.0.0.1:8000，供 AgentDojo 的 `local`/`vllm_parsed` provider 使用。
- 只转发 /v1/models 与 /v1/chat/completions，不支持任意 URL。
- 上游固定为 https://api.deepseek.com/v1；Key 只从 DEEPSEEK_API_KEY 读取。
- 不记录请求/响应正文，避免提示注入内容进入日志。
"""

import json
import os
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import requests

UPSTREAM = "https://api.deepseek.com/v1"
MODEL_ID = os.environ.get("NF_EVAL_MODEL_ID", "deepseek-chat")
API_KEY = os.environ.get("DEEPSEEK_API_KEY")
MAX_BODY = 4 * 1024 * 1024

if not API_KEY:
    raise SystemExit("DEEPSEEK_API_KEY is required")


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # noqa: A003 - silence access logs
        return

    def _send(self, code: int, body: bytes, content_type: str = "application/json") -> None:
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code: int, payload: object) -> None:
        self._send(code, json.dumps(payload).encode("utf-8"))

    def do_GET(self):  # noqa: N802
        if self.path == "/health":
            self._json(200, {"ok": True})
            return
        if self.path == "/v1/models":
            self._json(
                200,
                {
                    "object": "list",
                    "data": [{"id": MODEL_ID, "object": "model", "owned_by": "deepseek"}],
                },
            )
            return
        self._json(404, {"error": {"message": "not found"}})

    def do_POST(self):  # noqa: N802
        if self.path != "/v1/chat/completions":
            self._json(404, {"error": {"message": "not found"}})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            self._json(400, {"error": {"message": "invalid content-length"}})
            return
        if length <= 0 or length > MAX_BODY:
            self._json(413, {"error": {"message": "invalid body size"}})
            return
        body = self.rfile.read(length)
        try:
            payload = json.loads(body)
        except ValueError:
            self._json(400, {"error": {"message": "invalid json"}})
            return
        # AgentDojo 的 vllm_parsed provider 可能把模型名写成 provider 名；统一改写为上游模型 ID。
        if isinstance(payload, dict):
            payload["model"] = MODEL_ID
            body = json.dumps(payload).encode("utf-8")
        try:
            upstream = requests.post(
                f"{UPSTREAM}/chat/completions",
                data=body,
                headers={
                    "Authorization": f"Bearer {API_KEY}",
                    "Content-Type": "application/json",
                },
                timeout=180,
            )
        except requests.RequestException:
            self._json(502, {"error": {"message": "upstream request failed"}})
            return
        self._send(
            upstream.status_code,
            upstream.content,
            upstream.headers.get("Content-Type", "application/json"),
        )


def main() -> int:
    server = ThreadingHTTPServer(("127.0.0.1", 8000), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    cmd = [sys.executable, "-m", "agentdojo.scripts.benchmark", *sys.argv[1:]]
    return subprocess.call(cmd)


if __name__ == "__main__":
    raise SystemExit(main())
