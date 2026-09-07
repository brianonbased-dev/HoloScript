# npm Package Canonicalization

This handbook is the routing layer above raw npm publication state. The npm
registry can contain historical, compatibility, and experimental packages; that
does not make every live package a current cold-consume surface.

## Source Of Truth

- Current v1 release candidates:
  `scripts/holo-ci/npm-v1-release-manifest.json`.
- Owned laptop, Jetson, and Vast consumption matrix:
  `scripts/holo-ci/package-consumption-manifest.json`.
- Differentiated fleet utilities:
  `scripts/holo-ci/fleet-utilities-manifest.json`.
- Workspace public-package allowlist:
  `scripts/holo-ci/publish-surface-allowlist.json`.
- Package docs and ownership:
  `docs/packages/index.md`, `docs/packages/governance.md`, and
  `docs/PACKAGE_OWNERSHIP.md`.
- Package doc mold checker and starter generator:
  `corepack pnpm check:package-doc-mold` and
  `node scripts/holo-ci/package-doc-mold.mjs --emit --package <name>`.
- Git-history plus Absorb-cache package opportunity map:
  `corepack pnpm package:opportunity-map`.
- Legacy agent package migrations:
  `docs/handbooks/npm-agent-package-migrations.md`.

Use live npm evidence before changing this document:

```powershell
$uri = 'https://registry.npmjs.org/-/v1/search?text=%40holoscript&size=250&quality=0.0&popularity=1.0&maintenance=0.0'
(Invoke-RestMethod -Uri $uri).objects | ForEach-Object { $_.package.name }
```

## Canonical Lanes

| Lane                      | Packages                                                                                                                                                                                                                                                                                                            | Rule                                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| v1 fleet                  | `@holoscript/core`, `@holoscript/cli`, `@holoscript/mcp-server`, `@holoscript/memory`, `@holoscript/holollama`, `@holoscript/holoscript-agent`, `@holoscript/xr-embodiment`                                                                                                                                         | Must pass release readiness, package consumption, pack, and cold-install checks before publish.                                               |
| next cognition wave       | `@holoscript/uaal`, `@holoscript/agent-protocol`, `@holoscript/framework`, `@holoscript/holo-vm`                                                                                                                                                                                                                    | Public and strategically important, but not promoted into the v1 fleet lane until cold-consume closure is proven.                             |
| parked model-runtime seed | `@holoscript/holo-runtime`                                                                                                                                                                                                                                                                                          | Version-policy managed, but parked outside v1, package-consumption, and fleet utility manifests until tokenizer and cold-consume proof exist. |
| supported tooling         | `@holoscript/core-types`, `@holoscript/wasm`, `@holoscript/formatter`, `@holoscript/linter`, `@holoscript/lsp`, `tree-sitter-holoscript`                                                                                                                                                                            | Keep documented and installable, but do not treat as fleet-required by default.                                                               |
| supported runtime         | `@holoscript/engine`, `@holoscript/runtime`, `@holoscript/mesh`, `@holoscript/crdt`, `@holoscript/crdt-spatial`, `@holoscript/mvc-schema`, `@holoscript/snn-webgpu`, `@holoscript/holoembed`, `@holoscript/security-sandbox`, `@holoscript/secrets-broker`, `@holoscript/platform`, `@hololand/platform-services` | Keep as composable runtime modules; promote only when a consumer lane needs them directly.                                                    |
| domain plugins            | `@holoscript/plugin-*`, `@holoscript/*-plugin`, `@holoscript/qm-bridge`, `@holoscript/domain-plugin-template`, `@holoscript/assimp-plugin`                                                                                                                                                                          | Long-tail packages. Each needs its own receipt before being promoted into a default install path.                                             |
| connectors                | `@holoscript/connector-*`                                                                                                                                                                                                                                                                                           | Product integrations, not default fleet packages. Publish/update only with credential and platform contract review.                           |
| service packages          | `@holoscript/*-service`, `@holoscript/*-api`, `@holoscript/graphql-api`, `@holoscript/registry`, `@holoscript/marketplace-api`                                                                                                                                                                                      | Prefer service deployment artifacts over public library promises unless a client package is intentionally carved out.                         |

## Legacy And Redundant Names

Do not unpublish historical packages. Use deprecation notices, docs, and shim
packages so existing consumers get a clear migration path.

| Legacy package             | Canonical replacement                                                         | Action                                                                                                                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@holoscript/parser`       | `@holoscript/core`                                                            | Deprecated on npm; keep docs pointing at core parser exports.                                                                                                                                      |
| `@holoscript/compiler`     | `@holoscript/core` and `@holoscript/cli`                                      | Deprecated on npm; compiler implementations live in core and user commands live in CLI.                                                                                                            |
| `@holoscript/traits`       | `@holoscript/core`                                                            | Deprecated on npm; traits are not a standalone canonical package.                                                                                                                                  |
| `@holoscript/agent-sdk`    | `@holoscript/framework`, `@holoscript/mesh`, `@holoscript/memory`             | Deprecated on npm; see `docs/handbooks/npm-agent-package-migrations.md`.                                                                                                                           |
| `@holoscript/intelligence` | `@holoscript/framework`, `@holoscript/holoscript-agent`, `@holoscript/memory` | Deprecated on npm; see `docs/handbooks/npm-agent-package-migrations.md`.                                                                                                                           |
| `@holoscript/state-sync`   | `@holoscript/crdt`, `@holoscript/crdt-spatial`, `@holoscript/mesh`            | Deprecated on npm; see `docs/handbooks/npm-agent-package-migrations.md`.                                                                                                                           |
| `holoscript`               | `@holoscript/cli`                                                             | Keep only as an optional compatibility wrapper if revived; the canonical install is scoped.                                                                                                        |
| `create-holoscript`        | `create-holoscript-app`                                                       | Live npm currently deprecates `create-holoscript@1.4.0` in favor of `create-holoscript-app@1.5.0`; keep source in `packages/create-holoscript` and release-sync both names before claiming parity. |
| `@holoscript/sdk`          | `@holoscript/core`                                                            | Compatibility shim only; do not describe as the primary SDK.                                                                                                                                       |

## Next Package Strategy

1. Keep the v1 fleet lane small until every package has a cold-install proof on
   laptop, Jetson, and Vast.
2. Promote the cognition wave next, starting with `@holoscript/uaal` only after
   the VM package has the same pack/install/consumer checks as HoloLlama.
3. Keep `@holoscript/holo-runtime` parked until its tokenizer bridge no longer
   depends on the private academy repo by default and the package has a
   laptop/Jetson/Vast cold-consumption proof.
4. Keep npm deprecation messages synced with
   `scripts/holo-ci/npm-deprecation-manifest.json` before publishing more domain
   packages.
5. Convert registry-live-but-local-private packages into one of two states:
   public and supported with docs/tests, or deprecated with a replacement path.
6. Treat domain plugins as marketplace inventory, not core install surface, until
   each plugin has a human-readable receipt and a package-level smoke test.
7. Before scaffolding a new package, run `corepack pnpm package:opportunity-map`
   and prefer fostering an existing hot public package when the map shows docs,
   governance, or ownership gaps.

## Package Doc Mold

Newly fostered package pages should use the same minimum shape so the curation
lane stays mechanical instead of memory-based:

- `Install`
- `Use`
- `Package Surface`
- `Strategy Role`
- `Validation`

Generate a starter from the package manifest when possible:

```powershell
node scripts/holo-ci/package-doc-mold.mjs --emit --package @holoscript/ui
```

Then edit the surface and strategy text with package-specific evidence, add the
page to `docs/packages/index.md` and `docs/packages/governance.md`, and run:

```powershell
corepack pnpm check:package-doc-mold
```

## Required Checks

Run these before claiming the npm surface is coherent:

```powershell
corepack pnpm check:publish-surface
corepack pnpm check:package-architecture
corepack pnpm check:package-doc-mold
node scripts/holo-ci/check-npm-v1-release-readiness.mjs --require-built
corepack pnpm check:npm-deprecations
corepack pnpm check:holollama-consumption
corepack pnpm check:registry-cold-start
corepack pnpm check:package-consumption
corepack pnpm check:package-consumption:full
corepack pnpm check:fleet-utilities
```

For live registry drift, also run the registry search command from this handbook
and compare live-only packages against the legacy table above.
