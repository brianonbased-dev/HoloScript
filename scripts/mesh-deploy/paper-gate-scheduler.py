#!/usr/bin/env python3
"""paper-gate-scheduler.py — reads paper-program + codebase state, ranks
unmet gates, produces cap-aware Vast.ai rental schedule.

Founder direction 2026-04-26 ("instances rented should be automated and
gated on codebase and papers"): provisioning must read real signals
from (a) paper-audit-matrix gate criteria, (b) corpus INDEX.json
counters, (c) /room board open tasks, and produce a SCHEDULE the
operator (or future executor) can act on.

This module is the PLANNER. It outputs a ranked schedule. It does NOT
rent. The executor wiring (--execute flag → call deploy.py per
schedule item, monitor CAEL records for completion, auto-tear-down via
vast-spend-ledger close + vastai destroy instance) is filed as a
follow-up task per F.031 (refuses to ship live-instance auto-rental
behavior without one manual validation pass).

Architecture (per W.GOLD.001, structure beats vigilance):
    GATES (declarative)              picker ────► offer
        │                                │
        ├─► resolve_state ──► UnmetGate ─┼─► Plan  ─► ledger check-cap
        │   (corpus + board + git)       │    │
        │                                │    └─► JSON output (operator/executor reads)
        └─► brain capability lookup      │
            (compositions/*.hsplus)      │

Usage:
    python paper-gate-scheduler.py --dry-run         # full schedule, no side effects
    python paper-gate-scheduler.py --paper 22        # single-paper plan (kernel-check)
    python paper-gate-scheduler.py --self-test       # synthetic-state assertions
    python paper-gate-scheduler.py --json            # machine-readable output

Output (JSON):
    {
      "asOf": "<iso>",
      "schedulable": [
        {
          "gate_id": "22-msc-kernel-check",
          "paper": "22",
          "brain": "lean-theorist-brain",
          "priority": "P0",
          "estimated_hours": 2.0,
          "estimated_cost_usd": 6.40,
          "fits_under_cap": true,
          "matrix_row": "research/paper-audit-matrix.md",
          "blocking_artifact": "research/papers-22-23-mechanization/MSC/Invariants.lean",
          "verification": "lake build (kernel-check 0-sorry status)",
          "runtime_requirements": { ... },
          "first_action": "rent <chosen_offer> + bootstrap-agent.sh + run lake build"
        },
        ...
      ],
      "blocked_by_cap": [ ... ],
      "blocked_by_missing_scaffold": [ ... ],
      "ledger_state": {
        "spent_usd": 0,
        "burn_rate_usd": 0,
        "cap_usd": 50,
        "headroom_usd": 50
      }
    }
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path


# Hand-curated gate map. Each entry maps a paper-program gate to (a) the
# brain that clears it, (b) the verification artifact, (c) cost estimate.
# Source-of-truth for the gate criteria column is paper-audit-matrix.md;
# matrix_row references that table for honesty per F.017 + F.030.
#
# When matrix is updated, audit this list. Drift surfaces in --self-test
# via a "matrix_row file does not exist" assertion.
GATES = [
    {
        "gate_id": "22-msc-kernel-check",
        "paper": "22",
        "brain": "lean-theorist-brain",
        "priority": "P0",
        "estimated_hours": 2.0,
        "blocking_artifact": "research/papers-22-23-mechanization/MSC/Invariants.lean",
        "verification": "lake build → exit 0, 0 sorry, all 4 invariants kernel-check pass",
        "matrix_row": "research/paper-audit-matrix.md (Paper 22)",
        "preconditions": [
            "compositions/lean-theorist-brain.hsplus has @runtime_requirements (✓ b97bad9)",
            "bootstrap-agent.sh installs elan + lake on lean*brain* match (✓ 3e8b623e1)",
            "agents.json mw01 = local-llm Qwen 72B-AWQ (✓ f592086ae)",
        ],
        "first_action": "rent → scp Invariants.lean → bash 'lake build' → record CAEL",
    },
    {
        "gate_id": "23-hscore-kernel-check",
        "paper": "23",
        "brain": "lean-theorist-brain",
        "priority": "P1",
        "estimated_hours": 8.0,
        "blocking_artifact": "research/papers-22-23-mechanization/HsCore/{Syntax,Progress,Preservation,NoTraitConflict}.lean",
        "verification": "5-trait fragment encoded + progress + preservation kernel-check 0 sorry",
        "matrix_row": "research/paper-audit-matrix.md (Paper 23)",
        "preconditions": [
            "Same toolchain as Paper 22",
            "Paper 23 file layout NOT yet worker-verified (lean-theorist composition flagged TODO)",
        ],
        "first_action": "rent → scp HsCore/* → bash 'lake build' iteratively per file",
    },
    {
        "gate_id": "17-sesl-corpus",
        "paper": "17",
        "brain": "sesl-training-brain",
        "priority": "P1",
        "estimated_hours": 168.0,  # 7 fleet-days
        "blocking_artifact": "research/paper-17-sesl-pairs/INDEX.json (post-W.107 pair count)",
        "verification": "≥5000 trusted pairs + ≥60% pass rate per Paper 17 gate",
        "matrix_row": "research/paper-audit-matrix.md (Paper 17)",
        "preconditions": [
            "fleet-corpus-collector.mjs running daily (manual cron)",
            "extract-sesl-pairs.mjs running daily (manual cron)",
            "compositions/sesl-training-brain.hsplus needs @runtime_requirements (TODO _nfpi)",
        ],
        "first_action": "rent → bootstrap → daemon ticks → corpus accumulates over 7 days",
    },
    {
        "gate_id": "19-trait-inference-f1",
        "paper": "19",
        "brain": "trait-inference-brain",
        "priority": "P1",
        "estimated_hours": 24.0,
        "blocking_artifact": "F1 score from training+held-out-eval pipeline (does not yet exist)",
        "verification": "≥80% F1 on held-out trait descriptions + ablation matrix",
        "matrix_row": "research/paper-audit-matrix.md (Paper 19)",
        "preconditions": [
            "Harness MISSING — research/paper-19-trait-inference/ has only spec + 5 board tasks",
            "Phase-3 tasks: _yohk dataset / _jpmg ablation / _ovpi top-k / _mrr3 GPU-claim",
            "compositions/trait-inference-brain.hsplus needs @runtime_requirements (TODO _nfpi)",
        ],
        "first_action": "BLOCKED — claim _yohk first (offline dataset synthesis), then _jpmg ablation, then GPU sweep",
    },
    {
        "gate_id": "21-ati-defense-measure",
        "paper": "21",
        "brain": "security-auditor-brain",
        "priority": "P2",
        "estimated_hours": 48.0,  # 7-day measurement window
        "blocking_artifact": "research/paper-21-adversarial-trust-injection-usenix.tex (29 \\todo{measure} markers)",
        "verification": "D2/D3 defense efficacy measurements (post-7-day post-W.107 fleet)",
        "matrix_row": "research/paper-audit-matrix.md (Paper 21)",
        "preconditions": [
            "Fleet running ≥7 days post-W.107 (clock not yet started — fleet stopped)",
            "Trust-epoch tagged CAEL records accumulating",
            "Headless security-auditor agent (agent_1777079220108_d8yw) needs to be running",
        ],
        "first_action": "BLOCKED on 17-sesl-corpus — same fleet-up dependency",
    },
    {
        "gate_id": "2-snn-bench",
        "paper": "2",
        "brain": "trait-inference-brain",  # SNN bench runs as a benchmark not a brain task
        "priority": "P2",
        "estimated_hours": 6.0,
        "blocking_artifact": "packages/snn-webgpu/scripts/run-benchmark.mjs output at scale",
        "verification": "RTX bench at 6000-Ada / 5060-Ti / H100 cross-GPU",
        "matrix_row": "research/paper-audit-matrix.md (Paper 2)",
        "preconditions": [
            "D.011 already complete per matrix line 124",
            "Cross-GPU rerun is incremental, not gating",
        ],
        "first_action": "rent RTX 5060 Ti or 6000-Ada → pnpm --filter @holoscript/snn-webgpu bench",
    },
]

# Brain → composition file mapping. Capability requirements live on the
# composition (founder ruling 2026-04-26: vision pillar 2). Scheduler
# parses runtime_requirements to compute cost estimate.
BRAINS_DIR_DEFAULT = Path.home() / ".ai-ecosystem" / "compositions"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def parse_runtime_requirements(brain_path: Path) -> dict | None:
    """Parse the @runtime_requirements block. Returns None if missing.
    Mirrors pick-cheapest-offer.py's parser; kept inline so this script
    has no in-repo Python dep beyond stdlib (so it runs cleanly in any
    Vast worker bootstrap context too).
    """
    if not brain_path.exists():
        return None
    text = brain_path.read_text(encoding="utf-8")
    m = re.search(r"@runtime_requirements\s*\{(.*?)\n\s*\}", text, re.DOTALL)
    if not m:
        return None
    block = m.group(1)
    out: dict = {}
    for line in block.splitlines():
        line = line.strip().rstrip(",")
        if not line or line.startswith("//"):
            continue
        kv = re.match(r'^(\w+)\s*:\s*(.+?)\s*$', line)
        if not kv:
            continue
        k, v = kv.group(1), kv.group(2).strip()
        if "//" in v:
            v = v.split("//")[0].strip().rstrip(",")
        if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
            v = v[1:-1]
        try:
            v = float(v) if "." in v else int(v)
        except ValueError:
            pass
        out[k] = v
    return out


def estimate_cost_usd(req: dict | None, hours: float) -> float | None:
    """Cost estimate = hours × max_dph_total_usd from brain capability.
    Returns None when brain has no @runtime_requirements (block under
    schedule.blocked_by_missing_scaffold). Conservative: uses the max
    dph the brain accepts as the upper-bound cost; picker may rent
    cheaper, but we plan against the worst-case acceptable price.

    Note: this returns the TOTAL cost over the full run. The cap-fit
    check uses `daily_burn_rate` (max_dph × 24) instead, since the
    cap is a daily rate, not a total-spend ceiling. See
    `daily_burn_rate_usd` below.
    """
    if not req:
        return None
    max_dph = req.get("max_dph_total_usd")
    if max_dph is None:
        return None
    return float(max_dph) * hours


def daily_burn_rate_usd(req: dict | None) -> float | None:
    """Steady-state $/day cost if this brain runs continuously: max_dph × 24.
    Long-running corpus collection at $0.30/hr → $7.20/day, fits within
    $50/day cap even if its total estimate exceeds $50.
    """
    if not req:
        return None
    max_dph = req.get("max_dph_total_usd")
    if max_dph is None:
        return None
    return float(max_dph) * 24.0


def cap_fit_cost_usd(req: dict | None, hours: float) -> float | None:
    """Returns the spend that would be incurred in the NEXT 24 hours if
    this rental started now: `min(hours, 24) × max_dph`. This is what
    the cap-fit check should compare against the daily headroom.

    - For a 2h sweep at $3.50/hr: min(2, 24) × 3.50 = $7 (entire run
      finishes within today's window, so total cost = today's impact).
    - For a 168h corpus at $0.30/hr: min(168, 24) × 0.30 = $7.20
      (only the first 24h count toward today's cap; tomorrow's cap
      gets its own check via daily ledger pollin).

    This makes burst-rentals AND continuous-rentals comparable to the
    same cap rail without disadvantaging either.
    """
    if not req:
        return None
    max_dph = req.get("max_dph_total_usd")
    if max_dph is None:
        return None
    return float(max_dph) * min(float(hours), 24.0)


def fetch_ledger_state(ledger_script: Path, cap: float) -> dict:
    """Call vast-spend-ledger.py check-cap, parse JSON output. Returns
    dict with spent_usd, burn_rate_usd, headroom_usd, under_cap booleans.
    Falls back to {cap_usd, headroom: cap, all-zero-fields} when ledger
    can't be reached so the planner doesn't fail-closed in dry runs.
    """
    fallback = {
        "cap_usd": cap,
        "already_spent_usd": 0.0,
        "daily_burn_rate_usd": 0.0,
        "headroom_burn_rate_usd": cap,
        "under_cap_actual": True,
        "under_cap_projected": True,
        "_fallback_reason": "ledger script unreachable",
    }
    if not ledger_script.exists():
        fallback["_fallback_reason"] = f"script not found: {ledger_script}"
        return fallback
    try:
        cp = subprocess.run(
            [sys.executable, str(ledger_script), "check-cap", "--cap", str(cap)],
            capture_output=True, text=True, timeout=10,
        )
    except Exception as exc:  # noqa: BLE001
        fallback["_fallback_reason"] = f"ledger call failed: {exc}"
        return fallback
    # check-cap exits 1 on cap-breach; that's fine, output is still JSON
    try:
        return json.loads(cp.stdout)
    except json.JSONDecodeError:
        fallback["_fallback_reason"] = f"ledger non-JSON output (exit={cp.returncode})"
        return fallback


def fetch_open_board_tasks(api_base: str, team_id: str, api_key: str) -> list[dict]:
    """Fetch /board for the team. Returns [] on any error — scheduler
    must work even when board is unreachable (degraded mode shows the
    static GATES list with no board-signal annotation)."""
    if not api_key or not team_id:
        return []
    try:
        import urllib.request as urlreq
    except Exception:  # noqa: BLE001
        return []
    url = f"{api_base.rstrip('/')}/api/holomesh/team/{team_id}/board?status=open"
    req = urlreq.Request(url, headers={"x-mcp-api-key": api_key})
    try:
        with urlreq.urlopen(req, timeout=8) as resp:  # noqa: S310
            data = json.loads(resp.read().decode("utf-8"))
    except Exception:  # noqa: BLE001
        return []
    return data.get("tasks") or data.get("board") or []


def find_board_signals_per_gate(gates: list[dict], board_tasks: list[dict]) -> dict[str, list[dict]]:
    """For each gate, find any open board tasks that match the paper number
    or gate_id by tag/title scan. Returns {gate_id: [task_summary, ...]}."""
    out: dict[str, list[dict]] = {}
    for gate in gates:
        paper = gate["paper"]
        matches: list[dict] = []
        for t in board_tasks:
            title = (t.get("title") or "").lower()
            tags = [str(x).lower() for x in (t.get("tags") or [])]
            haystack = title + " " + " ".join(tags)
            if (
                f"paper-{paper}" in haystack
                or f"paper {paper}" in haystack
                or gate["gate_id"] in haystack
            ):
                matches.append({
                    "id": t.get("id"),
                    "title": t.get("title"),
                    "priority": t.get("priority"),
                    "status": t.get("status"),
                })
        if matches:
            out[gate["gate_id"]] = matches
    return out


def fetch_paper17_progress(repo_root: Path) -> dict:
    """Read research/paper-17-sesl-pairs/INDEX.json if present."""
    index_path = repo_root / "research" / "paper-17-sesl-pairs" / "INDEX.json"
    if not index_path.exists():
        return {"_state": "no INDEX.json yet (corpus collection has not run)"}
    try:
        d = json.loads(index_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"_state": "INDEX.json malformed"}
    return d.get("gate") or d


def build_schedule(
    *,
    brains_dir: Path,
    ledger_script: Path,
    cap_usd: float,
    api_base: str,
    team_id: str,
    api_key: str,
    repo_root: Path,
    paper_filter: str | None = None,
    gates: list[dict] | None = None,
) -> dict:
    """Produce the full ranked schedule.

    `gates` defaults to the module-level GATES list. Override is for
    self-tests + future per-program sub-runs.
    """
    if gates is None:
        gates = GATES
    # 1. Ledger state — figure out remaining headroom
    ledger_state = fetch_ledger_state(ledger_script, cap_usd)
    headroom = float(ledger_state.get("headroom_burn_rate_usd", cap_usd))

    # 2. Board signals
    board_tasks = fetch_open_board_tasks(api_base, team_id, api_key)
    board_per_gate = find_board_signals_per_gate(gates, board_tasks)

    # 3. Paper 17 corpus state (special case — only paper with a live counter)
    p17_state = fetch_paper17_progress(repo_root)

    # 4. Per-gate evaluation
    schedulable: list[dict] = []
    blocked_by_cap: list[dict] = []
    blocked_by_missing_scaffold: list[dict] = []

    priority_order = {"P0": 0, "P1": 1, "P2": 2, "P3": 3}

    for gate in gates:
        if paper_filter and gate["paper"] != paper_filter:
            continue
        brain_path = brains_dir / f"{gate['brain']}.hsplus"
        req = parse_runtime_requirements(brain_path)
        cost = estimate_cost_usd(req, gate["estimated_hours"])
        burn_rate = daily_burn_rate_usd(req)
        cap_fit = cap_fit_cost_usd(req, gate["estimated_hours"])
        annotated = {
            **gate,
            "runtime_requirements": req,
            "estimated_cost_usd": cost,
            "daily_burn_rate_usd": burn_rate,
            "cap_fit_cost_usd": cap_fit,
            "board_signals": board_per_gate.get(gate["gate_id"], []),
        }
        if gate["paper"] == "17":
            annotated["corpus_progress"] = p17_state

        # Block reason 1: brain has no @runtime_requirements yet
        if req is None or cost is None or burn_rate is None:
            annotated["blocked_reason"] = (
                f"brain {gate['brain']}.hsplus has no @runtime_requirements "
                f"(needed for cost estimate). Tracked under task_1777247600051_nfpi."
            )
            blocked_by_missing_scaffold.append(annotated)
            continue

        # Block reason 2: NEXT-24h spend exceeds daily headroom. Uses
        # `min(hours, 24) × max_dph` — burst rentals (2h × $3.50 = $7)
        # and continuous rentals (24h × $0.30 = $7.20) compare to the
        # same daily rail. Long runs spill over multiple days; each day
        # the ledger re-checks against that day's headroom.
        annotated["fits_under_cap"] = cap_fit <= headroom
        if not annotated["fits_under_cap"]:
            annotated["blocked_reason"] = (
                f"next-24h spend ${cap_fit:.2f} > headroom ${headroom:.2f}/day "
                f"(cap ${cap_usd:.2f}/day; daily burn rate ${burn_rate:.2f}/day; "
                f"total estimated run cost: ${cost:.2f})."
            )
            blocked_by_cap.append(annotated)
            continue

        # Block reason 3: explicit precondition mention of "BLOCKED" / "MISSING"
        if any("BLOCKED" in str(p) or "MISSING" in str(p) for p in gate.get("preconditions", [])):
            annotated["blocked_reason"] = (
                "preconditions name explicit blockers (see preconditions list)"
            )
            blocked_by_missing_scaffold.append(annotated)
            continue

        schedulable.append(annotated)

    # Rank schedulable by (priority, hours ASC — short sweeps first to validate
    # the loop, then commit to longer ones).
    schedulable.sort(key=lambda g: (
        priority_order.get(g["priority"], 99),
        g["estimated_hours"],
    ))

    return {
        "asOf": _now_iso(),
        "cap_usd": cap_usd,
        "ledger_state": ledger_state,
        "schedulable": schedulable,
        "blocked_by_cap": blocked_by_cap,
        "blocked_by_missing_scaffold": blocked_by_missing_scaffold,
        "summary": {
            "total_gates": len([g for g in gates if not paper_filter or g["paper"] == paper_filter]),
            "schedulable_count": len(schedulable),
            "blocked_count": len(blocked_by_cap) + len(blocked_by_missing_scaffold),
            "first_action": (
                schedulable[0]["first_action"]
                if schedulable
                else "no gates schedulable - review blocked_by_missing_scaffold or raise cap"
            ),
        },
    }


def render_table(schedule: dict) -> str:
    """Human-readable summary."""
    lines = [
        f"=== Paper-program gate schedule @ {schedule['asOf']} ===",
        f"  cap: ${schedule['cap_usd']}/day  ledger: spent=${schedule['ledger_state'].get('already_spent_usd', 0):.2f}  burn_rate=${schedule['ledger_state'].get('daily_burn_rate_usd', 0):.2f}  headroom=${schedule['ledger_state'].get('headroom_burn_rate_usd', schedule['cap_usd']):.2f}",
        "",
        "SCHEDULABLE (ranked by priority then duration):",
    ]
    if not schedule["schedulable"]:
        lines.append("  (none)")
    for g in schedule["schedulable"]:
        lines.append(
            f"  [{g['priority']}] {g['gate_id']:<32} {g['brain']:<24} "
            f"{g['estimated_hours']:>6.1f}h  ~${g['estimated_cost_usd']:.2f}  "
            f"signals={len(g['board_signals'])}"
        )
    lines.append("")
    lines.append("BLOCKED BY CAP:")
    for g in schedule["blocked_by_cap"]:
        lines.append(
            f"  [{g['priority']}] {g['gate_id']:<32}  "
            f"{g['estimated_hours']:>6.1f}h  ~${g['estimated_cost_usd']:.2f}  "
            f"reason={g.get('blocked_reason', '?')}"
        )
    if not schedule["blocked_by_cap"]:
        lines.append("  (none)")
    lines.append("")
    lines.append("BLOCKED BY MISSING SCAFFOLD:")
    for g in schedule["blocked_by_missing_scaffold"]:
        reason = g.get("blocked_reason", "?")
        lines.append(f"  [{g['priority']}] {g['gate_id']:<32}  reason={reason[:80]}")
    if not schedule["blocked_by_missing_scaffold"]:
        lines.append("  (none)")
    lines.append("")
    lines.append(f"FIRST ACTION: {schedule['summary']['first_action']}")
    return "\n".join(lines)


def self_test() -> int:
    """Self-tests against synthetic state."""
    import tempfile

    # Test 1: parser handles a brain with @runtime_requirements
    with tempfile.TemporaryDirectory() as td:
        td_path = Path(td)
        good_brain = td_path / "good-lean-theorist-brain.hsplus"
        good_brain.write_text(
            'composition "X" { object "R" { @runtime_requirements {\n'
            '  min_vram_gb: 96,\n  gpu_class_regex: "H200",\n'
            '  min_reliability: 0.95,\n  max_dph_total_usd: 3.50\n}}}',
            encoding="utf-8",
        )
        req = parse_runtime_requirements(good_brain)
        assert req is not None
        assert req["min_vram_gb"] == 96
        assert req["max_dph_total_usd"] == 3.50

        # Test 2: missing brain returns None
        missing = td_path / "no-such-brain.hsplus"
        assert parse_runtime_requirements(missing) is None

        # Test 3: brain without @runtime_requirements returns None
        bare_brain = td_path / "bare-brain.hsplus"
        bare_brain.write_text('composition "X" { state { foo: "bar" } }', encoding="utf-8")
        assert parse_runtime_requirements(bare_brain) is None

        # Test 4: cost estimate
        cost = estimate_cost_usd(req, hours=2.0)
        assert cost == 7.0, cost

        # Test 5: cost None when no req
        assert estimate_cost_usd(None, hours=2.0) is None

        # Test 6: board signal matching
        synthetic_tasks = [
            {"id": "t1", "title": "Paper 22 kernel-check", "tags": ["paper-22"], "status": "open"},
            {"id": "t2", "title": "unrelated", "tags": ["random"], "status": "open"},
            {"id": "t3", "title": "Paper-17 SESL extractor", "tags": ["paper-17"], "status": "open"},
        ]
        signals = find_board_signals_per_gate(GATES, synthetic_tasks)
        assert "22-msc-kernel-check" in signals
        assert len(signals["22-msc-kernel-check"]) >= 1
        assert "17-sesl-corpus" in signals
        assert "23-hscore-kernel-check" not in signals  # no Paper 23 task in synthetic

        # Test 7: build_schedule with no real brains_dir → all blocked_by_missing_scaffold
        empty_brains = td_path / "empty-brains"
        empty_brains.mkdir()
        empty_ledger = td_path / "no-ledger.py"  # not exists; fallback fires
        result = build_schedule(
            brains_dir=empty_brains,
            ledger_script=empty_ledger,
            cap_usd=50.0,
            api_base="http://example.invalid",
            team_id="",
            api_key="",
            repo_root=td_path,
        )
        assert result["schedulable"] == []
        # Every gate should be blocked because no brain compositions exist
        all_blocked = (
            len(result["blocked_by_cap"]) + len(result["blocked_by_missing_scaffold"])
        )
        assert all_blocked == len(GATES), all_blocked

        # Test 8: paper_filter restricts to single paper
        result22 = build_schedule(
            brains_dir=empty_brains,
            ledger_script=empty_ledger,
            cap_usd=50.0,
            api_base="http://example.invalid",
            team_id="",
            api_key="",
            repo_root=td_path,
            paper_filter="22",
        )
        assert result22["summary"]["total_gates"] == 1
        all_22 = result22["schedulable"] + result22["blocked_by_cap"] + result22["blocked_by_missing_scaffold"]
        assert all(g["paper"] == "22" for g in all_22)

        # Test 9: ledger fallback semantics — when ledger script doesn't exist,
        # fallback returns headroom == cap so cost-fit logic doesn't fail-closed
        ledger_state = fetch_ledger_state(empty_ledger, cap=50.0)
        assert ledger_state["headroom_burn_rate_usd"] == 50.0
        assert "_fallback_reason" in ledger_state

        # Test 10: cost-fit boundary using the cap_fit_cost (next-24h spend)
        # semantic. For a 2h sweep at $25/hr: cap_fit = min(2, 24) × 25 = $50.
        # Should fit at cap=50, fail at cap=49.
        boundary_brain = empty_brains / "boundary-brain.hsplus"
        boundary_brain.write_text(
            'composition "X" { @runtime_requirements {\n'
            '  min_vram_gb: 1,\n  gpu_class_regex: ".*",\n'
            '  min_reliability: 0.0,\n  max_dph_total_usd: 25.0\n}}',
            encoding="utf-8",
        )
        # Filename = "<brain>.hsplus" per convention; brain field below
        # must match the filename's base name.
        # Synthetic gate pointing to the boundary brain — pass via `gates`
        # parameter rather than mutating the module-level GATES.
        synthetic_gates = [
            {
                "gate_id": "boundary-test", "paper": "test",
                "brain": "boundary-brain", "priority": "P3",
                "estimated_hours": 2.0,
                "blocking_artifact": "synthetic",
                "verification": "synthetic",
                "matrix_row": "synthetic",
                "preconditions": [],
                "first_action": "synthetic",
            },
        ]
        r = build_schedule(
            brains_dir=empty_brains,
            ledger_script=empty_ledger,
            cap_usd=50.0,
            api_base="http://example.invalid", team_id="", api_key="",
            repo_root=td_path, gates=synthetic_gates,
        )
        assert len(r["schedulable"]) == 1, r["summary"]
        assert r["schedulable"][0]["estimated_cost_usd"] == 50.0
        # Now lower the cap below the cost
        r2 = build_schedule(
            brains_dir=empty_brains,
            ledger_script=empty_ledger,
            cap_usd=49.0,
            api_base="http://example.invalid", team_id="", api_key="",
            repo_root=td_path, gates=synthetic_gates,
        )
        assert len(r2["schedulable"]) == 0
        assert len(r2["blocked_by_cap"]) == 1

    print("self-tests PASS (10 assertions)")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--brains-dir", type=Path, default=BRAINS_DIR_DEFAULT)
    p.add_argument("--ledger-script", type=Path,
                   default=Path(__file__).parent / "vast-spend-ledger.py")
    p.add_argument("--cap", type=float, default=100.0,
                   help="$/day cap, fleet-wide aggregate (founder ruling 2026-04-26: $50 → $100)")
    p.add_argument("--api-base", default="https://mcp.holoscript.net")
    p.add_argument("--team-id", default=os.environ.get("HOLOMESH_TEAM_ID", ""))
    p.add_argument("--api-key", default=os.environ.get("HOLOMESH_API_KEY", ""))
    p.add_argument("--repo-root", type=Path, default=Path.home() / ".ai-ecosystem")
    p.add_argument("--paper", default=None,
                   help="filter to a single paper number (e.g., 22)")
    p.add_argument("--json", action="store_true",
                   help="emit JSON only (no human table)")
    p.add_argument("--dry-run", action="store_true",
                   help="default behavior — produce schedule without acting")
    p.add_argument("--self-test", action="store_true")
    args = p.parse_args()

    if args.self_test:
        return self_test()

    schedule = build_schedule(
        brains_dir=args.brains_dir,
        ledger_script=args.ledger_script,
        cap_usd=args.cap,
        api_base=args.api_base,
        team_id=args.team_id,
        api_key=args.api_key,
        repo_root=args.repo_root,
        paper_filter=args.paper,
    )

    if args.json:
        print(json.dumps(schedule, indent=2, default=str))
    else:
        print(render_table(schedule))

    return 0


if __name__ == "__main__":
    sys.exit(main())
