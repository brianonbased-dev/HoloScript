# @holoscript/holo-runtime

Pure TypeScript CPU decoder seed for HoloRunner S0 checkpoints.

## Install

```bash
npm install @holoscript/holo-runtime
```

M1 scope:

- Loads the S0 PyTorch `state_dict` key shape used by `train_holorunner_s0.py`.
- Runs a decoder-only transformer on CPU with matmul, layernorm, exact-erf GELU, softmax, causal self-attention, KV cache, and sampler primitives.
- Imports the academy `holorunner-tokenizer-v0.mjs` module directly at runtime instead of copying tokenizer logic.
- Exposes `HOLO_RUNTIME_MODEL_FLEET_NODE_KIND` so the runtime is registered as a `@model_fleet` node kind, not a parallel system.

The loader accepts JSON-safe tensor records:

```ts
import { readFile } from 'node:fs/promises';
import {
  HoloRuntimeDecoder,
  loadHoloRunnerS0StateDict,
  type HoloRunnerS0StateDictInput,
} from '@holoscript/holo-runtime';

const checkpoint = JSON.parse(
  await readFile('checkpoints/holorunner-s0.json', 'utf8')
) as HoloRunnerS0StateDictInput;
const loaded = loadHoloRunnerS0StateDict(checkpoint);

const decoder = new HoloRuntimeDecoder(loaded);
const logits = decoder.forward([1, 42, 7]).logits;
```

Set `HOLOAI_ECOSYSTEM_ROOT` to point at the private academy repo if it is not at `~/.ai-ecosystem`.

## Release Lane Decision

As of 2026-07-07, `@holoscript/holo-runtime` is parked outside the npm v1 release
manifest, package-consumption matrix, and fleet utility map. The decoder builds
and tests, but the default tokenizer bridge still resolves
`HOLOAI_ECOSYSTEM_ROOT` or `~/.ai-ecosystem`, so a clean npm consumer does not
yet have the tokenizer module by default.

Promote it only after the tokenizer bridge is public or fully parameterized,
`npm pack` plus cold-import checks pass, and a real laptop, Jetson, or Vast
model-fleet consumer needs the package as an operational utility.

## Boundary

`@holoscript/holo-runtime` is not the browser scene runtime and not the bytecode
VM. Use `@holoscript/runtime` for compiled HoloScript scene execution and
`@holoscript/holo-vm` for HoloScript bytecode workloads. This package is the
experimental HoloRunner S0 model-checkpoint decoder.

Keep model weights, private training artifacts, and tokenizer source outside
the public package.

## Validation

```bash
corepack pnpm --filter @holoscript/holo-runtime run build
corepack pnpm --filter @holoscript/holo-runtime run test
```

## Package boundary & release posture

This is a **v0-preview** package for external and agent framework consumers who
want a pure-CPU decoder for HoloRunner S0 checkpoints. It **does not ship** any
model weights, training data, or founder-local tooling — you bring your own
checkpoint JSON, and if you need the tokenizer bridge, you supply your own
`HOLOAI_ECOSYSTEM_ROOT` path; nothing here assumes that repo is present by
default. The package boundary stops at the decoder and loader — training,
quantization, and the browser/bytecode runtimes stay in their own packages
(`@holoscript/runtime`, `@holoscript/holo-vm`).

**Known limitations:** the default tokenizer bridge still resolves
`HOLOAI_ECOSYSTEM_ROOT` or `~/.ai-ecosystem`, so a cold npm consumer does not
have the tokenizer module until they supply their own academy checkout; this
package is parked outside the v1 release manifest until that bridge is public
or fully parameterized. Interfaces may change before promotion.
