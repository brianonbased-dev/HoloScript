#!/usr/bin/env python3
"""vast-spend-ledger.py — fleet-wide $/day spend ledger + cap enforcer.

Founder ruling 2026-04-26 (founder skill, Architecture-beats-alignment +
Paper 25 row): the daily Vast.ai spend cap is FLEET-WIDE AGGREGATE, not
per-instance. Default cap $50/day. Per-instance scope was rejected
because 5 concurrent rentals × $50/day = $250/day = 5× the target.

The cap must be a structural rail, not operator vigilance — caller
checks via `--check-cap 50` before any new rental, and gets non-zero
exit if the running day's projected spend would exceed the cap.

Ledger format: append-only NDJSON at ~/.ai-ecosystem/vast-spend-ledger.ndjson
Each record: {ts_iso, event, instance_id, handle, dph, ...}

Events:
    rented      — new instance dispatched; record dph_total + start time
    closed      — instance torn down; record actual_duration_h + final cost
    snapshot    — periodic state-of-the-fleet roll-up (daily cron output)

Usage:
    # Record a new rental (called by deploy.py post-DEPLOY_DISPATCHED)
    python vast-spend-ledger.py rent \\
        --instance-id 12345 --handle mesh-worker-01 --dph 2.85

    # Record a tear-down
    python vast-spend-ledger.py close --instance-id 12345

    # Check if the day's spend has hit the cap (used as a pre-rental gate)
    python vast-spend-ledger.py check-cap --cap 50
    # exit 0 — under cap, OK to rent
    # exit 1 — at or above cap, refuse new rentals

    # Daily roll-up report
    python vast-spend-ledger.py report --days 1

    # Self-test against synthetic ledger entries
    python vast-spend-ledger.py self-test
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from datetime import datetime, timezone, timedelta
from pathlib import Path


DEFAULT_LEDGER = Path.home() / ".ai-ecosystem" / "vast-spend-ledger.ndjson"
DEFAULT_CAP_USD = 50.0


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat(timespec="seconds")


def append_record(ledger: Path, record: dict) -> None:
    """Append-only write. Creates parent dir if missing."""
    ledger.parent.mkdir(parents=True, exist_ok=True)
    record = {**record, "ts_iso": record.get("ts_iso") or _iso(_now())}
    with ledger.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record) + "\n")


def read_records(ledger: Path) -> list[dict]:
    if not ledger.exists():
        return []
    out: list[dict] = []
    for line in ledger.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            # Skip malformed lines but don't fail the whole ledger
            pass
    return out


def parse_iso(s: str) -> datetime:
    """Parse ISO timestamps tolerantly. Accepts both `Z` and `+00:00` suffixes."""
    s = s.replace("Z", "+00:00")
    return datetime.fromisoformat(s)


def compute_day_spend(
    records: list[dict],
    *,
    now: datetime | None = None,
    window_hours: float = 24.0,
) -> tuple[float, float, list[dict]]:
    """Compute fleet-wide spend metrics.

    Returns (already_spent_usd, daily_burn_rate_usd, active_rentals).

    - already_spent_usd: actual $ burned in the trailing `window_hours`
      (default 24h). For closed rentals: hours running within the window
      × dph. For still-running: (now - rent_ts) hours × dph (clipped to
      window start).
    - daily_burn_rate_usd: steady-state burn — sum(dph × 24h) for all
      currently active (rented but not closed) rentals. This is what the
      next 24h will cost IF nothing changes. The natural cap-check
      number: if burn_rate >= cap, refuse new rentals.
    - active_rentals: list of {instance_id, handle, dph, started_at}.

    Founder ruling 2026-04-26: cap is fleet-wide aggregate (Paper 25 row
    framing). This function aggregates across ALL instances; the cap-
    enforcer is global, not per-instance.
    """
    now = now or _now()
    window_start = now - timedelta(hours=window_hours)

    # Pair rents with closes by instance_id (latest of each event wins)
    rents: dict[int, dict] = {}
    closes: dict[int, dict] = {}
    for r in records:
        ev = r.get("event")
        iid = r.get("instance_id")
        if iid is None:
            continue
        if ev == "rented":
            rents[iid] = r
        elif ev == "closed":
            closes[iid] = r

    already_spent = 0.0
    daily_burn_rate = 0.0
    active: list[dict] = []

    for iid, rent in rents.items():
        try:
            rent_ts = parse_iso(rent["ts_iso"])
        except (KeyError, ValueError):
            continue
        dph = float(rent.get("dph") or 0)
        if dph <= 0:
            continue

        close = closes.get(iid)
        if close:
            # Closed: count overlap with window
            try:
                close_ts = parse_iso(close["ts_iso"])
            except (KeyError, ValueError):
                continue
            start = max(rent_ts, window_start)
            end = min(close_ts, now)
            if end > start:
                already_spent += ((end - start).total_seconds() / 3600) * dph
        else:
            # Still running: count window-clipped hours so far
            start = max(rent_ts, window_start)
            if now > start:
                already_spent += ((now - start).total_seconds() / 3600) * dph
            # Steady-state contribution: dph × 24h
            daily_burn_rate += dph * 24
            active.append({
                "instance_id": iid,
                "handle": rent.get("handle"),
                "dph": dph,
                "started_at": rent.get("ts_iso"),
                "running_hours_so_far": round((now - rent_ts).total_seconds() / 3600, 2),
            })

    return already_spent, daily_burn_rate, active


def cmd_rent(args: argparse.Namespace) -> int:
    record = {
        "event": "rented",
        "instance_id": args.instance_id,
        "handle": args.handle,
        "dph": args.dph,
        "gpu_name": args.gpu_name,
    }
    append_record(args.ledger, record)
    print(json.dumps({"ok": True, "recorded": record}))
    return 0


def cmd_close(args: argparse.Namespace) -> int:
    record = {
        "event": "closed",
        "instance_id": args.instance_id,
    }
    if args.reason:
        record["reason"] = args.reason
    append_record(args.ledger, record)
    print(json.dumps({"ok": True, "recorded": record}))
    return 0


def cmd_check_cap(args: argparse.Namespace) -> int:
    records = read_records(args.ledger)
    spent, burn_rate, active = compute_day_spend(records, window_hours=args.window_hours)
    out = {
        "cap_usd": args.cap,
        "window_hours": args.window_hours,
        "already_spent_usd": round(spent, 2),
        "daily_burn_rate_usd": round(burn_rate, 2),
        "headroom_spent_usd": round(args.cap - spent, 2),
        "headroom_burn_rate_usd": round(args.cap - burn_rate, 2),
        "active_rentals": active,
        "under_cap_actual": spent < args.cap,
        "under_cap_projected": burn_rate < args.cap,
    }
    print(json.dumps(out, indent=2))
    # Refuse rentals if EITHER (a) trailing-24h actual already at cap, or
    # (b) steady-state burn rate would breach within next 24h.
    if spent >= args.cap:
        return 1
    if burn_rate >= args.cap and not args.allow_projected_breach:
        return 1
    return 0


def cmd_report(args: argparse.Namespace) -> int:
    records = read_records(args.ledger)
    spent, burn_rate, active = compute_day_spend(records, window_hours=args.days * 24.0)
    out = {
        "ledger": str(args.ledger),
        "window_days": args.days,
        "records_total": len(records),
        "spent_usd": round(spent, 2),
        "daily_burn_rate_usd": round(burn_rate, 2),
        "active_count": len(active),
        "active": active,
    }
    print(json.dumps(out, indent=2))
    return 0


def cmd_self_test(args: argparse.Namespace) -> int:
    """Self-tests for ledger math + cap enforcement."""
    with tempfile.TemporaryDirectory() as td:
        ledger = Path(td) / "ledger.ndjson"

        # Fixed clock for deterministic tests
        now = datetime(2026, 4, 26, 12, 0, 0, tzinfo=timezone.utc)
        eight_hours_ago = now - timedelta(hours=8)
        two_hours_ago = now - timedelta(hours=2)
        one_hour_ago = now - timedelta(hours=1)

        # Synthetic ledger: one closed rental + one still-running
        records = [
            {"ts_iso": _iso(eight_hours_ago), "event": "rented",
             "instance_id": 1001, "handle": "mw01", "dph": 3.00},
            {"ts_iso": _iso(two_hours_ago), "event": "closed",
             "instance_id": 1001, "reason": "experiment-done"},
            # Closed = ran for 6 hours @ $3/hr = $18
            {"ts_iso": _iso(one_hour_ago), "event": "rented",
             "instance_id": 1002, "handle": "mw02", "dph": 2.00},
            # Still running, 1h ago @ $2/hr = $2 already; if runs full 23h
            # remaining of 24h window, projects another 23 × $2 = $46
        ]
        for r in records:
            append_record(ledger, r)

        loaded = read_records(ledger)
        assert len(loaded) == 3, len(loaded)  # 2 rents + 1 close so far

        spent, burn_rate, active = compute_day_spend(loaded, now=now, window_hours=24.0)
        # Already spent: mw01 ran 6h × $3 = $18; mw02 ran 1h × $2 = $2 → $20
        assert abs(spent - 20.0) < 0.01, f"spent={spent} (expected 20.0)"
        # Daily burn rate: only mw02 is active (1002), $2/hr × 24 = $48
        assert abs(burn_rate - 48.0) < 0.01, f"burn_rate={burn_rate} (expected 48.0)"
        assert len(active) == 1, len(active)
        assert active[0]["instance_id"] == 1002
        assert active[0]["dph"] == 2.0

        # Cap-check semantics:
        # cap=$50: spent=$20 < 50 (OK), burn_rate=$48 < 50 (OK) → under cap
        assert spent < 50.0 and burn_rate < 50.0
        # cap=$40: spent=$20 < 40 (OK), burn_rate=$48 >= 40 (BREACH projected)
        assert spent < 40.0 and burn_rate >= 40.0
        # cap=$15: spent=$20 >= 15 (BREACH actual)
        assert spent >= 15.0

        # Close mw02; burn rate drops to 0
        append_record(ledger, {
            "ts_iso": _iso(now),
            "event": "closed",
            "instance_id": 1002,
        })
        loaded2 = read_records(ledger)
        spent2, burn_rate2, active2 = compute_day_spend(loaded2, now=now, window_hours=24.0)
        assert active2 == [], active2
        assert abs(spent2 - 20.0) < 0.01, spent2
        assert burn_rate2 == 0.0, burn_rate2  # nothing active → zero burn

    print("self-tests PASS (10 assertions)")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--ledger", type=Path, default=DEFAULT_LEDGER,
                   help=f"path to ledger NDJSON (default: {DEFAULT_LEDGER})")

    sub = p.add_subparsers(dest="cmd", required=True)

    s_rent = sub.add_parser("rent", help="record a new rental")
    s_rent.add_argument("--instance-id", type=int, required=True)
    s_rent.add_argument("--handle", required=True)
    s_rent.add_argument("--dph", type=float, required=True, help="$/hr from offer")
    s_rent.add_argument("--gpu-name", default="?")

    s_close = sub.add_parser("close", help="record a tear-down")
    s_close.add_argument("--instance-id", type=int, required=True)
    s_close.add_argument("--reason", default="")

    s_check = sub.add_parser("check-cap", help="exit non-zero if cap reached")
    s_check.add_argument("--cap", type=float, default=DEFAULT_CAP_USD,
                        help=f"$/day cap (default {DEFAULT_CAP_USD})")
    s_check.add_argument("--window-hours", type=float, default=24.0)
    s_check.add_argument("--allow-projected-breach", action="store_true",
                        help="allow new rental even if projected total would exceed cap")

    s_rep = sub.add_parser("report", help="daily roll-up report")
    s_rep.add_argument("--days", type=int, default=1)

    sub.add_parser("self-test", help="run self-tests against synthetic ledger")

    args = p.parse_args()
    handlers = {
        "rent": cmd_rent,
        "close": cmd_close,
        "check-cap": cmd_check_cap,
        "report": cmd_report,
        "self-test": cmd_self_test,
    }
    return handlers[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
