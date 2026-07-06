# @holoscript/holollama

Native HoloScript utilities for HoloLlama llama.cpp serving nodes.

This package does not bundle model weights or a llama.cpp binary. It turns an
authorable `@llama_serve` HoloScript block into deterministic operating
artifacts: launch command, PowerShell launcher, systemd unit, Windows S4U task,
health probe, and sovereign-device registry JSON.

## CLI

```bash
npm install -g @holoscript/holollama

holollama doctor --json
holollama mesh --profile jetson-orin --team-id team_... --json
holollama preflight --profile laptop-windows --json
holollama lifecycle --team-id team_... --json
holollama profiles
holollama brains
holollama brain --task "compose eerie ambience for a cave level" --json
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

Operational receipts:

- `doctor`: compiles profile artifacts and emits `holollama.doctor.v1`.
- `mesh`: resolves read-only HoloMesh board, room, done-log, slot, and
  knowledge endpoints as `holollama.holomesh-readonly-bridge.v1`.
- `preflight`: proves llama.cpp vision flags and registry capability as
  `holollama.llama-cpp-vision-preflight.v1`.
- `lifecycle`: joins plan, preflight, runtime-readiness, mesh bridge, and
  health probe stages as `holollama.fleet-lifecycle.v1`. Runtime-readiness is
  the launched-node gate for benchmark/routing callers: port owner, stale
  `llama-server` cleanup, `/v1/models` multimodal capability, and
  `/props.modalities.vision`.

## Brains

HoloLlama exposes `Brain` as the product-facing selector unit. `skill` remains
accepted as a compatibility alias for older Claude-style callers, but package
receipts return Brain-shaped fields.

```ts
import { selectHoloLlamaBrain } from '@holoscript/holollama/brain';

const selection = selectHoloLlamaBrain({
  task: 'Compose eerie ambience for a cave level.',
  selectedDevice: 'jetson-orin-super',
});

console.log(selection.selectedBrain.id); // audio
console.log(selection.selectedCompatibilitySkill.id); // audio
```

The selector returns the selected Brain, compatibility skill metadata, consumer
profile, scoring evidence, and the `holollama-brain-router.selection.v1` receipt
schema. This lets Jetson, desktop HoloShell, npm consumers, and future language
bridges share one canonical router. The same exports are re-exported from the
main package entry; the `/brain` subpath stays dependency-light for edge
appliances that only need routing receipts.

## Library

```ts
import {
  buildLlamaServeComposition,
  compileHoloLlamaBundle,
  doctorHoloLlamaProfiles,
  writeHoloLlamaBundleFiles,
} from '@holoscript/holollama';

const code = buildLlamaServeComposition('jetson-orin');
const bundle = compileHoloLlamaBundle({ code });
await writeHoloLlamaBundleFiles(bundle, './holollama-bundle');

const report = doctorHoloLlamaProfiles();
console.log(report.ok);
```

## Serving Strategy

`@holoscript/core` owns parsing and compilation. `@holoscript/mcp-server` exposes
agent tools. `@holoscript/holollama` is the installable operating surface for
owned local model serving. Fleet hosts consume this package to author, inspect,
and materialize serving bundles without installing the full MCP server.

Run `corepack pnpm check:holollama-consumption` after building to prove the
built API and CLI are consumable by laptop, Jetson, and Vast fleet lanes. The
gate exercises the operational receipts from built artifacts before publish.
