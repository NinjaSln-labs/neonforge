#!/usr/bin/env python3
"""NeonForge 策略门纯函数测试（不依赖 AgentDojo）。"""

import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).parent))

import neonforge_gate as gate

POLICY = gate.load_policy(str(pathlib.Path(__file__).parent / "neonforge-policy.json"))


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

    def test_local_write_depends_on_trust_mode(self):
        self.assertEqual(gate.decide("create_file", "strict", POLICY)[0], "ask")
        self.assertEqual(gate.decide("create_file", "standard", POLICY)[0], "allow")
        self.assertEqual(gate.decide("append_to_file", "delegated", POLICY)[0], "allow")

    def test_unknown_tool_fails_closed(self):
        self.assertEqual(gate.decide("unknown_tool", "standard", POLICY)[0], "ask")

    def test_ask_effective_is_deny_without_human(self):
        self.assertEqual(gate.effective_decision("ask"), "deny")
        self.assertEqual(gate.effective_decision("deny"), "deny")
        self.assertEqual(gate.effective_decision("allow"), "allow")

    def test_invalid_mode_raises(self):
        with self.assertRaises(ValueError):
            gate.decide("search_calendar_events", "yolo", POLICY)


if __name__ == "__main__":
    unittest.main()
