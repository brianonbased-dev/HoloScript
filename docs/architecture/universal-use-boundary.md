# Universal Use Boundary

HoloScript is a general-purpose semantic systems programming language. Its
source and contract model is universal; spatial programs are one first-class
domain. General-purpose does not mean every builder should clone the full engine
monorepo, edit internals, or run the founder/operator workspace.

The stable product boundary is:

```text
.holo / .hsplus / .hs source
  -> parser / validator / runtime / compiler
  -> MCP, CLI, Studio, service APIs, or generated target artifacts
  -> receipts, provenance, deployment outputs
```

The engine repo is for building HoloScript itself. Customer and team work should
live in workspace repos, project files, service configuration, plugins,
connectors, and receipts.

## Use Modes

| Mode                     | Actor                                        | Owns                                                                          | Uses                                                                   | Should not require                                                           |
| ------------------------ | -------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Scaffolded local project | Builder using `create-holoscript` or the CLI | Project source, assets, local config                                          | Public npm packages and local runtime                                  | Editing `packages/core` or service internals                                 |
| Hosted MCP/API consumer  | Agent, app, or CI job                        | Bearer token, request payloads, workspace/project state                       | `mcp.holoscript.net`, public tools, OAuth tools                        | Cloning the HoloScript repo                                                  |
| Studio workspace         | Product team or account                      | Workspace repo, linked repos, agent config, knowledge, board/project state    | Studio, Absorb, MCP, orchestrator, connectors                          | Founder-local paths, private hooks, GOLD, wallets, or internal board history |
| Service/container image  | Operator or enterprise deployment            | Runtime config, mounted workspace/project data, env/secrets, plugin allowlist | Versioned image exposing health, MCP/API, compiler/runtime entrypoints | Baking user state into the image or patching core for normal use             |
| Engine contribution      | Platform contributor or core agent           | HoloScript monorepo changes                                                   | pnpm workspace packages, tests, preflight, HoloCI                      | Customer secrets or account workspace state                                  |

## Image Contract

A HoloScript service image should behave like a stable execution envelope, not a
fork invitation.

The image provides:

- parser, validator, runtime, compiler, and MCP/API entrypoints;
- health/version/discovery endpoints;
- a plugin and connector loading contract;
- receipt/provenance emission;
- bounded filesystem/network/secret access through configured policy.

The caller provides:

- `.holo`, `.hsplus`, and `.hs` source files;
- workspace/project data and assets;
- environment variables and secret handles;
- auth token or client credentials;
- selected plugins/connectors and compile targets;
- output directory, artifact store, or deployment target.

The image must not require:

- writing into `packages/*` for ordinary projects;
- copying founder-local `.env`, GOLD, hooks, wallets, or board state;
- running from `C:/Users/...` paths;
- a mutable checkout of the full monorepo just to parse, validate, compile, or
  serve a user composition.

## Extension Order

When a user or agent needs new behavior, prefer this order:

1. Express it in `.holo`, `.hsplus`, or `.hs`.
2. Use an existing trait, compiler, connector, or MCP tool discovered at runtime.
3. Add a domain plugin or connector.
4. Add a workspace-level service contract or adapter.
5. Change HoloScript core only when the missing behavior is a platform primitive.

If normal customer work repeatedly reaches step 5, the product boundary is
leaking. Turn that pattern into a trait, plugin, connector, compiler target, or
service contract.

## Verification

Use the strongest gate for the touched surface:

| Surface              | Verification                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| Local source/project | `holoscript validate`, CLI smoke, or project tests                                                        |
| MCP/API consumer     | health/discovery response plus tool call receipt                                                          |
| Studio workspace     | provisioned workspace id, linked repo, scoped key, and account-tier checks                                |
| Service image        | container start, health endpoint, discovery endpoint, sample compile, mounted workspace read/write policy |
| Engine repo          | `pnpm preflight` for changed packages, targeted tests, and HoloCI status                                  |

Do not use visual previews as solver or safety evidence unless a receipt path
also proves the relevant contract.

## Design Rule

Universal use means one owned source can travel across runtimes and services.
It does not mean one repository or one image contains every account, secret,
agent, board, and workspace.

Keep these boundaries separate:

- **Language source**: `.holo`, `.hsplus`, `.hs`.
- **Engine**: parser, runtime, compiler, traits, plugins, connectors.
- **Service envelope**: MCP/API/Studio/image exposing stable entrypoints.
- **Workspace**: account/project state, memory, linked repos, board, policies.
- **Founder control plane**: private operations and dogfood state, never a
  customer artifact.
