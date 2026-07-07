# @holoscript/sdk Compatibility Shim

`@holoscript/sdk` is a legacy compatibility shim for older Smart Asset and
HoloHub-client JavaScript consumers. It is not the primary SDK for new
HoloScript construction.

## Overview

The package remains published so existing integrations can keep importing
`HoloHubClient` and Smart Asset schemas while they migrate. New parser,
compiler, scene, trait, and runtime integrations should start from
`@holoscript/core`, with agent access through `@holoscript/mcp-server` and
command workflows through `@holoscript/cli`.

## Installation

```bash
npm install @holoscript/sdk
```

## Use When

- You already depend on `@holoscript/sdk` and need the compatibility imports to
  stay green.
- You are maintaining older Smart Asset or HoloHub-client integrations.
- You are writing migration code toward `@holoscript/core`.

## Do Not Use When

- You are starting a new HoloScript application.
- You need parser, compiler, scene, or trait APIs.
- You want the agent or fleet operating surface.

Use `@holoscript/core`, `@holoscript/cli`, `@holoscript/mcp-server`, or the
specific package that owns the capability instead.

## Validation

```bash
corepack pnpm --filter @holoscript/sdk run test
node scripts/holo-ci/check-registry-cold-start.mjs --package @holoscript/sdk@latest --probe sdk-compat-import --json
```

## See Also

- [JavaScript SDK](./sdk.md)
- [Core](./core.md)
- [CLI](./cli.md)
- [MCP Server](./mcp-server.md)
