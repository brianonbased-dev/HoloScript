---
name: release
description: >
  Release management for HoloScript monorepo. Handles changeset generation,
  version bumping, changelog generation, npm publish coordination across packages,
  and git tagging. Uses changesets and pnpm workspace conventions.
argument-hint: "[status|changeset|version|publish|tag <version>]"
disable-model-invocation: false
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, Task, Agent
context: fork
agent: general-purpose
project-dir: C:/Users/Josep/Documents/GitHub/HoloScript
---

# /holoscript:release — Release Management

**Command**: $ARGUMENTS

## Overview

Coordinate releases across the HoloScript monorepo. Handles the full lifecycle
from changeset creation to npm publish.

## Subcommands

### `status` — Release Readiness Check
```bash
cd C:/Users/Josep/Documents/GitHub/HoloScript

echo "=== Pending Changesets ==="
ls .changeset/*.md 2>/dev/null | grep -v README || echo "None"

echo "=== Current Versions ==="
for pkg in packages/*/package.json; do
  name=$(python3 -c "import json; print(json.load(open('$pkg'))['name'])")
  ver=$(python3 -c "import json; print(json.load(open('$pkg'))['version'])")
  echo "  $name@$ver"
done

echo "=== Unpublished Commits ==="
git log --oneline $(git describe --tags --abbrev=0 2>/dev/null || echo HEAD~10)..HEAD --no-merges | head -20

echo "=== Test Status ==="
pnpm test -- --run 2>&1 | tail -5
```

### `changeset` — Create a Changeset
Interactive changeset creation for the current work.

```bash
cd C:/Users/Josep/Documents/GitHub/HoloScript
pnpm changeset
```

### `version` — Bump Versions
Apply pending changesets to bump package versions and update changelogs.

```bash
cd C:/Users/Josep/Documents/GitHub/HoloScript
pnpm changeset version
```

### `publish` — Publish to npm
Publish all changed packages to the npm registry.

```bash
cd C:/Users/Josep/Documents/GitHub/HoloScript

# Verify build first
pnpm build

# Dry run
pnpm changeset publish --dry-run

# Actual publish (requires confirmation)
echo "Ready to publish. Awaiting confirmation..."
```

### `tag <version>` — Git Tag
Create and push a git tag for a release.

```bash
cd C:/Users/Josep/Documents/GitHub/HoloScript
git tag -a "v$1" -m "Release v$1"
echo "Tag v$1 created. Push with: git push origin v$1"
```

## Release Checklist

1. All tests passing (`pnpm test`)
2. Build succeeds (`pnpm build`)
3. Changesets describe all user-facing changes
4. CHANGELOG.md entries are clear and accurate
5. Version bumps follow semver (breaking = major, feature = minor, fix = patch)
6. `docs/NUMBERS.md` verification commands still work
7. No hardcoded stats in docs or skills

## Package Publishing Order

Core must publish first due to workspace dependencies:
1. `@holoscript/core`
2. `@holoscript/engine`
3. All other packages (parallel)
4. `@holoscript/mcp-server` (last — depends on everything)
