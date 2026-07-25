#!/usr/bin/env python3
"""vast-spend-ledger.py — fleet-wide $/day spend ledger + cap enforcer.

Founder rulings on the daily cap:
  - 2026-04-26 (founder skill, Architecture-beats-alignment + Paper 25
    row): the daily Vast.ai spend cap is FLEET-WIDE AGGREGATE, not
    per-instance. Initial default $50/day. Per-instance scope rejected
    because 5 concurrent rentals × $50/day = $250/day = 5× the target.
  - 2026-04-26 (later in same day, founder direct directive "lets raise
    the cap to $100 per day"): default raised from $50 to $100/day.
    Same fleet-wide aggregate semantic. Per-paper burn-rates documented
    in compositions/*.hsplus @runtime_requirements blocks unchanged
    (lean-theorist max_dph $3.50; burst-worker brains max_dph $0.30).

The cap must be a structural rail, not operator vigilance — caller
checks via `--check-cap 50` before any new rental, and gets non-zero
exit if the running day's projected spend would exceed the cap.

Ledger format: append-only NDJSON at ~/.ai-ecosystem/vast-spend-ledger.ndjson
Each record: {ts_iso, event, ...}; rental rows also carry instance_id/handle/dph.

Events:
    llm_paid    - discrete paid-LLM cost; record non-negative est_usd
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
import math
import os
import re
import sys
import tempfile
from datetime import datetime, timezone, timedelta
from pathlib import Path


DEFAULT_LEDGER = Path.home() / ".ai-ecosystem" / "vast-spend-ledger.ndjson"
DEFAULT_CAP_USD = 100.0  # raised from $50 to $100/day per founder directive 2026-04-26

SIGNED_RENTAL_BINDING_FIELDS = (
    "spend_authority_hash",
    "provider_principal",
    "contract_guard_path",
    "binding_hash",
    "run_id",
    "label",
)
SIGNED_RENTAL_INTENT_FIELDS = (
    "spend_authority_hash",
    "provider_principal",
    "contract_guard_path",
    "binding_hash",
)
SIGNED_RENTAL_HASH_FIELDS = {
    "spend_authority_hash",
    "provider_principal",
    "binding_hash",
}
SHA256_RECEIPT_RE = re.compile(r"^sha256:[0-9a-f]{64}$")


class LedgerIntegrityError(ValueError):
    """A paid-spend row cannot be safely admitted into cap accounting."""


def signed_rental_binding(record: dict, *, context: str) -> tuple[str, ...] | None:
    """Return an exact signed lifecycle tuple, or ``None`` for a legacy row.

    Presence of a cryptographic or guard binding key is signed intent. ``run_id``
    and ``label`` are also valid legacy metadata, so they do not independently
    switch a row into signed mode. Once signed intent exists, every binding
    field remains mandatory; partial cryptographic tuples never fall back.
    """
    if not any(field in record for field in SIGNED_RENTAL_INTENT_FIELDS):
        return None

    values: list[str] = []
    for field in SIGNED_RENTAL_BINDING_FIELDS:
        value = record.get(field)
        if not isinstance(value, str) or not value.strip():
            raise LedgerIntegrityError(
                f"{context} has an incomplete signed rental binding: {field}"
            )
        if field in SIGNED_RENTAL_HASH_FIELDS and not SHA256_RECEIPT_RE.fullmatch(value):
            raise LedgerIntegrityError(
                f"{context} has an invalid signed rental binding hash: {field}"
            )
        values.append(value)
    return tuple(values)


def positive_finite_number(value: object, *, field: str) -> float:
    if isinstance(value, bool):
        raise LedgerIntegrityError(f"{field} must be a positive finite number")
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise LedgerIntegrityError(
            f"{field} must be a positive finite number"
        ) from exc
    if not math.isfinite(number) or number <= 0:
        raise LedgerIntegrityError(f"{field} must be a positive finite number")
    return number


def normalized_instance_id(value: int | str) -> int | str:
    """Normalize admitted legacy numeric-string ids for lifecycle pairing."""
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return value


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
    for line_number, line in enumerate(
        ledger.read_text(encoding="utf-8").splitlines(), start=1
    ):
        line = line.strip()
        if not line:
            continue
        try:
            record = json.loads(line)
        except json.JSONDecodeError as exc:
            raise LedgerIntegrityError(
                f"ledger line {line_number} is not valid JSON"
            ) from exc
        if not isinstance(record, dict):
            raise LedgerIntegrityError(
                f"ledger line {line_number} must contain a JSON object"
            )
        out.append(record)
    return out


def parse_iso(s: str) -> datetime:
    """Parse ISO timestamps tolerantly. Accepts both `Z` and `+00:00` suffixes."""
    s = s.replace("Z", "+00:00")
    return datetime.fromisoformat(s)


def compute_llm_spend(
    records: list[dict],
    *,
    window_start: datetime,
    now: datetime,
) -> float:
    """Sum valid ``llm_paid.est_usd`` rows in the trailing window.

    Paid-LLM calls are discrete purchased-compute spend, so they contribute
    to actual spend but not the steady-state Vast rental burn rate. A current
    paid row with an invalid timestamp or amount is an integrity failure:
    silently treating it as zero would make the shared cap fail open.
    """
    total = 0.0
    for index, record in enumerate(records, start=1):
        if record.get("event") != "llm_paid":
            continue

        raw_timestamp = record.get("ts_iso")
        if not isinstance(raw_timestamp, str) or not raw_timestamp.strip():
            raise LedgerIntegrityError(
                f"llm_paid record {index} requires a valid ts_iso"
            )
        try:
            paid_ts = parse_iso(raw_timestamp)
        except (KeyError, TypeError, ValueError) as exc:
            raise LedgerIntegrityError(
                f"llm_paid record {index} requires a valid ts_iso"
            ) from exc
        if paid_ts.tzinfo is None or paid_ts.utcoffset() is None:
            raise LedgerIntegrityError(
                f"llm_paid record {index} requires a timezone-aware ts_iso"
            )
        if paid_ts > now:
            raise LedgerIntegrityError(
                f"llm_paid record {index} has a future ts_iso"
            )
        if paid_ts < window_start:
            continue

        raw_amount = record.get("est_usd")
        if isinstance(raw_amount, bool):
            raise LedgerIntegrityError(
                f"llm_paid record {index} requires a non-negative finite est_usd"
            )
        try:
            amount = float(raw_amount)
        except (TypeError, ValueError) as exc:
            raise LedgerIntegrityError(
                f"llm_paid record {index} requires a non-negative finite est_usd"
            ) from exc
        if not math.isfinite(amount) or amount < 0:
            raise LedgerIntegrityError(
                f"llm_paid record {index} requires a non-negative finite est_usd"
            )
        total += amount
        if not math.isfinite(total):
            raise LedgerIntegrityError(
                "llm_paid spend total must remain finite"
            )

    return total


def validate_current_rental_rows(
    records: list[dict],
    *,
    window_start: datetime,
    now: datetime,
) -> None:
    """Reject malformed contract rows that can affect purchased-compute spend.

    Historical ledgers contain a small number of pre-contract rental attempts
    without an instance id. Those rows predate the trailing cap window and keep
    their legacy ignored behavior. A row with an invalid timestamp cannot prove
    that it is historical, so it fails closed. Every identified rental is
    validated even when it predates the window because an unclosed historical
    contract still contributes current burn. Close rows are equally strict:
    malformed or future closes must never suppress an otherwise active rental.
    """
    for index, record in enumerate(records, start=1):
        event = record.get("event")
        if event not in {"rented", "closed"}:
            continue

        raw_timestamp = record.get("ts_iso")
        if not isinstance(raw_timestamp, str) or not raw_timestamp.strip():
            raise LedgerIntegrityError(
                f"{event} record {index} requires a valid ts_iso"
            )
        try:
            rent_ts = parse_iso(raw_timestamp)
        except (AttributeError, TypeError, ValueError) as exc:
            raise LedgerIntegrityError(
                f"{event} record {index} requires a valid ts_iso"
            ) from exc
        if rent_ts.tzinfo is None or rent_ts.utcoffset() is None:
            raise LedgerIntegrityError(
                f"{event} record {index} requires a timezone-aware ts_iso"
            )
        if rent_ts > now:
            raise LedgerIntegrityError(
                f"{event} record {index} has a future ts_iso"
            )
        instance_id = record.get("instance_id")
        binding = signed_rental_binding(record, context=f"{event} record {index}")
        if (
            event == "rented"
            and rent_ts < window_start
            and instance_id is None
            and binding is None
        ):
            continue

        legacy_numeric_id = (
            rent_ts < window_start
            and isinstance(instance_id, str)
            and instance_id.isdigit()
            and int(instance_id) > 0
        )
        if not legacy_numeric_id and (
            isinstance(instance_id, bool)
            or not isinstance(instance_id, int)
            or instance_id <= 0
        ):
            raise LedgerIntegrityError(
                f"{event} record {index} requires a positive integer instance_id"
            )

        if event == "closed":
            continue

        raw_dph = record.get("dph")
        if isinstance(raw_dph, bool):
            raise LedgerIntegrityError(
                f"rented record {index} requires a positive finite dph"
            )
        try:
            dph = float(raw_dph)
        except (TypeError, ValueError) as exc:
            raise LedgerIntegrityError(
                f"rented record {index} requires a positive finite dph"
            ) from exc
        if not math.isfinite(dph) or dph <= 0:
            raise LedgerIntegrityError(
                f"rented record {index} requires a positive finite dph"
            )


def compute_day_spend(
    records: list[dict],
    *,
    now: datetime | None = None,
    window_hours: float = 24.0,
) -> tuple[float, float, list[dict]]:
    """Compute fleet-wide spend metrics.

    Returns (already_spent_usd, daily_burn_rate_usd, active_rentals).

    - already_spent_usd: actual $ burned in the trailing `window_hours`
      (default 24h), including discrete `llm_paid.est_usd` rows. For
      closed rentals: hours running within the window
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
    window_hours = positive_finite_number(window_hours, field="window_hours")
    now = now or _now()
    window_start = now - timedelta(hours=window_hours)
    llm_spend = compute_llm_spend(records, window_start=window_start, now=now)
    validate_current_rental_rows(
        records,
        window_start=window_start,
        now=now,
    )

    # File order is the append-only lifecycle order. A last-row-wins map lets
    # a duplicate unsigned rent overwrite a signed rent, so retain each closed
    # lifecycle and at most one currently open lifecycle per provider id.
    open_rentals: dict[int | str, dict] = {}
    last_closed: dict[int | str, dict] = {}
    pending_unsigned_closes: set[int | str] = set()
    completed: list[tuple[dict, dict]] = []
    for index, record in enumerate(records, start=1):
        event = record.get("event")
        if event not in {"rented", "closed"}:
            continue
        raw_instance_id = record.get("instance_id")
        if raw_instance_id is None:
            continue
        instance_id = normalized_instance_id(raw_instance_id)
        binding = signed_rental_binding(
            record,
            context=f"{event} record {index}",
        )

        if event == "rented":
            if instance_id in open_rentals:
                raise LedgerIntegrityError(
                    f"rented record {index} duplicates an open lifecycle for instance {instance_id}"
                )
            open_rentals[instance_id] = {
                "rent": record,
                "binding": binding,
            }
            continue

        lifecycle = open_rentals.get(instance_id)
        if lifecycle is None:
            prior = last_closed.get(instance_id)
            if prior is None:
                # Legacy ledgers contain inert close attempts before a matching
                # rent. They must not retroactively close a later lifecycle.
                continue
            if prior["binding"] != binding:
                raise LedgerIntegrityError(
                    f"closed record {index} changes the binding mode or proof for instance {instance_id}"
                )
            # A same-proof duplicate close is an inert retry; the first close
            # remains authoritative and cannot be overwritten by append order.
            continue

        if lifecycle["binding"] != binding:
            if lifecycle["binding"] is not None and binding is None:
                # A legacy/conservative reconciler may observe that a provider
                # instance disappeared before the signed host watchdog writes
                # its exact close. The unsigned row has no authority to close
                # or replace the signed lifecycle, so retain the rental until
                # a later exact close arrives. If none arrives, fail closed
                # after the append-only stream has been inspected.
                pending_unsigned_closes.add(instance_id)
                continue
            raise LedgerIntegrityError(
                f"closed record {index} has no exact signed lifecycle proof for instance {instance_id}"
            )
        open_rentals.pop(instance_id)
        pending_unsigned_closes.discard(instance_id)
        rent_ts = parse_iso(lifecycle["rent"]["ts_iso"])
        close_ts = parse_iso(record["ts_iso"])
        if close_ts < rent_ts:
            raise LedgerIntegrityError(
                f"closed record for instance {instance_id} predates its rental"
            )
        completed.append((lifecycle["rent"], record))
        last_closed[instance_id] = {
            "binding": binding,
            "close": record,
        }

    unresolved_unsigned_closes = pending_unsigned_closes.intersection(open_rentals)
    if unresolved_unsigned_closes:
        instance_id = sorted(unresolved_unsigned_closes, key=str)[0]
        raise LedgerIntegrityError(
            f"signed rental {instance_id} has an unsigned close but no exact signed lifecycle proof"
        )

    already_spent = llm_spend
    daily_burn_rate = 0.0
    active: list[dict] = []

    for rent, close in completed:
        rent_ts = parse_iso(rent["ts_iso"])
        close_ts = parse_iso(close["ts_iso"])
        dph = float(rent["dph"])
        start = max(rent_ts, window_start)
        end = min(close_ts, now)
        if end > start:
            already_spent += ((end - start).total_seconds() / 3600) * dph

    for iid, lifecycle in open_rentals.items():
        rent = lifecycle["rent"]
        rent_ts = parse_iso(rent["ts_iso"])
        dph = float(rent["dph"])
        start = max(rent_ts, window_start)
        if now > start:
            already_spent += ((now - start).total_seconds() / 3600) * dph
        daily_burn_rate += dph * 24
        active.append({
            "instance_id": iid,
            "handle": rent.get("handle"),
            "dph": dph,
            "started_at": rent.get("ts_iso"),
            "running_hours_so_far": round((now - rent_ts).total_seconds() / 3600, 2),
        })

    return already_spent, daily_burn_rate, active


def find_open_rental(records: list[dict], instance_id: int) -> dict | None:
    """Find the validated open lifecycle for the legacy close command."""
    target = normalized_instance_id(instance_id)
    current: dict | None = None
    for record in records:
        if record.get("event") not in {"rented", "closed"}:
            continue
        raw_id = record.get("instance_id")
        if raw_id is None or normalized_instance_id(raw_id) != target:
            continue
        if record.get("event") == "rented":
            current = record
        elif current is not None:
            current = None
    return current


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
    try:
        records = read_records(args.ledger)
        compute_day_spend(records)
        open_rental = find_open_rental(records, args.instance_id)
        if open_rental is not None and signed_rental_binding(
            open_rental,
            context=f"open rental {args.instance_id}",
        ) is not None:
            raise LedgerIntegrityError(
                "the close command is legacy-only; signed rentals close through the bound host watchdog"
            )
    except LedgerIntegrityError as exc:
        print(json.dumps({
            "ok": False,
            "ledger_integrity_ok": False,
            "error": str(exc),
        }))
        return 2
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
    try:
        cap_usd = positive_finite_number(args.cap, field="cap_usd")
        window_hours = positive_finite_number(
            args.window_hours,
            field="window_hours",
        )
        records = read_records(args.ledger)
        spent, burn_rate, active = compute_day_spend(
            records, window_hours=window_hours
        )
    except LedgerIntegrityError as exc:
        raw_cap = float(args.cap)
        raw_window = float(args.window_hours)
        print(json.dumps({
            "cap_usd": raw_cap if math.isfinite(raw_cap) else None,
            "window_hours": raw_window if math.isfinite(raw_window) else None,
            "ledger_integrity_ok": False,
            "error": str(exc),
            "under_cap_actual": False,
            "under_cap_projected": False,
        }, indent=2))
        return 2
    out = {
        "cap_usd": cap_usd,
        "window_hours": window_hours,
        "ledger_integrity_ok": True,
        "already_spent_usd": round(spent, 2),
        "daily_burn_rate_usd": round(burn_rate, 2),
        "headroom_spent_usd": round(cap_usd - spent, 2),
        "headroom_burn_rate_usd": round(cap_usd - burn_rate, 2),
        "active_rentals": active,
        "under_cap_actual": spent < cap_usd,
        "under_cap_projected": burn_rate < cap_usd,
    }
    print(json.dumps(out, indent=2))
    # Refuse rentals if EITHER (a) trailing-24h actual already at cap, or
    # (b) steady-state burn rate would breach within next 24h.
    if spent >= cap_usd:
        return 1
    if burn_rate >= cap_usd and not args.allow_projected_breach:
        return 1
    return 0


def cmd_report(args: argparse.Namespace) -> int:
    try:
        records = read_records(args.ledger)
        spent, burn_rate, active = compute_day_spend(
            records, window_hours=args.days * 24.0
        )
    except LedgerIntegrityError as exc:
        print(json.dumps({
            "ledger": str(args.ledger),
            "window_days": args.days,
            "ledger_integrity_ok": False,
            "error": str(exc),
        }, indent=2))
        return 2
    out = {
        "ledger": str(args.ledger),
        "window_days": args.days,
        "ledger_integrity_ok": True,
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

        # Paid LLM usage shares the purchased-compute cap with Vast rentals.
        # Historical rows outside the trailing window remain valid but do not
        # reduce today's headroom.
        llm_records = [
            {"ts_iso": _iso(one_hour_ago), "event": "llm_paid", "est_usd": 99.0},
            {"ts_iso": _iso(now - timedelta(hours=25)),
             "event": "llm_paid", "est_usd": 500.0},
        ]
        llm_spent, llm_burn_rate, llm_active = compute_day_spend(
            llm_records, now=now, window_hours=24.0
        )
        assert abs(llm_spent - 99.0) < 0.01, llm_spent
        assert llm_burn_rate == 0.0, llm_burn_rate
        assert llm_active == [], llm_active
        llm_headroom = DEFAULT_CAP_USD - llm_spent
        assert abs(llm_headroom - 1.0) < 0.01, llm_headroom
        projected_rent_cost = 2.0
        assert projected_rent_cost > llm_headroom

        try:
            compute_day_spend(
                [{"ts_iso": _iso(one_hour_ago), "event": "llm_paid",
                  "est_usd": "not-a-number"}],
                now=now,
                window_hours=24.0,
            )
        except LedgerIntegrityError:
            pass
        else:
            assert False, "invalid current llm_paid row must fail closed"

        try:
            compute_day_spend(
                [{"ts_iso": _iso(one_hour_ago), "event": "rented",
                  "instance_id": 1003}],
                now=now,
                window_hours=24.0,
            )
        except LedgerIntegrityError:
            pass
        else:
            assert False, "invalid current rented row must fail closed"

        # Valid historical rentals still contribute only their overlap with the
        # trailing window; a legitimate close row never needs its own dph.
        historical_closed = [
            {"ts_iso": _iso(now - timedelta(hours=26)), "event": "rented",
             "instance_id": 1004, "handle": "historical", "dph": 2.0},
            {"ts_iso": _iso(now - timedelta(hours=1)), "event": "closed",
             "instance_id": 1004},
        ]
        historical_spent, historical_burn, historical_active = compute_day_spend(
            historical_closed,
            now=now,
            window_hours=24.0,
        )
        assert abs(historical_spent - 46.0) < 0.01, historical_spent
        assert historical_burn == 0.0, historical_burn
        assert historical_active == [], historical_active

    print("self-tests PASS (22 assertions)")
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

    s_close = sub.add_parser(
        "close",
        help="record a legacy tear-down; signed rentals close through the host watchdog",
    )
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
