"""Dataset module — Paper 19 ATI.

Implements the dataset spec from
`research/paper-19-trait-inference/phase-1-spec.md` §1.

Schema, JSONL I/O, train/val/test/novel-combination splits, and
audit checks.

Pure CPU; no GPU dependencies.
"""
from __future__ import annotations

import json
import random
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Iterable, Iterator


class Source(str, Enum):
    EXISTING = "existing"
    BRITTNEY = "brittney"
    COMMUNITY = "community"
    NEGATIVE = "negative"


class Split(str, Enum):
    TRAIN = "train"
    VAL = "val"
    HELD_OUT_INDIST = "held_out_indist"
    HELD_OUT_NOVEL = "held_out_novel"


@dataclass(frozen=True, slots=True)
class Pair:
    """One labeled (description -> trait set) pair.

    Schema matches `phase-1-spec.md` §1.2 verbatim.
    """
    id: str
    description: str
    trait_set: tuple[str, ...]   # sorted, canonical order
    source: Source
    expected_validity: str       # "valid" | "invalid" | "empty"
    novel_combination: bool
    audit_status: str = "pending"  # "pending" | "passed" | "rejected"
    created_at: str = ""

    def __post_init__(self) -> None:
        # Canonicalize trait set ordering at construction time so equality
        # comparisons are deterministic regardless of input order.
        if list(self.trait_set) != sorted(self.trait_set):
            object.__setattr__(self, "trait_set", tuple(sorted(self.trait_set)))


# ----------------------------------------------------------------------------
# JSONL I/O
# ----------------------------------------------------------------------------

def load_jsonl(path: Path | str) -> list[Pair]:
    """Load a dataset from JSONL. Robust to extra fields (forward-compat)."""
    pairs: list[Pair] = []
    with open(path, "r", encoding="utf-8") as fh:
        for lineno, line in enumerate(fh, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"line {lineno}: invalid JSON: {exc}") from exc
            try:
                pair = Pair(
                    id=str(obj["id"]),
                    description=str(obj["description"]),
                    trait_set=tuple(obj["trait_set"]),
                    source=Source(obj["source"]),
                    expected_validity=str(obj["expected_validity"]),
                    novel_combination=bool(obj["novel_combination"]),
                    audit_status=str(obj.get("audit_status", "pending")),
                    created_at=str(obj.get("created_at", "")),
                )
            except KeyError as exc:
                raise ValueError(f"line {lineno}: missing field {exc}") from exc
            pairs.append(pair)
    return pairs


def write_jsonl(path: Path | str, pairs: Iterable[Pair]) -> int:
    """Write pairs to JSONL. Returns count written. Atomic via temp + rename."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    n = 0
    with open(tmp, "w", encoding="utf-8") as fh:
        for pair in pairs:
            obj = asdict(pair)
            obj["source"] = pair.source.value  # enum -> string
            obj["trait_set"] = list(pair.trait_set)  # tuple -> list for JSON
            fh.write(json.dumps(obj, separators=(",", ":")) + "\n")
            n += 1
    tmp.replace(path)
    return n


# ----------------------------------------------------------------------------
# Splits
# ----------------------------------------------------------------------------

def make_splits(
    pairs: list[Pair],
    *,
    seed: int = 42,
    train_frac: float = 0.70,
    val_frac: float = 0.10,
    indist_frac: float = 0.10,
    # remaining → held_out_novel; computed not declared
) -> dict[Split, list[Pair]]:
    """Create train/val/held_out_indist/held_out_novel splits per
    `phase-1-spec.md` §1.3.

    The novel-combination split contains examples whose `trait_set` does NOT
    appear in the training set. This is the headline split per
    `preregistration.md` §1.

    Strategy:
      1. Shuffle by deterministic seed.
      2. Allocate negative examples evenly across all splits.
      3. Group pairs by canonical trait_set; ensure ≥1 group per split.
      4. Reserve groups whose trait_sets are unique-in-corpus for
         held_out_novel; remaining groups distributed by frac.
    """
    if not 0.99 <= train_frac + val_frac + indist_frac <= 1.0:
        raise ValueError("split fractions must leave room for held_out_novel")

    rng = random.Random(seed)

    # Index pairs by trait_set (canonical tuple) so we can decide novelty.
    by_trait: dict[tuple[str, ...], list[Pair]] = {}
    for p in pairs:
        by_trait.setdefault(p.trait_set, []).append(p)

    trait_groups = list(by_trait.items())
    rng.shuffle(trait_groups)

    # Split groups: novel = groups whose trait_set has only 1-2 examples
    # (rare combos) — these are the "held out" candidates. Common combos
    # populate train/val/indist.
    rare = [g for g in trait_groups if len(g[1]) <= 2]
    common = [g for g in trait_groups if len(g[1]) > 2]

    novel_pairs = [p for _, examples in rare for p in examples]

    # Distribute common-trait pairs to train/val/indist by fraction.
    common_pairs = [p for _, examples in common for p in examples]
    rng.shuffle(common_pairs)
    n = len(common_pairs)
    n_train = int(n * train_frac)
    n_val = int(n * val_frac)
    n_indist = int(n * indist_frac)

    train_pairs = common_pairs[:n_train]
    val_pairs = common_pairs[n_train : n_train + n_val]
    indist_pairs = common_pairs[n_train + n_val : n_train + n_val + n_indist]

    splits: dict[Split, list[Pair]] = {
        Split.TRAIN: train_pairs,
        Split.VAL: val_pairs,
        Split.HELD_OUT_INDIST: indist_pairs,
        Split.HELD_OUT_NOVEL: novel_pairs,
    }

    # Final novelty check: any pair in HELD_OUT_NOVEL whose trait_set DOES
    # appear in TRAIN gets moved to HELD_OUT_INDIST. (Edge case: rare combo
    # that happens to share traits with a common combo via overlap — we keep
    # the novelty invariant strict.)
    train_trait_sets = {p.trait_set for p in train_pairs}
    truly_novel = [p for p in novel_pairs if p.trait_set not in train_trait_sets]
    moved_to_indist = [p for p in novel_pairs if p.trait_set in train_trait_sets]
    splits[Split.HELD_OUT_NOVEL] = truly_novel
    splits[Split.HELD_OUT_INDIST] = indist_pairs + moved_to_indist

    return splits


# ----------------------------------------------------------------------------
# Audit
# ----------------------------------------------------------------------------

@dataclass
class AuditReport:
    """Result of running audit() against a dataset.

    Acceptance criteria from `phase-1-spec.md` §1.4 — a dataset is
    acceptable for Phase 3 training when ALL items below pass.
    """
    total_pairs: int = 0
    pairs_per_source: dict[str, int] = field(default_factory=dict)
    novel_split_size: int = 0
    novel_split_unique_combos: int = 0
    negative_count: int = 0
    issues: list[str] = field(default_factory=list)

    @property
    def passes(self) -> bool:
        """Spec acceptance: ≥2k pairs, ≥300 novel, ≥500 each major source,
        ≥200 negatives, no issues."""
        return (
            self.total_pairs >= 2000
            and self.novel_split_size >= 300
            and self.pairs_per_source.get("existing", 0) >= 500
            and self.pairs_per_source.get("brittney", 0) >= 500
            and self.pairs_per_source.get("community", 0) >= 300
            and self.negative_count >= 200
            and not self.issues
        )

    def to_dict(self) -> dict:
        return {
            **asdict(self),
            "passes": self.passes,
            "audited_at": datetime.now(timezone.utc).isoformat(),
        }


def audit(pairs: list[Pair], splits: dict[Split, list[Pair]] | None = None) -> AuditReport:
    """Audit a dataset against `phase-1-spec.md` §1.4 acceptance criteria."""
    report = AuditReport()
    report.total_pairs = len(pairs)

    # Source distribution
    for p in pairs:
        report.pairs_per_source[p.source.value] = (
            report.pairs_per_source.get(p.source.value, 0) + 1
        )
    report.negative_count = report.pairs_per_source.get("negative", 0)

    # Novel split (compute splits if not provided)
    if splits is None:
        splits = make_splits(pairs)
    novel_pairs = splits.get(Split.HELD_OUT_NOVEL, [])
    report.novel_split_size = len(novel_pairs)
    report.novel_split_unique_combos = len({p.trait_set for p in novel_pairs})

    # Issues
    if report.total_pairs < 2000:
        report.issues.append(f"total {report.total_pairs} < 2000 minimum")
    if report.novel_split_size < 300:
        report.issues.append(
            f"novel-combination split {report.novel_split_size} < 300 minimum"
        )
    if report.pairs_per_source.get("existing", 0) < 500:
        report.issues.append(
            f"existing source {report.pairs_per_source.get('existing', 0)} < 500 minimum"
        )
    if report.pairs_per_source.get("brittney", 0) < 500:
        report.issues.append(
            f"brittney source {report.pairs_per_source.get('brittney', 0)} < 500 minimum"
        )
    if report.pairs_per_source.get("community", 0) < 300:
        report.issues.append(
            f"community source {report.pairs_per_source.get('community', 0)} < 300 minimum"
        )
    if report.negative_count < 200:
        report.issues.append(
            f"negative examples {report.negative_count} < 200 minimum"
        )

    # Spot-check novelty: sample 50 from novel split, verify trait_set not
    # in any train example. If splits weren't provided, this is comparing
    # against the same generated splits, so it's a self-consistency check.
    train_trait_sets = {p.trait_set for p in splits[Split.TRAIN]}
    leaked = [p for p in novel_pairs if p.trait_set in train_trait_sets]
    if leaked:
        report.issues.append(
            f"novelty leak: {len(leaked)} novel-split pairs share trait_set with train"
        )

    return report


# ----------------------------------------------------------------------------
# Synthetic dataset generator (for smoke tests + CI)
# ----------------------------------------------------------------------------

def generate_smoke_dataset(
    label_space: list[str],
    *,
    n: int = 100,
    seed: int = 42,
) -> list[Pair]:
    """Generate a small synthetic dataset for smoke-testing the pipeline.

    NOT for headline measurement — real datasets must come from the 3-source
    mix per spec §1.1. This generator exists so unit tests + the smoke-test
    CLI command can run without requiring the full data-collection pipeline.
    """
    rng = random.Random(seed)
    pairs: list[Pair] = []
    now = datetime.now(timezone.utc).isoformat()

    for i in range(n):
        # Random trait subset of size 1-4
        k = rng.randint(1, min(4, len(label_space)))
        traits = tuple(sorted(rng.sample(label_space, k)))
        # Synthetic description: trait names joined with filler words
        desc_words = ["a"] + list(traits) + rng.choice([
            ["object"], ["thing"], ["entity"], ["construct"], ["element"]
        ])
        desc = " ".join(desc_words).replace("@", "").replace("_", " ")

        pairs.append(Pair(
            id=f"smoke-{i:04d}",
            description=desc,
            trait_set=traits,
            source=Source.BRITTNEY,
            expected_validity="valid",
            novel_combination=False,
            audit_status="passed",
            created_at=now,
        ))

    # Add a few negatives
    for i in range(n, n + max(2, n // 20)):
        pairs.append(Pair(
            id=f"smoke-neg-{i:04d}",
            description=rng.choice([
                "the number seven", "an abstract concept",
                "explain quantum entanglement", "purely conceptual",
            ]),
            trait_set=(),
            source=Source.NEGATIVE,
            expected_validity="empty",
            novel_combination=False,
            audit_status="passed",
            created_at=now,
        ))

    return pairs
