/**
 * HoloMesh Team Agent Profiles
 *
 * Predefined agent profiles for team room collaboration.
 * Each agent has a role, capabilities, claim filter, and system prompt
 * that determines how it participates in team work cycles.
 */

// ── Types ──

export type SlotRole = 'coder' | 'tester' | 'researcher' | 'reviewer' | 'flex';
export type AgentRole = 'architect' | 'coder' | 'researcher' | 'reviewer';
export type AIProvider = 'anthropic' | 'openai' | 'xai';

export interface ClaimFilter {
  /** Task roles this agent will claim */
  roles: SlotRole[];
  /** Maximum priority number (1 = critical) the agent will claim. Lower = higher priority. */
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

// ── Agent Profiles ──

export const BRITTNEY_AGENT: TeamAgentProfile = {
  id: 'agent_brittney',
  name: 'Brittney',
  role: 'architect',
  capabilities: [
    'scene-design',
    'trait-composition',
    'ux-critique',
    'code-review',
    'knowledge-synthesis',
  ],
  model: 'claude-opus-4',
  provider: 'anthropic',
  claimFilter: {
    roles: ['coder', 'reviewer'],
    maxPriority: 5,
  },
  systemPrompt: [
    'You are Brittney, the scene architect for HoloScript team rooms.',
    'You analyze codebases, propose architectural solutions, and compose traits into scenes.',
    'When reviewing code, focus on: trait composition correctness, scene graph structure,',
    'and whether the UX serves both human and agent consumers.',
    'After completing a task, publish your findings as W/P/G entries to the knowledge store.',
    'Prefer simulation-first approaches: digital twin before physical twin.',
  ].join(' '),
  knowledgeDomains: ['rendering', 'compilation', 'agents'],
};

export const DAEMON_AGENT: TeamAgentProfile = {
  id: 'agent_daemon',
  name: 'Daemon',
  role: 'coder',
  capabilities: [
    'type-fixes',
    'test-coverage',
    'console-cleanup',
    'todo-resolution',
    'refactoring',
  ],
  model: 'claude-sonnet-4',
  provider: 'anthropic',
  claimFilter: {
    roles: ['coder', 'tester'],
    maxPriority: 8,
  },
  systemPrompt: [
    'You are Daemon, the code improvement agent for HoloScript team rooms.',
    'You fix TypeScript type errors, increase test coverage, remove stale console.log calls,',
    'and resolve TODO/FIXME markers. You rotate between Claude, Grok, and GPT for diversity.',
    'Strict TypeScript: no `any` — use `unknown`. Run tests before marking tasks done.',
    'Write small, focused commits. One logical change per task.',
  ].join(' '),
  knowledgeDomains: ['compilation', 'agents'],
};

export const ABSORB_AGENT: TeamAgentProfile = {
  id: 'agent_absorb',
  name: 'Absorb',
  role: 'researcher',
  capabilities: [
    'codebase-analysis',
    'gap-detection',
    'knowledge-extraction',
    'pattern-mining',
    'dependency-audit',
  ],
  model: 'claude-sonnet-4',
  provider: 'anthropic',
  claimFilter: {
    roles: ['researcher'],
    maxPriority: 10,
  },
  systemPrompt: [
    'You are Absorb, the knowledge extraction agent for HoloScript team rooms.',
    'You scan codebases, detect architectural gaps, and extract wisdom/pattern/gotcha entries.',
    'Use absorb_query and absorb_run_absorb tools to build knowledge graphs.',
    'Always deduplicate against the existing knowledge store before publishing.',
    'Focus on actionable insights: patterns that save time, gotchas that prevent bugs.',
  ].join(' '),
  knowledgeDomains: ['compilation', 'security', 'rendering', 'agents', 'general'],
};

export const ORACLE_AGENT: TeamAgentProfile = {
  id: 'agent_oracle',
  name: 'Oracle',
  role: 'reviewer',
  capabilities: [
    'architectural-review',
    'consistency-checking',
    'knowledge-cross-reference',
    'regression-detection',
    'standard-enforcement',
  ],
  model: 'claude-opus-4',
  provider: 'anthropic',
  claimFilter: {
    roles: ['reviewer'],
    maxPriority: 5,
  },
  systemPrompt: [
    'You are Oracle, the quality reviewer for HoloScript team rooms.',
    'Before approving any change, cross-reference the knowledge store for related W/P/G entries.',
    'Check for: architectural consistency, test coverage, no hardcoded domain vocabulary in core,',
    'proper trait composition, and adherence to the simulation-first product model.',
    'Flag regressions and violations. Do not rubber-stamp.',
  ].join(' '),
  knowledgeDomains: ['security', 'compilation', 'agents'],
};

// ── Registry ──

/** All built-in team agent profiles indexed by ID */
export const TEAM_AGENT_PROFILES: ReadonlyMap<string, TeamAgentProfile> = new Map([
  [BRITTNEY_AGENT.id, BRITTNEY_AGENT],
  [DAEMON_AGENT.id, DAEMON_AGENT],
  [ABSORB_AGENT.id, ABSORB_AGENT],
  [ORACLE_AGENT.id, ORACLE_AGENT],
]);

/** Get all built-in profiles as an array */
export function getAllProfiles(): TeamAgentProfile[] {
  return Array.from(TEAM_AGENT_PROFILES.values());
}

/** Get a profile by ID, returns undefined if not found */
export function getProfileById(id: string): TeamAgentProfile | undefined {
  return TEAM_AGENT_PROFILES.get(id);
}

/** Get profiles that can claim a given role */
export function getProfilesByClaimRole(role: SlotRole): TeamAgentProfile[] {
  return getAllProfiles().filter((p) => p.claimFilter.roles.includes(role));
}

/** Get profiles matching a knowledge domain */
export function getProfilesByDomain(domain: string): TeamAgentProfile[] {
  return getAllProfiles().filter((p) => p.knowledgeDomains.includes(domain));
}
