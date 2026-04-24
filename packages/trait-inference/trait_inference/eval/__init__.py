"""trait_inference.eval — Phase 4 evaluation harness.

Per `phase-1-spec.md` §4: bootstrap-CI metrics + ablation matrix +
required user study analysis.

Modules:
  ablations  — 5-row ablation matrix runner per spec §3.5
"""

__all__ = ["AblationMatrix", "AblationConfig", "AblationResult"]


def __getattr__(name: str):
    if name in {"AblationMatrix", "AblationConfig", "AblationResult"}:
        from trait_inference.eval.ablations import (
            AblationConfig,
            AblationMatrix,
            AblationResult,
        )
        return locals()[name]
    raise AttributeError(f"module 'trait_inference.eval' has no attribute {name!r}")
