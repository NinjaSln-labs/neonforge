#!/usr/bin/env python3
"""模拟审批端测试：模式裁决、HTTP 回调与日志字段。"""

import json
import os
import pathlib
import sys
import tempfile
import unittest
import urllib.error
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).parent))

import neonforge_approval_server as approval
import neonforge_gate as gate


def _post(url: str, payload: dict) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=2) as response:
        return json.loads(response.read().decode("utf-8"))


class ApprovalDecisionTest(unittest.TestCase):
    def test_approve_all(self):
        self.assertEqual(approval.decide(approval.APPROVE_ALL, "send_email", ["recipient"])[0], True)
        self.assertEqual(approval.decide(approval.APPROVE_ALL, "delete_file", ["file_id"])[0], True)

    def test_deny_all(self):
        self.assertEqual(approval.decide(approval.DENY_ALL, "create_file", ["filename"])[0], False)

    def test_approve_local(self):
        self.assertEqual(approval.decide(approval.APPROVE_LOCAL, "create_file", ["filename"])[0], True)
        self.assertEqual(approval.decide(approval.APPROVE_LOCAL, "append_to_file", ["file_id"])[0], True)
        self.assertEqual(
            approval.decide(approval.APPROVE_LOCAL, "create_calendar_event", ["title"])[0], True
        )
        # 有 participants 的日历创建按外部邀请处理
        self.assertEqual(
            approval.decide(approval.APPROVE_LOCAL, "create_calendar_event", ["title", "participants"])[0],
            False,
        )
        self.assertEqual(approval.decide(approval.APPROVE_LOCAL, "send_email", ["recipient"])[0], False)
        self.assertEqual(approval.decide(approval.APPROVE_LOCAL, "delete_file", ["file_id"])[0], False)

    def test_unknown_mode_raises(self):
        with self.assertRaises(ValueError):
            approval.decide("yolo", "create_file", [])


class ApprovalServerTest(unittest.TestCase):
    def setUp(self):
        self._old_url = os.environ.get("NF_GATE_APPROVAL_URL")
        self._tmp = tempfile.TemporaryDirectory()
        self._log_path = os.path.join(self._tmp.name, "approvals.jsonl")

    def tearDown(self):
        if self._old_url is None:
            os.environ.pop("NF_GATE_APPROVAL_URL", None)
        else:
            os.environ["NF_GATE_APPROVAL_URL"] = self._old_url
        self._tmp.cleanup()

    def _entries(self):
        if not os.path.exists(self._log_path):
            return []
        with open(self._log_path, encoding="utf-8") as fh:
            return [json.loads(line) for line in fh if line.strip()]

    def test_server_approve_local_via_http(self):
        server = approval.start_server(approval.APPROVE_LOCAL, port=0, log_path=self._log_path)
        try:
            url = os.environ["NF_GATE_APPROVAL_URL"]
            payload = {
                "type": "gate.approval_request",
                "tool": "create_file",
                "mode": "strict",
                "arg_keys": ["filename"],
            }
            self.assertTrue(_post(url, payload)["approved"])
            payload["tool"] = "send_email"
            self.assertFalse(_post(url, payload)["approved"])
            payload["tool"] = "create_calendar_event"
            payload["arg_keys"] = ["title", "participants"]
            self.assertFalse(_post(url, payload)["approved"])
        finally:
            approval.stop_server(server)

        entries = self._entries()
        self.assertEqual(len(entries), 3)
        self.assertEqual(entries[0]["type"], "gate.approval_simulated")
        self.assertNotIn("filename_value", entries[0])
        self.assertEqual(entries[0]["arg_keys"], ["filename"])

    def test_gate_uses_simulated_server(self):
        server = approval.start_server(approval.APPROVE_LOCAL, port=0, log_path=self._log_path)
        try:
            self.assertIs(gate._approval_request("append_to_file", {"file_id": "3"}, "standard"), True)
            self.assertIs(gate._approval_request("send_email", {"recipient": "x"}, "standard"), False)
        finally:
            approval.stop_server(server)

    def test_bad_request_is_rejected(self):
        server = approval.start_server(approval.DENY_ALL, port=0, log_path=self._log_path)
        try:
            url = os.environ["NF_GATE_APPROVAL_URL"]
            with self.assertRaises(urllib.error.HTTPError):
                _post(url, {"type": "not-a-gate-request"})
        finally:
            approval.stop_server(server)


if __name__ == "__main__":
    unittest.main()
