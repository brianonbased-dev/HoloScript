# Release Versioning Guide

## Rule

**PyPI major tracks npm platform major unless explicitly declared independent.**

When we release a new version (e.g. `v7.0.0`) as a git tag:

- npm packages in the platform-synced lane publish at that version
- PyPI `holoscript` publishes at that version
- Both use the same tag as source of truth

## Independent packages

These follow their own semver:

- `holoscript-mesh` (PyPI) — HoloMesh Python client, versioned independently
- `holoscript-vscode` (VS Code Marketplace) — IDE extension, versioned independently
- `tree-sitter-holoscript` (npm) — grammar, versioned independently

## How it works

1. Create a git tag: `git tag v7.0.0` (example)
2. Push: `git push origin v7.0.0`
3. GitHub Actions triggers:
   - `publish-pypi.yml` → extracts version from tag → builds Python package → publishes to PyPI
   - `release-multi-platform.yml` → runs `pnpm release:publish` → publishes npm packages via changesets
4. Both registries end up at the same version

## Validation

The publish-pypi workflow validates that the tag major matches the npm root major.
If they diverge, the workflow fails with a clear error message.

## Current state (verified from repository)

- npm root `holoscript`: `7.0.0` (from `/package.json`)
- npm `@holoscript/core`: `7.0.0` (from `packages/core/package.json`)
- npm `@holoscript/engine`: `7.0.0` (from `packages/engine/package.json`)
- npm `@holoscript/mcp-server`: `7.0.0` (from `packages/mcp-server/package.json`)

For PyPI package state, verify directly at release time (do not hardcode here):

```bash
pip index versions holoscript
pip index versions holoscript-mesh
```

If npm platform lane is moved to 6.1.x, PyPI `holoscript` should follow that major on the next tagged publish.
