/**
 * Template generator for CLAUDE.md — project-specific IDE agent instructions.
 *
 * Produces a structured markdown file that tells Claude Code how to work in
 * the user's repo: tech stack, conventions, build commands, key directories,
 * and links to NORTH_STAR and MEMORY.
 */

import type { ScaffoldDNA } from '../scaffolder';

// ─── Stack-specific convention blocks ───────────────────────────────────────

function typescriptConventions(dna: ScaffoldDNA): string {
  const strict = dna.techStack.includes('typescript');
  if (!strict) return '';
  return `
## TypeScript Conventions
- Strict mode enabled. No \`any\` — use \`unknown\` when the type is genuinely unknown.
- Prefer explicit return types on exported functions.
- Use \`interface\` for object shapes, \`type\` for unions/intersections.
- JSX files require explicit \`.tsx\` extension.
`;
}

function pythonConventions(dna: ScaffoldDNA): string {
  if (!dna.languages.includes('py')) return '';
  const hasDjango = dna.frameworks.includes('django');
  const hasFastapi = dna.frameworks.includes('fastapi');
  return `
## Python Conventions
- Type hints required on all public functions.
- Use \`pathlib.Path\` over \`os.path\`.${hasDjango ? '\n- Django: follow app-based structure. Models in models.py, views in views.py.' : ''}${hasFastapi ? '\n- FastAPI: routers in routers/, schemas in schemas/, dependencies in deps/.' : ''}
- Format with black, lint with ruff.
`;
}

function goConventions(dna: ScaffoldDNA): string {
  if (!dna.languages.includes('go')) return '';
  return `
## Go Conventions
- Follow standard Go project layout: cmd/, internal/, pkg/.
- Error handling: always check returned errors, never discard with \`_\`.
- Use \`context.Context\` as first parameter for functions that do I/O.
- Format with \`gofmt\`, lint with \`golangci-lint\`.
`;
}

function reactConventions(dna: ScaffoldDNA): string {
  if (!dna.frameworks.includes('react') && !dna.frameworks.includes('next.js')) return '';
  return `
## React Conventions
- Functional components only. No class components.
- Co-locate tests with components: \`Component.test.tsx\` next to \`Component.tsx\`.
- Use named exports for components, default exports only for pages.${dna.frameworks.includes('next.js') ? '\n- Next.js: App Router. Server components by default, add `\'use client\'` only when needed.' : ''}
`;
}

// ─── Build command detection ────────────────────────────────────────────────

function buildCommands(dna: ScaffoldDNA): string {
  const cmds: string[] = [];

  if (dna.techStack.includes('pnpm')) {
    cmds.push('- **Install**: `pnpm install`');
    cmds.push('- **Build**: `pnpm build`');
    cmds.push('- **Test**: `pnpm test`');
    cmds.push('- **Lint**: `pnpm lint`');
  } else if (dna.techStack.includes('npm')) {
    cmds.push('- **Install**: `npm install`');
    cmds.push('- **Build**: `npm run build`');
    cmds.push('- **Test**: `npm test`');
    cmds.push('- **Lint**: `npm run lint`');
  } else if (dna.techStack.includes('yarn')) {
    cmds.push('- **Install**: `yarn install`');
    cmds.push('- **Build**: `yarn build`');
    cmds.push('- **Test**: `yarn test`');
    cmds.push('- **Lint**: `yarn lint`');
  } else if (dna.languages.includes('py')) {
    cmds.push('- **Install**: `pip install -e ".[dev]"` or `poetry install`');
    cmds.push('- **Test**: `pytest`');
    cmds.push('- **Lint**: `ruff check .`');
    cmds.push('- **Format**: `black .`');
  } else if (dna.languages.includes('go')) {
    cmds.push('- **Build**: `go build ./...`');
    cmds.push('- **Test**: `go test ./...`');
    cmds.push('- **Lint**: `golangci-lint run`');
  } else if (dna.languages.includes('rs')) {
    cmds.push('- **Build**: `cargo build`');
    cmds.push('- **Test**: `cargo test`');
    cmds.push('- **Lint**: `cargo clippy`');
  }

  if (cmds.length === 0) {
    cmds.push('- Build and test commands not auto-detected. Check package.json or Makefile.');
  }

  return cmds.join('\n');
}

// ─── Key directories ────────────────────────────────────────────────────────

function keyDirectories(dna: ScaffoldDNA): string {
  const dirs: string[] = [];

  if (dna.packageCount > 1) {
    dirs.push('- `packages/` — Monorepo packages');
  }
  if (dna.frameworks.includes('next.js')) {
    dirs.push('- `src/app/` — Next.js App Router pages and API routes');
    dirs.push('- `src/lib/` — Shared library code');
    dirs.push('- `src/components/` — React components');
  } else if (dna.frameworks.includes('react')) {
    dirs.push('- `src/components/` — React components');
    dirs.push('- `src/hooks/` — Custom React hooks');
    dirs.push('- `src/lib/` or `src/utils/` — Shared utilities');
  } else if (dna.frameworks.includes('express') || dna.frameworks.includes('nest')) {
    dirs.push('- `src/routes/` or `src/controllers/` — API endpoints');
    dirs.push('- `src/services/` — Business logic');
    dirs.push('- `src/models/` — Data models');
  } else if (dna.frameworks.includes('django')) {
    dirs.push('- `<app>/models.py` — Data models');
    dirs.push('- `<app>/views.py` — View handlers');
    dirs.push('- `<app>/urls.py` — URL routing');
  } else if (dna.frameworks.includes('fastapi')) {
    dirs.push('- `routers/` — API route definitions');
    dirs.push('- `schemas/` — Pydantic models');
    dirs.push('- `services/` — Business logic');
  } else if (dna.languages.includes('go')) {
    dirs.push('- `cmd/` — Application entrypoints');
    dirs.push('- `internal/` — Private application code');
    dirs.push('- `pkg/` — Public library code');
  }

  dirs.push('- `tests/` or `__tests__/` — Test files');

  return dirs.length > 0 ? dirs.join('\n') : '- Project structure not auto-detected. Explore with `ls`.';
}

// ─── Main template ──────────────────────────────────────────────────────────

export function generateClaudeMd(dna: ScaffoldDNA): string {
  const langList = dna.languages.slice(0, 5).join(', ');
  const fwList = dna.frameworks.length > 0 ? dna.frameworks.join(', ') : 'none detected';
  const stackList = dna.techStack.length > 0 ? dna.techStack.join(', ') : 'minimal';

  return `# ${dna.name} — Agent Instructions

## Project Overview
- **Repository**: ${dna.repoUrl}
- **Languages**: ${langList}
- **Frameworks**: ${fwList}
- **Stack**: ${stackList}
- **Code Health**: ${dna.codeHealthScore}/10
- **Test Coverage**: ${dna.testCoverage}%

## Oracle & Memory

Before asking the user architectural questions, consult:
1. \`NORTH_STAR.md\` — Decision trees for common choices
2. \`MEMORY.md\` — Persistent project knowledge

Only ask the user for: novel features with no precedent, budget decisions, destructive operations, or genuinely ambiguous requirements.

## Build & Test Commands

${buildCommands(dna)}

## Key Directories

${keyDirectories(dna)}
${typescriptConventions(dna)}${pythonConventions(dna)}${goConventions(dna)}${reactConventions(dna)}
## Coding Standards
- Never commit secrets. Use \`.env\` files.
- Git staging: always explicit paths (\`git add <file>\`), never \`git add -A\` or \`git add .\`.
- Prefer editing existing files over creating new ones.
- Read files before editing. Concurrent reads, serial mutations.

## Agent Workflow
1. **Understand** — Read relevant files before making changes
2. **Plan** — Identify files to touch and blast radius
3. **Build** — Write code, prefer existing files over new ones
4. **Test** — Run tests. Fix failures before committing.
5. **Commit** — Sectioned commits by logical group. Explicit \`git add\`.

## Session Hygiene
- End sessions with a summary and next steps.
- Update MEMORY.md with new persistent facts.
- Keep context lean — don't read files you don't need.
`.trimStart();
}
