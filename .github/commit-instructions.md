# Commit Message Instructions

Generate commit messages that reflect only explicitly staged files.

## Required workflow

- Assume explicit-path staging only: `git add <file>` and `git commit <file> -m`.
- Keep one logical scope per commit.
- Mention only files/features actually included in staged diff.

## Never suggest

- `git add -A`
- `git add .`
- `git commit -a`
- bare `git commit -m` in shared-index workflows

## Message format

- Use Conventional Commits: `<type>(<scope>): <summary>`
- Keep subject concise and factual.
- If multiple bullets are generated, they must all map to staged changes.

## Scope hygiene

- Prefer canonical scopes already used in this repo.
- Do not invent unrelated scopes from unstaged or external work.
