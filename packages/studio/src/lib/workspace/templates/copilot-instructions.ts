/**
 * Template generator for copilot-instructions.md — GitHub Copilot agent instructions.
 *
 * Lives at .github/copilot-instructions.md. Copilot also supports
 * glob-based file-type targeting in .github/instructions/*.instructions.md.
 *
 * We generate the main instructions file. It's read by Copilot Chat,
 * Copilot Workspace, and Copilot CLI.
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

function buildCmd(dna: ScaffoldDNA): string {
  if (dna.techStack.includes('pnpm')) return 'pnpm build';
  if (dna.techStack.includes('yarn')) return 'yarn build';
  if (dna.languages.includes('go')) return 'go build ./...';
  if (dna.languages.includes('rs')) return 'cargo build';
  return 'npm run build';
}

function stackConventions(dna: ScaffoldDNA): string {
  const sections: string[] = [];

  if (dna.techStack.includes('typescript')) {
    sections.push(`### TypeScript
- Strict mode. No \`any\` — use \`unknown\`.
- Explicit return types on exports.
- \`interface\` for shapes, \`type\` for unions.
- \`.tsx\` extension for JSX files.`);
  }

  if (dna.languages.includes('py')) {
    sections.push(`### Python
- Type hints on all public functions.
- \`pathlib.Path\` over \`os.path\`.
- Format: black. Lint: ruff.`);
  }

  if (dna.languages.includes('go')) {
    sections.push(`### Go
- Always check errors. No \`_\` discards.
- \`context.Context\` as first I/O parameter.
- Standard layout: cmd/, internal/, pkg/.`);
  }

  if (dna.frameworks.includes('next.js')) {
    sections.push(`### Next.js
- App Router. Server Components by default.
- Add \`'use client'\` only when needed.
- Pages in app/, API routes in app/api/.`);
  }

  if (dna.frameworks.includes('react') && !dna.frameworks.includes('next.js')) {
    sections.push(`### React
- Functional components only.
- Co-locate tests: Component.test.tsx next to Component.tsx.
- Named exports for components.`);
  }

  return sections.length > 0 ? sections.join('\n\n') : 'Follow existing codebase conventions.';
}

// ─── Main template ─────────────────────────────────────────────────────────

export function generateCopilotInstructions(dna: ScaffoldDNA): string {
  const isMonorepo = dna.packageCount > 1;

  return `# Copilot Instructions — ${dna.name}

## Project Overview

${dna.name} is a ${isMonorepo ? `monorepo with ${dna.packageCount} packages` : 'single-package project'}.

- **Languages**: ${dna.languages.join(', ') || 'not detected'}
- **Frameworks**: ${dna.frameworks.join(', ') || 'none'}
- **Test Coverage**: ${dna.testCoverage}%
- **Code Health**: ${dna.codeHealthScore}/10

## Commands

- **Build**: \`${buildCmd(dna)}\`
- **Test**: \`${testCmd(dna)}\`
- **Lint**: \`${lintCmd(dna)}\`

## Conventions

${stackConventions(dna)}

### Universal Rules

- Never commit secrets. Use \`.env\` files.
- Prefer editing existing files over creating new ones.
- Read files before editing them.
- Git staging: always \`git add <file>\`, never \`git add -A\`.

## Workflow

1. Read relevant files before making changes
2. Make changes in the smallest scope possible
3. Run tests: \`${testCmd(dna)}\`
4. Run lint: \`${lintCmd(dna)}\`
5. Commit with descriptive messages

## Decision Defaults

- New file or existing? **Existing** first
- New dependency? Use what's already installed
- Test failing? Fix if yours, note if pre-existing
- Ask or decide? Decide, then explain your reasoning
${isMonorepo ? '- Which package? The one closest to the feature\n' : ''}
## Enhanced Features

This project uses [HoloScript](https://holoscript.net) agent infrastructure:
- Decision oracle at \`.claude/NORTH_STAR.md\`
- Persistent memory at \`.claude/MEMORY.md\`
- Multi-IDE coordination via \`team-connect.mjs\`

Activate full features: \`npx @holoscript/agent-setup\`
`.trimStart();
}
