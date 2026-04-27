#!/usr/bin/env python3
"""pick-cheapest-offer.py — price-aware Vast.ai offer picker.

Wraps `vastai search offers --raw` with capability-fit filtering + price
ranking. Inputs come from a brain composition's `@runtime_requirements`
block (founder ruling 2026-04-26: requirements live on brain, not agent).

Usage:
    # Pick top-5 H200 offers fitting lean-theorist (96GB VRAM, $≤3.50/hr)
    python pick-cheapest-offer.py \\
        --requirements lean-theorist-brain.hsplus \\
        --top 5

    # Self-test against captured snapshot — no live vastai call
    python pick-cheapest-offer.py --self-test

    # Dry-run: show what filter+rank would do without invoking vastai
    python pick-cheapest-offer.py \\
        --min-vram 96 --gpu-class 'H200|H100.*NVL' --max-dph 3.50 \\
        --offers-file <captured.json> --top 5

Output (JSON to stdout):
    {
      "ok": true,
      "candidates": [
        {"id": 30848004, "gpu_name": "A100_SXM4_80GB", "dph_total": 1.20,
         "gpu_ram": 81920, "reliability2": 0.987, "dlperf_per_dphtotal": 18.4},
        ...
      ],
      "rejected_count": N,
      "min_dph": 1.20, "max_dph": 3.50
    }

Exit codes:
    0 — at least one candidate found
    1 — no offers match the filter (caller should escalate / widen filter)
    2 — error (vastai unavailable, malformed input, etc.)

Per Architecture-beats-alignment (W.GOLD.001): the cap must be a
structural rail. This picker rejects offers above max_dph by construction
so the caller cannot accidentally rent a price-spiked instance.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path


# Default snapshot for self-test — synthesized from typical vastai search
# offers output shape (see https://docs.vast.ai/cli/search-offers).
_SELF_TEST_OFFERS = [
    # H200 — fits lean-theorist; expensive but capable
    {"id": 1001, "gpu_name": "H200", "num_gpus": 1, "gpu_ram": 143360,
     "dph_total": 3.20, "reliability2": 0.991, "dlperf_per_dphtotal": 24.5,
     "disk_space": 200, "cpu_cores": 24, "cpu_ram": 131072},
    # H100 NVL — fits, slightly cheaper
    {"id": 1002, "gpu_name": "H100_NVL", "num_gpus": 1, "gpu_ram": 95488,
     "dph_total": 2.40, "reliability2": 0.985, "dlperf_per_dphtotal": 22.1,
     "disk_space": 150, "cpu_cores": 16, "cpu_ram": 65536},
    # A100 SXM4 80GB — too small VRAM (80GB < 96GB) — should reject
    {"id": 1003, "gpu_name": "A100_SXM4_80GB", "num_gpus": 1, "gpu_ram": 81920,
     "dph_total": 1.20, "reliability2": 0.987, "dlperf_per_dphtotal": 18.4,
     "disk_space": 634, "cpu_cores": 24, "cpu_ram": 131072},
    # H200 cheapest — should rank #1
    {"id": 1004, "gpu_name": "H200", "num_gpus": 1, "gpu_ram": 143360,
     "dph_total": 2.85, "reliability2": 0.96, "dlperf_per_dphtotal": 28.2,
     "disk_space": 200, "cpu_cores": 32, "cpu_ram": 131072},
    # H200 priced ABOVE the 3.50 cap — should reject
    {"id": 1005, "gpu_name": "H200", "num_gpus": 1, "gpu_ram": 143360,
     "dph_total": 4.10, "reliability2": 0.992, "dlperf_per_dphtotal": 26.0,
     "disk_space": 200, "cpu_cores": 24, "cpu_ram": 131072},
    # RTX 5090 — wrong gpu_class — should reject
    {"id": 1006, "gpu_name": "RTX5090", "num_gpus": 1, "gpu_ram": 32768,
     "dph_total": 0.50, "reliability2": 0.99, "dlperf_per_dphtotal": 32.0,
     "disk_space": 100, "cpu_cores": 16, "cpu_ram": 65536},
    # H100 NVL — low reliability — should reject
    {"id": 1007, "gpu_name": "H100_NVL", "num_gpus": 1, "gpu_ram": 95488,
     "dph_total": 2.10, "reliability2": 0.85, "dlperf_per_dphtotal": 21.8,
     "disk_space": 150, "cpu_cores": 16, "cpu_ram": 65536},
]


def parse_runtime_requirements(brain_path: Path) -> dict:
    """Parse the @runtime_requirements block from a .hsplus brain composition.

    The .hsplus format is JS-ish; we look for `@runtime_requirements` and
    extract field=value pairs from the following object literal. Per F.014:
    do NOT use this for general .hsplus parsing — use @holoscript/core. This
    is a narrow, single-block extractor for the picker's deployment-time
    needs only.
    """
    text = brain_path.read_text(encoding="utf-8")
    # Find the @runtime_requirements block
    m = re.search(r"@runtime_requirements\s*\{(.*?)\n\s*\}", text, re.DOTALL)
    if not m:
        raise ValueError(
            f"brain {brain_path.name} has no @runtime_requirements block — "
            f"add one per the lean-theorist-brain.hsplus example"
        )
    block = m.group(1)
    out: dict = {}
    # Match `key: value` lines (value can be number, "string", or 'string')
    for line in block.splitlines():
        line = line.strip().rstrip(",")
        if not line or line.startswith("//"):
            continue
        kv = re.match(r'^(\w+)\s*:\s*(.+?)\s*$', line)
        if not kv:
            continue
        k, v = kv.group(1), kv.group(2).strip()
        # Strip trailing comments
        if "//" in v:
            v = v.split("//")[0].strip().rstrip(",")
        # Strip quotes
        if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
            v = v[1:-1]
        # Coerce number if possible
        try:
            v = float(v) if "." in v else int(v)
        except ValueError:
            pass
        out[k] = v
    return out


def filter_offers(
    offers: list[dict],
    *,
    min_vram_gb: int,
    gpu_class_regex: str,
    min_reliability: float,
    max_dph_total: float,
    headroom_gb: int = 0,
) -> tuple[list[dict], list[dict]]:
    """Filter offers by capability fit. Returns (kept, rejected)."""
    rx = re.compile(gpu_class_regex)
    required_vram_mib = (min_vram_gb + headroom_gb) * 1024
    kept: list[dict] = []
    rejected: list[dict] = []
    for o in offers:
        # Skip offers that don't meet ANY required field
        reasons: list[str] = []
        gpu_name = str(o.get("gpu_name") or "")
        if not rx.search(gpu_name):
            reasons.append(f"gpu_class miss: {gpu_name!r}")
        gpu_ram_mib = int(o.get("gpu_ram") or 0)
        if gpu_ram_mib < required_vram_mib:
            reasons.append(f"vram {gpu_ram_mib} MiB < required {required_vram_mib} MiB")
        rel = float(o.get("reliability2") or 0)
        if rel < min_reliability:
            reasons.append(f"reliability {rel:.3f} < {min_reliability}")
        dph = float(o.get("dph_total") or 0)
        if dph <= 0 or dph > max_dph_total:
            reasons.append(f"dph_total {dph:.2f} > cap {max_dph_total}")
        if reasons:
            rejected.append({**o, "_reject_reasons": reasons})
        else:
            kept.append(o)
    return kept, rejected


def rank_offers(offers: list[dict]) -> list[dict]:
    """Sort by (dph_total ASC, dlperf_per_dphtotal DESC). Cheaper first;
    among same-priced offers, better perf/dollar wins."""
    return sorted(
        offers,
        key=lambda o: (
            float(o.get("dph_total") or 0),
            -float(o.get("dlperf_per_dphtotal") or 0),
        ),
    )


def query_live_offers(filter_query: str = "") -> list[dict]:
    """Call `vastai search offers --raw` and parse JSON. Caller MUST handle
    subprocess errors — we surface the exit code as ValueError."""
    cmd = ["vastai", "search", "offers", "--raw"]
    if filter_query:
        cmd.append(filter_query)
    try:
        cp = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    except FileNotFoundError as exc:
        raise ValueError(f"vastai CLI not on PATH: {exc}") from exc
    except subprocess.TimeoutExpired as exc:
        raise ValueError(f"vastai search offers timed out: {exc}") from exc
    if cp.returncode != 0:
        raise ValueError(f"vastai exit={cp.returncode}: {cp.stderr[:300]}")
    try:
        return json.loads(cp.stdout)
    except json.JSONDecodeError as exc:
        raise ValueError(f"vastai returned non-JSON: {exc}") from exc


def self_test() -> None:
    """Self-tests for parser + filter + rank."""
    # Parser test
    test_brain = Path(__file__).parent / "_test_brain.hsplus"
    test_brain.write_text(
        """
composition "Test" {
  object "RuntimeRequirements" {
    @runtime_requirements {
      min_vram_gb: 96,
      gpu_class_regex: "H200|H100.*NVL|A100.*SXM",
      min_reliability: 0.95,
      max_dph_total_usd: 3.50,
      headroom_gb: 8,
      reasoning: "test"
    }
  }
}
""",
        encoding="utf-8",
    )
    try:
        req = parse_runtime_requirements(test_brain)
        assert req["min_vram_gb"] == 96, req
        assert req["gpu_class_regex"] == "H200|H100.*NVL|A100.*SXM", req
        assert req["min_reliability"] == 0.95, req
        assert req["max_dph_total_usd"] == 3.50, req
        assert req["headroom_gb"] == 8, req
        assert req["reasoning"] == "test", req
    finally:
        test_brain.unlink(missing_ok=True)

    # Filter test against the snapshot
    kept, rejected = filter_offers(
        _SELF_TEST_OFFERS,
        min_vram_gb=96,
        gpu_class_regex="H200|H100.*NVL|A100.*SXM",
        min_reliability=0.95,
        max_dph_total=3.50,
        headroom_gb=0,
    )
    kept_ids = sorted(o["id"] for o in kept)
    # Expected: H200 1001 (3.20, fits), H100_NVL 1002 (2.40, 95488 MiB just shy of 96GB)
    # Wait: 96GB = 98304 MiB. H100_NVL gpu_ram=95488 < 98304 → REJECTED
    # H200 1004 (2.85, fits), H200 1001 (3.20, fits)
    # Expected kept: 1001, 1004 only
    assert kept_ids == [1001, 1004], f"kept_ids={kept_ids} (expected [1001, 1004])"
    rejected_ids = sorted(o["id"] for o in rejected)
    assert rejected_ids == [1002, 1003, 1005, 1006, 1007], rejected_ids

    # Rank test: 1004 ($2.85) before 1001 ($3.20)
    ranked = rank_offers(kept)
    assert [o["id"] for o in ranked] == [1004, 1001], [o["id"] for o in ranked]

    # Edge case: no offers fit
    kept2, _ = filter_offers(
        _SELF_TEST_OFFERS,
        min_vram_gb=200,  # impossibly large
        gpu_class_regex="H200",
        min_reliability=0.95,
        max_dph_total=10.0,
    )
    assert kept2 == [], kept2

    # Edge case: tighter dph cap rejects everything but cheapest
    kept3, _ = filter_offers(
        _SELF_TEST_OFFERS,
        min_vram_gb=96,
        gpu_class_regex="H200|H100.*NVL|A100.*SXM",
        min_reliability=0.95,
        max_dph_total=3.00,  # only 1004 ($2.85) fits
    )
    assert sorted(o["id"] for o in kept3) == [1004], sorted(o["id"] for o in kept3)

    print("self-tests PASS (5 assertions)")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--requirements", type=Path,
                   help="path to a .hsplus brain composition with @runtime_requirements")
    p.add_argument("--min-vram", type=int, help="override: min VRAM in GB")
    p.add_argument("--gpu-class", help="override: regex against gpu_name")
    p.add_argument("--min-reliability", type=float, help="override: 0.0-1.0")
    p.add_argument("--max-dph", type=float, help="override: max $/hr")
    p.add_argument("--headroom-gb", type=int, default=0, help="extra VRAM buffer")
    p.add_argument("--offers-file", type=Path,
                   help="JSON file of vastai search offers output (skips live call)")
    p.add_argument("--top", type=int, default=5, help="how many candidates to return")
    p.add_argument("--self-test", action="store_true", help="run self-tests and exit")
    args = p.parse_args()

    if args.self_test:
        self_test()
        return 0

    # Resolve requirements: CLI overrides win over brain composition
    req: dict = {}
    if args.requirements:
        req = parse_runtime_requirements(args.requirements)
    if args.min_vram is not None:
        req["min_vram_gb"] = args.min_vram
    if args.gpu_class:
        req["gpu_class_regex"] = args.gpu_class
    if args.min_reliability is not None:
        req["min_reliability"] = args.min_reliability
    if args.max_dph is not None:
        req["max_dph_total_usd"] = args.max_dph
    if args.headroom_gb:
        req["headroom_gb"] = args.headroom_gb

    needed = ["min_vram_gb", "gpu_class_regex", "min_reliability", "max_dph_total_usd"]
    missing = [k for k in needed if k not in req]
    if missing:
        print(f"ERROR: missing required fields: {missing}", file=sys.stderr)
        print("  provide via --requirements <brain.hsplus> or CLI overrides", file=sys.stderr)
        return 2

    # Source offers
    if args.offers_file:
        offers = json.loads(args.offers_file.read_text(encoding="utf-8"))
    else:
        try:
            offers = query_live_offers()
        except ValueError as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
            return 2

    kept, rejected = filter_offers(
        offers,
        min_vram_gb=int(req["min_vram_gb"]),
        gpu_class_regex=str(req["gpu_class_regex"]),
        min_reliability=float(req["min_reliability"]),
        max_dph_total=float(req["max_dph_total_usd"]),
        headroom_gb=int(req.get("headroom_gb", 0)),
    )
    ranked = rank_offers(kept)[: args.top]

    result = {
        "ok": len(ranked) > 0,
        "requirements": req,
        "candidates": ranked,
        "kept_count": len(kept),
        "rejected_count": len(rejected),
        "total_offers": len(offers),
    }
    if ranked:
        result["min_dph"] = float(ranked[0]["dph_total"])
        result["max_dph"] = float(ranked[-1]["dph_total"])
    print(json.dumps(result, indent=2))
    return 0 if ranked else 1


if __name__ == "__main__":
    sys.exit(main())
