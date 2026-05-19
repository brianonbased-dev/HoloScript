# Release Versioning Guide

## Rule

**Package versions are lane-managed. Do not assume every workspace package shares the same major.**

When we release a new version tag:

- npm packages in the platform-synced lane publish at that version
- PyPI `holoscript` publishes at that version
- Both use the same tag as source of truth

## Independent packages

These follow their own semver:

- `holoscript-mesh` (PyPI) — HoloMesh Python client, versioned independently
- `holoscript-vscode` (VS Code Marketplace) — IDE extension, versioned independently
- `tree-sitter-holoscript` (npm) — grammar, versioned independently

## How it works

1. Create a git tag for the release lane.
2. Push the tag.
3. GitHub Actions triggers:
   - `publish-pypi.yml` → extracts version from tag → builds Python package → publishes to PyPI
   - `release-multi-platform.yml` → runs `pnpm release:publish` → publishes npm packages via changesets
4. Both registries end up at the same version

## Validation

The publish-pypi workflow validates that the tag major matches the npm root major.
If they diverge, the workflow fails with a clear error message.

## Current state

Verify from repository manifests at release time:

```bash
node -p "require('./package.json').version"
node -p "require('./packages/core/package.json').version"
node -p "require('./packages/engine/package.json').version"
node -p "require('./packages/mcp-server/package.json').version"
pnpm version:check
```

For PyPI package state, verify directly at release time (do not hardcode here):

```bash
pip index versions holoscript
pip index versions holoscript-mesh
```

If a lane moves, update `scripts/version-policy.json`, rerun `pnpm version:check`, and only then update registry-facing copy.
