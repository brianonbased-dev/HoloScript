# npm v1 Release Readiness

HoloScript npm publishing is green-lit by an explicit candidate set, not by every
workspace package that happens to be public. The candidate set lives in
`scripts/holo-ci/npm-v1-release-manifest.json`.

## V0 vs V1

- V0 package: installable or useful for internal agents, but not yet promised as
  a stable cold-consume surface.
- V1 package: a package a fresh user or agent can install from npm, import or run
  from documented entrypoints, and trust as part of the public HoloScript runway.

V1 candidates must have npm metadata, a bounded `files[]` surface, built
entrypoints, non-private runtime dependencies, and registry versions that will
not strand public installers on unpublished `@holoscript/*` pins.

## Green-Light Flow

Run these before publish:

```bash
corepack pnpm run check:publish-surface
corepack pnpm run check:package-architecture
corepack pnpm run check:npm-v1-release
corepack pnpm build
corepack pnpm run check:npm-v1-release:built
corepack pnpm check:holollama-consumption
corepack pnpm check:registry-cold-start
corepack pnpm check:package-consumption
corepack pnpm release:guard
node scripts/audit-published-install-tree.mjs @holoscript/cli@latest
```

`check:package-consumption` is the published consumption bar. A raw
`node scripts/holo-ci/check-package-consumption-matrix.mjs` run requires the
existing registry cold-start probes (`core-holo-webgpu`, `cli-bin-help`,
`mcp-server-sizing`). Metadata-only no longer counts as a pass. Use
`--skip-registry-cold-start` only for local PyPI/pack lanes that are not the
consumption bar.

`corepack pnpm` is intentional on local Codex seats because this repo pins
`pnpm@9.15.9`; a newer global pnpm can try to rewrite or purge the install tree.

Use `corepack pnpm release:publish` only after those checks are green. The root
`publish` script stays blocked so raw `pnpm publish` cannot bypass the gates.

## Current Candidate Lane

The first v1 npm lane is intentionally small:

- `@holoscript/core`: language core and cold importer surface.
- `@holoscript/cli`: `holoscript` and `hs` binary.
- `@holoscript/mcp-server`: agent MCP package for universal use.
- `@holoscript/memory`: shared sovereign memory client used by MCP and fleet
  agents.
- `@holoscript/holollama`: native local model serving utilities for HoloLlama
  llama.cpp nodes.
- `@holoscript/holoscript-agent`: headless HoloMesh agent runtime.
- `@holoscript/xr-embodiment`: reusable VR/WebXR embodiment layer.

Packages outside the manifest can still exist, build, or be published later, but
they are not green-lit by this lane until they are added intentionally and pass
the same checks.

2026-07-07 lane decision: `@holoscript/holo-runtime` remains parked outside the
npm v1 manifest. It is version-policy managed and documented, but its default
tokenizer bridge still resolves `HOLOAI_ECOSYSTEM_ROOT` or `~/.ai-ecosystem`;
do not promote it until a clean npm consumer can pack, import, and run the
decoder without the private academy repo.

## Canonicalization

The npm registry also contains historical split packages, compatibility shims,
domain plugins, services, and experimental packages. The v1 manifest is the
fleet lane, not the full registry surface. Use
[npm package canonicalization](./npm-package-canonicalization.md) to decide
whether a package is canonical, next-wave, plugin inventory, service-only, or a
legacy name that should receive an npm deprecation notice.

`@holoscript/uaal`, `@holoscript/agent-protocol`, `@holoscript/framework`, and
`@holoscript/holo-vm` are the next cognition wave, but they stay outside the v1
fleet manifest until the same cold-install and package-consumption checks are
green for laptop, Jetson, and Vast. `@holoscript/holo-runtime` is narrower: it
stays parked until the tokenizer bridge is public/parameterized and a real
model-fleet consumer proves the laptop, Jetson, and Vast package lanes.
