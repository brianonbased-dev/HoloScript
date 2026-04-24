"""trait-inference — Paper 19 (ATI) training pipeline + baselines + eval.

See ai-ecosystem/research/paper-19-trait-inference/{phase-1-spec,
preregistration}.md for the frozen spec.

Modules:
  dataset    — schema, JSONL loader, splits, audit (CPU-only)
  baselines  — keyword + TF-IDF + few-shot baselines (CPU-only)
  metrics    — F1 macro, exact-match, validity rate, bootstrap CI
  cli        — argparse runner; entrypoint `trait-inference`

Optional (install [model] extra):
  model      — sentence-transformer encoder + constrained-decoder LLM
  trainer    — training loop (PyTorch + transformers)
"""

__version__ = "0.1.0"

# Re-export commonly used types so callers can `from trait_inference import Pair`.
from trait_inference.dataset import (  # noqa: F401
    Pair,
    Source,
    Split,
    audit,
    load_jsonl,
    write_jsonl,
)
