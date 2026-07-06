# create-holoscript

`packages/create-holoscript` is the repo source package for first-touch
HoloScript project scaffolding. The public npm quickstart currently uses
`create-holoscript-app` because live npm deprecates `create-holoscript@1.4.0`
in favor of `create-holoscript-app@1.5.0`.

## Install

```bash
npx create-holoscript-app@latest my-world --go
```

## Use

```bash
npx create-holoscript-app my-world --go
npx create-holoscript-app my-world --template hello-world --yes
npx create-holoscript-app my-world --template 2d-revolution
agent-setup
holoscript-agents
```

## Package Surface

| Surface                | Purpose                                      |
| ---------------------- | -------------------------------------------- |
| `create-holoscript`    | Project scaffolder and `--go` local preview  |
| `agent-setup`          | Existing-repo agent infrastructure generator |
| `holoscript-agents`    | Alias for the agent setup generator          |
| `instant` template     | CDN-backed scene with no install step        |
| `hello-world` template | Vite scene with parser-backed validation     |
| `2d-revolution`        | Semantic2D React/R3F starter                 |

## Packaging Note

The workspace package is named `create-holoscript` and publishes the
`create-holoscript`, `agent-setup`, and `holoscript-agents` binaries from
`packages/create-holoscript`.

Public registry policy:

- Recommend `create-holoscript-app` for npm quickstarts while
  `create-holoscript@1.4.0` remains deprecated.
- Treat `create-holoscript` as the historical npm entry point and workspace
  filter name until a deliberate release-sync changes the registry state.
- Check both npm versions and deprecation fields before claiming they are
  release-synced.

The npm payload is build-first: `bin/` wrappers import `dist/` outputs, and the
published files list includes `bin/`, `dist/`, templates, README, and changelog.

## Strategy Role

This is a public first-touch package, not a default fleet runtime. Use it for
laptop onboarding, demos, docs quickstarts, and agent-seat setup. Fleet machines
should consume runtime packages such as `@holoscript/cli`, `@holoscript/core`,
`@holoscript/mcp-server`, and `@holoscript/holollama` directly after a project
exists.

## Validation

```bash
corepack pnpm --filter create-holoscript run build
corepack pnpm --filter create-holoscript run test
corepack pnpm run check:publish-surface
corepack pnpm run check:package-architecture
corepack pnpm run package:opportunity-map
npm view create-holoscript version deprecated
npm view create-holoscript-app version deprecated
```
