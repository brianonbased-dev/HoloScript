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
holollama contract --profile laptop-windows --json
holollama lifecycle --team-id team_... --json
holollama lifecycle --profile jetson-orin --live --team-id team_... --json
holollama lifecycle --profile jetson-orin --live --code ./serve.holo --json
holollama harness --out ./.ai-ecosystem --team-id local-team --json
holollama profiles
holollama brains
holollama brain --task "compose eerie ambience for a cave level" --json
holollama plan --profile jetson-orin --json
holollama plan --profile laptop-windows --out ./holollama-bundle
holollama plan --code ./serve.holo --out ./holollama-bundle
```

Profiles are operating defaults for the fleet lanes, not hardware claims:

- `jetson-orin`: owned-metal Linux ARM64 text serving lane, using a native
  `/opt/holoscript/llama.cpp/build-holo/bin/llama-server`, Qwen3 base model,
  and Brittney LoRA adapter.
- `laptop-windows`: founder laptop Windows vision/tooling lane.
- `vast-linux-gpu`: Linux GPU fleet lane.

HoloLlama is not an Ollama wrapper. The Jetson profile expects a native
llama.cpp build owned by the HoloLlama lane; `lifecycle --live` rejects
Ollama-owned `llama-server` binaries, model/LoRA drift, ignored GPU layers,
unsafe prompt-cache ceilings, and unified-memory pressure.

## Public `.ai-ecosystem` Harness

`.ai-ecosystem` is the harness pattern for cloud frontier families and local
agents: a small operating folder that gives agents durable rules, receipt
commands, package entrypoints, and secret boundaries. The founder private
`.ai-ecosystem` repo is not shipped to users.

HoloLlama includes a clean-room starter at
`templates/ai-ecosystem-basic`. Copy that folder into a new project's
`.ai-ecosystem` when an outside human or AI agent needs a minimal HoloLlama
operating harness. The template points agents at package commands such as
`holollama doctor`, `holollama profiles`, `holollama lifecycle`, and
`holollama lifecycle --live`; it does not assume founder paths, GOLD, private
MCP keys, or local research state.

Use the installer instead of copying by hand:

```bash
holollama harness --out ./.ai-ecosystem --team-id local-team --json
```

The command refuses to overwrite changed harness files unless `--force` is
provided, scans the installed files for founder-private anchors and filled env
secrets, then writes `doctor`, `lifecycle`, and install receipts under
`.ai-ecosystem/receipts/holollama/`.

Override the authored plan with flags such as `--model`, `--model-path`,
`--host`, `--port`, `--ctx`, `--ngl`, `--parallel`, `--register-as`, `--node`,
`--platform`, `--executable`, `--service-user`, `--grammar`, and `--vision`.

Operational receipts:

- `doctor`: compiles profile artifacts and emits `holollama.doctor.v1`.
- `mesh`: resolves read-only HoloMesh board, room, done-log, slot, and
  knowledge endpoints as `holollama.holomesh-readonly-bridge.v1`.
- `preflight`: proves llama.cpp vision flags and registry capability as
  `holollama.llama-cpp-vision-preflight.v1`.
- `contract`: proves fleet-bench server contract as
  `holollama.llama-cpp-server-contract.v1`: text profiles omit `--mmproj` and
  image-token flags, vision profiles include the intended projector and image
  token window, and sovereign-device registry entries expose `capabilities[]`
  with base endpoints for fleet-router discovery.
- `lifecycle`: joins plan, server-contract, preflight, runtime-readiness, mesh
  bridge, and health probe stages as `holollama.fleet-lifecycle.v1`.
  Runtime-readiness is the launched-node gate for benchmark/routing callers:
  port owner, stale `llama-server` cleanup, `/v1/models` multimodal capability,
  and `/props.modalities.vision`.
- `lifecycle --live`: probes a live HoloLlama node, attaches
  `holollama.lifecycle-doctor.v1`, and promotes it into the lifecycle as a
  `live-lifecycle` stage. The live probe checks optional systemd service state,
  read-only SSH/procfs footprint, `/health`, `/v1/models`, and a tiny
  OpenAI-compatible completion. The footprint check catches Jetson-class drift:
  wrong `llama-server` binary, model/LoRA path drift, ignored GPU layers, unsafe
  prompt-cache ceilings, RSS pressure against unified memory, and swap already
  in use. Use
  `--endpoint`, `--host`, `--key`, `--unit`, `--models-path`, `--timeout-ms`,
  `--prompt`, `--max-tokens`, `--no-systemd`, `--no-footprint`, and
  `--require-systemd` to adapt the same package to Jetson, laptop, and Vast
  fleet lanes. `HOLOLLAMA_ENDPOINT`, `JETSON_HOST`, and `JETSON_KEY` are honored
  by the CLI. Pass `--code <composition.holo>` to compile an authored
  `@llama_serve` composition and use its resolved executable, model, LoRA,
  context, GPU-layer, and cache-RAM fields as the live footprint contract. The
  authored contract is merged over the selected public profile, so private
  machine paths stay outside the published reference profiles while drift still
  fails closed. In lifecycle mode, `--code` requires positive systemd and
  SSH/procfs footprint evidence; `--no-systemd` or `--no-footprint` therefore
  produces a blocked receipt instead of weakening the authored contract.

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
  observeHoloLlamaModelWorkspace,
  probeHoloLlamaLiveLifecycle,
  summarizeModelWorkspaceSignal,
  writeHoloLlamaBundleFiles,
} from '@holoscript/holollama';

const code = buildLlamaServeComposition('jetson-orin');
const bundle = compileHoloLlamaBundle({ code });
await writeHoloLlamaBundleFiles(bundle, './holollama-bundle');

const report = doctorHoloLlamaProfiles();
console.log(report.ok);

const live = await probeHoloLlamaLiveLifecycle({
  profile: 'jetson-orin',
  endpoint: 'http://jetson.local:18080', // or set HOLO_LLAMA_JETSON_ENDPOINT
  skipSystemd: true,
});
console.log(live.runtimeState);

const workspace = await observeHoloLlamaModelWorkspace({
  endpoint: 'http://127.0.0.1:8080',
  model: 'holorunner-s0',
  prompt: 'composition "',
  layers: [1],
  positions: [-1],
  k: 10,
});
console.log(workspace.status, workspace.modelWorkspaceReceipt?.observation);
if (workspace.modelWorkspaceReceipt) {
  console.log(summarizeModelWorkspaceSignal(workspace.modelWorkspaceReceipt));
}
```

`observeHoloLlamaModelWorkspace` is a typed client and verifier for HoloServe's
read-only `/v1/model-workspace/observe` endpoint. It health-checks the backend,
requires a model-bound `jacobian_lens` capability, recomputes the integer-domain
observation and receipt hashes, binds the receipt to the requested prompt,
layers, positions, k, model, and advertised lens, and validates the safety
envelope. The advertised v0.2 capability must bind the exact
`full-distribution-v1` measurement profile and `uncorrected-logit-lens-v1`
control profile; a downgraded capability or receipt fails closed. It accepts
only the honest estimator/parity contracts:
`explicit_pair_average_v0` with `paperParity: false`, or
`corpus_position_average_v1` with `paperParity: true`,
`parityScope: reference-estimator-only`, and `paperExperimentParity: false`.
For every v0.2 receipt it also requires internally consistent requested versus
normalized token positions, original/observed token counts, and an explicit
`none` or `left-truncate-to-model-block-size` policy, so a clipped
prompt cannot pass as an untruncated measurement.
`summarizeModelWorkspaceSignal` validates a v0.2 source receipt and emits a
hash-bound signal receipt using the server-computed, cross-runtime deterministic
mean full-vocabulary mapped/control JSD. HoloLlama also verifies both sparse
tail masses, the complete-distribution metric bounds, target-fidelity lens gain,
exact mass conservation, coordinate count, and summary arithmetic. Historical v0.1 receipts remain
verifiable, but cannot be promoted into the new signal profile.

The JSD signal is a preregistered HoloScript candidate, not Anthropic's
target-token rank/pass@k evaluation and not a paper-parity claim. Target-relative
metrics diagnose lens fidelity only. Neither signal is intent, truth, identity,
consciousness, or policy authority.
Standard llama.cpp/GGUF HoloLlama nodes fail closed because they do not expose
differentiable hidden states. The client never synthesizes a latent readout from
request/response traces and exposes no intervention method.

## Serving Strategy

`@holoscript/core` owns parsing and compilation. `@holoscript/mcp-server` exposes
agent tools. `@holoscript/holollama` is the installable operating surface for
owned local model serving. Fleet hosts consume this package to author, inspect,
materialize, and live-prove serving bundles without installing the full MCP
server.

Run `corepack pnpm check:holollama-consumption` after building to prove the
built API and CLI are consumable by laptop, Jetson, and Vast fleet lanes. The
gate exercises the operational receipts from built artifacts before publish.

## Package boundary & release posture

This is a **v0-preview** operator tool for planning, inspecting, and live-proving
llama.cpp serving nodes. It **does not ship** any private workspace, wallet, or
owned-metal path: every host, endpoint, and storage coordinate is env-driven
(`HOLO_LLAMA_JETSON_ENDPOINT`, `HOLO_LLAMA_JETSON_SSH_HOST`,
`HOLO_LLAMA_JETSON_MODELS_DIR`, …). The shipped `jetson-orin` profile is a
clearly-labeled **reference**, **not the package default** — point it at your own
node before use.

**Known limitations:** the built-in profiles cover the laptop / Jetson / Vast
lanes only; other hosts need a new profile. The live-lifecycle probe assumes a
reachable `llama-server` and systemd unit that _you_ supply, and it reports state
rather than performing any rollback of a running server — the tool inspects, you
operate. Interfaces may change before the v1 release.
