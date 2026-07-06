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
