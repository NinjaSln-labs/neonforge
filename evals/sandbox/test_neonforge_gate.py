#!/usr/bin/env python3
"""NeonForge 策略门纯函数/审批回调测试（不依赖 AgentDojo）。"""

import json
import os
import pathlib
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, str(pathlib.Path(__file__).parent))

import neonforge_gate as gate

POLICY = gate.load_policy(str(pathlib.Path(__file__).parent / "neonforge-policy.json"))
POLICY_V1 = gate.load_policy(str(pathlib.Path(__file__).parent / "neonforge-policy-v1.json"))


class GateDecisionTest(unittest.TestCase):
    def test_off_allows_everything(self):
        self.assertEqual(gate.decide("send_email", "off", POLICY)[0], "allow")

    def test_read_only_allowed_in_all_modes(self):
        for mode in ("strict", "standard", "delegated"):
            self.assertEqual(gate.decide("search_calendar_events", mode, POLICY)[0], "allow")
            self.assertEqual(gate.decide("list_files", mode, POLICY)[0], "allow")

    def test_destructive_denied_in_all_modes(self):
        for mode in ("strict", "standard", "delegated"):
            self.assertEqual(gate.decide("delete_file", mode, POLICY)[0], "deny")
            self.assertEqual(gate.decide("delete_email", mode, POLICY)[0], "deny")

    def test_external_requires_approval(self):
        for mode in ("strict", "standard", "delegated"):
            self.assertEqual(gate.decide("send_email", mode, POLICY)[0], "ask")
            self.assertEqual(gate.decide("share_file", mode, POLICY)[0], "ask")

    def test_local_create_depends_on_trust_mode(self):
        self.assertEqual(gate.decide("create_file", "strict", POLICY)[0], "ask")
        self.assertEqual(gate.decide("create_file", "standard", POLICY)[0], "allow")
        self.assertEqual(gate.decide("create_file", "delegated", POLICY)[0], "allow")

    def test_local_edit_depends_on_trust_mode(self):
        self.assertEqual(gate.decide("append_to_file", "strict", POLICY)[0], "ask")
        self.assertEqual(gate.decide("append_to_file", "standard", POLICY)[0], "ask")
        self.assertEqual(gate.decide("append_to_file", "delegated", POLICY)[0], "allow")

    def test_calendar_participants_are_external(self):
        self.assertEqual(gate.decide("create_calendar_event", "standard", POLICY)[0], "allow")
        self.assertEqual(
            gate.decide(
                "create_calendar_event",
                "standard",
                POLICY,
                {"participants": ["a@example.com"]},
            )[0],
            "ask",
        )
        self.assertEqual(gate.decide("create_calendar_event", "strict", POLICY)[0], "ask")

    def test_specifier_rule_denies_secret_file_prefix(self):
        self.assertEqual(
            gate.decide("create_file", "delegated", POLICY, {"filename": "secret-plan.txt"})[0],
            "deny",
        )
        self.assertEqual(
            gate.decide(
                "create_file",
                "delegated",
                POLICY,
                {"filename": "hawaii-packing-list.docx"},
            )[0],
            "allow",
        )

    def test_unknown_tool_fails_closed(self):
        self.assertEqual(gate.decide("unknown_tool", "standard", POLICY)[0], "ask")

    def test_ask_effective_requires_explicit_approval(self):
        self.assertEqual(gate.effective_decision("allow"), "allow")
        self.assertEqual(gate.effective_decision("ask"), "deny")
        self.assertEqual(gate.effective_decision("ask", True), "allow")
        self.assertEqual(gate.effective_decision("ask", False), "deny")
        self.assertEqual(gate.effective_decision("deny", True), "deny")

    def test_invalid_mode_raises(self):
        with self.assertRaises(ValueError):
            gate.decide("search_calendar_events", "yolo", POLICY)

    def test_v1_policy_snapshot_is_still_loadable(self):
        self.assertEqual(gate.decide("create_file", "standard", POLICY_V1)[0], "allow")
        self.assertEqual(gate.decide("append_to_file", "delegated", POLICY_V1)[0], "allow")
        # v1 没有 localCalendar：日历创建仍按外部副作用 fail-closed
        self.assertEqual(gate.decide("create_calendar_event", "standard", POLICY_V1)[0], "ask")


class _ApprovalHandler(BaseHTTPRequestHandler):
    def do_POST(self):  # noqa: N802
        length = int(self.headers.get("Content-Length") or 0)
        self.rfile.read(length)
        body = json.dumps({"approved": True, "reason": "test approval"}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        return


class ApprovalCallbackTest(unittest.TestCase):
    def test_approval_callback_returns_true(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), _ApprovalHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        old = os.environ.get("NF_GATE_APPROVAL_URL")
        os.environ["NF_GATE_APPROVAL_URL"] = f"http://127.0.0.1:{server.server_port}/approve"
        try:
            self.assertIs(gate._approval_request("append_to_file", {"file_id": "3"}, "standard"), True)
        finally:
            if old is None:
                os.environ.pop("NF_GATE_APPROVAL_URL", None)
            else:
                os.environ["NF_GATE_APPROVAL_URL"] = old
            server.shutdown()
            server.server_close()

    def test_approval_callback_unavailable_fails_closed(self):
        old = os.environ.get("NF_GATE_APPROVAL_URL")
        os.environ["NF_GATE_APPROVAL_URL"] = "http://127.0.0.1:1/approve"
        try:
            self.assertIsNone(gate._approval_request("append_to_file", {"file_id": "3"}, "standard"))
        finally:
            if old is None:
                os.environ.pop("NF_GATE_APPROVAL_URL", None)
            else:
                os.environ["NF_GATE_APPROVAL_URL"] = old


if __name__ == "__main__":
    unittest.main()
