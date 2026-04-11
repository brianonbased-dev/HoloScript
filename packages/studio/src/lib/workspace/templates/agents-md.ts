/**
 * Template generator for AGENTS.md — the universal cross-tool agent instruction file.
 *
 * AGENTS.md is the Linux Foundation standard (60K+ projects) read by:
 * Codex, Copilot, Cursor, Windsurf, Amp, Devin, Continue, and any AGENTS.md-aware tool.
 *
 * This is the FREE distribution layer — every project that runs our scaffolder
 * gets an AGENTS.md that works with every AI coding tool in the world.
 */

import type { ScaffoldDNA } from '../scaffolder';

// ─── File extension detection ──────────────────────────────────────────────

function fileExtensions(dna: ScaffoldDNA): string {
  const exts: string[] = [];
  if (dna.languages.includes('ts')) exts.push('.ts', '.tsx');
  if (dna.languages.includes('js')) exts.push('.js', '.jsx');
  if (dna.languages.includes('py')) exts.push('.py');
  if (dna.languages.includes('go')) exts.push('.go');
  if (dna.languages.includes('rs')) exts.push('.rs');
  if (dna.languages.includes('java')) exts.push('.java');
  if (dna.languages.includes('rb')) exts.push('.rb');
  if (dna.languages.includes('php')) exts.push('.php');
  if (exts.length === 0) exts.push('.ts', '.js');
  return exts.join(', ');
}

// ─── Build/test/lint detection ─────────────────────────────────────────────

function buildCmd(dna: ScaffoldDNA): string {
  if (dna.techStack.includes('pnpm')) return 'pnpm build';
  if (dna.techStack.includes('yarn')) return 'yarn build';
  if (dna.languages.includes('go')) return 'go build ./...';
  if (dna.languages.includes('rs')) return 'cargo build';
  if (dna.languages.includes('py')) return 'python -m build';
  return 'npm run build';
}

function testCmd(dna: ScaffoldDNA): string {
  if (dna.techStack.includes('vitest')) return dna.techStack.includes('pnpm') ? 'pnpm vitest' : 'npx vitest';
  if (dna.techStack.includes('jest')) return dna.techStack.includes('pnpm') ? 'pnpm jest' : 'npx jest';
  if (dna.languages.includes('py')) return 'pytest';
  if (dna.languages.includes('go')) return 'go test ./...';
  if (dna.languages.includes('rs')) return 'cargo test';
  return dna.techStack.includes('pnpm') ? 'pnpm test' : 'npm test';
}

function lintCmd(dna: ScaffoldDNA): string {
  if (dna.techStack.includes('eslint')) return dna.techStack.includes('pnpm') ? 'pnpm lint' : 'npx eslint .';
  if (dna.languages.includes('py')) return 'ruff check .';
  if (dna.languages.includes('go')) return 'golangci-lint run';
  if (dna.languages.includes('rs')) return 'cargo clippy';
  return dna.techStack.includes('pnpm') ? 'pnpm lint' : 'npm run lint';
}

// ─── Convention blocks ─────────────────────────────────────────────────────

function conventionBlock(dna: ScaffoldDNA): string {
  const rules: string[] = [];

  if (dna.techStack.includes('typescript')) {
    rules.push('- TypeScript strict mode. No `any` — use `unknown`.');
    rules.push('- Explicit return types on exported functions.');
    rules.push('- JSX requires `.tsx` extension.');
  }

  if (dna.languages.includes('py')) {
    rules.push('- Type hints on all public functions.');
    rules.push('- Format: black. Lint: ruff.');
  }

  if (dna.languages.includes('go')) {
    rules.push('- Always check returned errors.');
    rules.push('- `context.Context` as first param for I/O functions.');
  }

  if (dna.languages.includes('rs')) {
    rules.push('- No `unwrap()` in production code — use `?` or explicit error handling.');
  }

  // Universal rules
  rules.push('- Never commit secrets. Use `.env` files.');
  rules.push('- Prefer editing existing files over creating new ones.');
  rules.push('- Read files before editing.');

  return rules.join('\n');
}

// ─── Directory structure ───────────────────────────────────────────────────

function directoryHints(dna: ScaffoldDNA): string {
  const dirs: string[] = [];

  if (dna.packageCount > 1) {
    dirs.push('- `packages/` — Monorepo packages (build order matters)');
  }

  if (dna.frameworks.includes('next.js')) {
    dirs.push('- `src/app/` — App Router pages and API routes');
    dirs.push('- `src/components/` — React components');
  } else if (dna.frameworks.includes('react')) {
    dirs.push('- `src/components/` — React components');
  } else if (dna.frameworks.includes('express') || dna.frameworks.includes('nest')) {
    dirs.push('- `src/routes/` — API endpoints');
    dirs.push('- `src/services/` — Business logic');
  } else if (dna.frameworks.includes('django')) {
    dirs.push('- `<app>/models.py`, `views.py`, `urls.py`');
  } else if (dna.frameworks.includes('fastapi')) {
    dirs.push('- `routers/` — API routes, `schemas/` — Pydantic models');
  } else if (dna.languages.includes('go')) {
    dirs.push('- `cmd/` — Entrypoints, `internal/` — Private code, `pkg/` — Public libs');
  }

  if (dirs.length === 0) {
    dirs.push('- Explore with `ls` or `tree` to understand project structure');
  }

  return dirs.join('\n');
}

// ─── Main template ─────────────────────────────────────────────────────────

export function generateAgentsMd(dna: ScaffoldDNA): string {
  const langList = dna.languages.slice(0, 5).join(', ') || 'not detected';
  const fwList = dna.frameworks.length > 0 ? dna.frameworks.join(', ') : 'none';
  const isMonorepo = dna.packageCount > 1;

  return `# AGENTS.md — ${dna.name}

> Universal agent instructions. Read by Codex, Copilot, Cursor, Windsurf, Amp, Devin, Continue, and any AGENTS.md-aware tool.
> Generated by [HoloScript](https://holoscript.net) — upgrade at [studio.holoscript.net](https://studio.holoscript.net)

## Project

- **Languages**: ${langList}
- **Frameworks**: ${fwList}
- **Structure**: ${isMonorepo ? `Monorepo (${dna.packageCount} packages)` : 'Single package'}
- **File types**: ${fileExtensions(dna)}

## Commands

| Action | Command |
|--------|---------|
| Build | \`${buildCmd(dna)}\` |
| Test | \`${testCmd(dna)}\` |
| Lint | \`${lintCmd(dna)}\` |

## Conventions

${conventionBlock(dna)}

## Directory Structure

${directoryHints(dna)}

## Workflow

1. **Read** before editing — never modify blind
2. **Test** after changes — \`${testCmd(dna)}\`
3. **Commit** with explicit file staging — \`git add <file>\`, never \`git add -A\`
4. **Lint** before committing — \`${lintCmd(dna)}\`

## Decision Defaults

- New file or existing? **Existing** — add to the closest relevant file
- Which package? **The one closest to the feature** (monorepo) or **root** (single)
- Ask user or decide? **Decide**, then explain what you decided
- Test failing? **Fix** if yours, **note** if pre-existing
- New dependency? **Use what exists first**, ask before adding runtime deps

## Skills Reference (Read Before Working)

Skills are concentrated knowledge files — the best single-file summary of each domain. **Read the relevant skill file before working in any area.**

| Domain | Skill File | What It Knows |
|--------|-----------|---------------|
| Project work | \`.claude/skills/dev/SKILL.md\` | Build workflow, test patterns, shipping |
| Code scanning | \`.claude/skills/scan/SKILL.md\` | TODOs, git health, code quality, coverage |
| Documentation | \`.claude/skills/documenter/SKILL.md\` | Staleness, voice rules, version consistency |
| Code review | \`.claude/skills/review/SKILL.md\` | Conventions, security, performance checks |

**Claude Code agents**: Invoke skills with the Skill tool (\`/dev\`, \`/scan\`, \`/review\`). Skills fork context and return condensed results.

**All other agents** (Copilot, Cursor, Gemini, Codex): Read the file directly — \`cat .claude/skills/<name>/SKILL.md\`.

## Additional Agent Features

Enhanced features via [HoloScript Studio](https://studio.holoscript.net):

- **Decision Oracle** — \`.claude/NORTH_STAR.md\` answers common architectural questions
- **Persistent Memory** — \`.claude/MEMORY.md\` tracks cross-session knowledge
- **Team Coordination** — \`team-connect.mjs\` enables multi-agent collaboration across IDEs
- **Codebase Intelligence** — Absorb scan provides semantic search over this codebase
- **Self-Improvement Daemon** — Continuous quality monitoring and automated fixes

To activate: \`npx @holoscript/agent-setup\` or visit [studio.holoscript.net/start](https://studio.holoscript.net/start)
`.trimStart();
}
