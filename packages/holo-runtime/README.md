# @holoscript/holo-runtime

Pure TypeScript CPU decoder seed for HoloRunner S0 checkpoints.

M1 scope:

- Loads the S0 PyTorch `state_dict` key shape used by `train_holorunner_s0.py`.
- Runs a decoder-only transformer on CPU with matmul, layernorm, exact-erf GELU, softmax, causal self-attention, KV cache, and sampler primitives.
- Imports the academy `holorunner-tokenizer-v0.mjs` module directly at runtime instead of copying tokenizer logic.
- Exposes `HOLO_RUNTIME_MODEL_FLEET_NODE_KIND` so the runtime is registered as a `@model_fleet` node kind, not a parallel system.

The loader accepts JSON-safe tensor records:

```ts
import { HoloRuntimeDecoder, loadHoloRunnerS0StateDict } from '@holoscript/holo-runtime';

const loaded = loadHoloRunnerS0StateDict({
  config: { vocab_size: 512, n_layer: 4, n_head: 4, n_embd: 128, block_size: 128 },
  state: {
    'tok.weight': { shape: [512, 128], data: [...] },
    'pos.weight': { shape: [128, 128], data: [...] },
    // blocks.N.* tensors, final lnf.*, and head.weight
  },
});

const decoder = new HoloRuntimeDecoder(loaded);
const logits = decoder.forward([1, 42, 7]).logits;
```

Set `HOLOAI_ECOSYSTEM_ROOT` to point at the private academy repo if it is not at `~/.ai-ecosystem`.
