#!/usr/bin/env python3
"""Focused regression tests for the unified purchased-compute ledger."""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path


SCRIPT = Path(__file__).with_name("vast-spend-ledger.py")
SPEC = importlib.util.spec_from_file_location("vast_spend_ledger", SCRIPT)
if SPEC is None or SPEC.loader is None:  # pragma: no cover - import infrastructure
    raise RuntimeError(f"cannot import {SCRIPT}")
LEDGER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(LEDGER)


class UnifiedPurchasedComputeLedgerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.now = datetime(2026, 7, 11, 12, 0, tzinfo=timezone.utc)

    def test_llm_paid_counts_as_actual_without_changing_vast_burn(self) -> None:
        records = [
            {
                "ts_iso": LEDGER._iso(self.now - timedelta(hours=1)),
                "event": "llm_paid",
                "est_usd": 99,
            },
            {
                "ts_iso": LEDGER._iso(self.now - timedelta(hours=2)),
                "event": "rented",
                "instance_id": 42,
                "handle": "mixed-cap-test",
                "dph": 0.5,
            },
        ]

        spent, burn_rate, active = LEDGER.compute_day_spend(
            records, now=self.now, window_hours=24
        )

        self.assertAlmostEqual(spent, 100.0)
        self.assertAlmostEqual(burn_rate, 12.0)
        self.assertEqual([row["instance_id"] for row in active], [42])

    def test_llm_paid_window_leaves_one_dollar_projected_headroom(self) -> None:
        records = [
            {
                "ts_iso": LEDGER._iso(self.now - timedelta(hours=1)),
                "event": "llm_paid",
                "est_usd": 99,
            },
            {
                "ts_iso": LEDGER._iso(self.now - timedelta(hours=25)),
                "event": "llm_paid",
                "est_usd": 500,
            },
        ]

        spent, burn_rate, active = LEDGER.compute_day_spend(
            records, now=self.now, window_hours=24
        )
        headroom = LEDGER.DEFAULT_CAP_USD - spent

        self.assertAlmostEqual(spent, 99.0)
        self.assertAlmostEqual(headroom, 1.0)
        self.assertEqual(burn_rate, 0.0)
        self.assertEqual(active, [])
        self.assertGreater(2.0, headroom, "a projected $2 rental must not fit")

    def test_invalid_current_llm_paid_rows_fail_closed(self) -> None:
        timestamp = LEDGER._iso(self.now - timedelta(hours=1))
        invalid_rows = [
            {"ts_iso": timestamp, "event": "llm_paid"},
            {"ts_iso": timestamp, "event": "llm_paid", "est_usd": -0.01},
            {"ts_iso": timestamp, "event": "llm_paid", "est_usd": "NaN"},
            {"ts_iso": timestamp, "event": "llm_paid", "est_usd": True},
            {"ts_iso": "not-a-date", "event": "llm_paid", "est_usd": 1},
            {"ts_iso": 123, "event": "llm_paid", "est_usd": 1},
            {
                "ts_iso": LEDGER._iso(self.now + timedelta(minutes=1)),
                "event": "llm_paid",
                "est_usd": 1,
            },
        ]

        for row in invalid_rows:
            with self.subTest(row=row):
                with self.assertRaises(LEDGER.LedgerIntegrityError):
                    LEDGER.compute_day_spend([row], now=self.now, window_hours=24)

    def test_cli_reports_one_dollar_headroom_then_blocks_mixed_spend(self) -> None:
        now = datetime.now(timezone.utc)
        with tempfile.TemporaryDirectory() as temp_dir:
            ledger_path = Path(temp_dir) / "ledger.ndjson"
            LEDGER.append_record(ledger_path, {
                "ts_iso": LEDGER._iso(now - timedelta(hours=1)),
                "event": "llm_paid",
                "est_usd": 99,
            })

            command = [
                sys.executable,
                str(SCRIPT),
                "--ledger",
                str(ledger_path),
                "check-cap",
                "--cap",
                "100",
            ]
            under_cap = subprocess.run(
                command, capture_output=True, text=True, check=False
            )
            self.assertEqual(under_cap.returncode, 0, under_cap.stderr)
            under_cap_state = json.loads(under_cap.stdout)
            self.assertTrue(under_cap_state["ledger_integrity_ok"])
            self.assertAlmostEqual(under_cap_state["already_spent_usd"], 99.0)
            self.assertAlmostEqual(under_cap_state["headroom_spent_usd"], 1.0)

            LEDGER.append_record(ledger_path, {
                "ts_iso": LEDGER._iso(now - timedelta(hours=2)),
                "event": "rented",
                "instance_id": 77,
                "handle": "mixed-cap-block",
                "dph": 1.0,
            })
            over_cap = subprocess.run(
                command, capture_output=True, text=True, check=False
            )
            self.assertEqual(over_cap.returncode, 1, over_cap.stderr)
            over_cap_state = json.loads(over_cap.stdout)
            self.assertFalse(over_cap_state["under_cap_actual"])
            self.assertGreaterEqual(over_cap_state["already_spent_usd"], 101.0)

    def test_cli_rejects_invalid_current_paid_row_with_structured_error(self) -> None:
        now = datetime.now(timezone.utc)
        with tempfile.TemporaryDirectory() as temp_dir:
            ledger_path = Path(temp_dir) / "ledger.ndjson"
            LEDGER.append_record(ledger_path, {
                "ts_iso": LEDGER._iso(now - timedelta(hours=1)),
                "event": "llm_paid",
                "est_usd": "not-a-number",
            })
            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    "--ledger",
                    str(ledger_path),
                    "check-cap",
                    "--cap",
                    "100",
                ],
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertEqual(result.returncode, 2, result.stderr)
            state = json.loads(result.stdout)
            self.assertFalse(state["ledger_integrity_ok"])
            self.assertFalse(state["under_cap_actual"])
            self.assertFalse(state["under_cap_projected"])

    def test_cli_rejects_malformed_ledger_instead_of_skipping_spend(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            ledger_path = Path(temp_dir) / "ledger.ndjson"
            ledger_path.write_text(
                '{"event":"llm_paid","est_usd":99\n', encoding="utf-8"
            )
            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    "--ledger",
                    str(ledger_path),
                    "check-cap",
                    "--cap",
                    "100",
                ],
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertEqual(result.returncode, 2, result.stderr)
            state = json.loads(result.stdout)
            self.assertFalse(state["ledger_integrity_ok"])
            self.assertFalse(state["under_cap_actual"])


if __name__ == "__main__":
    unittest.main()
