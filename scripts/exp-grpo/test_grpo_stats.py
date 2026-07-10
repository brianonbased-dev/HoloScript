#!/usr/bin/env python3
"""
test_grpo_stats.py — CPU unit tests for grpo_stats (no GPU / no third-party deps).

Runs two ways:
  pytest scripts/exp-grpo/test_grpo_stats.py
  python3 scripts/exp-grpo/test_grpo_stats.py     # standalone runner (no pytest)

Fixtures use known-answer cases where the correct statistical conclusion is
unambiguous, so a regression in the stats code is caught deterministically.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import grpo_stats as gs  # noqa: E402


def test_mean_and_stddev():
    assert gs.mean([]) == 0.0
    assert gs.mean([2.0, 4.0]) == 3.0
    assert gs.stddev([5.0]) == 0.0            # n<2 → 0
    assert abs(gs.stddev([2.0, 4.0, 6.0]) - 2.0) < 1e-9


def test_paired_deltas_alignment():
    assert gs.paired_deltas([1.0, 2.0], [1.5, 2.5]) == [0.5, 0.5]
    try:
        gs.paired_deltas([1.0], [1.0, 2.0])
    except ValueError:
        pass
    else:
        raise AssertionError("expected ValueError on length mismatch")


def test_bootstrap_ci_degenerate():
    assert gs.bootstrap_ci([]) == (0.0, 0.0)
    assert gs.bootstrap_ci([0.7]) == (0.7, 0.7)
    lo, hi = gs.bootstrap_ci([0.3, 0.3, 0.3, 0.3])   # zero spread
    assert abs(lo - 0.3) < 1e-9 and abs(hi - 0.3) < 1e-9


def test_bootstrap_ci_all_positive_excludes_zero():
    # Every prompt improved → the CI for the mean delta must sit strictly above 0.
    deltas = [0.10, 0.12, 0.08, 0.15, 0.09, 0.11, 0.13, 0.10, 0.14, 0.12]
    lo, hi = gs.bootstrap_ci(deltas, seed=42, n_resamples=5000)
    assert lo > 0.0, f"expected CI lower bound > 0, got {lo}"
    assert hi >= lo


def test_bootstrap_ci_is_seed_deterministic():
    deltas = [0.1, -0.2, 0.3, 0.05, -0.1, 0.2, 0.0, 0.15]
    a = gs.bootstrap_ci(deltas, seed=7, n_resamples=3000)
    b = gs.bootstrap_ci(deltas, seed=7, n_resamples=3000)
    assert a == b, "same seed must give identical CI"


def test_bootstrap_ci_zero_mean_noise_straddles_zero():
    # Symmetric noise around 0 → CI should include 0 (no false signal).
    deltas = [0.2, -0.2, 0.1, -0.1, 0.15, -0.15, 0.05, -0.05, 0.0, 0.0]
    lo, hi = gs.bootstrap_ci(deltas, seed=42, n_resamples=5000)
    assert lo < 0.0 < hi, f"expected CI to straddle 0, got [{lo}, {hi}]"


def test_wilcoxon_no_difference_is_p1():
    assert gs.wilcoxon_signed_rank_p([0.5, 0.5, 0.5], [0.5, 0.5, 0.5]) == 1.0


def test_wilcoxon_strong_effect_is_small_p():
    base = [0.30] * 20
    adapter = [0.55] * 20
    p = gs.wilcoxon_signed_rank_p(base, adapter)
    assert p < 0.05, f"consistent improvement should be significant, got p={p}"


def test_verdict_prove_on_clear_improvement():
    base = [0.30, 0.32, 0.28, 0.31, 0.29, 0.30, 0.33, 0.27, 0.30, 0.31]
    adapter = [0.45, 0.47, 0.44, 0.46, 0.43, 0.45, 0.48, 0.42, 0.46, 0.47]
    v = gs.paired_verdict(base, adapter, min_delta=0.05, abs_threshold=0.35,
                          kill_threshold=0.20, n_resamples=5000)
    assert v["verdict"] == "PROVE", v
    assert v["deltaCI95"][0] > 0.05
    assert v["baselineSource"] == "measured"


def test_verdict_kill_on_regression():
    base = [0.40] * 12
    adapter = [0.25] * 12   # significantly worse, and below abs threshold
    v = gs.paired_verdict(base, adapter, min_delta=0.05, abs_threshold=0.35,
                          kill_threshold=0.20, n_resamples=5000)
    assert v["verdict"] == "KILL", v


def test_verdict_inconclusive_on_noise():
    base = [0.40, 0.42, 0.38, 0.41, 0.39, 0.40, 0.43, 0.37, 0.40, 0.41]
    adapter = [0.41, 0.40, 0.42, 0.39, 0.43, 0.38, 0.41, 0.42, 0.39, 0.40]
    v = gs.paired_verdict(base, adapter, min_delta=0.05, abs_threshold=0.35,
                          kill_threshold=0.20, n_resamples=5000)
    assert v["verdict"] == "INCONCLUSIVE", v


def test_verdict_kill_when_below_kill_threshold_even_if_improved():
    # Adapter improved over base but is still absolutely terrible → KILL.
    base = [0.05] * 10
    adapter = [0.15] * 10
    v = gs.paired_verdict(base, adapter, min_delta=0.05, abs_threshold=0.35,
                          kill_threshold=0.20, n_resamples=3000)
    assert v["verdict"] == "KILL", v


def _run_standalone() -> int:
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"  PASS  {t.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"  FAIL  {t.__name__}: {e}")
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"  ERROR {t.__name__}: {type(e).__name__}: {e}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(_run_standalone())
