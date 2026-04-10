/**
 * Template generator for skill definitions.
 *
 * Every scaffolded project gets 4 skills: scan, dev, documenter, review.
 * Each is customized based on the project's tech stack, build system,
 * and detected conventions.
 */

import type { ScaffoldDNA } from '../scaffolder';

export interface SkillDefinition {
  /** Filename (e.g. "scan") — becomes the skill directory name */
  name: string;
  /** Full skill.md content including YAML frontmatter */
  content: string;
}

// ─── Test/lint commands by stack ────────────────────────────────────────────

function testCommand(dna: ScaffoldDNA): string {
  if (dna.techStack.includes('vitest')) return 'pnpm vitest';
  if (dna.techStack.includes('jest')) return dna.techStack.includes('pnpm') ? 'pnpm jest' : 'npx jest';
  if (dna.languages.includes('py')) return 'pytest';
  if (dna.languages.includes('go')) return 'go test ./...';
  if (dna.languages.includes('rs')) return 'cargo test';
  return dna.techStack.includes('pnpm') ? 'pnpm test' : 'npm test';
}

function lintCommand(dna: ScaffoldDNA): string {
  if (dna.techStack.includes('eslint')) return dna.techStack.includes('pnpm') ? 'pnpm lint' : 'npx eslint .';
  if (dna.languages.includes('py')) return 'ruff check .';
  if (dna.languages.includes('go')) return 'golangci-lint run';
  if (dna.languages.includes('rs')) return 'cargo clippy';
  return dna.techStack.includes('pnpm') ? 'pnpm lint' : 'npm run lint';
}

function buildCommand(dna: ScaffoldDNA): string {
  if (dna.techStack.includes('pnpm')) return 'pnpm build';
  if (dna.techStack.includes('yarn')) return 'yarn build';
  if (dna.languages.includes('go')) return 'go build ./...';
  if (dna.languages.includes('rs')) return 'cargo build';
  return 'npm run build';
}

// ─── Scan skill ─────────────────────────────────────────────────────────────

function scanSkill(dna: ScaffoldDNA): SkillDefinition {
  const tCmd = testCommand(dna);
  const lCmd = lintCommand(dna);

  return {
    name: 'scan',
    content: `---
name: scan
description: >
  Proactive codebase scanner for ${dna.name}. Scans for TODO/FIXME markers,
  uncommitted changes, code health issues, and test coverage gaps.
  Run periodically or manually with /scan.
argument-hint: "[focus: 'todos' | 'health' | 'git' | 'coverage' | 'full']"
disable-model-invocation: false
allowed-tools: Bash, Read, Grep, Glob
context: fork
agent: general-purpose
---

# ${dna.name} Scanner

You are executing a proactive scan. Detect issues before they become problems.

## Scan Phases

### Phase 1: TODO/FIXME Scan (\`todos\`)

Search for TODO, FIXME, HACK, XXX markers in recently modified files.

\`\`\`bash
git diff --name-only HEAD~10 HEAD
\`\`\`

For each file, grep for markers. Report file, line number, marker type, text.
Sort by priority (FIXME > TODO > HACK > XXX). Cap at 25 results.

### Phase 2: Git Health (\`git\`)

\`\`\`bash
git status --short
git stash list
\`\`\`

Report uncommitted files, stash entries, unstaged changes.

### Phase 3: Code Health (\`health\`)

1. Run lint check: \`${lCmd}\`
2. Check build: \`${buildCommand(dna)}\`
3. Report each as OK/WARN/FAIL.

### Phase 4: Test Coverage (\`coverage\`)

Run targeted tests: \`${tCmd}\`
Check for coverage reports. Report metrics as OK/WARN.

## Output Format

\`\`\`
SCAN RESULTS
============

TODOS (X found, Y high-priority)
  FIXME path/file:42 — description

GIT (X uncommitted)
  3 modified, 1 untracked

HEALTH
  Lint:  OK
  Build: OK

COVERAGE
  Lines: X% | Branches: Y%

RECOMMENDATIONS
  1. ...
\`\`\`

Keep the report under 40 lines. Be concise.
`,
  };
}

// ─── Dev skill ──────────────────────────────────────────────────────────────

function devSkill(dna: ScaffoldDNA): SkillDefinition {
  const tCmd = testCommand(dna);
  const bCmd = buildCommand(dna);

  return {
    name: 'dev',
    content: `---
name: dev
description: >
  Developer skill for ${dna.name}. Writes code, adds features, fixes bugs,
  expands test coverage, and ships. Reads the codebase first, builds second.
argument-hint: "[build|fix|test|ship] [target or description]"
disable-model-invocation: false
allowed-tools: Bash, Read, Write, Edit, Grep, Glob
context: fork
agent: general-purpose
---

# ${dna.name} Developer

**Directive**: $ARGUMENTS
**Mode**: Autonomous
**Role**: Developer — writes code, ships features, fixes bugs

## The Build Cycle

\`\`\`
1. UNDERSTAND — Read relevant files (never edit blind)
2. PLAN      — Identify files to touch, blast radius, test strategy
3. BUILD     — Write the code. Prefer editing existing files.
4. TEST      — Run: ${tCmd}. Fix failures.
5. COMMIT    — Sectioned commits. Explicit git add <file>.
6. VERIFY    — Run: ${bCmd}. Ensure clean build.
\`\`\`

## Commands

\`\`\`
/dev build "feature description"  # Implement a feature
/dev fix "bug description"        # Find and fix a bug
/dev test "area to cover"         # Add missing test coverage
/dev ship                         # Commit and push ready work
\`\`\`

## Stack

- **Languages**: ${dna.languages.join(', ')}
- **Frameworks**: ${dna.frameworks.join(', ') || 'none'}
- **Test runner**: ${tCmd}
- **Build**: ${bCmd}

## Rules

- Read before editing. Always.
- Tests must pass before committing.
- Explicit git add. Never \`git add -A\`.
- Sectioned commits by logical group.
- Prefer existing files over new files.
`,
  };
}

// ─── Documenter skill ───────────────────────────────────────────────────────

function documenterSkill(dna: ScaffoldDNA): SkillDefinition {
  return {
    name: 'documenter',
    content: `---
name: documenter
description: >
  Documentation auditor for ${dna.name}. Checks READMEs, inline docs,
  API documentation, and changelog for staleness and accuracy.
  Every number must be verified against live sources.
argument-hint: "[mode: 'audit' | 'fix' | 'changelog' | 'full'] [scope]"
disable-model-invocation: false
allowed-tools: Bash, Read, Write, Edit, Grep, Glob
context: fork
agent: general-purpose
---

# ${dna.name} Documenter

**Directive**: $ARGUMENTS

## Grounded Reporter Protocol

Every number you write into a doc MUST come from a live source you queried
in this session. Never trust cached values or what another doc claims.

**Verification hierarchy:**
1. Live service response — curl output from this session
2. Code traversal — grep, find on actual source files
3. Git history — git log, git show
4. Existing docs — ONLY as input to check, NEVER as source of truth

## Audit Checklist

1. **README.md** — Does it reflect current state? Correct install steps?
2. **API docs** — Are endpoints documented? Request/response shapes accurate?
3. **Inline docs** — Do exported functions have JSDoc/docstrings?
4. **CHANGELOG** — Is it up to date with recent commits?
5. **Version numbers** — Consistent across package.json, README, docs?

## Output

Report each item as OK / STALE / MISSING with brief explanation.
Fix what you can. Flag what needs user input.
`,
  };
}

// ─── Review skill ───────────────────────────────────────────────────────────

function reviewSkill(dna: ScaffoldDNA): SkillDefinition {
  const isTypescript = dna.techStack.includes('typescript');
  const isPython = dna.languages.includes('py');
  const isGo = dna.languages.includes('go');

  const conventions: string[] = [];
  if (isTypescript) {
    conventions.push('- No `any` types — use `unknown` or proper generics');
    conventions.push('- Explicit return types on exported functions');
    conventions.push('- Prefer `interface` for object shapes');
  }
  if (isPython) {
    conventions.push('- Type hints on all public functions');
    conventions.push('- Docstrings on public classes and functions');
    conventions.push('- No bare except clauses');
  }
  if (isGo) {
    conventions.push('- All errors must be checked');
    conventions.push('- Context as first parameter for I/O functions');
    conventions.push('- No exported names without doc comments');
  }

  const conventionBlock = conventions.length > 0
    ? conventions.join('\n')
    : '- Follow existing codebase conventions';

  return {
    name: 'review',
    content: `---
name: review
description: >
  Code reviewer for ${dna.name}. Reviews changes against project conventions,
  checks for bugs, security issues, and style violations. Provides actionable
  feedback, not nitpicks.
argument-hint: "[file or directory to review]"
disable-model-invocation: false
allowed-tools: Bash, Read, Grep, Glob
context: fork
agent: general-purpose
---

# ${dna.name} Code Reviewer

**Target**: $ARGUMENTS

## Review Checklist

1. **Correctness** — Does the code do what it claims? Edge cases handled?
2. **Security** — No secrets in code? Input validated? SQL injection? XSS?
3. **Performance** — O(n^2) in hot paths? Unnecessary re-renders? Memory leaks?
4. **Conventions** — Follows project patterns?
5. **Tests** — Are changes tested? Do existing tests still pass?
6. **Readability** — Clear naming? Comments where needed? No dead code?

## Project Conventions

${conventionBlock}

## Output Format

For each issue found:
\`\`\`
[SEVERITY] file:line — description
  Suggestion: how to fix
\`\`\`

Severity levels: CRITICAL, WARNING, INFO
Keep feedback actionable. No nitpicks on style if a formatter handles it.
`,
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function generateSkills(dna: ScaffoldDNA): SkillDefinition[] {
  return [
    scanSkill(dna),
    devSkill(dna),
    documenterSkill(dna),
    reviewSkill(dna),
  ];
}
