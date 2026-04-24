"""Baselines — Paper 19 ATI.

Per `phase-1-spec.md` §2 — ≥3 baselines required:
  1. Keyword match (trivial; CPU; ~30-55% F1 expected on novel split)
  2. TF-IDF + multi-label LogReg (classical; CPU; ~50-65% F1 expected)
  3. Brittney few-shot (strong; needs Brittney API; ~60-75% F1 expected)

Per `trait-inference-brain` priority 3 + `phase-1-spec.md` §2:
  > Build baselines BEFORE contribution model. If a baseline already
  > hits the gate, the contribution is null.

Each baseline implements:
  fit(train_pairs) -> None        # may be no-op for keyword
  predict(description) -> list[str]
  predict_batch(descs) -> list[list[str]]

This module is CPU-only. Brittney baseline imports lazily so missing
API key doesn't break keyword/tfidf usage.
"""
from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Protocol

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.multiclass import OneVsRestClassifier
from sklearn.preprocessing import MultiLabelBinarizer

from trait_inference.dataset import Pair


# ----------------------------------------------------------------------------
# Baseline protocol
# ----------------------------------------------------------------------------

class Baseline(Protocol):
    """Common interface for all baselines."""
    name: str

    def fit(self, train_pairs: list[Pair]) -> None: ...
    def predict(self, description: str) -> list[str]: ...
    def predict_batch(self, descriptions: list[str]) -> list[list[str]]: ...


# ----------------------------------------------------------------------------
# Baseline 1: Keyword match (trivial)
# ----------------------------------------------------------------------------

@dataclass
class KeywordBaseline:
    """Trivial baseline: predict trait T if T's name (or known synonym)
    appears in the description.

    Per `phase-1-spec.md` §2.1 — expected F1 ≈ 30-55% on novel split.
    """
    name: str = "keyword"
    label_space: tuple[str, ...] = ()
    synonyms: dict[str, list[str]] = field(default_factory=dict)
    _patterns: dict[str, re.Pattern[str]] = field(default_factory=dict, init=False)

    def __post_init__(self) -> None:
        self._compile()

    def _compile(self) -> None:
        """Build per-trait word-boundary regex from name + synonyms."""
        self._patterns = {}
        for trait in self.label_space:
            # Strip @-prefix and _-separators for matching.
            normalized = trait.lstrip("@").replace("_", " ")
            tokens = [normalized] + self.synonyms.get(trait, [])
            # Word-boundary regex; case-insensitive.
            pattern = r"\b(" + "|".join(re.escape(t) for t in tokens) + r")\b"
            self._patterns[trait] = re.compile(pattern, re.IGNORECASE)

    def fit(self, train_pairs: list[Pair]) -> None:
        # Could optionally derive synonyms from train co-occurrence here.
        # Phase 1: synonyms come from constructor (caller-supplied).
        return

    def predict(self, description: str) -> list[str]:
        hits = [t for t, p in self._patterns.items() if p.search(description)]
        return sorted(hits)

    def predict_batch(self, descriptions: list[str]) -> list[list[str]]:
        return [self.predict(d) for d in descriptions]


# ----------------------------------------------------------------------------
# Baseline 2: TF-IDF + multi-label Logistic Regression (classical)
# ----------------------------------------------------------------------------

@dataclass
class TfidfLogregBaseline:
    """TF-IDF vectorizer + one-vs-rest LogReg per trait.

    Per `phase-1-spec.md` §2.2 — expected F1 ≈ 50-65% on novel split.
    Captures bag-of-words associations beyond lexical match but cannot
    generalize across novel combinations because training only sees
    existing combinations.
    """
    name: str = "tfidf_logreg"
    threshold: float = 0.5      # decision threshold for trait inclusion
    max_features: int = 10000
    ngram_range: tuple[int, int] = (1, 2)
    _vectorizer: TfidfVectorizer | None = None
    _classifier: OneVsRestClassifier | None = None
    _binarizer: MultiLabelBinarizer | None = None
    _label_space: list[str] = field(default_factory=list)

    def fit(self, train_pairs: list[Pair]) -> None:
        if not train_pairs:
            raise ValueError("cannot fit on empty training set")

        descriptions = [p.description for p in train_pairs]
        trait_sets = [list(p.trait_set) for p in train_pairs]

        # Establish label space from training data
        self._binarizer = MultiLabelBinarizer()
        Y = self._binarizer.fit_transform(trait_sets)
        self._label_space = list(self._binarizer.classes_)

        self._vectorizer = TfidfVectorizer(
            max_features=self.max_features,
            ngram_range=self.ngram_range,
            sublinear_tf=True,
            stop_words="english",
        )
        X = self._vectorizer.fit_transform(descriptions)

        # Multi-label via one-vs-rest. LogReg's predict_proba enables
        # threshold tuning on the validation split.
        self._classifier = OneVsRestClassifier(
            LogisticRegression(max_iter=500, C=1.0, solver="liblinear"),
            n_jobs=-1,
        )
        self._classifier.fit(X, Y)

    def _ensure_fit(self) -> None:
        if self._vectorizer is None or self._classifier is None or self._binarizer is None:
            raise RuntimeError("call fit() before predict()")

    def predict(self, description: str) -> list[str]:
        return self.predict_batch([description])[0]

    def predict_batch(self, descriptions: list[str]) -> list[list[str]]:
        self._ensure_fit()
        assert self._vectorizer is not None and self._classifier is not None
        assert self._binarizer is not None
        X = self._vectorizer.transform(descriptions)
        # predict_proba returns shape (n_samples, n_labels)
        proba = self._classifier.predict_proba(X)
        out: list[list[str]] = []
        for row in proba:
            chosen = [
                self._label_space[i]
                for i, p in enumerate(row)
                if p >= self.threshold
            ]
            out.append(sorted(chosen))
        return out

    def tune_threshold(
        self,
        val_pairs: list[Pair],
        candidates: Iterable[float] = (0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8),
    ) -> float:
        """Find the threshold that maximizes F1 macro on the validation
        split. Updates self.threshold and returns it."""
        from trait_inference.metrics import f1_macro

        descriptions = [p.description for p in val_pairs]
        gold = [list(p.trait_set) for p in val_pairs]

        best_thr, best_f1 = self.threshold, -1.0
        for thr in candidates:
            self.threshold = thr
            preds = self.predict_batch(descriptions)
            score = f1_macro(gold, preds, label_space=self._label_space)
            if score > best_f1:
                best_thr, best_f1 = thr, score
        self.threshold = best_thr
        return best_thr


# ----------------------------------------------------------------------------
# Baseline 3: Brittney few-shot (strong; lazy import — needs API access)
# ----------------------------------------------------------------------------

@dataclass
class BrittneyFewShotBaseline:
    """In-context-learn from K=8 stratified examples + Brittney prompt.

    Per `phase-1-spec.md` §2.3 — expected F1 ≈ 60-75% on novel split.
    Strongest baseline — represents "what you get for free from the
    existing system."

    Phase 3 implementation deferred — depends on Brittney API surface
    decision (HoloScript MCP `brittney_*` tools). This stub captures the
    interface so the eval harness can be tested end-to-end with mock
    behavior; the real implementation lands when training Phase 3 starts.
    """
    name: str = "brittney_fewshot"
    k_shots: int = 8
    _examples: list[Pair] = field(default_factory=list)

    def fit(self, train_pairs: list[Pair]) -> None:
        # Stratified sampling: pick K examples that maximize trait diversity
        # in the prompt context. Greedy: each next example adds the most
        # not-yet-seen traits.
        if not train_pairs:
            self._examples = []
            return
        seen: set[str] = set()
        chosen: list[Pair] = []
        remaining = list(train_pairs)
        while len(chosen) < self.k_shots and remaining:
            best_idx, best_new = 0, -1
            for i, p in enumerate(remaining):
                new_traits = len(set(p.trait_set) - seen)
                if new_traits > best_new:
                    best_idx, best_new = i, new_traits
            picked = remaining.pop(best_idx)
            chosen.append(picked)
            seen.update(picked.trait_set)
        self._examples = chosen

    def predict(self, description: str) -> list[str]:
        # Phase 1 stub: return empty (will be replaced by Brittney API call
        # in Phase 3). Empty prediction is the most honest non-call default
        # — the eval harness will record this baseline as needing impl.
        return []

    def predict_batch(self, descriptions: list[str]) -> list[list[str]]:
        return [self.predict(d) for d in descriptions]
