/**
 * Board Types — Canonical home for all team board data structures.
 *
 * Absorbed from mcp-server/src/holomesh/http-routes.ts.
 * The mcp-server should import these instead of defining inline.
 */

// ── Task Board ──

export type TaskStatus = 'open' | 'claimed' | 'done' | 'blocked';
export type SlotRole = 'coder' | 'tester' | 'researcher' | 'reviewer' | 'flex';

export interface TeamTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  claimedBy?: string;
  claimedByName?: string;
  completedBy?: string;
  commitHash?: string;
  source?: string;
  priority: number;
  role?: SlotRole;
  createdAt: string;
  completedAt?: string;
}

export interface DoneLogEntry {
  taskId: string;
  title: string;
  completedBy: string;
  commitHash?: string;
  timestamp: string;
  summary: string;
}

// ── Suggestions ──

export type SuggestionCategory = 'process' | 'tooling' | 'architecture' | 'testing' | 'docs' | 'performance' | 'other';

export interface SuggestionVote {
  agentId: string;
  agentName: string;
  value: 1 | -1;
  reason?: string;
  votedAt: string;
}

export interface TeamSuggestion {
  id: string;
  title: string;
  description: string;
  category: SuggestionCategory;
  proposedBy: string;
  proposedByName: string;
  votes: SuggestionVote[];
  score: number;
  status: 'open' | 'promoted' | 'dismissed';
  promotedTaskId?: string;
  evidence?: string;
  createdAt: string;
  resolvedAt?: string;
}

// ── Room Presets ──

export interface RoomPreset {
  objective: string;
  taskSources: string[];
  rules: string[];
}

export const ROOM_PRESETS: Record<string, RoomPreset> = {
  audit: {
    objective: 'Fix audit issues — split oversized components, add error handling, close security gaps, add tests',
    taskSources: ['STUDIO_AUDIT.md'],
    rules: ['Screenshot before and after visual changes', 'Run tsc --noEmit before committing', 'One task at a time'],
  },
  research: {
    objective: 'Compound knowledge — read research files, synthesize findings, contribute wisdom/patterns/gotchas',
    taskSources: ['research/*.md', 'ROADMAP.md'],
    rules: ['Query knowledge store before writing', 'Contribute findings to team workspace', 'Cite sources'],
  },
  build: {
    objective: 'Ship features — implement roadmap items, write code, add tests, deploy',
    taskSources: ['ROADMAP.md', 'TODO.md'],
    rules: ['Run tests before committing', 'Sectioned commits by scope', 'Update docs if adding public API'],
  },
  review: {
    objective: 'Quality gate — review recent changes, check for regressions, verify test coverage',
    taskSources: ['git log --oneline -20'],
    rules: ['Read the diff before commenting', 'Check test coverage', 'Verify no new console.log in production code'],
  },
};

// ── Team Agent Profiles (absorbed from team-agents.ts) ──

export type AgentRole = 'architect' | 'coder' | 'researcher' | 'reviewer';
export type AIProvider = 'anthropic' | 'openai' | 'xai';

export interface ClaimFilter {
  roles: SlotRole[];
  maxPriority: number;
}

export interface TeamAgentProfile {
  id: string;
  name: string;
  role: AgentRole;
  capabilities: string[];
  model: string;
  provider: AIProvider;
  claimFilter: ClaimFilter;
  systemPrompt: string;
  knowledgeDomains: string[];
}

export const BRITTNEY_AGENT: TeamAgentProfile = {
  id: 'agent_brittney',
  name: 'Brittney',
  role: 'architect',
  capabilities: ['scene-design', 'trait-composition', 'ux-critique', 'code-review', 'knowledge-synthesis'],
  model: 'claude-opus-4',
  provider: 'anthropic',
  claimFilter: { roles: ['coder', 'reviewer'], maxPriority: 5 },
  systemPrompt: 'You are Brittney, the orchestrating AI for HoloScript team rooms. HoloScript is a knowledge compiler — users describe any system and it compiles to 37 targets. You scaffold projects, dispatch agents, compose traits, and select compilation targets. Simulation-first: digital twin before physical twin.',
  knowledgeDomains: ['rendering', 'compilation', 'agents', 'domain-modeling', 'semantic-platform', 'orchestration'],
};

export const DAEMON_AGENT: TeamAgentProfile = {
  id: 'agent_daemon',
  name: 'Daemon',
  role: 'coder',
  capabilities: ['type-fixes', 'test-coverage', 'console-cleanup', 'todo-resolution', 'refactoring'],
  model: 'claude-sonnet-4',
  provider: 'anthropic',
  claimFilter: { roles: ['coder', 'tester'], maxPriority: 8 },
  systemPrompt: 'You are Daemon, the code improvement agent. Fix TypeScript type errors, increase test coverage, remove stale console.log, resolve TODO/FIXME. Strict TypeScript: no `any` — use `unknown`. Run tests before marking done.',
  knowledgeDomains: ['compilation', 'agents'],
};

export const ABSORB_AGENT: TeamAgentProfile = {
  id: 'agent_absorb',
  name: 'Absorb',
  role: 'researcher',
  capabilities: ['codebase-analysis', 'gap-detection', 'knowledge-extraction', 'pattern-mining', 'dependency-audit'],
  model: 'claude-sonnet-4',
  provider: 'anthropic',
  claimFilter: { roles: ['researcher'], maxPriority: 10 },
  systemPrompt: 'You are Absorb, the knowledge extraction agent. Scan codebases, detect gaps, extract W/P/G entries. Use absorb_query and absorb_run_absorb. Deduplicate against existing knowledge. Focus on actionable insights.',
  knowledgeDomains: ['compilation', 'security', 'rendering', 'agents', 'general'],
};

export const ORACLE_AGENT: TeamAgentProfile = {
  id: 'agent_oracle',
  name: 'Oracle',
  role: 'reviewer',
  capabilities: ['architectural-review', 'consistency-checking', 'knowledge-cross-reference', 'regression-detection', 'standard-enforcement'],
  model: 'claude-opus-4',
  provider: 'anthropic',
  claimFilter: { roles: ['reviewer'], maxPriority: 5 },
  systemPrompt: 'You are Oracle, the quality reviewer. Cross-reference knowledge store for related W/P/G. Check architectural consistency, test coverage, no hardcoded domain vocabulary in core, proper trait composition. Flag regressions.',
  knowledgeDomains: ['security', 'compilation', 'agents'],
};

export const TEAM_AGENT_PROFILES: ReadonlyMap<string, TeamAgentProfile> = new Map([
  [BRITTNEY_AGENT.id, BRITTNEY_AGENT],
  [DAEMON_AGENT.id, DAEMON_AGENT],
  [ABSORB_AGENT.id, ABSORB_AGENT],
  [ORACLE_AGENT.id, ORACLE_AGENT],
]);

export function getAllProfiles(): TeamAgentProfile[] {
  return Array.from(TEAM_AGENT_PROFILES.values());
}

export function getProfileById(id: string): TeamAgentProfile | undefined {
  return TEAM_AGENT_PROFILES.get(id);
}

export function getProfilesByClaimRole(role: SlotRole): TeamAgentProfile[] {
  return getAllProfiles().filter((p) => p.claimFilter.roles.includes(role));
}

export function getProfilesByDomain(domain: string): TeamAgentProfile[] {
  return getAllProfiles().filter((p) => p.knowledgeDomains.includes(domain));
}

// ── Board Utilities ──

/** Normalize a title for dedup comparison. */
export function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60);
}

/** Generate a unique task ID. */
export function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/** Generate a unique suggestion ID. */
export function generateSuggestionId(): string {
  return `sug_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/** Infer priority from TODO/FIXME kind and text. */
export function inferFixPriority(kind: string, text: string): number {
  const upper = `${kind} ${text}`.toUpperCase();
  if (/SECURITY|VULN|INJECTION|AUTH|CRITICAL/.test(upper)) return 1;
  if (/FIXME|BUG|BROKEN|FAIL|ERROR|REGRESSION/.test(upper)) return 2;
  if (/TODO|HACK|TECH\s*DEBT|CLEANUP|REFACTOR/.test(upper)) return 3;
  return 4;
}

/** Parse a derive source (markdown, grep output) into task candidates. */
export function parseDeriveContent(content: string, source: string): Array<Omit<TeamTask, 'id' | 'status' | 'createdAt'>> {
  const lines = content.split('\n');
  const tasks: Array<Omit<TeamTask, 'id' | 'status' | 'createdAt'>> = [];
  const seen = new Set<string>();
  let priority = 5;

  for (const line of lines) {
    const trimmed = line.trim();

    // Priority markers from section headers
    if (trimmed.match(/^#+\s*(CRITICAL|SEC-)/i)) priority = 1;
    else if (trimmed.match(/^#+\s*(HIGH|PERF-|MEM-|TYPE-|ERR-|TEST-)/i)) priority = 2;
    else if (trimmed.match(/^#+\s*(MEDIUM|LOG-|TODO-|STORE-|UNUSED-)/i)) priority = 3;

    // Markdown checkboxes
    if (trimmed.match(/^\-\s*\[\s*\]\s+.+/)) {
      const title = trimmed.replace(/^\-\s*\[\s*\]\s+/, '').slice(0, 200);
      const norm = normalizeTitle(title);
      if (title && !seen.has(norm)) {
        seen.add(norm);
        tasks.push({ title, description: '', priority, source });
      }
      continue;
    }

    // Section headers as tasks
    if (trimmed.match(/^###\s+\w+-\d+:.+/)) {
      const title = trimmed.replace(/^###\s+/, '').slice(0, 200);
      const norm = normalizeTitle(title);
      if (title && !seen.has(norm)) {
        seen.add(norm);
        tasks.push({ title, description: '', priority, source });
      }
      continue;
    }

    // grep-style: path:line: // TODO: message
    const grepMatch = trimmed.match(/^(.+?):(\d+):\s*(?:\/\/\s*)?(TODO|FIXME|HACK|XXX)\s*:?\s*(.+)$/i);
    if (grepMatch) {
      const [, file, lineNo, kind, detail] = grepMatch;
      const title = `${kind.toUpperCase()}: ${detail.trim().slice(0, 180)}`;
      const norm = normalizeTitle(title);
      if (!seen.has(norm)) {
        seen.add(norm);
        tasks.push({ title, description: `${file}:${lineNo}`, priority: inferFixPriority(kind, detail), source });
      }
      continue;
    }

    // Plain TODO/FIXME lines
    const inlineMatch = trimmed.match(/^(?:[-*]\s*)?(TODO|FIXME|HACK|XXX)\s*:?\s*(.+)$/i);
    if (inlineMatch) {
      const [, kind, detail] = inlineMatch;
      const title = `${kind.toUpperCase()}: ${detail.trim().slice(0, 180)}`;
      const norm = normalizeTitle(title);
      if (!seen.has(norm)) {
        seen.add(norm);
        tasks.push({ title, description: '', priority: inferFixPriority(kind, detail), source });
      }
    }
  }

  return tasks;
}
