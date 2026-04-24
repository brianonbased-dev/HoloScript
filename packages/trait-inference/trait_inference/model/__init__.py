"""trait_inference.model — Phase 2 contribution model.

Sentence-transformer embedding + constrained-decoder LLM for the
Paper 19 contribution per `phase-1-spec.md` §3.

Heavy deps (torch, transformers, sentence-transformers, outlines) are
imported only when these modules are loaded. Install via:

    pip install -e .[model]

CPU baselines + eval (trait_inference.{dataset,baselines,metrics})
work without these deps.
"""

# Lazy re-exports — importing this __init__ does NOT import torch.
__all__ = ["TraitDecoder", "TraitTrainer", "TraitSweep", "build_trait_regex"]


def __getattr__(name: str):
    """Lazy import: `from trait_inference.model import X` works without
    pulling torch unless X is actually accessed."""
    if name == "TraitDecoder":
        from trait_inference.model.decoder import TraitDecoder
        return TraitDecoder
    if name == "TraitTrainer":
        from trait_inference.model.trainer import TraitTrainer
        return TraitTrainer
    if name == "TraitSweep":
        from trait_inference.model.sweep import TraitSweep
        return TraitSweep
    if name == "build_trait_regex":
        from trait_inference.model.decoder import build_trait_regex
        return build_trait_regex
    raise AttributeError(f"module 'trait_inference.model' has no attribute {name!r}")
