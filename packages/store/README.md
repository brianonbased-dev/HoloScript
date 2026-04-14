# HoloScript Store

Local-first package registry for the HoloScript ecosystem. Built on Verdaccio (npm-compatible).

## Quick Start

```bash
# From HoloScript root
cd packages/store
pnpm install
npm start
# → http://localhost:4873
```

Or use the unified launcher:
```powershell
.\scripts\holoscript-local.ps1 -Service store
```

## Package Scopes

| Scope | Type | Access |
|-------|------|--------|
| `@holoscript/*` | Core packages | Free, open |
| `@traits/*` | .hsplus behaviors | Free, community |
| `@plugins/*` | Domain plugins | Free, community |
| `@compilers/*` | Bridge compilers | Free, community |
| `@scenes/*` | .holo spatial content | Free, community |
| `@templates/*` | Starter projects | Free, community |
| `@experiences/*` | HoloLand worlds | Free, community |
| `@premium/*` | Paid content | x402 gated (future) |

## Usage

```bash
# Register (first time)
npm adduser --registry http://localhost:4873

# Publish a package
npm publish --registry http://localhost:4873

# Install from local store
pnpm add @holoscript/core --registry http://localhost:4873
```

## Architecture

```
Store (Verdaccio :4873)     ← npm-compatible registry
  ├── storage/              ← package tarballs + metadata (gitignored)
  ├── plugins/              ← auth plugins (HoloMesh wallet + htpasswd)
  └── config.yaml           ← scopes, uplinks, auth
```

The store proxies npmjs.org — any package not found locally is fetched and cached for offline use.

**Production**: `store.holoscript.net` (Railway, same config)
**Local**: `localhost:4873` (offline-capable with cached packages)

## Local MCP Server

Run the full HoloScript stack locally:
```powershell
.\scripts\holoscript-local.ps1           # Start all
.\scripts\holoscript-local.ps1 -Status   # Check status
.\scripts\holoscript-local.ps1 -Stop     # Stop all
```
