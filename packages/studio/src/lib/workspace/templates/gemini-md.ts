/**
 * Template generator for GEMINI.md — Gemini CLI / Gemini Code Assist instructions.
 *
 * Gemini CLI reads GEMINI.md from ~/.gemini/ (global) and project root (local).
 * Also supports /memory show for inspection of loaded instructions.
 *
 * Structure mirrors CLAUDE.md but adapted for Gemini's style preferences:
 * - Gemini prefers structured sections with clear headers
 * - Supports tool_code blocks for executable instructions
 * - Works with Gemini CLI, Gemini Code Assist, and Android Studio Gemini
 */

import type { ScaffoldDNA } from '../scaffolder';

// ─── Helpers ───────────────────────────────────────────────────────────────

function testCmd(dna: ScaffoldDNA): string {
  if (dna.techStack.includes('vitest')) return dna.techStack.includes('pnpm') ? 'pnpm vitest' : 'npx vitest';
  if (dna.techStack.includes('jest')) return dna.techStack.includes('pnpm') ? 'pnpm jest' : 'npx jest';
  if (dna.languages.includes('py')) return 'pytest';
  if (dna.languages.includes('go')) return 'go test ./...';
  if (dna.languages.includes('rs')) return 'cargo test';
  return dna.techStack.includes('pnpm') ? 'pnpm test' : 'npm test';
}

function buildCmd(dna: ScaffoldDNA): string {
  if (dna.techStack.includes('pnpm')) return 'pnpm build';
  if (dna.techStack.includes('yarn')) return 'yarn build';
  if (dna.languages.includes('go')) return 'go build ./...';
  if (dna.languages.includes('rs')) return 'cargo build';
  return 'npm run build';
}

function lintCmd(dna: ScaffoldDNA): string {
  if (dna.techStack.includes('eslint')) return dna.techStack.includes('pnpm') ? 'pnpm lint' : 'npx eslint .';
  if (dna.languages.includes('py')) return 'ruff check .';
  if (dna.languages.includes('go')) return 'golangci-lint run';
  if (dna.languages.includes('rs')) return 'cargo clippy';
  return dna.techStack.includes('pnpm') ? 'pnpm lint' : 'npm run lint';
}

function conventionSection(dna: ScaffoldDNA): string {
  const blocks: string[] = [];

  if (dna.techStack.includes('typescript')) {
    blocks.push(`**TypeScript**: Strict mode, no \`any\` (use \`unknown\`), explicit return types on exports, \`.tsx\` for JSX.`);
  }

  if (dna.languages.includes('py')) {
    blocks.push(`**Python**: Type hints required on public functions. Format with black, lint with ruff. Use pathlib.Path.`);
  }

  if (dna.languages.includes('go')) {
    blocks.push(`**Go**: Always check errors. context.Context as first I/O param. Standard layout (cmd/internal/pkg).`);
  }

  if (dna.frameworks.includes('next.js')) {
    blocks.push(`**Next.js**: App Router, Server Components by default, \`'use client'\` only when needed.`);
  } else if (dna.frameworks.includes('react')) {
    blocks.push(`**React**: Functional components only. Co-locate tests. Named exports.`);
  }

  if (dna.frameworks.includes('django')) {
    blocks.push(`**Django**: App-based structure. Models in models.py, views in views.py.`);
  }

  if (dna.frameworks.includes('fastapi')) {
    blocks.push(`**FastAPI**: Routers in routers/, schemas in schemas/. Pydantic for validation.`);
  }

  return blocks.length > 0 ? blocks.join('\n\n') : 'Follow existing codebase conventions.';
}

// ─── Main template ─────────────────────────────────────────────────────────

export function generateGeminiMd(dna: ScaffoldDNA): string {
  const isMonorepo = dna.packageCount > 1;

  return `# GEMINI.md — ${dna.name}

## Project

${dna.name} — ${isMonorepo ? `monorepo (${dna.packageCount} packages)` : 'single package'}.
Languages: ${dna.languages.join(', ') || 'not detected'}.
Frameworks: ${dna.frameworks.join(', ') || 'none'}.
Code health: ${dna.codeHealthScore}/10. Test coverage: ${dna.testCoverage}%.

## Commands

- Build: \`${buildCmd(dna)}\`
- Test: \`${testCmd(dna)}\`
- Lint: \`${lintCmd(dna)}\`

## Conventions

${conventionSection(dna)}

## Rules

1. Read files before editing. Never modify blind.
2. Prefer editing existing files over creating new ones.
3. Never commit secrets. Use \`.env\` files.
4. Git: \`git add <file>\` only. Never \`git add -A\` or \`git add .\`.
5. Test after changes: \`${testCmd(dna)}\`.
6. Fix test failures before committing.

## Decision Defaults

| Question | Answer |
|----------|--------|
| New file or existing? | Existing first |
| Ask user or decide? | Decide, explain why |
| New dependency? | Use existing first, ask before adding |
| Test failing? | Fix if yours, note if pre-existing |
${isMonorepo ? '| Which package? | Closest to the feature |\n' : ''}
## Oracle

Before asking the user architectural questions, check:
1. \`.claude/NORTH_STAR.md\` — decision trees for common choices
2. \`.claude/MEMORY.md\` — persistent project knowledge

Only ask for: novel features, budget decisions, destructive operations.

## Enhanced Features

This project uses [HoloScript](https://holoscript.net) agent infrastructure.
Activate: \`npx @holoscript/agent-setup\` or [studio.holoscript.net/start](https://studio.holoscript.net/start)
`.trimStart();
}
