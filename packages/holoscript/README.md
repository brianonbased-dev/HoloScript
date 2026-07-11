# @holoscript/sdk

Legacy compatibility package for older HoloScript JavaScript and TypeScript
consumers.

## Install

```bash
npm install @holoscript/sdk
```

## Use

```ts
import { HoloHubClient, HoloSmartAsset } from '@holoscript/sdk';
```

## Status

This package is deprecated as the primary SDK. It remains published so existing
Smart Asset and HoloHub-client integrations keep working, but new parser,
compiler, scene, and trait integrations should use `@holoscript/core`.

Do not add new platform features here. Treat this package as a small
compatibility shim until a future major version removes it.

## Related Packages

- `@holoscript/core` - canonical parser, compiler, scene, and trait APIs
- `@holoscript/cli` - command-line workflows
- `@holoscript/mcp-server` - MCP tools for AI agents and IDEs

## Validation

```bash
corepack pnpm --filter @holoscript/sdk run test
```

## Package boundary & release posture

`@holoscript/sdk` is a **v0-preview**, deprecated compatibility shim for **external** and **public** JavaScript/TypeScript consumers — Smart Asset authors and HoloHub-client integrators, including agent framework tooling — who have not yet migrated to `@holoscript/core`.

It **does not ship** any private workspace, founder-local credentials, or hosted backend. `HoloHubClient` is caller-owned config: you bring your own `apiKey` and `endpoint` (from your own deployment's environment variables); if you omit them the client falls back to a placeholder default endpoint (`https://api.holohub.io/v1`) that is not a live service this package operates. Nothing here assumes a specific machine or workspace beyond what you supply.

**Known limitations:** `HoloHubClient.fetchAsset` / `publishAsset` / `searchAssets` currently read and write an in-memory mock registry, not a real network endpoint — treat it as a wire-shape-correct stub, not a production HoloHub client, until a live service is wired in. This package is deprecated and frozen at the `@holoscript/core` surface it re-exports; do not add new features here. Rollback for existing consumers is simply pinning the last published `6.x` version before it is removed in a future major release.
