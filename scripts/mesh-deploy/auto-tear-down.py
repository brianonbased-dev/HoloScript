#!/usr/bin/env python3
"""auto-tear-down.py — polls a running paper-gate instance for completion,
then tears it down and closes the ledger record.

Three independent tear-down triggers (first one wins):
  1. Gate verification artifact detected (CAEL success marker or artifact
     path exists) — paper-gate-execute.py --mode check exits 2.
  2. estimated_hours × 1.5 timeout elapsed — check exits 3.
  3. Fleet-wide cap breached — check exits 4.

Usage:
    # Minimal — derives timeout from the gate definition
    python auto-tear-down.py \\
        --instance-id 12345 \\
        --gate-id 22-msc-kernel-check

    # Explicit rental-start (UTC ISO) and estimated hours (overrides gate)
    python auto-tear-down.py \\
        --instance-id 12345 \\
        --gate-id 22-msc-kernel-check \\
        --rental-start-iso 2026-05-01T03:00:00+00:00 \\
        --estimated-hours 2.0

    # Dry mode — print what would happen every poll cycle without acting
    python auto-tear-down.py \\
        --instance-id 12345 \\
        --gate-id 22-msc-kernel-check \\
        --dry-run

Integration path (task task_1777249616756_l4kd):
    paper-gate-execute.py --mode rent  →  outputs instance_id
    auto-tear-down.py --instance-id <id> --gate-id <gate_id>   (runs in background)
    paper-gate-execute.py --mode teardown  ←  called by this script on trigger
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path


SCRIPT_DIR = Path(__file__).parent
EXECUTOR = SCRIPT_DIR / "paper-gate-execute.py"

POLL_INTERVAL_SECS = 60  # how often to call --mode check


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def run_subprocess(
    cmd: list[str], *, timeout: int = 60
) -> tuple[int, str, str]:
    try:
        cp = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return cp.returncode, cp.stdout or "", cp.stderr or ""
    except subprocess.TimeoutExpired as exc:
        return 124, "", f"timeout after {timeout}s: {exc}"
    except FileNotFoundError as exc:
        return 127, "", f"command not found: {exc}"


def check_instance(
    instance_id: int,
    gate_id: str,
    cap: float,
    team_id: str,
    api_key: str,
) -> tuple[int, dict]:
    """Call paper-gate-execute.py --mode check.

    Returns (exit_code, parsed_output_dict).
    Exit codes (mirrored from executor):
        0 = still running
        2 = success
        3 = timeout
        4 = cap breached
    """
    cmd = [
        sys.executable, str(EXECUTOR),
        "--mode", "check",
        "--instance-id", str(instance_id),
        "--gate-id", gate_id,
        "--cap", str(cap),
    ]
    if team_id:
        cmd += ["--team-id", team_id]
    if api_key:
        cmd += ["--api-key", api_key]

    rc, out, err = run_subprocess(cmd, timeout=30)
    try:
        data = json.loads(out)
    except json.JSONDecodeError:
        data = {"_raw_stdout": out[:300], "_stderr": err[:300]}
    return rc, data


def do_teardown(
    instance_id: int,
    reason: str,
    cap: float,
    team_id: str,
    api_key: str,
    *,
    dry_run: bool,
) -> int:
    """Call paper-gate-execute.py --mode teardown."""
    if dry_run:
        print(
            json.dumps({
                "dry_run": True,
                "action": "teardown",
                "instance_id": instance_id,
                "reason": reason,
                "ts": _now_iso(),
            }),
            flush=True,
        )
        return 0

    cmd = [
        sys.executable, str(EXECUTOR),
        "--mode", "teardown",
        "--instance-id", str(instance_id),
        "--reason", reason,
        "--cap", str(cap),
    ]
    if team_id:
        cmd += ["--team-id", team_id]
    if api_key:
        cmd += ["--api-key", api_key]

    rc, out, err = run_subprocess(cmd, timeout=60)
    try:
        result = json.loads(out)
    except json.JSONDecodeError:
        result = {"_raw_stdout": out[:300]}
    print(json.dumps({"teardown_result": result, "rc": rc, "reason": reason}), flush=True)
    return rc


_CHECK_EXIT_REASONS = {
    2: "success",
    3: "timeout",
    4: "cap-breached",
}


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--instance-id", type=int, required=True,
                   help="Vast.ai instance id returned by paper-gate-execute --mode rent")
    p.add_argument("--gate-id", required=True,
                   help="gate id from paper-gate-scheduler GATES (e.g. 22-msc-kernel-check)")
    p.add_argument("--rental-start-iso", default=None,
                   help="UTC ISO timestamp of rental start (default: now)")
    p.add_argument("--estimated-hours", type=float, default=None,
                   help="estimated gate run time (overrides gate definition default)")
    p.add_argument("--poll-interval", type=int, default=POLL_INTERVAL_SECS,
                   help=f"seconds between check polls (default: {POLL_INTERVAL_SECS})")
    p.add_argument("--cap", type=float, default=100.0,
                   help="$/day cap forwarded to paper-gate-execute --mode check")
    p.add_argument("--team-id", default=os.environ.get("HOLOMESH_TEAM_ID", ""))
    p.add_argument("--api-key", default=os.environ.get("HOLOMESH_API_KEY", ""))
    p.add_argument("--dry-run", action="store_true",
                   help="print what would happen without destroying the instance")
    p.add_argument("--max-polls", type=int, default=0,
                   help="stop after N polls regardless of outcome (0 = unlimited; for tests)")
    args = p.parse_args()

    if not EXECUTOR.exists():
        print(f"ERROR: paper-gate-execute.py not found at {EXECUTOR}", file=sys.stderr)
        return 2

    started_iso = args.rental_start_iso or _now_iso()
    print(
        json.dumps({
            "event": "watchdog-start",
            "instance_id": args.instance_id,
            "gate_id": args.gate_id,
            "rental_start_iso": started_iso,
            "poll_interval_secs": args.poll_interval,
            "dry_run": args.dry_run,
            "ts": _now_iso(),
        }),
        flush=True,
    )

    poll_count = 0
    while True:
        poll_count += 1
        rc, check_data = check_instance(
            args.instance_id,
            args.gate_id,
            args.cap,
            args.team_id,
            args.api_key,
        )

        print(
            json.dumps({
                "event": "poll",
                "poll": poll_count,
                "check_rc": rc,
                "check_data": check_data,
                "ts": _now_iso(),
            }),
            flush=True,
        )

        if rc in _CHECK_EXIT_REASONS:
            reason = _CHECK_EXIT_REASONS[rc]
            tear_rc = do_teardown(
                args.instance_id,
                reason,
                args.cap,
                args.team_id,
                args.api_key,
                dry_run=args.dry_run,
            )
            print(
                json.dumps({
                    "event": "watchdog-done",
                    "instance_id": args.instance_id,
                    "gate_id": args.gate_id,
                    "trigger": reason,
                    "teardown_rc": tear_rc,
                    "total_polls": poll_count,
                    "ts": _now_iso(),
                }),
                flush=True,
            )
            return tear_rc

        if args.max_polls and poll_count >= args.max_polls:
            print(
                json.dumps({
                    "event": "watchdog-max-polls",
                    "instance_id": args.instance_id,
                    "total_polls": poll_count,
                    "ts": _now_iso(),
                }),
                flush=True,
            )
            return 0

        time.sleep(args.poll_interval)


if __name__ == "__main__":
    sys.exit(main())
