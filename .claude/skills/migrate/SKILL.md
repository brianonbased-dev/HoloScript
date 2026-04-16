---
name: migrate
description: >
  Schema and API migration helper for HoloScript. When breaking changes happen
  to traits, compilers, or the .holo format, generates migration guides, updates
  examples, and patches downstream consumers. Ensures backward compatibility or
  clean breaks.
argument-hint: "[detect|guide|patch|validate] [target-path or package]"
disable-model-invocation: false
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, Task, Agent
context: fork
agent: general-purpose
project-dir: C:/Users/Josep/Documents/GitHub/HoloScript
---

# /holoscript:migrate — Migration Helper

**Command**: $ARGUMENTS

## Overview

When HoloScript makes breaking changes (new trait schema, compiler API changes,
.holo format updates), this skill helps identify affected code and generate
migration paths.

## Subcommands

### `detect` — Detect Breaking Changes
Analyze recent commits for API surface changes.

```bash
cd C:/Users/Josep/Documents/GitHub/HoloScript

echo "=== Public API Changes (since last tag) ==="
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo HEAD~20)
git diff $LAST_TAG..HEAD -- "dist/index.d.ts" "packages/core/src/types/" | head -100

echo "=== Trait Schema Changes ==="
git diff $LAST_TAG..HEAD -- "packages/core/src/constants/" | head -50

echo "=== Compiler Interface Changes ==="
git diff $LAST_TAG..HEAD -- "packages/core/src/compilers/CompilerBase.ts" | head -50
```

### `guide` — Generate Migration Guide
Create a migration guide for consumers upgrading between versions.

Steps:
1. Diff public API types between versions
2. Identify removed/renamed exports
3. Generate before/after code examples
4. List required changes per consumer package

### `patch` — Auto-Patch Downstream
Apply mechanical fixes to downstream packages affected by a migration.

```bash
cd C:/Users/Josep/Documents/GitHub/HoloScript

# Find all imports of the changed API
grep -r "import.*from.*@holoscript/core" packages/ --include="*.ts" -l
```

### `validate` — Validate Migration Completeness
Verify all consumers compile after a migration.

```bash
cd C:/Users/Josep/Documents/GitHub/HoloScript

# Build everything — any broken import will fail
pnpm build 2>&1 | grep -E "error|Error|failed" | head -20

# Run type check
pnpm tsc --noEmit 2>&1 | head -30
```

## Common Migration Patterns

| Change Type | Detection | Fix Pattern |
|---|---|---|
| Trait renamed | grep old name in constants/ | Find-replace across trait files |
| Compiler method signature | diff CompilerBase.ts | Update all *Compiler.ts subclasses |
| .holo syntax change | parser test failures | Update examples/ and tests/ |
| Package export removed | dist/index.d.ts diff | Add re-export or update consumers |
| Type narrowing | tsc --noEmit errors | Add type guards or casts |

## Important

- **Never auto-patch without showing the diff first** — migrations can be subtle
- Check `packages/plugins/` too — plugins are downstream consumers
- Trait constants in `packages/core/src/constants/` are the most common migration source
- `dist/index.d.ts` is hand-crafted via `generate-types.mjs` — never edit it directly
