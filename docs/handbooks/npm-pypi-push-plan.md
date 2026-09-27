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

That script is `node scripts/holo-ci/release-publish.mjs`. It runs package
stewardship, the release-closure build, `check-npm-v1-release-readiness --require-built`,
`release-guard`, local cold-repro, and the pre-publish install-tree audit, then
`changeset publish`, then the registry cold-start and published-tree audits.
Do not replace it with ad hoc `npm publish` loops. Root `pnpm publish` and
`pnpm changeset:publish` exit 1.

Changesets CLI 2.31.1 (locked in `pnpm-lock.yaml`) has no `--filter` and no
package allowlist. `changeset publish` options are otp, tag, and gitTag. It
publishes every non-private workspace package whose `package.json` version is
missing from the npm version list. `.changeset/config.json` `ignore` is not
consulted on that path, so adding a package to `ignore` does not hold it.

## Single-package npm publish

Unset, `release:publish` stays full-fleet. To publish only named packages,
set the allowlist. The flag name is `RELEASE_PUBLISH_ALLOWLIST`. The argv form
is `--packages`. They must name the same set when both are present. An empty
value fails closed and does not mean "publish everything".

```bash
RELEASE_PUBLISH_ALLOWLIST=@holoscript/llm-provider corepack pnpm release:publish
```

```bash
corepack pnpm release:publish --packages=@holoscript/llm-provider
```

Comma-separate names for more than one package. The allowlist gate
(`scripts/holo-ci/release-publish-allowlist.mjs`) refuses when:

- the allowlist is empty
- a named package is not a public workspace package
- a named package is not an unpublished tip (changeset would not ship it)
- an allowlisted package shares a changeset `fixed` or `linked` group with a
  different unpublished package
- an allowlisted package depends on an unpublished package outside the allowlist
- an outsider has never been published, so there is no registry version to hold

When the only problem is other unpublished tips that already exist on npm, the
command snapshots those `package.json` versions to the npm `latest` tag (or, if
that tag is missing, the highest published semver), re-runs the gate, and
continues only if the remaining publish set is exactly the allowlist. `changeset publish` then runs. The original tip versions
are restored afterward, including when publish fails. A receipt is written
under the OS temp dir for the duration of that window:
`node scripts/holo-ci/release-publish-allowlist.mjs --restore-receipt <file>`.

That hold is part of `release:publish`. It is not a second publish command.
The gate itself still fails while a stray unpublished package is on the publish
set; the snapshot exists so the re-check can pass without shipping the stray
and without leaving the git tip versions changed.

Publish only when a package needs a first publish or a newer registry version.
If every npm candidate is already published at the local version, the correct
action is a no-op.

## What this does not do

- It does not merge, tag, or run `release:publish` by itself.
- It does not choose which unpublished tips get a Chief-of-Staff GO.
- It does not bump, revert, or ignore those tips in git. The hold lasts for
  one publish process and then puts the working-tree manifests back.
- It does not make `scripts/holo-ci/publish-npm-package.mjs` a fleet ship path.
  That helper remains a tarball/repair tool. Fleet npm ship stays
  `release:publish`.

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
