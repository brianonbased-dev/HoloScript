# create-holoscript

`create-holoscript` is the repo-canonical npm scaffolder for first-touch
HoloScript projects. It is the fastest public entry point for creating a local
scene, trying the `instant` zero-install template, or bootstrapping agent setup
files into an existing workspace.

## Install

```bash
npm create holoscript@latest my-world -- --go
# or
npx create-holoscript@latest my-world --go
```

## Use

```bash
npx create-holoscript my-world --go
npx create-holoscript my-world --template hello-world --yes
npx create-holoscript my-world --template 2d-revolution
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
`create-holoscript`, `agent-setup`, and `holoscript-agents` binaries. The
published `create-holoscript-app` package is a compatibility sibling from the
same repo path; check both npm versions before claiming they are release-synced.

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
npm view create-holoscript version
npm view create-holoscript-app version
```
