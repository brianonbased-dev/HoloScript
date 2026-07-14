"""holoserve — native sovereign PyTorch-direct inference for HoloRunner S0 (HOLO) models.

Graduates the loose HoloServe scripts into an installable distribution: a resident-model
OpenAI-compatible HTTP server, a deterministic offline sampler, and a byte-level NFA
constrained-decoding engine. NO llama.cpp, NO GGUF — the fully-sovereign HOLO runtime
north star (D.118).

Modules:
  tokenizer  — native byte-BPE codec (pure Python; no torch)
  grammar    — byte-level NFA constrained-decoding engine (pure Python; no torch)
  model      — the from-scratch S0 GPT (Block + GPT); requires the [model] extra (torch)
  sampler    — deterministic offline JSONL sampler; requires the [model] extra
  server     — resident-model OpenAI-compatible HTTP server; requires the [model] extra
  train      — the from-scratch GPU trainer (optional); requires the [model] extra

Entry points:
  holoserve         -> holoserve.server:main
  holoserve-sample  -> holoserve.sampler:main
"""

__version__ = "0.1.0"

# HoloModel (and the server / sampler / model / train modules) require torch, shipped via
# the [model] extra. Guard the re-export so `import holoserve`, `import holoserve.grammar`,
# and `import holoserve.tokenizer` all stay import-clean in a torch-free install — the
# grammar + tokenizer surfaces carry no heavy deps. (Mirrors trait-inference, which keeps
# its heavy model module out of package import and behind the same [model] extra.)
try:
    from holoserve.server import HoloModel  # noqa: F401  (re-exported public surface)
except ImportError:  # torch not installed — grammar + tokenizer still import cleanly.
    HoloModel = None
