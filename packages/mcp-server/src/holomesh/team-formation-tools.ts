/**
 * Team Formation MCP Tools
 *
 * MCP tool wrappers for the team-formation service. Today: `holomesh_team_form`
 * (form a task-specific team from a roster).
 *
 * Roster can be passed inline (callers who already have agent profiles) or
 * fetched from the HoloMesh members API when a `team_id` is supplied.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  formTeam,
  type RosterAgent,
  type TeamRequirement,
  type TeamFormationConfig,
  DEFAULT_FORMATION_CONFIG,
} from './team-formation';

// ── MCP Tool Definitions ──

export const teamFormationTools: Tool[] = [
  {
    name: 'holomesh_team_form',
    description:
      'Form a task-specific agent team by scoring a roster against a capability requirement. Returns a ranked FormedTeam with members, capability coverage, gaps, strengths, and recommendations. Pass `roster` inline, or pass `team_id` to fetch active members from the HoloMesh team API.',
    inputSchema: {
      type: 'object',
      properties: {
        requirement: {
          type: 'object',
          description: 'The task requirement to form a team for.',
          properties: {
            taskId: { type: 'string', description: 'Stable identifier for the task being staffed.' },
            taskType: { type: 'string', description: 'Short description of the task domain.' },
            requiredCapabilities: {
              type: 'array',
              items: { type: 'string' },
              description: 'Capabilities that MUST be covered by the team.',
            },
            preferredCapabilities: {
              type: 'array',
              items: { type: 'string' },
              description: 'Capabilities that boost score but are not required.',
            },
            teamSize: { type: 'number', description: 'Target team size. Clamped to [minTeamSize, maxTeamSize].' },
            priority: {
              type: 'string',
              enum: ['low', 'normal', 'high', 'critical'],
              description: 'Priority hint (informational; does not change scoring).',
            },
            metadata: { type: 'object', description: 'Free-form caller metadata.' },
          },
          required: ['taskId', 'taskType', 'requiredCapabilities'],
        },
        roster: {
          type: 'array',
          description: 'Inline roster. Each entry: { agentId, agentName, capabilities, specializationScore?, performanceScore?, active? }.',
          items: {
            type: 'object',
            properties: {
              agentId: { type: 'string' },
              agentName: { type: 'string' },
              capabilities: { type: 'array', items: { type: 'string' } },
              specializationScore: { type: 'number', minimum: 0, maximum: 1 },
              performanceScore: { type: 'number', minimum: 0, maximum: 1 },
              active: { type: 'boolean' },
            },
            required: ['agentId', 'agentName', 'capabilities'],
          },
        },
        team_id: {
          type: 'string',
          description: 'HoloMesh team id. When provided and roster is omitted, members are fetched from the team API.',
        },
        config: {
          type: 'object',
          description: 'Optional formation config overrides. Defaults to DEFAULT_FORMATION_CONFIG.',
          properties: {
            maxTeamSize: { type: 'number' },
            minTeamSize: { type: 'number' },
            preferComplementary: { type: 'boolean' },
            considerPerformance: { type: 'boolean' },
            considerSpecialization: { type: 'boolean' },
            requireActiveAgents: { type: 'boolean' },
          },
        },
      },
      required: ['requirement'],
    },
  },
];

// ── Roster Source ──

export interface RosterSource {
  fetchRoster(teamId: string): Promise<RosterAgent[]>;
}

let rosterSource: RosterSource | null = null;

/**
 * Inject the HoloMesh roster source. Called by the server bootstrap once the
 * mesh client is constructed. When not injected, `holomesh_team_form` requires an
 * inline `roster`.
 */
export function setTeamFormationRosterSource(src: RosterSource): void {
  rosterSource = src;
}

// ── Handler ──

export async function handleTeamFormationTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown | null> {
  if (name !== 'holomesh_team_form') return null;


  const requirement = args.requirement as TeamRequirement | undefined;
  if (!requirement || !requirement.taskId || !requirement.taskType) {
    return { error: '"requirement" with taskId and taskType is required.' };
  }
  if (!Array.isArray(requirement.requiredCapabilities)) {
    return { error: '"requirement.requiredCapabilities" must be an array of capability strings.' };
  }

  let roster = args.roster as RosterAgent[] | undefined;

  if ((!roster || roster.length === 0) && typeof args.team_id === 'string' && args.team_id.length > 0) {
    if (!rosterSource) {
      return { error: 'No roster source configured; pass `roster` inline or call setTeamFormationRosterSource() at server boot.' };
    }
    try {
      roster = await rosterSource.fetchRoster(args.team_id);
    } catch (err) {
      return { error: `Failed to fetch roster for team_id=${args.team_id}: ${(err as Error).message}` };
    }
  }

  if (!roster || roster.length === 0) {
    return { error: 'No roster available. Pass `roster` inline or `team_id` with a configured roster source.' };
  }

  const configOverrides = (args.config as Partial<TeamFormationConfig>) ?? {};
  const team = formTeam(requirement, roster, configOverrides);

  return {
    success: true,
    team,
    defaults: DEFAULT_FORMATION_CONFIG,
  };
}
