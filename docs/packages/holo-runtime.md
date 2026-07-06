# @holoscript/holo-runtime

`@holoscript/holo-runtime` is the pure TypeScript CPU decoder seed for
HoloRunner S0 checkpoints. It loads JSON-safe HoloRunner state dictionaries,
runs a decoder-only transformer on CPU, bridges to the private HoloRunner
tokenizer module, and advertises itself as a `@model_fleet` node kind.

## Install

```bash
npm install @holoscript/holo-runtime
```

## Use

```ts
import { readFile } from 'node:fs/promises';
import {
  HoloRuntimeDecoder,
  loadHoloRunnerS0StateDict,
  type HoloRunnerS0StateDictInput,
} from '@holoscript/holo-runtime';

const checkpoint = JSON.parse(
  await readFile('checkpoints/holorunner-s0.json', 'utf8'),
) as HoloRunnerS0StateDictInput;
const loaded = loadHoloRunnerS0StateDict(checkpoint);

const decoder = new HoloRuntimeDecoder(loaded);
const logits = decoder.forward([1, 42, 7]).logits;
```

Real checkpoints must provide the full S0 tensor set documented in the package
README.

## Boundary

This package is not the browser scene runtime and not the bytecode VM:

- `@holoscript/runtime` executes compiled HoloScript scene compositions in web
  environments.
- `@holoscript/holo-vm` executes HoloScript bytecode workloads.
- `@holoscript/holo-runtime` executes HoloRunner S0 model checkpoints as a
  sovereign CPU decoder seed.

Keep model-weight custody, HoloRunner training artifacts, and private academy
tokenizer source outside this public package. The package imports the tokenizer
module from `HOLOAI_ECOSYSTEM_ROOT` or `~/.ai-ecosystem` at runtime instead of
copying private tokenizer logic into the public repo.

## Strategy Role

This package is experimental model-runtime infrastructure. It is public and
allowlisted so HoloRunner checkpoint consumers can install the decoder API, but
it is not part of the v1 fleet consumption lane. Promote it only after the model
fleet has cold-consume checks and a concrete laptop, Jetson, or Vast consumer.

## Validation

```bash
corepack pnpm --filter @holoscript/holo-runtime run build
corepack pnpm --filter @holoscript/holo-runtime run test
corepack pnpm run check:publish-surface
corepack pnpm run check:package-architecture
corepack pnpm run package:opportunity-map
```
