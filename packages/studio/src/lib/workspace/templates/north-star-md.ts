/**
 * Template generator for NORTH_STAR.md — decision trees derived from the user's codebase.
 *
 * Each decision tree is tailored to the project's detected stack, frameworks,
 * test setup, and directory conventions.
 */

import type { ScaffoldDNA } from '../scaffolder';

// ─── DT-1: New file or existing? ───────────────────────────────────────────

function dt1NewFileOrExisting(dna: ScaffoldDNA): string {
  const isMonorepo = dna.packageCount > 1;
  const hasComponents = dna.frameworks.includes('react') || dna.frameworks.includes('vue');

  return `### DT-1: Should I create a new file or add to an existing one?

\`\`\`
${isMonorepo ? `Is it for a specific package?
  YES → Add to that package's existing files first
  NO  → Check if a shared/common package exists
` : ''}${hasComponents ? `Is it a new UI component?
  YES → New file in components/ (one component per file)
` : ''}Is it a new utility function?
  YES → Add to the closest existing utility file
  NO new file unless the function doesn't fit anywhere
Is it a new API endpoint?
  YES → ${dna.frameworks.includes('next.js') ? 'New route.ts in app/api/<path>/' : dna.frameworks.includes('express') ? 'Add to existing router file, or new file in routes/' : 'Add to existing handler, or new file in appropriate directory'}
Everything else → Prefer adding to existing files. Only create new files for genuinely new concerns.
\`\`\`
`;
}

// ─── DT-2: Commit timing ───────────────────────────────────────────────────

function dt2CommitTiming(): string {
  return `### DT-2: When should I commit?

\`\`\`
Did I complete a coherent unit of work?
  YES → Commit now
  NO  → Keep working

Do tests pass?
  YES → Safe to commit
  NO  → Fix tests first, then commit

How many files changed?
  1-9 files, 1 area  → Single commit, push to current branch
  10+ files or 3+ areas → Sectioned commits by logical group

Commit message format:
  <type>(<scope>): <description>
  Types: feat, fix, refactor, test, docs, chore
  Keep under 72 characters
\`\`\`
`;
}

// ─── DT-3: Test triage ─────────────────────────────────────────────────────

function dt3TestTriage(dna: ScaffoldDNA): string {
  let testRunner = 'your test runner';
  let testCmd = 'npm test';

  if (dna.techStack.includes('vitest') || dna.frameworks.includes('next.js')) {
    testRunner = 'vitest';
    testCmd = dna.techStack.includes('pnpm') ? 'pnpm vitest' : 'npx vitest';
  } else if (dna.techStack.includes('jest')) {
    testRunner = 'jest';
    testCmd = dna.techStack.includes('pnpm') ? 'pnpm jest' : 'npx jest';
  } else if (dna.languages.includes('py')) {
    testRunner = 'pytest';
    testCmd = 'pytest';
  } else if (dna.languages.includes('go')) {
    testRunner = 'go test';
    testCmd = 'go test ./...';
  } else if (dna.languages.includes('rs')) {
    testRunner = 'cargo test';
    testCmd = 'cargo test';
  }

  return `### DT-3: A test is failing — what do I do?

\`\`\`
Test runner: ${testRunner}
Run targeted: ${testCmd} <path>
Run all: ${testCmd}

Is the failure in code I just changed?
  YES → Fix it. Untested code is unfinished code.
  NO  → Is it a known pre-existing failure?
    YES → Skip it, note in commit message
    NO  → Investigate. If it's flaky, note it. If it's real, fix it.

Test coverage is at ${dna.testCoverage}%:${dna.testCoverage < 30 ? '\n  LOW — prioritize adding tests for new code' : dna.testCoverage < 60 ? '\n  MODERATE — add tests for touched areas' : '\n  GOOD — maintain coverage, add tests for edge cases'}
\`\`\`
`;
}

// ─── DT-4: Which tool/framework? ───────────────────────────────────────────

function dt4ToolChoice(dna: ScaffoldDNA): string {
  const choices: string[] = [];

  if (dna.frameworks.length > 0) {
    choices.push(`Detected frameworks: ${dna.frameworks.join(', ')}`);
    choices.push('Use what the project already uses. Do NOT introduce new frameworks.');
  }

  if (dna.techStack.includes('typescript')) {
    choices.push('Language: TypeScript (strict). Do not add JavaScript files.');
  } else if (dna.techStack.includes('javascript')) {
    choices.push('Language: JavaScript. Follow existing patterns (CJS vs ESM).');
  }

  if (dna.languages.includes('py')) {
    choices.push('Python: follow existing import style and project structure.');
  }

  if (dna.languages.includes('go')) {
    choices.push('Go: use standard library when possible. Minimize external deps.');
  }

  const choiceBlock = choices.length > 0
    ? choices.map(c => `  - ${c}`).join('\n')
    : '  - Follow existing patterns in the codebase.';

  return `### DT-4: Which tool or framework should I use?

\`\`\`
Rule: Use what the project already uses. Never introduce a new framework
without explicit user approval.

${choiceBlock}

Need a new dependency?
  Is there an existing dep that does the same thing? → Use it
  Is it a dev-only tool? → OK to add with --save-dev
  Is it a runtime dep? → Ask the user first
\`\`\`
`;
}

// ─── DT-5: Error recovery ──────────────────────────────────────────────────

function dt5ErrorRecovery(dna: ScaffoldDNA): string {
  const buildCmd = dna.techStack.includes('pnpm') ? 'pnpm build' :
    dna.techStack.includes('yarn') ? 'yarn build' :
    dna.languages.includes('go') ? 'go build ./...' :
    dna.languages.includes('rs') ? 'cargo build' :
    'npm run build';

  return `### DT-5: Something broke — how do I recover?

\`\`\`
Build fails?
  1. Read the error message carefully
  2. Check if it's a type error → fix the types
  3. Check if it's a missing import → add the import
  4. Check if it's a config issue → review recent changes to configs
  5. Run clean build: ${buildCmd}

Test fails after my change?
  1. Read the assertion error
  2. Is my code wrong? → Fix the code
  3. Is the test outdated? → Update the test
  4. Is it a snapshot? → Update snapshot if change is intentional

Git conflict?
  1. Read the conflict markers
  2. Understand both sides
  3. Keep the intent of both changes when possible
  4. Re-run tests after resolving

Unknown error?
  1. Search the codebase for the error message
  2. Check if there's error handling that explains it
  3. If stuck, ask the user with context about what you tried
\`\`\`
`;
}

// ─── Quick decision defaults ────────────────────────────────────────────────

function quickDefaults(dna: ScaffoldDNA): string {
  const defaults: string[] = [
    `New file or existing? → **Existing** (add to closest relevant file)`,
    `Commit now? → **Yes** if you completed a coherent unit and tests pass`,
    `Test failing? → **Fix** if yours, **skip** if pre-existing`,
    `Git staging? → **ALWAYS explicit paths**, never \`git add -A\``,
    `Ask user or decide? → **Decide**, then tell user what you decided`,
  ];

  if (dna.packageCount > 1) {
    defaults.push(`Which package? → The one closest to the feature being changed`);
  }

  if (dna.frameworks.includes('next.js')) {
    defaults.push(`Server or client component? → **Server** by default, client only when needed`);
  }

  return defaults.map(d => `- ${d}`).join('\n');
}

// ─── Main template ──────────────────────────────────────────────────────────

export function generateNorthStarMd(dna: ScaffoldDNA): string {
  return `# North Star Oracle — ${dna.name}

**Purpose**: Answer questions that would otherwise cause an IDE agent to stall and ask the user. Read this BEFORE interrupting the human.

**When to still ask the user**: Novel features with no precedent, budget decisions, destructive operations, or anything not covered here.

---

## Quick Decision Defaults

${quickDefaults(dna)}

---

## Decision Trees

${dt1NewFileOrExisting(dna)}
${dt2CommitTiming()}
${dt3TestTriage(dna)}
${dt4ToolChoice(dna)}
${dt5ErrorRecovery(dna)}
---

## Project Context

- **Name**: ${dna.name}
- **Repository**: ${dna.repoUrl}
- **Languages**: ${dna.languages.join(', ')}
- **Frameworks**: ${dna.frameworks.join(', ') || 'none detected'}
- **Packages**: ${dna.packageCount}
- **Code Health**: ${dna.codeHealthScore}/10
- **Test Coverage**: ${dna.testCoverage}%
- **Suggested Traits**: ${dna.traits.length > 0 ? dna.traits.join(', ') : 'none'}
- **Compilation Targets**: ${dna.compilationTargets.length > 0 ? dna.compilationTargets.join(', ') : 'none'}
`.trimStart();
}
