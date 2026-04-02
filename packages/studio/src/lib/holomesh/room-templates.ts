/**
 * HoloMesh Room Template Library
 *
 * Prebuilt team configurations for common session types.
 * Each template defines: mode, objective, roles, and a set of starter tasks.
 *
 * Available templates:
 *   studio-audit    — Full codebase audit (TypeScript, TODOs, coverage, security)
 *   research-sprint — Knowledge gathering, W/P/G compression, documentation
 *   bug-bash        — Triage, reproduce, fix, and verify bugs
 *   doc-day         — README, API docs, examples, changelog updates
 */

export type TeamMode = 'audit' | 'research' | 'build' | 'review';

export interface RoomTemplateTask {
  title: string;
  description: string;
  role: string;
  priority: number;
}

export interface RoomTemplateRole {
  role: string;
  count: number;
  description: string;
}

export interface RoomTemplate {
  slug: string;
  name: string;
  description: string;
  mode: TeamMode;
  objective: string;
  maxSlots: number;
  roles: RoomTemplateRole[];
  tasks: RoomTemplateTask[];
}

export const ROOM_TEMPLATES: Record<string, RoomTemplate> = {
  'studio-audit': {
    slug: 'studio-audit',
    name: 'Studio Audit',
    description:
      'Full health check of the Studio codebase: TypeScript errors, TODO/FIXME markers, API coverage gaps, and dependency freshness.',
    mode: 'audit',
    objective: 'Audit Studio for code quality issues, missing coverage, and stale dependencies',
    maxSlots: 3,
    roles: [
      { role: 'auditor', count: 2, description: 'Runs static analysis and files issues' },
      { role: 'coder', count: 1, description: 'Fixes high-priority issues found during audit' },
    ],
    tasks: [
      {
        title: 'Scan codebase for TODO/FIXME markers',
        description:
          'Run grep -r TODO/FIXME across packages/studio/src; create a board task for each unresolved marker found.',
        role: 'auditor',
        priority: 1,
      },
      {
        title: 'Audit TypeScript errors in Studio',
        description:
          'Run `npx tsc --noEmit --skipLibCheck --project packages/studio/tsconfig.json` and file tasks for any NEW errors beyond the known pre-existing set.',
        role: 'auditor',
        priority: 1,
      },
      {
        title: 'Audit API routes for missing auth checks',
        description:
          'Scan all /api/holomesh/* routes; flag any handler that uses HOLOMESH_API_KEY without an Authorization header validation guard.',
        role: 'auditor',
        priority: 1,
      },
      {
        title: 'Review dependency freshness',
        description:
          'Run `pnpm outdated` in packages/studio; file issues for packages more than 2 major versions behind.',
        role: 'auditor',
        priority: 2,
      },
      {
        title: 'Check test coverage for new holomesh routes',
        description:
          'Find all files under src/app/api/holomesh added in the last 10 commits; create test stubs for any missing route.test.ts.',
        role: 'auditor',
        priority: 2,
      },
      {
        title: 'Fix highest-priority issues from audit',
        description:
          'After the audit tasks are done, claim the highest-priority filed issue, implement the fix, and commit with the task ID.',
        role: 'coder',
        priority: 3,
      },
    ],
  },

  'research-sprint': {
    slug: 'research-sprint',
    name: 'Research Sprint',
    description:
      'Focused knowledge extraction session: query knowledge store gaps, run GROW phase, and push new W/P/G entries to the orchestrator.',
    mode: 'research',
    objective: 'Identify knowledge gaps, run GROW, and compound W/P/G entries across domains',
    maxSlots: 3,
    roles: [
      { role: 'researcher', count: 2, description: 'Queries, synthesizes, and pushes knowledge entries' },
      { role: 'coder', count: 1, description: 'Implements code changes suggested by research findings' },
    ],
    tasks: [
      {
        title: 'Query knowledge store for domain coverage gaps',
        description:
          'POST /knowledge/query with each domain (ai, web, systems, architecture); identify any domain with < 3 W/P/G entries.',
        role: 'researcher',
        priority: 1,
      },
      {
        title: 'Run GROW phase on latest session learnings',
        description:
          'Read ai-ecosystem/research/*.md modified in last 7 days; extract W/P/G entries following uAA2++ GROW template; push via /knowledge/sync.',
        role: 'researcher',
        priority: 1,
      },
      {
        title: 'Identify cross-domain relationship opportunities',
        description:
          'Find W/P/G entries from different domains that share concepts; generate a linking entry that bridges them.',
        role: 'researcher',
        priority: 2,
      },
      {
        title: 'Summarize top-10 knowledge entries by query count',
        description:
          'GET /api/holomesh/knowledge/catalog?limit=10; summarize the most-accessed entries for documentation.',
        role: 'researcher',
        priority: 2,
      },
      {
        title: 'Compress session findings into MEMORY.md',
        description:
          'After the sprint, extract key decisions and facts; append to ai-ecosystem/memory/MEMORY.md following W/P/G format.',
        role: 'researcher',
        priority: 3,
      },
      {
        title: 'Implement a knowledge-driven code improvement',
        description:
          'Pick the highest-confidence pattern entry, apply it to Studio code, commit with reference to the W/P/G entry ID.',
        role: 'coder',
        priority: 3,
      },
    ],
  },

  'bug-bash': {
    slug: 'bug-bash',
    name: 'Bug Bash',
    description:
      'Coordinated bug-finding and fixing session: triage open issues, reproduce bugs, implement fixes, write regression tests.',
    mode: 'build',
    objective: 'Triage, reproduce, fix, and verify all open bugs in Studio and HoloScript',
    maxSlots: 4,
    roles: [
      { role: 'tester', count: 2, description: 'Reproduces bugs and writes regression tests' },
      { role: 'coder', count: 2, description: 'Implements bug fixes and reviews changes' },
    ],
    tasks: [
      {
        title: 'Triage board for open bug tasks',
        description:
          'GET /board; identify all tasks with "bug", "error", "broken", or "fail" in title; sort by priority; assign to team.',
        role: 'tester',
        priority: 1,
      },
      {
        title: 'Reproduce highest-priority bug and write failing test',
        description:
          'Claim the P1 bug task; write a vitest test that demonstrates the failure before fixing it.',
        role: 'tester',
        priority: 1,
      },
      {
        title: 'Fix and verify the reproduced bug',
        description:
          'After the test is written and failing, implement the minimum fix to make it pass; commit with "[fix] task-id: description".',
        role: 'coder',
        priority: 1,
      },
      {
        title: 'Scan git diff for regression risks',
        description:
          'Run `git diff main...HEAD --stat`; identify files changed in > 2 unrelated areas; add integration tests for those areas.',
        role: 'tester',
        priority: 2,
      },
      {
        title: 'Run full test suite and report failures',
        description:
          '`cd packages/studio && pnpm test`; categorize failures as pre-existing vs. new; file new failures as board tasks.',
        role: 'tester',
        priority: 2,
      },
      {
        title: 'Fix medium-priority bugs claimed from board',
        description:
          'Pick any unassigned P2 bug tasks; fix each with failing test → fix → passing test workflow.',
        role: 'coder',
        priority: 2,
      },
      {
        title: 'Write regression tests for all fixed bugs',
        description:
          'For each bug fixed during this session, ensure a vitest test exists that would have caught it before the fix.',
        role: 'tester',
        priority: 3,
      },
    ],
  },

  'doc-day': {
    slug: 'doc-day',
    name: 'Doc Day',
    description:
      'Documentation overhaul day: update README.md, write API endpoint docs, add code examples, and sync CHANGELOG.',
    mode: 'review',
    objective: 'Bring all documentation up to date: README, API docs, CHANGELOG, and examples',
    maxSlots: 3,
    roles: [
      { role: 'researcher', count: 1, description: 'Reads codebase, extracts facts for documentation' },
      { role: 'coder', count: 2, description: 'Writes and updates documentation files' },
    ],
    tasks: [
      {
        title: 'Audit README.md for staleness',
        description:
          'Read packages/studio/README.md; compare to actual API routes and features; flag outdated or missing sections.',
        role: 'researcher',
        priority: 1,
      },
      {
        title: 'Update README.md with HoloMesh teams and marketplace',
        description:
          'Add sections for: Team management, Knowledge marketplace, Referral system, Presence tracking. Include example curl commands for each.',
        role: 'coder',
        priority: 1,
      },
      {
        title: 'Write API reference for new HoloMesh endpoints',
        description:
          'Document all routes added in the last 10 commits: request params, response shape, example. Output to docs/api-holomesh.md.',
        role: 'coder',
        priority: 1,
      },
      {
        title: 'Sync CHANGELOG.md with recent commits',
        description:
          'Run `git log --oneline -20`; group by feat/fix/chore; write proper CHANGELOG entries in Keep-a-Changelog format.',
        role: 'coder',
        priority: 2,
      },
      {
        title: 'Add code examples for referral API',
        description:
          'Write a usage example for the referral tracking system: how to pass referrerAgentId on purchase, how to query referral earnings.',
        role: 'coder',
        priority: 2,
      },
      {
        title: 'Create CONTRIBUTING.md for agent contributors',
        description:
          'Document: how to claim a board task, conventions for commit messages, TS check command, how to mark a task done.',
        role: 'coder',
        priority: 3,
      },
    ],
  },
};

/** Returns all templates as an array, sorted by slug. */
export function listTemplates(): RoomTemplate[] {
  return Object.values(ROOM_TEMPLATES).sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Returns a template by slug, or null if not found. */
export function getTemplate(slug: string): RoomTemplate | null {
  return ROOM_TEMPLATES[slug] ?? null;
}
