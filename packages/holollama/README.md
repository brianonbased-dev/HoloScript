# @holoscript/holollama

Native HoloScript utilities for HoloLlama llama.cpp serving nodes.

This package does not bundle model weights or a llama.cpp binary. It turns an
authorable `@llama_serve` HoloScript block into deterministic operating
artifacts: launch command, PowerShell launcher, systemd unit, Windows S4U task,
health probe, and sovereign-device registry JSON.

## CLI

```bash
npm install -g @holoscript/holollama

holollama profiles
holollama plan --profile jetson-orin --json
holollama plan --profile laptop-windows --out ./holollama-bundle
holollama plan --code ./serve.holo --out ./holollama-bundle
```

Profiles are operating defaults for the fleet lanes, not hardware claims:

- `jetson-orin`: owned-metal Linux ARM64 text serving lane.
- `laptop-windows`: founder laptop Windows vision/tooling lane.
- `vast-linux-gpu`: Linux GPU fleet lane.

Override the authored plan with flags such as `--model`, `--model-path`,
`--host`, `--port`, `--ctx`, `--ngl`, `--parallel`, `--register-as`, `--node`,
`--platform`, `--executable`, `--service-user`, `--grammar`, and `--vision`.

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

## Serving Strategy

`@holoscript/core` owns parsing and compilation. `@holoscript/mcp-server` exposes
agent tools. `@holoscript/holollama` is the installable operating surface for
owned local model serving. Fleet hosts consume this package to author, inspect,
and materialize serving bundles without installing the full MCP server.
