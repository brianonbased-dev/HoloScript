#!/usr/bin/env python3
"""
grpo_stats.py — Pure-stdlib statistics for paired GRPO evaluation.

Tried-and-true experimental-design methods (all ≥40 years old), implemented with
zero third-party dependencies so they run and unit-test on CPU without the GPU
fleet (no numpy / scipy / torch):

  - paired_deltas        per-prompt treatment−control differences (paired design)
  - mean / stddev        first moments
  - bootstrap_ci         Efron's percentile bootstrap CI on the mean paired delta
  - wilcoxon_signed_rank_p  two-sided signed-rank test (normal approx)
  - paired_verdict       CI-based PROVE / KILL / INCONCLUSIVE decision

Design intent: the base model (control) and adapter (treatment) are evaluated on
the SAME held-out prompts with the SAME decode settings, so the per-prompt
difference isolates the adapter's effect. A verdict then requires the *interval*
around the mean delta — not a single point estimate compared to a guessed
baseline — to clear the margin.

Seeded everywhere for reproducibility (F.062 zero-hardcoded-stats).
"""

from __future__ import annotations

import math
import random
from typing import List, Sequence, Tuple


def mean(xs: Sequence[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0


def stddev(xs: Sequence[float]) -> float:
    """Sample standard deviation (Bessel-corrected, n-1)."""
    n = len(xs)
    if n < 2:
        return 0.0
    m = mean(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / (n - 1))


def paired_deltas(base: Sequence[float], adapter: Sequence[float]) -> List[float]:
    """Per-prompt (adapter − base). Requires equal-length, prompt-aligned arrays."""
    if len(base) != len(adapter):
        raise ValueError(
            f"paired arrays must align by prompt: len(base)={len(base)} "
            f"!= len(adapter)={len(adapter)}"
        )
    return [a - b for b, a in zip(base, adapter)]


def bootstrap_ci(
    deltas: Sequence[float],
    seed: int = 42,
    n_resamples: int = 10_000,
    alpha: float = 0.05,
) -> Tuple[float, float]:
    """
    Percentile-bootstrap (Efron, 1979) confidence interval on the mean of `deltas`.

    Resamples prompt indices with replacement `n_resamples` times, recomputes the
    mean each time, and returns the (alpha/2, 1-alpha/2) percentiles. Seeded, so
    two runs on the same input return the same interval.

    Degenerate cases:
      - empty deltas          → (0.0, 0.0)
      - single observation    → (x, x)  (no spread is estimable)
      - all-identical deltas  → (v, v)
    """
    n = len(deltas)
    if n == 0:
        return (0.0, 0.0)
    if n == 1:
        return (float(deltas[0]), float(deltas[0]))

    rng = random.Random(seed)
    boot_means: List[float] = []
    for _ in range(n_resamples):
        s = 0.0
        for _ in range(n):
            s += deltas[rng.randrange(n)]
        boot_means.append(s / n)

    boot_means.sort()
    lo = _percentile(boot_means, alpha / 2.0)
    hi = _percentile(boot_means, 1.0 - alpha / 2.0)
    return (lo, hi)


def _percentile(sorted_xs: Sequence[float], q: float) -> float:
    """Linear-interpolation percentile of an already-sorted sequence. q in [0,1]."""
    if not sorted_xs:
        return 0.0
    if len(sorted_xs) == 1:
        return float(sorted_xs[0])
    pos = q * (len(sorted_xs) - 1)
    lo_i = int(math.floor(pos))
    hi_i = int(math.ceil(pos))
    if lo_i == hi_i:
        return float(sorted_xs[lo_i])
    frac = pos - lo_i
    return float(sorted_xs[lo_i] * (1.0 - frac) + sorted_xs[hi_i] * frac)


def wilcoxon_signed_rank_p(base: Sequence[float], adapter: Sequence[float]) -> float:
    """
    Two-sided Wilcoxon signed-rank p-value (normal approximation with tie
    correction). Non-parametric paired test — a distribution-free complement to
    the bootstrap CI. Returns 1.0 when no non-zero differences exist.

    Not exact for tiny n (the normal approximation is rough below ~10 pairs);
    treat it as corroborating evidence for the CI, not the primary gate.
    """
    diffs = [a - b for b, a in zip(base, adapter)]
    nonzero = [d for d in diffs if d != 0.0]
    n = len(nonzero)
    if n == 0:
        return 1.0

    # Rank absolute differences, averaging ranks within ties.
    order = sorted(range(n), key=lambda i: abs(nonzero[i]))
    ranks = [0.0] * n
    i = 0
    while i < n:
        j = i
        while j + 1 < n and abs(nonzero[order[j + 1]]) == abs(nonzero[order[i]]):
            j += 1
        avg_rank = (i + 1 + j + 1) / 2.0  # 1-indexed average rank across the tie block
        for k in range(i, j + 1):
            ranks[order[k]] = avg_rank
        i = j + 1

    w_plus = sum(r for r, d in zip(ranks, nonzero) if d > 0)
    mean_w = n * (n + 1) / 4.0
    # Tie-corrected variance.
    tie_term = 0.0
    from collections import Counter

    for _, c in Counter(abs(d) for d in nonzero).items():
        tie_term += c ** 3 - c
    var_w = (n * (n + 1) * (2 * n + 1) - tie_term / 2.0) / 24.0
    if var_w <= 0:
        return 1.0

    z = (w_plus - mean_w) / math.sqrt(var_w)
    # Two-sided p from the standard normal survival function.
    p = 2.0 * (1.0 - _normal_cdf(abs(z)))
    return max(0.0, min(1.0, p))


def _normal_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def paired_verdict(
    base: Sequence[float],
    adapter: Sequence[float],
    min_delta: float,
    abs_threshold: float,
    kill_threshold: float,
    seed: int = 42,
    n_resamples: int = 10_000,
    alpha: float = 0.05,
) -> dict:
    """
    CI-based PROVE / KILL / INCONCLUSIVE decision from paired per-prompt scores.

    Rules (first match wins):
      KILL          adapter significantly WORSE (CI upper bound < 0)
                    OR adapter absolute quality < kill_threshold
      PROVE         CI lower bound of (adapter−base) > min_delta
                    AND adapter absolute quality >= abs_threshold
      INCONCLUSIVE  everything else (the interval straddles the margin —
                    the honest "within noise" band)
    """
    n = len(adapter)
    deltas = paired_deltas(base, adapter)
    adapter_q = mean(adapter)
    base_q = mean(base)
    delta_mean = mean(deltas)
    ci_lo, ci_hi = bootstrap_ci(deltas, seed=seed, n_resamples=n_resamples, alpha=alpha)
    p_value = wilcoxon_signed_rank_p(base, adapter)

    if ci_hi < 0.0 or adapter_q < kill_threshold:
        verdict = "KILL"
        if ci_hi < 0.0:
            reason = (
                f"adapter significantly WORSE: 95% CI of delta "
                f"[{ci_lo:.4f}, {ci_hi:.4f}] entirely below 0"
            )
        else:
            reason = f"adapter quality {adapter_q:.4f} < kill_threshold {kill_threshold}"
    elif ci_lo > min_delta and adapter_q >= abs_threshold:
        verdict = "PROVE"
        reason = (
            f"CI lower bound {ci_lo:.4f} > min_delta {min_delta} "
            f"AND quality {adapter_q:.4f} >= abs_threshold {abs_threshold} "
            f"(delta mean {delta_mean:.4f}, base {base_q:.4f})"
        )
    else:
        verdict = "INCONCLUSIVE"
        reason = (
            f"delta 95% CI [{ci_lo:.4f}, {ci_hi:.4f}] straddles margin "
            f"(need CI_lo > {min_delta}); quality {adapter_q:.4f} "
            f"(need >= {abs_threshold})"
        )

    return {
        "verdict": verdict,
        "reason": reason,
        "baselineSource": "measured",
        "adapterQuality": round(adapter_q, 4),
        "baselineQuality": round(base_q, 4),
        "deltaMean": round(delta_mean, 4),
        "deltaCI95": [round(ci_lo, 4), round(ci_hi, 4)],
        "wilcoxonP": round(p_value, 4),
        "nPairs": n,
        "bootstrapSeed": seed,
        "bootstrapResamples": n_resamples,
    }
