"""5-row ablation matrix runner — Paper 19.

Per `phase-1-spec.md` §3.5 + `preregistration.md` §3 ablation thresholds:

  1. Trait-name removal           — F1 retention ≥0.65
  2. Constrained decoding off     — Validity drop ≥0.40
  3. Training set size sweep      — F1(N=2000) ≥ F1(N=1000) + 0.05
  4. Source ablation              — Brittney-only F1 retention ≤0.85
  5. Brittney-only synthesis      — separate baseline runner

Each ablation produces a structured measurement JSON. Aggregate matrix
gets composed by `AblationMatrix.run_all()`.

Heavy deps imported lazily — CPU code paths run without torch.
"""
from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Sequence

from trait_inference.dataset import Pair, Source
from trait_inference.metrics import bootstrap_ci, f1_macro


# ----------------------------------------------------------------------------
# Result + config
# ----------------------------------------------------------------------------

@dataclass
class AblationResult:
    """One ablation row's measurement."""
    name: str
    description: str
    headline_metric: str
    headline_value: float
    headline_ci_low: float
    headline_ci_high: float
    threshold_check: str            # human-readable pass/fail rationale
    passes_preregistered_threshold: bool
    extra: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            **asdict(self),
            "measured_at": datetime.now(timezone.utc).isoformat(),
        }


@dataclass
class AblationConfig:
    """Ablation matrix config. label_space is required."""
    label_space: tuple[str, ...] = ()
    bootstrap_b: int = 1000
    seed: int = 42


# ----------------------------------------------------------------------------
# Per-ablation utilities
# ----------------------------------------------------------------------------

_TRAIT_NAME_RE = re.compile(r"@?[a-z][a-z0-9_]*", re.IGNORECASE)


def strip_trait_names(description: str, label_space: Sequence[str]) -> str:
    """Replace any token that matches a known trait name (with/without
    @-prefix) with [TRAIT]. Used by ablation 1.
    """
    bare_names = {t.lstrip("@") for t in label_space}
    full_names = set(label_space)
    out_tokens: list[str] = []
    for tok in re.findall(r"\S+|\s+", description):
        if not tok.strip():
            out_tokens.append(tok)
            continue
        # Strip trailing punctuation for comparison
        clean = tok.rstrip(".,;:!?").lower()
        if clean in {b.lower() for b in bare_names} or clean in {f.lower() for f in full_names}:
            out_tokens.append("[TRAIT]" + tok[len(tok.rstrip(".,;:!?")):])
        else:
            out_tokens.append(tok)
    return "".join(out_tokens)


# ----------------------------------------------------------------------------
# Ablation runner
# ----------------------------------------------------------------------------

class AblationMatrix:
    """Coordinator for the 5-row ablation matrix.

    Each ablation takes a "predict_fn" callable: given a list of
    descriptions (possibly perturbed per the ablation), returns a list
    of predicted trait sets. This decouples ablations from the specific
    model — caller provides the model's predict_batch.

    Usage:
        matrix = AblationMatrix(AblationConfig(label_space=label_space))
        # baseline run (no perturbation)
        baseline_score = matrix.headline(model.predict_batch, eval_pairs)
        # 5-row matrix
        results = matrix.run_all(
            model_predict=model.predict_batch,
            unconstrained_predict=model_unconstrained.predict_batch,
            train_eval_at_size_fn=train_eval_at_size_callable,
            brittney_only_train_eval_fn=brittney_only_callable,
            eval_pairs=eval_pairs,
            train_pairs=train_pairs,
            baseline_headline=baseline_score,
        )
    """

    def __init__(self, config: AblationConfig):
        if not config.label_space:
            raise ValueError("AblationConfig.label_space must be non-empty")
        self.config = config

    # ------------------------------------------------------------------------
    # Headline measurement (used as baseline for ablations 1+4)
    # ------------------------------------------------------------------------

    def headline(
        self,
        predict_fn: Callable[[list[str]], list[list[str]]],
        eval_pairs: list[Pair],
    ) -> dict[str, float]:
        """Compute F1 macro + bootstrap CI on eval split."""
        descriptions = [p.description for p in eval_pairs]
        gold = [list(p.trait_set) for p in eval_pairs]
        preds = predict_fn(descriptions)
        ci = bootstrap_ci(
            gold, preds,
            metric="f1_macro",
            b=self.config.bootstrap_b,
            seed=self.config.seed,
            label_space=self.config.label_space,
        )
        return {
            "f1_macro": f1_macro(gold, preds, label_space=self.config.label_space),
            "ci_low": ci.ci_low,
            "ci_high": ci.ci_high,
            "n": len(eval_pairs),
        }

    # ------------------------------------------------------------------------
    # Ablation 1: Trait-name removal
    # ------------------------------------------------------------------------

    def trait_name_removal(
        self,
        predict_fn: Callable[[list[str]], list[list[str]]],
        eval_pairs: list[Pair],
        baseline_f1: float,
    ) -> AblationResult:
        """Replace trait names in descriptions with [TRAIT] tokens; if
        F1 retention ≥0.65 of baseline, model is semantically grounded
        (not lexically reliant).

        Per `preregistration.md` §3 row 1 threshold."""
        ls = self.config.label_space
        perturbed_descs = [strip_trait_names(p.description, ls) for p in eval_pairs]
        gold = [list(p.trait_set) for p in eval_pairs]
        preds = predict_fn(perturbed_descs)
        f1 = f1_macro(gold, preds, label_space=ls)
        ci = bootstrap_ci(
            gold, preds, metric="f1_macro",
            b=self.config.bootstrap_b, seed=self.config.seed + 1,
            label_space=ls,
        )
        retention = f1 / baseline_f1 if baseline_f1 > 0 else 0.0
        passes = retention >= 0.65
        return AblationResult(
            name="trait_name_removal",
            description="Replace trait names in description with [TRAIT]; tests semantic grounding vs lexical reliance",
            headline_metric="f1_macro_retention",
            headline_value=retention,
            headline_ci_low=ci.ci_low / baseline_f1 if baseline_f1 > 0 else 0.0,
            headline_ci_high=ci.ci_high / baseline_f1 if baseline_f1 > 0 else 0.0,
            threshold_check=f"retention {retention:.3f} {'>=' if passes else '<'} 0.65",
            passes_preregistered_threshold=passes,
            extra={"baseline_f1": baseline_f1, "perturbed_f1": f1},
        )

    # ------------------------------------------------------------------------
    # Ablation 2: Constrained decoding off
    # ------------------------------------------------------------------------

    def constrained_decoding_off(
        self,
        unconstrained_predict_fn: Callable[[list[str]], list[list[str]]],
        eval_pairs: list[Pair],
        baseline_validity: float,
    ) -> AblationResult:
        """Compare validity rate WITHOUT constrained decoding to the
        baseline (with constraints). Validity drop ≥0.40 confirms
        architecture is load-bearing.

        Per `preregistration.md` §3 row 2 threshold."""
        descriptions = [p.description for p in eval_pairs]
        preds = unconstrained_predict_fn(descriptions)
        # Validity = predicted trait sets that are subsets of label space.
        # All elements must be in label_space; empty set is also valid.
        ls_set = set(self.config.label_space)
        n_valid = sum(1 for p in preds if all(t in ls_set for t in p))
        validity_unconstrained = n_valid / len(preds) if preds else 0.0
        drop = baseline_validity - validity_unconstrained
        passes = drop >= 0.40
        return AblationResult(
            name="constrained_decoding_off",
            description="Validity rate without constrained decoding vs with",
            headline_metric="validity_drop",
            headline_value=drop,
            headline_ci_low=drop,  # single-point measurement; no bootstrap on validity ratio
            headline_ci_high=drop,
            threshold_check=f"drop {drop:.3f} {'>=' if passes else '<'} 0.40",
            passes_preregistered_threshold=passes,
            extra={
                "baseline_validity": baseline_validity,
                "unconstrained_validity": validity_unconstrained,
                "n_eval": len(preds),
            },
        )

    # ------------------------------------------------------------------------
    # Ablation 3: Training set size sweep
    # ------------------------------------------------------------------------

    def training_size_sweep(
        self,
        train_eval_at_size_fn: Callable[[int], float],
    ) -> AblationResult:
        """Train + eval at sizes {500, 1000, 2000} and check curve
        flattening.

        train_eval_at_size_fn(N) → returns F1 macro on novel split when
        trained on N examples. (GPU-heavy — caller provides function.)

        Per `preregistration.md` §3 row 3: F1(2000) ≥ F1(1000) + 0.05.
        """
        sizes = [500, 1000, 2000]
        scores = {n: train_eval_at_size_fn(n) for n in sizes}
        delta = scores[2000] - scores[1000]
        passes = delta >= 0.05
        return AblationResult(
            name="training_size_sweep",
            description="F1 macro at training sizes {500, 1000, 2000}",
            headline_metric="f1_delta_2000_vs_1000",
            headline_value=delta,
            headline_ci_low=delta,
            headline_ci_high=delta,
            threshold_check=f"F1(2000)-F1(1000) = {delta:.3f} {'>=' if passes else '<'} 0.05",
            passes_preregistered_threshold=passes,
            extra={"scores": scores},
        )

    # ------------------------------------------------------------------------
    # Ablation 4: Source ablation (Brittney-only training)
    # ------------------------------------------------------------------------

    def source_ablation_brittney_only(
        self,
        brittney_only_train_eval_fn: Callable[[list[Pair]], float],
        train_pairs: list[Pair],
        baseline_f1: float,
    ) -> AblationResult:
        """Train on Brittney source only; F1 retention ≤0.85 confirms
        multi-source dataset is load-bearing.

        Per `preregistration.md` §3 row 4."""
        brittney_pairs = [p for p in train_pairs if p.source == Source.BRITTNEY]
        if not brittney_pairs:
            return AblationResult(
                name="source_ablation_brittney_only",
                description="Train on Brittney source only; tests multi-source load-bearingness",
                headline_metric="brittney_only_f1_retention",
                headline_value=0.0,
                headline_ci_low=0.0,
                headline_ci_high=0.0,
                threshold_check="SKIPPED — no Brittney pairs in training set",
                passes_preregistered_threshold=False,
                extra={"reason": "no brittney pairs"},
            )
        f1 = brittney_only_train_eval_fn(brittney_pairs)
        retention = f1 / baseline_f1 if baseline_f1 > 0 else 0.0
        # Per §3 row 4: retention ≤0.85 confirms multi-source is load-bearing
        # (i.e. removing the other sources HURTS by ≥15 pp)
        passes = retention <= 0.85
        return AblationResult(
            name="source_ablation_brittney_only",
            description="Train on Brittney source only; tests multi-source load-bearingness",
            headline_metric="brittney_only_f1_retention",
            headline_value=retention,
            headline_ci_low=retention,
            headline_ci_high=retention,
            threshold_check=f"retention {retention:.3f} {'<=' if passes else '>'} 0.85",
            passes_preregistered_threshold=passes,
            extra={
                "baseline_f1": baseline_f1,
                "brittney_only_f1": f1,
                "n_brittney_pairs": len(brittney_pairs),
            },
        )

    # ------------------------------------------------------------------------
    # Run-all dispatcher
    # ------------------------------------------------------------------------

    def run_all(
        self,
        *,
        predict_fn: Callable[[list[str]], list[list[str]]],
        unconstrained_predict_fn: Callable[[list[str]], list[list[str]]],
        train_eval_at_size_fn: Callable[[int], float],
        brittney_only_train_eval_fn: Callable[[list[Pair]], float],
        eval_pairs: list[Pair],
        train_pairs: list[Pair],
        baseline_validity: float,
    ) -> dict[str, Any]:
        """Run the full 5-row matrix. Returns aggregated results."""
        baseline = self.headline(predict_fn, eval_pairs)
        baseline_f1 = baseline["f1_macro"]
        results = [
            self.trait_name_removal(predict_fn, eval_pairs, baseline_f1),
            self.constrained_decoding_off(unconstrained_predict_fn, eval_pairs, baseline_validity),
            self.training_size_sweep(train_eval_at_size_fn),
            self.source_ablation_brittney_only(brittney_only_train_eval_fn, train_pairs, baseline_f1),
        ]
        return {
            "baseline": baseline,
            "ablations": [r.to_dict() for r in results],
            "all_pass": all(r.passes_preregistered_threshold for r in results),
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }
