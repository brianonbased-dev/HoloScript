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

    @staticmethod
    def signed_binding(tag: str = "77") -> dict[str, str]:
        return {
            "spend_authority_hash": "sha256:" + ("11" * 32),
            "provider_principal": "sha256:" + ("22" * 32),
            "contract_guard_path": f"C:/guard/{tag}.json",
            "binding_hash": "sha256:" + ("33" * 32),
            "run_id": f"signed-run-{tag}",
            "label": f"signed-label-{tag}",
        }

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

    def test_invalid_current_rental_rows_fail_closed(self) -> None:
        timestamp = LEDGER._iso(self.now - timedelta(hours=1))
        invalid_rows = [
            {"ts_iso": timestamp, "event": "rented", "dph": 1},
            {
                "ts_iso": timestamp,
                "event": "rented",
                "instance_id": 0,
                "dph": 1,
            },
            {
                "ts_iso": timestamp,
                "event": "rented",
                "instance_id": "77",
                "dph": 1,
            },
            {
                "ts_iso": timestamp,
                "event": "rented",
                "instance_id": True,
                "dph": 1,
            },
            {"ts_iso": timestamp, "event": "rented", "instance_id": 77},
            {
                "ts_iso": timestamp,
                "event": "rented",
                "instance_id": 77,
                "dph": 0,
            },
            {
                "ts_iso": timestamp,
                "event": "rented",
                "instance_id": 77,
                "dph": -0.01,
            },
            {
                "ts_iso": timestamp,
                "event": "rented",
                "instance_id": 77,
                "dph": "NaN",
            },
            {
                "ts_iso": timestamp,
                "event": "rented",
                "instance_id": 77,
                "dph": float("inf"),
            },
            {
                "ts_iso": timestamp,
                "event": "rented",
                "instance_id": 77,
                "dph": True,
            },
            {
                "ts_iso": "not-a-date",
                "event": "rented",
                "instance_id": 77,
                "dph": 1,
            },
            {
                "ts_iso": 123,
                "event": "rented",
                "instance_id": 77,
                "dph": 1,
            },
            {
                "ts_iso": "2026-07-11T11:00:00",
                "event": "rented",
                "instance_id": 77,
                "dph": 1,
            },
            {
                "ts_iso": LEDGER._iso(self.now + timedelta(minutes=1)),
                "event": "rented",
                "instance_id": 77,
                "dph": 1,
            },
        ]

        for row in invalid_rows:
            with self.subTest(row=row):
                with self.assertRaises(LEDGER.LedgerIntegrityError):
                    LEDGER.compute_day_spend([row], now=self.now, window_hours=24)

    def test_historical_and_closed_rental_behavior_is_preserved(self) -> None:
        records = [
            {
                "ts_iso": LEDGER._iso(self.now - timedelta(hours=26)),
                "event": "rented",
                "instance_id": 77,
                "handle": "historical-valid",
                "dph": 2,
            },
            {
                "ts_iso": LEDGER._iso(self.now - timedelta(hours=1)),
                "event": "closed",
                "instance_id": 77,
            },
            # Legacy pre-contract attempt outside the cap window: it has no
            # provider id, and retains the historical ignored behavior.
            {
                "ts_iso": LEDGER._iso(self.now - timedelta(hours=48)),
                "event": "rented",
                "dph": 99,
            },
        ]

        spent, burn_rate, active = LEDGER.compute_day_spend(
            records, now=self.now, window_hours=24
        )

        self.assertAlmostEqual(spent, 46.0)
        self.assertEqual(burn_rate, 0.0)
        self.assertEqual(active, [])

    def test_historical_active_rental_still_requires_a_finite_rate(self) -> None:
        with self.assertRaises(LEDGER.LedgerIntegrityError):
            LEDGER.compute_day_spend(
                [{
                    "ts_iso": LEDGER._iso(self.now - timedelta(hours=48)),
                    "event": "rented",
                    "instance_id": 77,
                    "dph": "NaN",
                }],
                now=self.now,
                window_hours=24,
            )

    def test_historical_numeric_string_contract_ids_remain_compatible(self) -> None:
        records = [
            {
                "ts_iso": LEDGER._iso(self.now - timedelta(hours=48)),
                "event": "rented",
                "instance_id": "77",
                "dph": 1,
            },
            {
                "ts_iso": LEDGER._iso(self.now - timedelta(hours=25)),
                "event": "closed",
                "instance_id": "77",
            },
        ]

        spent, burn_rate, active = LEDGER.compute_day_spend(
            records, now=self.now, window_hours=24
        )
        self.assertEqual(spent, 0.0)
        self.assertEqual(burn_rate, 0.0)
        self.assertEqual(active, [])

    def test_historical_string_rent_pairs_with_integer_close(self) -> None:
        records = [
            {
                "ts_iso": LEDGER._iso(self.now - timedelta(hours=26)),
                "event": "rented",
                "instance_id": "77",
                "dph": 2,
            },
            {
                "ts_iso": LEDGER._iso(self.now - timedelta(hours=1)),
                "event": "closed",
                "instance_id": 77,
            },
        ]

        spent, burn_rate, active = LEDGER.compute_day_spend(
            records, now=self.now, window_hours=24
        )
        self.assertAlmostEqual(spent, 46.0)
        self.assertEqual(burn_rate, 0.0)
        self.assertEqual(active, [])

    def test_malformed_future_and_pre_rent_closes_fail_closed(self) -> None:
        rent = {
            "ts_iso": LEDGER._iso(self.now - timedelta(hours=2)),
            "event": "rented",
            "instance_id": 77,
            "dph": 1,
        }
        invalid_closes = [
            {"ts_iso": "not-a-date", "event": "closed", "instance_id": 77},
            {
                "ts_iso": LEDGER._iso(self.now + timedelta(minutes=1)),
                "event": "closed",
                "instance_id": 77,
            },
            {
                "ts_iso": LEDGER._iso(self.now - timedelta(hours=3)),
                "event": "closed",
                "instance_id": 77,
            },
        ]

        for close in invalid_closes:
            with self.subTest(close=close):
                with self.assertRaises(LEDGER.LedgerIntegrityError):
                    LEDGER.compute_day_spend(
                        [rent, close], now=self.now, window_hours=24
                    )

    def test_partial_signed_binding_never_falls_back_to_legacy(self) -> None:
        base = {
            "ts_iso": LEDGER._iso(self.now - timedelta(hours=2)),
            "event": "rented",
            "instance_id": 77,
            "dph": 1,
            **self.signed_binding(),
        }
        partials = []
        for field in LEDGER.SIGNED_RENTAL_BINDING_FIELDS:
            missing = dict(base)
            missing.pop(field)
            partials.append(missing)
            empty = dict(base)
            empty[field] = ""
            partials.append(empty)

        for rent in partials:
            with self.subTest(fields=sorted(rent)):
                with self.assertRaises(LEDGER.LedgerIntegrityError):
                    LEDGER.compute_day_spend(
                        [rent], now=self.now, window_hours=24
                    )

        historical_without_id = {
            "ts_iso": LEDGER._iso(self.now - timedelta(hours=48)),
            "event": "rented",
            "dph": 1,
            **self.signed_binding("historical"),
        }
        with self.assertRaises(LEDGER.LedgerIntegrityError):
            LEDGER.compute_day_spend(
                [historical_without_id], now=self.now, window_hours=24
            )
        historical_without_id["spend_authority_hash"] = ""
        with self.assertRaises(LEDGER.LedgerIntegrityError):
            LEDGER.compute_day_spend(
                [historical_without_id], now=self.now, window_hours=24
            )

    def test_legacy_run_and_label_metadata_do_not_claim_signed_intent(self) -> None:
        records = [
            {
                "ts_iso": LEDGER._iso(self.now - timedelta(hours=2)),
                "event": "rented",
                "instance_id": 77,
                "dph": 1,
                "run_id": "legacy-finite-job",
                "label": "legacy-finite-job",
            },
            {
                "ts_iso": LEDGER._iso(self.now - timedelta(hours=1)),
                "event": "closed",
                "instance_id": 77,
            },
        ]
        spent, burn_rate, active = LEDGER.compute_day_spend(
            records, now=self.now, window_hours=24
        )
        self.assertEqual(spent, 1)
        self.assertEqual(burn_rate, 0)
        self.assertEqual(active, [])

    def test_duplicate_open_rent_is_rejected_for_all_binding_modes(self) -> None:
        def rent(hours: int, *, signed: bool) -> dict:
            row = {
                "ts_iso": LEDGER._iso(self.now - timedelta(hours=hours)),
                "event": "rented",
                "instance_id": 77,
                "dph": 1,
            }
            if signed:
                row.update(self.signed_binding())
            return row

        for first_signed in (False, True):
            for second_signed in (False, True):
                with self.subTest(
                    first_signed=first_signed,
                    second_signed=second_signed,
                ):
                    with self.assertRaises(LEDGER.LedgerIntegrityError):
                        LEDGER.compute_day_spend(
                            [
                                rent(3, signed=first_signed),
                                rent(2, signed=second_signed),
                            ],
                            now=self.now,
                            window_hours=24,
                        )

    def test_duplicate_close_cannot_change_binding_mode_or_proof(self) -> None:
        signed_rent = {
            "ts_iso": LEDGER._iso(self.now - timedelta(hours=3)),
            "event": "rented",
            "instance_id": 77,
            "dph": 1,
            **self.signed_binding(),
        }
        exact_close = {
            "ts_iso": LEDGER._iso(self.now - timedelta(hours=2)),
            "event": "closed",
            "instance_id": 77,
            **self.signed_binding(),
        }
        bare_duplicate = {
            "ts_iso": LEDGER._iso(self.now - timedelta(hours=1)),
            "event": "closed",
            "instance_id": 77,
        }
        with self.assertRaises(LEDGER.LedgerIntegrityError):
            LEDGER.compute_day_spend(
                [signed_rent, exact_close, bare_duplicate],
                now=self.now,
                window_hours=24,
            )

        unsigned_rent = {
            "ts_iso": LEDGER._iso(self.now - timedelta(hours=3)),
            "event": "rented",
            "instance_id": 88,
            "dph": 1,
        }
        bare_close = {
            "ts_iso": LEDGER._iso(self.now - timedelta(hours=2)),
            "event": "closed",
            "instance_id": 88,
        }
        bound_duplicate = {
            **bare_close,
            "ts_iso": LEDGER._iso(self.now - timedelta(hours=1)),
            **self.signed_binding("88"),
        }
        with self.assertRaises(LEDGER.LedgerIntegrityError):
            LEDGER.compute_day_spend(
                [unsigned_rent, bare_close, bound_duplicate],
                now=self.now,
                window_hours=24,
            )

        spent, burn_rate, active = LEDGER.compute_day_spend(
            [signed_rent, exact_close, {**exact_close, "ts_iso": bare_duplicate["ts_iso"]}],
            now=self.now,
            window_hours=24,
        )
        self.assertAlmostEqual(spent, 1.0)
        self.assertEqual(burn_rate, 0.0)
        self.assertEqual(active, [])

    def test_file_order_preserves_reused_and_preclosed_lifecycles(self) -> None:
        pre_rent_close = {
            "ts_iso": LEDGER._iso(self.now - timedelta(hours=5)),
            "event": "closed",
            "instance_id": 99,
        }
        records = [
            pre_rent_close,
            {
                "ts_iso": LEDGER._iso(self.now - timedelta(hours=4)),
                "event": "rented",
                "instance_id": 77,
                "dph": 1,
            },
            {
                "ts_iso": LEDGER._iso(self.now - timedelta(hours=3)),
                "event": "closed",
                "instance_id": 77,
            },
            {
                "ts_iso": LEDGER._iso(self.now - timedelta(hours=2)),
                "event": "rented",
                "instance_id": 77,
                "dph": 2,
            },
            {
                "ts_iso": LEDGER._iso(self.now - timedelta(hours=1)),
                "event": "closed",
                "instance_id": 77,
            },
            {
                "ts_iso": LEDGER._iso(self.now - timedelta(hours=2)),
                "event": "rented",
                "instance_id": 99,
                "dph": 1,
            },
        ]

        spent, burn_rate, active = LEDGER.compute_day_spend(
            records, now=self.now, window_hours=24
        )
        self.assertAlmostEqual(spent, 5.0)
        self.assertAlmostEqual(burn_rate, 24.0)
        self.assertEqual([row["instance_id"] for row in active], [99])

    def test_signed_rental_rejects_an_unbound_close_row(self) -> None:
        rent = {
            "ts_iso": LEDGER._iso(self.now - timedelta(hours=2)),
            "event": "rented",
            "instance_id": 77,
            "dph": 1,
            "spend_authority_hash": "sha256:" + ("11" * 32),
            "provider_principal": "sha256:" + ("22" * 32),
            "contract_guard_path": "C:/guard/77.json",
            "binding_hash": "sha256:" + ("33" * 32),
            "run_id": "signed-run-77",
            "label": "signed-label-77",
        }
        forged_close = {
            "ts_iso": LEDGER._iso(self.now - timedelta(hours=1)),
            "event": "closed",
            "instance_id": 77,
        }
        with self.assertRaises(LEDGER.LedgerIntegrityError):
            LEDGER.compute_day_spend(
                [rent, forged_close], now=self.now, window_hours=24
            )

        exact_close = {
            **forged_close,
            **{
                field: rent[field]
                for field in (
                    "spend_authority_hash",
                    "provider_principal",
                    "contract_guard_path",
                    "binding_hash",
                    "run_id",
                    "label",
                )
            },
        }
        spent, burn_rate, active = LEDGER.compute_day_spend(
            [rent, exact_close], now=self.now, window_hours=24
        )
        self.assertAlmostEqual(spent, 1.0)
        self.assertEqual(burn_rate, 0.0)
        self.assertEqual(active, [])

    def test_unsigned_reconciler_close_is_inert_until_exact_signed_close(self) -> None:
        rent = {
            "ts_iso": LEDGER._iso(self.now - timedelta(hours=2)),
            "event": "rented",
            "instance_id": 77,
            "dph": 1,
            **self.signed_binding("reconciled"),
        }
        unsigned_close = {
            "ts_iso": LEDGER._iso(self.now - timedelta(minutes=70)),
            "event": "closed",
            "instance_id": 77,
            "reason": "vast-reconcile-not-found",
        }
        exact_close = {
            **unsigned_close,
            "ts_iso": LEDGER._iso(self.now - timedelta(hours=1)),
            **self.signed_binding("reconciled"),
        }

        spent, burn_rate, active = LEDGER.compute_day_spend(
            [rent, unsigned_close, exact_close],
            now=self.now,
            window_hours=24,
        )

        self.assertAlmostEqual(spent, 1.0)
        self.assertEqual(burn_rate, 0.0)
        self.assertEqual(active, [])

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

    def test_cli_rejects_nonfinite_cap_and_invalid_window(self) -> None:
        now = datetime.now(timezone.utc)
        with tempfile.TemporaryDirectory() as temp_dir:
            ledger_path = Path(temp_dir) / "ledger.ndjson"
            LEDGER.append_record(ledger_path, {
                "ts_iso": LEDGER._iso(now - timedelta(hours=1)),
                "event": "llm_paid",
                "est_usd": 250,
            })
            cases = [
                ["--cap", "NaN"],
                ["--cap", "Infinity"],
                ["--cap", "-1"],
                ["--cap", "100", "--window-hours", "-1"],
                ["--cap", "100", "--window-hours", "NaN"],
            ]
            for extra in cases:
                with self.subTest(extra=extra):
                    result = subprocess.run(
                        [
                            sys.executable,
                            str(SCRIPT),
                            "--ledger",
                            str(ledger_path),
                            "check-cap",
                            *extra,
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

    def test_legacy_close_cli_refuses_signed_lifecycle(self) -> None:
        now = datetime.now(timezone.utc)
        with tempfile.TemporaryDirectory() as temp_dir:
            ledger_path = Path(temp_dir) / "ledger.ndjson"
            LEDGER.append_record(ledger_path, {
                "ts_iso": LEDGER._iso(now - timedelta(hours=1)),
                "event": "rented",
                "instance_id": 77,
                "dph": 1,
                **self.signed_binding(),
            })
            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    "--ledger",
                    str(ledger_path),
                    "close",
                    "--instance-id",
                    "77",
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(result.returncode, 2, result.stderr)
            state = json.loads(result.stdout)
            self.assertFalse(state["ok"])
            self.assertIn("legacy-only", state["error"])
            self.assertEqual(len(LEDGER.read_records(ledger_path)), 1)

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

    def test_cli_rejects_invalid_current_rental_with_structured_error(self) -> None:
        now = datetime.now(timezone.utc)
        with tempfile.TemporaryDirectory() as temp_dir:
            ledger_path = Path(temp_dir) / "ledger.ndjson"
            LEDGER.append_record(ledger_path, {
                "ts_iso": LEDGER._iso(now - timedelta(hours=1)),
                "event": "rented",
                "instance_id": 77,
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
            self.assertIn("positive finite dph", state["error"])
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
