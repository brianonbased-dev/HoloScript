# npm and PyPI Push Plan

This is the release-prep lane for publishing HoloScript packages to npm and
PyPI. It is intentionally conservative: registry pushes are irreversible enough
that a clean evidence pass comes before any publish command.

## Operating Rule

Do not publish from a dirty or ambiguous tree. Start from `main`, isolate release
changes, validate the package surfaces, then publish only the packages whose
registry state requires it.

If the registry checks report that every package is already current, stop. The
next release needs a version bump, changeset, or release tag before another
push.

## Registry Surfaces

Use the manifests as the source of truth instead of hand-curated package lists:

- npm v1 candidates: `scripts/holo-ci/npm-v1-release-manifest.json`
- cross-registry consumption gates:
  `scripts/holo-ci/package-consumption-manifest.json`
- version policy: `scripts/version-policy.json`

The npm path is changeset-managed. The PyPI path is tag/workflow-managed unless
Joseph explicitly asks for a local manual upload.

## Preflight

Run these from the repository root before publishing:

```bash
corepack pnpm run check:publish-surface
corepack pnpm run check:package-architecture
corepack pnpm run check:package-stewardship
corepack pnpm run build:package-release-closure
corepack pnpm run check:npm-v1-release
corepack pnpm run check:npm-v1-release:built
corepack pnpm run check:package-consumption:full
corepack pnpm run check:pypi-consumption
corepack pnpm run check:pypi-extras-resolution
corepack pnpm run release:guard
```

Use `--json --out-dir .scratch/<date>-release-push-plan/<gate>` on gates that
support machine-readable output. Scratch evidence is disposable; promote only
summaries or durable release notes into tracked docs.

## npm Push

Publish npm packages through the existing release script:

```bash
corepack pnpm release:publish
```

That script owns npm auth checks, changeset status, release guards, and publish
ordering. Do not replace it with ad hoc `npm publish` loops.

Publish only when `check:npm-v1-release` or the changeset release flow reports a
package that needs a first publish or a newer registry version. If every npm
candidate is already published at the local version, the correct action is a
no-op.

## PyPI Push

Preferred path:

1. Create the release tag after npm/PyPI preflight passes.
2. Push the tag.
3. Let the PyPI workflow build and publish from the tag.

Manual local upload is a break-glass path only. If it is explicitly requested,
build from the package directory, verify the wheel/sdist through the consumption
gates, then upload with a token supplied through environment variables:

```bash
python -m build
python -m twine check dist/*
python -m twine upload dist/*
```

Use `TWINE_USERNAME=__token__` and a `TWINE_PASSWORD` or equivalent secret
environment variable. Never write PyPI tokens into tracked files, command
history, release notes, or `.pypirc`.

## Decision Matrix

| Gate result                                | Action                                                                 |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| npm already published and PyPI current     | Stop; no registry push is needed.                                      |
| npm needs publish, PyPI current            | Run the npm release script after all preflight gates pass.             |
| npm current, PyPI needs publish            | Use the tag/workflow path or explicit manual PyPI upload.              |
| either registry reports a version mismatch | Fix version policy, changesets, or package metadata before publishing. |
| any consumption gate fails                 | Fix package contents before publishing.                                |

## After Publish

Re-run the registry checks and commit or attach the resulting release evidence:

```bash
corepack pnpm run check:npm-v1-release
corepack pnpm run check:pypi-consumption
corepack pnpm run check:pypi-extras-resolution
```

If a push was performed, the final release note should include the git commit,
tag, registry URLs, and the commands that passed.
