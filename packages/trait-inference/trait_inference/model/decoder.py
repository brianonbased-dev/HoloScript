"""Constrained-decoding trait set generator — Paper 19 contribution.

Per `phase-1-spec.md` §3.1: small LLM decoder with constrained
generation over the trait composition lattice. The decoder samples ONLY
JSON arrays of valid trait names, in canonical sorted order, with no
duplicates. This bakes gate item 4 (≥90% validity) into the
ARCHITECTURE per F.031.

Approach:
- HF transformers LLM (default Qwen2.5-0.5B; ≤1B sweep target).
- Prompt template: {description} → {trait JSON}.
- Constrained decoding via outlines.RegexFSM with a regex enumerating
  the label space.
- Post-decode: parse JSON, deduplicate, return as sorted set
  (defense-in-depth).

Heavy deps (torch, transformers, outlines) imported only when
TraitDecoder is constructed.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any, Sequence


# ----------------------------------------------------------------------------
# Regex builder for the trait JSON list (no heavy deps)
# ----------------------------------------------------------------------------

def build_trait_regex(label_space: Sequence[str]) -> str:
    """Build a regex that matches a JSON list of traits drawn from the
    label space, in any order, with arbitrary length 0..N.

    Returns a Python regex string suitable for outlines.RegexFSM.

    NOTE: This regex enforces MEMBERSHIP in the label space and JSON
    syntax, but does NOT enforce sorted-unique-set semantics — those
    are applied post-decode via parse_trait_set(). Stateful
    sort-unique constraint is possible via outlines CFG but adds
    significant complexity; defense-in-depth post-processing is
    sufficient for the spec.

    Examples (with label_space = ["@grabbable", "@physics", "@rigid"]):
      []                                       — valid (empty)
      ["@grabbable"]                           — valid
      ["@grabbable", "@physics"]               — valid
      ["@physics", "@grabbable"]               — valid (post-dedup will sort)
      ["@unknown"]                             — REJECTED by regex
    """
    if not label_space:
        return r"\[\]"
    # Each trait literal — escaped for regex, JSON-quoted.
    trait_alts = "|".join(re.escape(t) for t in sorted(set(label_space)))
    one_trait = rf'"({trait_alts})"'
    # `[]` OR `[T(, T)*]`
    return rf'\[(?:{one_trait}(?:, {one_trait})*)?\]'


def parse_trait_set(text: str, label_space: Sequence[str] | None = None) -> list[str]:
    """Parse a JSON-list string from the decoder, return canonical
    sorted-unique trait list.

    Tolerant: returns [] on parse failure rather than raising — generator
    output should be assumed well-formed (constrained decoding) but
    defense-in-depth means we never crash the eval harness on a single
    bad output.

    If label_space is provided, traits not in label_space are dropped.
    """
    text = text.strip()
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    out: set[str] = set()
    for item in parsed:
        if not isinstance(item, str):
            continue
        if label_space is not None and item not in label_space:
            continue
        out.add(item)
    return sorted(out)


# ----------------------------------------------------------------------------
# TraitDecoder — model wrapper
# ----------------------------------------------------------------------------

@dataclass
class TraitDecoderConfig:
    """Config for the constrained-decoding model."""
    model_name: str = "Qwen/Qwen2.5-0.5B"   # ≤1B per spec; sweep over Qwen-0.5B/1B + Llama-3.2-1B
    label_space: tuple[str, ...] = ()
    prompt_template: str = (
        "Given a description of a virtual object, return the minimal "
        "set of HoloScript traits that apply, as a JSON array.\n"
        "Description: {description}\n"
        "Traits: "
    )
    max_new_tokens: int = 256
    temperature: float = 0.0    # deterministic; required for Paper 19 reproducibility
    device: str = "cuda"        # override "cpu" for local smoke-test
    encoder_name: str | None = None  # if set, use sentence-transformer for input embedding (Phase 2.1 ablation axis)


class TraitDecoder:
    """Wrapper over HF transformers + outlines constrained generation.

    Construction triggers heavy imports + model load. For CPU smoke
    tests, pass `device="cpu"` AND a tiny model_name like
    "sshleifer/tiny-gpt2".

    Usage:
        decoder = TraitDecoder(TraitDecoderConfig(label_space=(...,)))
        traits = decoder.predict("a ball that bounces")
        traits  # ["@collidable", "@physics", "@rigid"]
    """

    def __init__(self, config: TraitDecoderConfig):
        if not config.label_space:
            raise ValueError("TraitDecoderConfig.label_space must be non-empty")
        # Heavy imports happen here, not at module load.
        try:
            import torch  # noqa: F401
            from transformers import AutoModelForCausalLM, AutoTokenizer
        except ImportError as exc:
            raise ImportError(
                "TraitDecoder requires the [model] extra. "
                "Install via: pip install -e '.[model]'"
            ) from exc

        self.config = config
        self.tokenizer = AutoTokenizer.from_pretrained(config.model_name)
        if self.tokenizer.pad_token is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token

        self.model = AutoModelForCausalLM.from_pretrained(config.model_name)
        self.model.to(config.device)
        self.model.eval()

        self._regex = build_trait_regex(config.label_space)
        self._fsm: Any = None  # lazy-built on first predict (outlines optional at construction)

    def _build_fsm(self) -> Any:
        """Build the outlines FSM for constrained decoding."""
        if self._fsm is not None:
            return self._fsm
        try:
            import outlines  # noqa: F401
        except ImportError as exc:
            raise ImportError(
                "TraitDecoder.predict() requires outlines. "
                "Install via: pip install -e '.[model]'"
            ) from exc
        # outlines API surface has changed across versions; we use the
        # generate.regex helper which is stable as of 0.0.40+.
        from outlines.models.transformers import Transformers
        from outlines.generate import regex as outlines_regex_gen
        wrapped = Transformers(self.model, self.tokenizer)
        self._fsm = outlines_regex_gen(wrapped, self._regex)
        return self._fsm

    def predict(self, description: str) -> list[str]:
        """Generate constrained trait set for a single description."""
        return self.predict_batch([description])[0]

    def predict_batch(self, descriptions: list[str]) -> list[list[str]]:
        """Batch predict. Returns list of canonical sorted trait lists."""
        fsm = self._build_fsm()
        prompts = [self.config.prompt_template.format(description=d) for d in descriptions]
        # outlines `generate.regex` returns a callable; arg is prompt string(s).
        results = fsm(prompts, max_tokens=self.config.max_new_tokens)
        if isinstance(results, str):
            results = [results]
        out: list[list[str]] = []
        for text in results:
            out.append(parse_trait_set(text, label_space=self.config.label_space))
        return out

    @classmethod
    def for_smoke_test(cls, label_space: Sequence[str]) -> "TraitDecoder":
        """Construct a CPU-only tiny model for unit/smoke tests."""
        return cls(TraitDecoderConfig(
            model_name="sshleifer/tiny-gpt2",
            label_space=tuple(label_space),
            device="cpu",
            max_new_tokens=64,
        ))
