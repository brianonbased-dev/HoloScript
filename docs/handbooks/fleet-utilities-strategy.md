# Fleet Utilities Strategy

HoloScript fleet utility packages are split by use case. Do not collapse them
into one catch-all package or one server profile; laptop, Jetson, Vast, and
hosted service lanes need different entrypoints, resource envelopes, and spend
guards.

## Source Of Truth

- Utility map: `scripts/holo-ci/fleet-utilities-manifest.json`.
- Hardware app envelopes:
  `scripts/holo-ci/hardware-app-envelopes-manifest.json`.
- Hardware app gate:
  `node scripts/holo-ci/check-hardware-app-envelopes.mjs`.
- Package architecture gate: `corepack pnpm check:package-architecture`.
- Coherence gate: `corepack pnpm check:fleet-utilities`.
- Published package consumption bar: `corepack pnpm check:package-consumption`
  (live registry cold-start for `@holoscript/core`, `@holoscript/cli`, and
  `@holoscript/mcp-server`). Local pack/wheel extras still run through
  `corepack pnpm check:package-consumption:full`, which also requires that
  published install.
- HoloLlama consumption gate: `corepack pnpm check:holollama-consumption`.
- PyPI consumption gate: `corepack pnpm check:pypi-consumption`.
- v1 package lane: `scripts/holo-ci/npm-v1-release-manifest.json`.

Fleet utilities are implementation inventory; hardware app envelopes are the
public consumption surface. The envelope manifest groups utilities into utility
bands such as tool gateway, local runtime, sovereign AI serving, semantic proof,
XR embodiment, Python science, and fleet dispatch so a hardware owner sees a
coherent app instead of a package matrix.

Continuous capability is tracked in the same envelope manifest. Each hardware
app declares telemetry signals, stale-after windows, readiness requirements,
retention, privacy boundaries, and failure response. Treat missing telemetry as
an explicit degraded state; paid dispatch and physical-world claims fail closed.
Use `node scripts/holo-ci/capture-hardware-telemetry.mjs` to emit
`holoscript.hardware-telemetry-capture/v1` receipt bundles from that manifest;
use `--interval-ms` and `--iterations` for bounded continuous capture. The
runner may execute repo and live-service checks only when explicitly requested.
HoloShell, MCP, and receipt-family sources stay custody-owned: pass their JSON,
JSONL, or NDJSON receipts with `--receipt` or `--receipt-dir` so the hardware
app envelope can cite the evidence without bypassing HoloShell consent,
HoloKey, spend-policy, or local-machine custody.

## Utility Classes

| Utility class              | Primary package                            | Consumer lane                        | Use it for                                                                                            |
| -------------------------- | ------------------------------------------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| MCP tool gateway           | `@holoscript/mcp-server`                   | laptop, Jetson, Vast, hosted service | Agent access to HoloScript tools, HoloKey/OAuth auth, board/knowledge, and fleet dispatch control.    |
| HoloLlama serving operator | `@holoscript/holollama`                    | laptop, Jetson, Vast                 | llama.cpp serving plans, launch artifacts, live lifecycle proofs, and sovereign-device registry JSON. |
| Headless agent runtime     | `@holoscript/holoscript-agent`             | laptop, Jetson, Vast                 | Unattended HoloMesh agent process and room/board execution worker.                                    |
| Shared memory client       | `@holoscript/memory`                       | laptop, Jetson, Vast                 | Identity-keyed memory reads/writes across agent families.                                             |
| HoloScript CLI             | `@holoscript/cli`                          | laptop, Jetson, Vast                 | Parse, validate, compile, run, package, and deploy source.                                            |
| XR embodiment runtime      | `@holoscript/xr-embodiment`                | laptop, Jetson, Vast                 | Shared locomotion and avatar substrate for WebXR clients and agent NPC embodiment.                    |
| Python bindings            | `holoscript`, `holoscript-trait-inference` | laptop, Jetson, Vast as declared     | Python runtime utilities, robotics/scientific scripts, and model-backed trait inference.              |
| GPU dispatch tools         | `@holoscript/mcp-server` MCP tools         | hosted service, Vast                 | Safe-by-default CI, world render, and paid simulation dispatch.                                       |

## Parked Runtime Seeds

`@holoscript/holo-runtime` is not a fleet utility as of 2026-07-07. It remains a
version-policy-managed HoloRunner decoder seed, but its default tokenizer bridge
loads from `HOLOAI_ECOSYSTEM_ROOT` or `~/.ai-ecosystem`; that is not enough for a
clean laptop, Jetson, or Vast package-consumption promise. Add it to
`fleet-utilities-manifest.json` only after the tokenizer bridge is public or
fully parameterized and a concrete model-fleet consumer has pack/cold-start
coverage across the declared hardware lanes.

## HoloLlama Fleet Lifecycle

HoloLlama is fleet-operational when every target profile can produce these
receipts from the installed package:

| Check                       | Receipt schema                            | Purpose                                                                  |
| --------------------------- | ----------------------------------------- | ------------------------------------------------------------------------ |
| Serving plan                | `holollama.doctor.v1`                     | Compile launch, health, service, and sovereign-device registry files.    |
| HoloMesh read-only bridge   | `holollama.holomesh-readonly-bridge.v1`   | Resolve board, room, done-log, slot, and knowledge reads without writes. |
| llama.cpp vision preflight  | `holollama.llama-cpp-vision-preflight.v1` | Prove projector, image-token flags, and registry vision capability.      |
| Live lifecycle doctor       | `holollama.lifecycle-doctor.v1`           | Prove systemd, health, models, and tiny completion on a running node.    |
| Aggregate lifecycle handoff | `holollama.fleet-lifecycle.v1`            | Bind plan, preflight, mesh reads, health, and optional live proof.       |

`corepack pnpm check:holollama-consumption` exercises those receipts from the
built CLI before npm publish. Node-local filesystem proof remains opt-in through
`holollama preflight --check-filesystem` so CI can validate package structure
without requiring model weights or a llama.cpp binary.

## PyPI Consumption Discipline

`corepack pnpm check:pypi-consumption` builds each declared PyPI package,
runs `twine check`, inspects the wheel and sdist for import packages and console
entry points, and compares local package versions to the live PyPI registry.
`current` means the local version matches PyPI, `publish-update` means the local
artifact is ready for a new upload, and `local-behind` is a blocker.

## MCP Sizing Profiles

Use `MCP_SERVER_SIZE` or `holoscript-mcp-http --size <profile>`.

| Profile                                | Use case                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------ |
| `tiny`                                 | Local smoke tests and constrained stdio probes.                          |
| `laptop`                               | Founder laptop or HoloShell local agent tooling.                         |
| `jetson`                               | Owned-metal Jetson edge node with tighter connection and memory budgets. |
| `vast`                                 | Single Vast.ai GPU worker or render/inference utility node.              |
| `fleet`                                | Hosted coordinator or multi-worker fleet gateway.                        |
| `small`, `standard`, `large`, `xlarge` | Backward-compatible generic profiles for existing deployments.           |

Resolved sizing is exposed in `GET /health`, `GET /api/health`, and the
programmatic `getMcpServerSizing()` export.

## Strategy

1. Keep `@holoscript/holollama` narrow: it emits deterministic serving bundles,
   Brain routing receipts, lifecycle receipts, live node proofs, read-only
   HoloMesh bridge receipts, and profile checks; it should not become the
   board, memory, or CI gateway.
2. Keep `@holoscript/mcp-server` as the authenticated tool gateway and dispatch
   control plane; it should expose profile choices without bundling model
   weights or fleet secrets.
3. Keep Python packages for Python-native runtime and model utility work, not as
   replacements for npm fleet packages.
4. Add new utility classes to the manifest before promoting them into the v1
   fleet lane.
5. Treat paid or credentialed fleet actions as MCP tools with preview-first,
   fail-closed behavior; local packages may plan and inspect, but should not
   hide fleet spend.
6. Public hardware consumption should enter through a hardware app envelope
   before it talks about individual packages. See
   `docs/architecture/hardware-app-envelopes.md`.
