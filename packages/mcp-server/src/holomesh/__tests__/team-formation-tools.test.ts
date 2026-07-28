import { describe, it, expect, beforeAll } from 'vitest';
import {
  handleTeamFormationTool,
  setTeamFormationRosterSource,
  type RosterSource,
} from '../team-formation-tools';
import type { RosterAgent } from '../team-formation';

/**
 * Regression coverage for task_1784579983269_ragg: `setTeamFormationRosterSource()`
 * (team-formation-tools.ts) was never called anywhere in the codebase — the
 * identical never-wired DI pattern flagged (but not fixed) alongside the
 * task_1784578782174_oo87 `holomesh_search` fix. Unlike that bug,
 * `holomesh_team_form` already worked fine with an inline `roster`; only the
 * `team_id` convenience path was broken, and it failed loud (an explicit
 * "No roster source configured" error), not silently with 0 results.
 *
 * http-server.ts now wires a real roster source at startup (team membership
 * from teamStore/reloadTeam, cross-referenced against agentKeyStore for
 * capabilities/reputation, liveness from teamPresenceStore). This test wires
 * an equivalent fake source directly against the exported contract so it
 * doesn't depend on the HTTP server boot sequence.
 */

const seededRoster: RosterAgent[] = [
  {
    agentId: 'agent_test_forge',
    agentName: 'Forge',
    capabilities: ['rust', 'wasm'],
    specializationScore: 0.9,
    performanceScore: 0.8,
    active: true,
  },
  {
    agentId: 'agent_test_quill',
    agentName: 'Quill',
    capabilities: ['docs', 'editorial'],
    specializationScore: 0.6,
    performanceScore: 0.5,
    active: true,
  },
  {
    agentId: 'agent_test_ghost',
    agentName: 'Ghost',
    capabilities: ['rust'],
    specializationScore: 0.3,
    performanceScore: 0.2,
    active: false,
  },
];

const fakeRosterSource: RosterSource = {
  async fetchRoster(teamId: string): Promise<RosterAgent[]> {
    if (teamId !== 'team_test_seeded') return [];
    return seededRoster;
  },
};

describe('holomesh_team_form roster source (setTeamFormationRosterSource wiring)', () => {
  beforeAll(() => {
    setTeamFormationRosterSource(fakeRosterSource);
  });

  it('errors clearly for an unconfigured/unknown team_id (no inline roster)', async () => {
    const result = (await handleTeamFormationTool('holomesh_team_form', {
      requirement: {
        taskId: 'task_x',
        taskType: 'unknown-team-probe',
        requiredCapabilities: ['rust'],
      },
      team_id: 'team_does_not_exist',
    })) as { error?: string };

    expect(result.error).toBeTruthy();
    expect(result.error).toMatch(/no roster available/i);
  });

  it('forms a real, non-empty team from a team_id once the roster source resolves it', async () => {
    const result = (await handleTeamFormationTool('holomesh_team_form', {
      requirement: {
        taskId: 'task_rust_wasm',
        taskType: 'wasm-build',
        requiredCapabilities: ['rust', 'wasm'],
      },
      team_id: 'team_test_seeded',
    })) as {
      success: boolean;
      team: {
        members: Array<{ agentId: string; agentName: string; capabilities: string[] }>;
        capabilityCoverage: number;
      };
    };

    expect(result.success).toBe(true);
    expect(result.team.members.length).toBeGreaterThan(0);
    // Forge covers both required capabilities and should be selected.
    expect(result.team.members.some((m) => m.agentId === 'agent_test_forge')).toBe(true);
    expect(result.team.capabilityCoverage).toBe(1);
  });

  it('excludes inactive roster agents by default (requireActiveAgents)', async () => {
    const result = (await handleTeamFormationTool('holomesh_team_form', {
      requirement: {
        taskId: 'task_rust_only',
        taskType: 'rust-only',
        requiredCapabilities: ['rust'],
      },
      team_id: 'team_test_seeded',
    })) as { success: boolean; team: { members: Array<{ agentId: string }> } };

    expect(result.success).toBe(true);
    // Ghost has 'rust' but active:false — must not be selected while Forge
    // (also active, also 'rust') is available.
    expect(result.team.members.some((m) => m.agentId === 'agent_test_ghost')).toBe(false);
  });

  it('still prefers an inline roster over the injected team_id source when both are present', async () => {
    const inlineRoster: RosterAgent[] = [
      {
        agentId: 'agent_inline_only',
        agentName: 'InlineOnly',
        capabilities: ['docs'],
        active: true,
      },
    ];

    const result = (await handleTeamFormationTool('holomesh_team_form', {
      requirement: {
        taskId: 'task_docs',
        taskType: 'docs-only',
        requiredCapabilities: ['docs'],
      },
      roster: inlineRoster,
      team_id: 'team_test_seeded',
    })) as { success: boolean; team: { members: Array<{ agentId: string }> } };

    expect(result.success).toBe(true);
    expect(result.team.members.map((m) => m.agentId)).toEqual(['agent_inline_only']);
  });
});
