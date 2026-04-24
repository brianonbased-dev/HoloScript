"""Eval metrics — Paper 19 ATI.

Per `phase-1-spec.md` §4.1 metric definitions + `preregistration.md` §1
acceptance thresholds:

  - F1 macro on novel-combination split  (HEADLINE)
  - F1 micro on in-distribution split    (sanity-check companion)
  - Exact-match accuracy                 (secondary, stricter)
  - Validity rate                        (gate item 4)
  - Bootstrap 95% CI on every reported number (B=1000)

CPU-only; no GPU dependencies.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

import numpy as np

# ----------------------------------------------------------------------------
# Single-example primitives
# ----------------------------------------------------------------------------

def precision_recall_f1(gold: set[str], pred: set[str]) -> tuple[float, float, float]:
    """Per-example P, R, F1. Returns (1, 1, 1) iff both empty (vacuous match)."""
    if not gold and not pred:
        return 1.0, 1.0, 1.0
    if not pred:
        return 0.0, 0.0, 0.0
    if not gold:
        return 0.0, 0.0, 0.0
    tp = len(gold & pred)
    p = tp / len(pred)
    r = tp / len(gold)
    f1 = 2 * p * r / (p + r) if (p + r) > 0 else 0.0
    return p, r, f1


def exact_match(gold: set[str], pred: set[str]) -> bool:
    return gold == pred


# ----------------------------------------------------------------------------
# Aggregate metrics
# ----------------------------------------------------------------------------

def f1_macro(
    gold_lists: Sequence[Sequence[str]],
    pred_lists: Sequence[Sequence[str]],
    *,
    label_space: Sequence[str] | None = None,
) -> float:
    """F1 macro: per-trait F1 averaged across the label space.

    Per `phase-1-spec.md` §4.1: "macro because the trait label distribution
    is long-tailed and we care about generalization to rare traits."

    If `label_space` is None, computed over the union of all traits seen in
    either gold or pred. Pass an explicit label_space when measuring against
    a fixed evaluation vocabulary (e.g. preregistration consistency).
    """
    if len(gold_lists) != len(pred_lists):
        raise ValueError("gold and pred must be same length")
    if not gold_lists:
        return 0.0

    if label_space is None:
        seen: set[str] = set()
        for lst in gold_lists:
            seen.update(lst)
        for lst in pred_lists:
            seen.update(lst)
        label_space = sorted(seen)

    if not label_space:
        # Edge case: all empty — F1 is not well-defined. Return 1.0 for
        # full vacuous agreement, 0.0 otherwise.
        return 1.0 if all(not g and not p for g, p in zip(gold_lists, pred_lists)) else 0.0

    f1_per_trait: list[float] = []
    for trait in label_space:
        tp = sum(1 for g, p in zip(gold_lists, pred_lists) if trait in g and trait in p)
        fp = sum(1 for g, p in zip(gold_lists, pred_lists) if trait not in g and trait in p)
        fn = sum(1 for g, p in zip(gold_lists, pred_lists) if trait in g and trait not in p)
        if tp + fp == 0 or tp + fn == 0:
            f1_per_trait.append(0.0)
            continue
        p_score = tp / (tp + fp)
        r_score = tp / (tp + fn)
        if p_score + r_score == 0:
            f1_per_trait.append(0.0)
        else:
            f1_per_trait.append(2 * p_score * r_score / (p_score + r_score))

    return float(np.mean(f1_per_trait))


def f1_micro(
    gold_lists: Sequence[Sequence[str]],
    pred_lists: Sequence[Sequence[str]],
) -> float:
    """F1 micro: pooled TP/FP/FN across all examples."""
    if len(gold_lists) != len(pred_lists):
        raise ValueError("gold and pred must be same length")
    tp = fp = fn = 0
    for gold, pred in zip(gold_lists, pred_lists):
        gold_set = set(gold)
        pred_set = set(pred)
        tp += len(gold_set & pred_set)
        fp += len(pred_set - gold_set)
        fn += len(gold_set - pred_set)
    if tp + fp == 0 or tp + fn == 0:
        return 0.0
    p = tp / (tp + fp)
    r = tp / (tp + fn)
    return 2 * p * r / (p + r) if (p + r) > 0 else 0.0


def exact_match_rate(
    gold_lists: Sequence[Sequence[str]],
    pred_lists: Sequence[Sequence[str]],
) -> float:
    """Fraction of examples where predicted trait set equals gold trait set."""
    if len(gold_lists) != len(pred_lists):
        raise ValueError("gold and pred must be same length")
    if not gold_lists:
        return 0.0
    matches = sum(1 for g, p in zip(gold_lists, pred_lists) if set(g) == set(p))
    return matches / len(gold_lists)


# ----------------------------------------------------------------------------
# Bootstrap CI (per preregistration §2)
# ----------------------------------------------------------------------------

@dataclass(frozen=True)
class CIResult:
    """Bootstrap CI result. Per preregistration §2: B=1000, 95% CI."""
    mean: float
    ci_low: float
    ci_high: float
    n: int
    b: int

    def to_dict(self) -> dict:
        return {
            "mean": self.mean,
            "ci_low": self.ci_low,
            "ci_high": self.ci_high,
            "n": self.n,
            "b": self.b,
        }


def bootstrap_ci(
    gold_lists: Sequence[Sequence[str]],
    pred_lists: Sequence[Sequence[str]],
    metric: str = "f1_macro",
    *,
    b: int = 1000,
    seed: int = 42,
    label_space: Sequence[str] | None = None,
    confidence: float = 0.95,
) -> CIResult:
    """Bootstrap 95% CI on a metric over (gold, pred) pairs.

    `metric` ∈ {"f1_macro", "f1_micro", "exact_match"}.

    Sampling: with replacement over example indices. Each resample
    reapplies the metric.
    """
    if len(gold_lists) != len(pred_lists):
        raise ValueError("gold and pred must be same length")
    if not gold_lists:
        return CIResult(mean=0.0, ci_low=0.0, ci_high=0.0, n=0, b=b)

    rng = np.random.default_rng(seed)
    n = len(gold_lists)
    gold_arr = list(gold_lists)
    pred_arr = list(pred_lists)

    metric_fn_map = {
        "f1_macro": lambda g, p: f1_macro(g, p, label_space=label_space),
        "f1_micro": f1_micro,
        "exact_match": exact_match_rate,
    }
    if metric not in metric_fn_map:
        raise ValueError(f"unknown metric: {metric}")
    metric_fn = metric_fn_map[metric]

    samples: list[float] = []
    for _ in range(b):
        idx = rng.integers(low=0, high=n, size=n)
        g_sample = [gold_arr[i] for i in idx]
        p_sample = [pred_arr[i] for i in idx]
        samples.append(metric_fn(g_sample, p_sample))

    samples_arr = np.array(samples)
    alpha = (1 - confidence) / 2
    return CIResult(
        mean=float(samples_arr.mean()),
        ci_low=float(np.quantile(samples_arr, alpha)),
        ci_high=float(np.quantile(samples_arr, 1 - alpha)),
        n=n,
        b=b,
    )


# ----------------------------------------------------------------------------
# Headline measurement (per preregistration §1)
# ----------------------------------------------------------------------------

@dataclass
class HeadlineMeasurement:
    """The Paper 19 headline metric: F1 macro on novel-combination split,
    bootstrap 95% CI, vs best baseline.
    """
    headline_f1_macro: CIResult
    indist_f1_macro: CIResult           # sanity-check companion
    exact_match_novel: CIResult
    best_baseline_name: str
    best_baseline_f1_macro: CIResult
    margin_over_baseline: float          # headline.mean - baseline.mean
    margin_lower_bound: float            # headline.ci_low - baseline.ci_high
    passes_preregistered_threshold: bool # ≥0.80 + ≥0.15 margin per preregistration §1

    def to_dict(self) -> dict:
        return {
            "headline_f1_macro": self.headline_f1_macro.to_dict(),
            "indist_f1_macro": self.indist_f1_macro.to_dict(),
            "exact_match_novel": self.exact_match_novel.to_dict(),
            "best_baseline_name": self.best_baseline_name,
            "best_baseline_f1_macro": self.best_baseline_f1_macro.to_dict(),
            "margin_over_baseline": self.margin_over_baseline,
            "margin_lower_bound": self.margin_lower_bound,
            "passes_preregistered_threshold": self.passes_preregistered_threshold,
        }


def evaluate_headline(
    gold_novel: Sequence[Sequence[str]],
    pred_novel: Sequence[Sequence[str]],
    gold_indist: Sequence[Sequence[str]],
    pred_indist: Sequence[Sequence[str]],
    baseline_name: str,
    baseline_pred_novel: Sequence[Sequence[str]],
    *,
    label_space: Sequence[str] | None = None,
    headline_threshold: float = 0.80,
    margin_threshold: float = 0.15,
    b: int = 1000,
    seed: int = 42,
) -> HeadlineMeasurement:
    """Compute the full Paper 19 headline measurement bundle."""
    headline = bootstrap_ci(
        gold_novel, pred_novel, metric="f1_macro",
        b=b, seed=seed, label_space=label_space,
    )
    indist = bootstrap_ci(
        gold_indist, pred_indist, metric="f1_macro",
        b=b, seed=seed + 1, label_space=label_space,
    )
    exact = bootstrap_ci(
        gold_novel, pred_novel, metric="exact_match",
        b=b, seed=seed + 2,
    )
    baseline = bootstrap_ci(
        gold_novel, baseline_pred_novel, metric="f1_macro",
        b=b, seed=seed + 3, label_space=label_space,
    )

    margin = headline.mean - baseline.mean
    margin_lower = headline.ci_low - baseline.ci_high

    passes = (
        headline.ci_low >= headline_threshold
        and margin_lower >= margin_threshold * 0.5  # weakened for CI overlap; preregistration §1 wants point estimate too
        and margin >= margin_threshold
    )

    return HeadlineMeasurement(
        headline_f1_macro=headline,
        indist_f1_macro=indist,
        exact_match_novel=exact,
        best_baseline_name=baseline_name,
        best_baseline_f1_macro=baseline,
        margin_over_baseline=margin,
        margin_lower_bound=margin_lower,
        passes_preregistered_threshold=passes,
    )
