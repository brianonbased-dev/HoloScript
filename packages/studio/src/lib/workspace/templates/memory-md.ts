/**
 * Template generator for MEMORY.md — persistent project memory seeded from Absorb findings.
 *
 * Captures architecture summary, detected patterns, known tech debt,
 * and key dependencies so the agent starts every session with context.
 */

import type { ScaffoldDNA } from '../scaffolder';

// ─── Architecture summary ───────────────────────────────────────────────────

function architectureSummary(dna: ScaffoldDNA): string {
  const lines: string[] = [];

  lines.push(`## Architecture Summary`);
  lines.push('');

  // Repo shape
  if (dna.packageCount > 1) {
    lines.push(`- **Structure**: Monorepo with ${dna.packageCount} packages`);
  } else {
    lines.push('- **Structure**: Single-package repository');
  }

  // Primary language
  if (dna.languages.length > 0) {
    lines.push(`- **Primary language**: ${dna.languages[0]}`);
    if (dna.languages.length > 1) {
      lines.push(`- **Secondary languages**: ${dna.languages.slice(1).join(', ')}`);
    }
  }

  // Frameworks
  if (dna.frameworks.length > 0) {
    lines.push(`- **Frameworks**: ${dna.frameworks.join(', ')}`);
  }

  // Stack tooling
  const tooling = dna.techStack.filter(t =>
    ['pnpm', 'npm', 'yarn', 'docker', 'terraform', 'kubernetes'].includes(t)
  );
  if (tooling.length > 0) {
    lines.push(`- **Tooling**: ${tooling.join(', ')}`);
  }

  return lines.join('\n');
}

// ─── Key patterns ───────────────────────────────────────────────────────────

function keyPatterns(dna: ScaffoldDNA): string {
  const patterns: string[] = [];

  if (dna.techStack.includes('typescript')) {
    patterns.push('- TypeScript strict mode — prefer interfaces for shapes, type for unions');
  }

  if (dna.frameworks.includes('next.js')) {
    patterns.push('- Next.js App Router — server components by default');
    patterns.push('- API routes in `app/api/` directory');
  }

  if (dna.frameworks.includes('express')) {
    patterns.push('- Express middleware chain — use router.use() for shared logic');
  }

  if (dna.frameworks.includes('django')) {
    patterns.push('- Django app-based architecture — each feature is its own app');
    patterns.push('- Django ORM for data access — avoid raw SQL');
  }

  if (dna.frameworks.includes('fastapi')) {
    patterns.push('- FastAPI router-based structure — group by domain');
    patterns.push('- Pydantic for request/response validation');
  }

  if (dna.frameworks.includes('react')) {
    patterns.push('- React functional components — hooks for state and effects');
  }

  if (dna.techStack.includes('prisma')) {
    patterns.push('- Prisma ORM — schema in prisma/schema.prisma');
  }

  if (dna.techStack.includes('docker')) {
    patterns.push('- Dockerized deployment — check Dockerfile and docker-compose.yml');
  }

  if (dna.languages.includes('go')) {
    patterns.push('- Go standard project layout — cmd/, internal/, pkg/');
    patterns.push('- Error wrapping with fmt.Errorf and %w');
  }

  if (dna.languages.includes('rs')) {
    patterns.push('- Rust module system — mod.rs or module_name.rs');
    patterns.push('- Result/Option for error handling — avoid unwrap() in production');
  }

  if (patterns.length === 0) {
    patterns.push('- No specific patterns auto-detected. Explore the codebase to discover conventions.');
  }

  return `## Key Patterns Detected\n\n${patterns.join('\n')}`;
}

// ─── Tech debt ──────────────────────────────────────────────────────────────

function techDebt(dna: ScaffoldDNA): string {
  const items: string[] = [];

  if (dna.testCoverage < 20) {
    items.push('- **Critical**: Test coverage below 20% — add tests before refactoring');
  } else if (dna.testCoverage < 50) {
    items.push('- **Moderate**: Test coverage below 50% — prioritize tests for critical paths');
  }

  if (dna.codeHealthScore < 4) {
    items.push('- **Critical**: Code health score below 4/10 — significant structural issues');
  } else if (dna.codeHealthScore < 6) {
    items.push('- **Moderate**: Code health score below 6/10 — some cleanup needed');
  }

  if (items.length === 0) {
    items.push('- No critical tech debt detected from initial scan.');
  }

  return `## Known Tech Debt\n\n${items.join('\n')}`;
}

// ─── Dependencies ───────────────────────────────────────────────────────────

function dependencies(dna: ScaffoldDNA): string {
  const deps: string[] = [];

  for (const fw of dna.frameworks) {
    switch (fw) {
      case 'next.js':
        deps.push('- **Next.js** — React framework with SSR/SSG');
        break;
      case 'react':
        deps.push('- **React** — UI component library');
        break;
      case 'express':
        deps.push('- **Express** — HTTP server framework');
        break;
      case 'django':
        deps.push('- **Django** — Python web framework');
        break;
      case 'fastapi':
        deps.push('- **FastAPI** — Python async API framework');
        break;
      case 'nest':
        deps.push('- **NestJS** — TypeScript server framework');
        break;
      case 'vue':
        deps.push('- **Vue** — Progressive UI framework');
        break;
      case 'angular':
        deps.push('- **Angular** — TypeScript application platform');
        break;
      default:
        deps.push(`- **${fw}** — detected framework`);
    }
  }

  for (const tool of dna.techStack) {
    if (['prisma', 'drizzle'].includes(tool)) {
      deps.push(`- **${tool}** — database ORM`);
    }
    if (['postgres', 'mysql', 'sqlite', 'mongodb', 'redis'].includes(tool)) {
      deps.push(`- **${tool}** — data store`);
    }
    if (['docker', 'kubernetes'].includes(tool)) {
      deps.push(`- **${tool}** — container/orchestration`);
    }
  }

  if (deps.length === 0) {
    deps.push('- Dependencies not auto-detected. Check package.json, requirements.txt, or go.mod.');
  }

  return `## Key Dependencies\n\n${deps.join('\n')}`;
}

// ─── Main template ──────────────────────────────────────────────────────────

export function generateMemoryMd(dna: ScaffoldDNA): string {
  return `# ${dna.name} — Project Memory

This file stores persistent knowledge about the project. Update it when you
discover new facts, patterns, or decisions that future sessions should know about.

${architectureSummary(dna)}

${keyPatterns(dna)}

${techDebt(dna)}

${dependencies(dna)}

## Session Log

| Date | Summary |
|------|---------|
| ${new Date().toISOString().split('T')[0]} | Initial workspace scaffolded from Absorb scan |
`.trimStart();
}
