# Release Versioning Guide

## Rule

**PyPI major tracks npm platform major unless explicitly declared independent.**

When we release `v6.1.0` as a git tag:

- npm packages in the platform-synced lane publish at `6.1.0`
- PyPI `holoscript` publishes at `6.1.0`
- Both use the same tag as source of truth

## Independent packages

These follow their own semver:

- `holoscript-mesh` (PyPI) — HoloMesh Python client, versioned independently
- `holoscript-vscode` (VS Code Marketplace) — IDE extension, versioned independently
- `tree-sitter-holoscript` (npm) — grammar, versioned independently

## How it works

1. Create a git tag: `git tag v6.1.0`
2. Push: `git push origin v6.1.0`
3. GitHub Actions triggers:
   - `publish-pypi.yml` → extracts `6.1.0` from tag → builds Python package → publishes to PyPI
   - `release-multi-platform.yml` → runs `pnpm release:publish` → publishes npm packages via changesets
4. Both registries end up at `6.1.0`

## Validation

The publish-pypi workflow validates that the tag major matches the npm root major.
If they diverge, the workflow fails with a clear error message.

## Current state

- npm `@holoscript/core`: `6.0.3` (platform lane)
- PyPI `holoscript`: `5.3.1` (will jump to 6.x on next release)
- PyPI `holoscript-mesh`: `0.1.0` (independent)

The jump from PyPI 5.3.1 to 6.x is intentional — aligning with the npm platform major.
