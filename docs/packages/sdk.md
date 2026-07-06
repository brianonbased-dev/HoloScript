# @holoscript/sdk

`@holoscript/sdk` is the legacy compatibility package for older JavaScript and
TypeScript consumers. It is kept installable for existing Smart Asset and
HoloHub-client code, but new application code should start from
`@holoscript/core`.

## Install

```bash
npm install @holoscript/sdk
```

## Use

```ts
import { HoloHubClient, HoloSmartAsset } from '@holoscript/sdk';
```

## Status

This package is deprecated as a primary SDK surface. Keep it small and stable:

- Do not add new platform features here.
- Route new parser, compiler, scene, and type work through `@holoscript/core`.
- Keep exports compatible for older consumers until a future major removal.
- Keep migration docs synchronized with
  [npm Agent Package Migrations](../handbooks/npm-agent-package-migrations.md)
  and the canonical package handbook.

## Migration

Use `@holoscript/core` for new parser, compiler, scene, and trait integrations:

```bash
npm install @holoscript/core
```

```ts
import { validateComposition } from '@holoscript/core';
```

## Validation

```bash
corepack pnpm --filter @holoscript/sdk run test
corepack pnpm run check:publish-surface
corepack pnpm run check:package-architecture
corepack pnpm run package:opportunity-map
```
