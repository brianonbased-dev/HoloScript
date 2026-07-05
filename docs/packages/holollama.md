# @holoscript/holollama

`@holoscript/holollama` is the native utility package for planning and operating
HoloLlama llama.cpp serving nodes. It does not bundle model weights or a
llama.cpp binary; it emits deterministic operating artifacts from HoloScript
serving intent.

## Install

```bash
npm install -g @holoscript/holollama
```

## CLI

```bash
holollama profiles
holollama plan --profile jetson-orin --json
holollama plan --profile laptop-windows --out ./holollama-bundle
holollama plan --code ./serve.holo --out ./holollama-bundle
```

Profiles currently describe the owned fleet lanes:

- `jetson-orin`: Linux ARM64 owned-metal serving defaults.
- `laptop-windows`: Windows laptop local model and vision/tooling defaults.
- `vast-linux-gpu`: Linux x64 GPU fleet defaults.

Common overrides include `--model`, `--model-path`, `--host`, `--port`, `--ctx`,
`--ngl`, `--parallel`, `--register-as`, `--node`, `--platform`,
`--executable`, `--service-user`, `--grammar`, and `--vision`.

## Library

```ts
import {
  buildLlamaServeComposition,
  compileHoloLlamaBundle,
  writeHoloLlamaBundleFiles,
} from '@holoscript/holollama';

const code = buildLlamaServeComposition('jetson-orin');
const bundle = compileHoloLlamaBundle({ code });
await writeHoloLlamaBundleFiles(bundle, './holollama-bundle');
```

## Canonical Role

This package is part of the v1 fleet lane. `@holoscript/core` owns parsing and
compilation, `@holoscript/mcp-server` owns the agent tool server, and
`@holoscript/holollama` owns the installable operator surface for local model
serving. The broader utility split is tracked in
`docs/handbooks/fleet-utilities-strategy.md` and enforced by
`corepack pnpm check:fleet-utilities`.
