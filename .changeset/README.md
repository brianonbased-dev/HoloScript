# Changesets

This directory is used by [Changesets](https://github.com/changesets/changesets) to manage versioning and changelogs for the HoloScript monorepo.

## Adding a changeset

```bash
pnpm changeset
```

Follow the prompts to select the packages that changed and describe the changes.

## Version lanes

Packages are grouped into lanes per `scripts/version-policy.json`:

- **platform-v5** (fixed): core, cli, agent-protocol, agent-sdk, holo-vm, snn-webgpu, uaal, vm-bridge
- **tooling-v3** (linked): benchmark, formatter, fs, linter, lsp, mcp-server, registry, runtime, std, test, visual, wasm
- **services-v1**: ai-validator, animation-presets, compiler, crdt, engine, intelligence, etc.
- **experimental-v0**: studio, r3f-renderer, adapter-postgres, auth, graphql-api

Fixed groups always bump together. Linked groups bump together only when one has a major/minor change.
