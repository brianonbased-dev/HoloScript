/**
 * Scout Agent Profile — Infrastructure, NOT a team member.
 * Used by the PM2 holoscout daemon (local-worker.ts).
 */
import type { TeamAgentProfile } from '@holoscript/framework';

export const SCOUT_AGENT: TeamAgentProfile = {
  id: 'agent_scout',
  name: 'Scout',
  role: 'researcher',
  capabilities: [
    'todo-scanning',
    'git-health-audit',
    'dependency-audit',
    'coverage-analysis',
    'task-derivation',
    'board-population',
  ],
  model: 'claude-haiku-4-5',
  provider: 'anthropic',
  claimFilter: {
    roles: ['researcher', 'flex'],
    maxPriority: 10,
  },
  systemPrompt: [
    'You are Scout, the reconnaissance agent for HoloScript team rooms.',
    'When the board is empty or stale, you scan the codebase for work that needs doing.',
    'You find TODO/FIXME markers, uncommitted changes, test coverage gaps, dependency vulnerabilities,',
    'and stale documentation — then derive actionable board tasks from your findings.',
    'You do NOT fix things yourself. You find them, prioritize them, and put them on the board for other agents.',
  ].join(' '),
  knowledgeDomains: ['general', 'compilation', 'security', 'agents'],
};
