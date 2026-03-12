# Working Tree Triage

Use this playbook when your local HoloScript branch has many unrelated changes and you need to isolate one workstream quickly.

## Goal

Keep each commit scoped to one concern (docs, studio, core runtime, tests) so PRs are reviewable and safe to merge.

## Fast Triage Workflow

1. Inspect high-level status:

```bash
git status --short
```

1. Stage only the files for your current scope:

```bash
git add docs/.vitepress/config.ts docs/packages/index.md
```

1. Verify staged set before commit:

```bash
git diff --staged --name-only
```

1. Commit only that scope:

```bash
git commit -m "docs: update package navigation"
```

## If You Need To Pause Unrelated Work

Stash only specific paths instead of stashing everything:

```bash
git stash push -m "wip-studio" packages/studio packages/test temp
```

Restore later:

```bash
git stash list
git stash pop stash@{0}
```

## Safe Patterns

- Prefer explicit path adds: `git add path/to/file`.
- Keep docs commits docs-only.
- Keep generated files out of commits unless intentionally versioned.
- Run the smallest relevant validation before commit.

## Common Split Strategy

1. Docs + navigation
2. CI/workflows
3. Runtime/core code
4. Studio UI
5. Tests and fixtures

This keeps each change set focused and easier to revert or cherry-pick.
