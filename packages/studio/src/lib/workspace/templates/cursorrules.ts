/**
 * Template generator for .cursorrules — Cursor IDE agent instructions.
 *
 * Cursor reads .cursorrules from the project root. It also supports
 * scoped rules in .cursor/rules/*.mdc with activation modes.
 * Character limits: 6K per rule, 12K total.
 *
 * We generate the root .cursorrules file (always active) and keep it
 * under the 6K limit by focusing on what Cursor needs beyond AGENTS.md.
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

function lintCmd(dna: ScaffoldDNA): string {
  if (dna.techStack.includes('eslint')) return dna.techStack.includes('pnpm') ? 'pnpm lint' : 'npx eslint .';
  if (dna.languages.includes('py')) return 'ruff check .';
  if (dna.languages.includes('go')) return 'golangci-lint run';
  if (dna.languages.includes('rs')) return 'cargo clippy';
  return dna.techStack.includes('pnpm') ? 'pnpm lint' : 'npm run lint';
}

function stackRules(dna: ScaffoldDNA): string {
  const rules: string[] = [];

  if (dna.techStack.includes('typescript')) {
    rules.push('- Use TypeScript strict mode. Never use `any`. Use `unknown` for uncertain types.');
    rules.push('- Prefer `interface` for object shapes, `type` for unions/intersections.');
    rules.push('- Use `.tsx` for files containing JSX.');
  }

  if (dna.languages.includes('py')) {
    rules.push('- Add type hints to all public functions.');
    rules.push('- Use pathlib.Path instead of os.path.');
  }

  if (dna.languages.includes('go')) {
    rules.push('- Always handle errors. Never discard with `_`.');
    rules.push('- Use context.Context as first parameter for I/O functions.');
  }

  if (dna.frameworks.includes('next.js')) {
    rules.push('- Use Server Components by default. Only add `\'use client\'` when needed.');
    rules.push('- App Router: pages in app/, API routes in app/api/.');
  }

  if (dna.frameworks.includes('react')) {
    rules.push('- Functional components only. No class components.');
    rules.push('- Co-locate tests: Component.test.tsx next to Component.tsx.');
  }

  return rules.length > 0 ? rules.join('\n') : '- Follow existing codebase patterns.';
}

// ─── Main template ─────────────────────────────────────────────────────────

export function generateCursorRules(dna: ScaffoldDNA): string {
  const isMonorepo = dna.packageCount > 1;

  return `# ${dna.name} — Cursor Rules

You are working on ${dna.name}${isMonorepo ? `, a monorepo with ${dna.packageCount} packages` : ''}.
Languages: ${dna.languages.join(', ') || 'not detected'}.
Frameworks: ${dna.frameworks.join(', ') || 'none'}.

## Stack Rules

${stackRules(dna)}

## Workflow

- Read files before editing. Never modify blind.
- Test after changes: \`${testCmd(dna)}\`
- Lint before commit: \`${lintCmd(dna)}\`
- Git: explicit \`git add <file>\`, never \`git add -A\` or \`git add .\`
- Prefer editing existing files over creating new ones.
- Never commit secrets. Use \`.env\`.

## Decisions

- New file or existing? Existing first.
- Ask user or decide? Decide, then explain.
- New dependency? Use existing deps first. Ask before adding runtime deps.
- Test failing? Fix if yours, note if pre-existing.
${isMonorepo ? `- Which package? The one closest to the feature.\n` : ''}
## Enhanced Agent Features

This project has HoloScript agent infrastructure:
- Decision oracle: .claude/NORTH_STAR.md
- Persistent memory: .claude/MEMORY.md
- Upgrade: npx @holoscript/agent-setup
`.trimStart();
}
