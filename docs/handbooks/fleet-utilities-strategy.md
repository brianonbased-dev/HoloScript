# Fleet Utilities Strategy

HoloScript fleet utility packages are split by use case. Do not collapse them
into one catch-all package or one server profile; laptop, Jetson, Vast, and
hosted service lanes need different entrypoints, resource envelopes, and spend
guards.

## Source Of Truth

- Utility map: `scripts/holo-ci/fleet-utilities-manifest.json`.
- Coherence gate: `corepack pnpm check:fleet-utilities`.
- Package consumption gate: `corepack pnpm check:package-consumption:full`.
- HoloLlama consumption gate: `corepack pnpm check:holollama-consumption`.
- PyPI consumption gate: `corepack pnpm check:pypi-consumption`.
- v1 package lane: `scripts/holo-ci/npm-v1-release-manifest.json`.

## Utility Classes

| Utility class             | Primary package                            | Consumer lane                        | Use it for                                                                                         |
| ------------------------- | ------------------------------------------ | ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| MCP tool gateway          | `@holoscript/mcp-server`                   | laptop, Jetson, Vast, hosted service | Agent access to HoloScript tools, HoloKey/OAuth auth, board/knowledge, and fleet dispatch control. |
| HoloLlama serving planner | `@holoscript/holollama`                    | laptop, Jetson, Vast                 | llama.cpp serving plans, launch artifacts, health probes, and sovereign-device registry JSON.      |
| Headless agent runtime    | `@holoscript/holoscript-agent`             | laptop, Jetson, Vast                 | Unattended HoloMesh agent process and room/board execution worker.                                 |
| Shared memory client      | `@holoscript/memory`                       | laptop, Jetson, Vast                 | Identity-keyed memory reads/writes across agent families.                                          |
| HoloScript CLI            | `@holoscript/cli`                          | laptop, Jetson, Vast                 | Parse, validate, compile, run, package, and deploy source.                                         |
| Python bindings           | `holoscript`, `holoscript-trait-inference` | laptop, Jetson, Vast as declared     | Python runtime utilities, robotics/scientific scripts, and model-backed trait inference.           |
| GPU dispatch tools        | `@holoscript/mcp-server` MCP tools         | hosted service, Vast                 | Safe-by-default CI, world render, and paid simulation dispatch.                                    |

## HoloLlama Fleet Lifecycle

HoloLlama is fleet-operational when every target profile can produce these
receipts from the installed package:

| Check                       | Receipt schema                            | Purpose                                                                  |
| --------------------------- | ----------------------------------------- | ------------------------------------------------------------------------ |
| Serving plan                | `holollama.doctor.v1`                     | Compile launch, health, service, and sovereign-device registry files.    |
| HoloMesh read-only bridge   | `holollama.holomesh-readonly-bridge.v1`   | Resolve board, room, done-log, slot, and knowledge reads without writes. |
| llama.cpp vision preflight  | `holollama.llama-cpp-vision-preflight.v1` | Prove projector, image-token flags, and registry vision capability.      |
| Aggregate lifecycle handoff | `holollama.fleet-lifecycle.v1`            | Bind plan, preflight, mesh reads, and health probe into one receipt.     |

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
   Brain routing receipts, lifecycle receipts, read-only HoloMesh bridge
   receipts, and profile checks; it should not become the board, memory, or CI
   gateway.
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
