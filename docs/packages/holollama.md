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

Profiles currently describe the owned fleet lanes:

- `jetson-orin`: Linux ARM64 owned-metal serving defaults.
- `laptop-windows`: Windows laptop local model and vision/tooling defaults.
- `vast-linux-gpu`: Linux x64 GPU fleet defaults.

Common overrides include `--model`, `--model-path`, `--host`, `--port`, `--ctx`,
`--ngl`, `--parallel`, `--register-as`, `--node`, `--platform`,
`--executable`, `--service-user`, `--grammar`, and `--vision`.

`holollama doctor` compiles and inspects every serving profile, then emits a
`holollama.doctor.v1` receipt proving that the profile registry handle, health
URL, and required bundle files are internally coherent.

`holollama mesh` emits a `holollama.holomesh-readonly-bridge.v1` receipt. It
resolves the read-only HoloMesh endpoints a node may consume for room, board,
messages, done-log, slot, and knowledge state without granting package-level
write authority.

`holollama preflight` emits a `holollama.llama-cpp-vision-preflight.v1` receipt.
For vision profiles it proves the multimodal projector path, llama.cpp
`--mmproj` launch flag, image-token flags, and registry vision capability are
coherent. Add `--check-filesystem` on the target node when you want local proof
that the executable, model, and projector files exist.

`holollama lifecycle` emits a `holollama.fleet-lifecycle.v1` receipt that joins
the serving plan, vision preflight, read-only HoloMesh bridge, and health-probe
stage for every fleet profile.

## Brains

HoloLlama exposes Brain routing for model-serving consumers while keeping
`skill` as a compatibility selector. Brain routing is available from both the
main package entry and the narrow `@holoscript/holollama/brain` subpath.

```ts
import { selectHoloLlamaBrain } from '@holoscript/holollama/brain';

const selection = selectHoloLlamaBrain({
  task: 'Compose eerie ambience for a cave level.',
  selectedDevice: 'jetson-orin-super',
});

console.log(selection.selectedBrain.id);
console.log(selection.selectedConsumerProfile.id);
```

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

## Canonical Role

This package is part of the v1 fleet lane. `@holoscript/core` owns parsing and
compilation, `@holoscript/mcp-server` owns the agent tool server, and
`@holoscript/holollama` owns the installable operator surface for local model
serving. The broader utility split is tracked in
`docs/handbooks/fleet-utilities-strategy.md` and enforced by
`corepack pnpm check:fleet-utilities`.

Run `corepack pnpm check:holollama-consumption` after building to prove the
built package API and CLI are consumable by laptop, Jetson, and Vast lanes. The
gate exercises `doctor`, `mesh`, `preflight`, `lifecycle`, `profiles`, and Brain
routing from built artifacts before publish.
