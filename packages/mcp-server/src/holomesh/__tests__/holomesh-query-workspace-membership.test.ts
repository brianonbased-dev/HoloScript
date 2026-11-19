/**
 * holomesh_query must not let a non-member search a private team's workspace
 * (task_1790079366686_qvr6).
 *
 * The premium gate (entitledSearchRows/entryForViewer, doors audit 2026-09-15) decides
 * whether a PAID row's content may be read, but says nothing about whether the caller may
 * search this WORKSPACE at all -- a free entry in a private team was returned to anyone who
 * named that team's workspace id, and the orchestrator cannot enforce this either:
 * HoloMeshOrchestratorClient authenticates every request with this server's own shared
 * `x-mcp-api-key`, never the individual end caller's identity.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../state', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    persistTeamDurable: vi.fn().mockResolvedValue(undefined),
    reloadTeam: vi.fn().mockResolvedValue(undefined),
  };
});

// Real network is never reached: queryKnowledge is a plain stub. This test proves the
// membership refusal, not the orchestrator round-trip (that is covered elsewhere).
const mockClient = {
  queryKnowledge: vi.fn().mockResolvedValue([]),
  getAgentId: vi.fn().mockReturnValue('server-agent-id'),
};
vi.mock('../orchestrator-client', () => ({
  HoloMeshOrchestratorClient: vi.fn(function (this: unknown) {
    Object.assign(this as object, mockClient);
  }),
}));

const { teamStore } = await import('../state');
const { getTeamWorkspaceId } = await import('../utils');
const { viewerMayQueryTeamWorkspace, ANONYMOUS_VIEWER } = await import('../entry-lookup');
const { handleHoloMeshTool, _resetHoloMeshClientForTests } = await import('../holomesh-tools');

const PREVIOUS_API_KEY = process.env.HOLOSCRIPT_API_KEY;
beforeEach(() => {
  process.env.HOLOSCRIPT_API_KEY = 'test-key-for-workspace-membership';
  mockClient.queryKnowledge.mockClear();
  _resetHoloMeshClientForTests();
});
afterEach(() => {
  if (PREVIOUS_API_KEY === undefined) delete process.env.HOLOSCRIPT_API_KEY;
  else process.env.HOLOSCRIPT_API_KEY = PREVIOUS_API_KEY;
  _resetHoloMeshClientForTests();
});

function seedTeam(teamId: string, overrides: Record<string, unknown> = {}) {
  const team = {
    id: teamId,
    name: 'Test Team',
    description: '',
    type: 'dev',
    visibility: 'private',
    ownerId: 'owner-1',
    ownerName: 'Owner',
    members: [
      { agentId: 'owner-1', agentName: 'Owner', role: 'owner', joinedAt: new Date().toISOString() },
    ],
    maxSlots: 5,
    waitlist: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
  teamStore.set(teamId, team as never);
  return team;
}

describe('viewerMayQueryTeamWorkspace', () => {
  it('lets a member query their own private team workspace', () => {
    seedTeam('private-team-1', { members: [{ agentId: 'member-1' }] });
    expect(
      viewerMayQueryTeamWorkspace(
        { authenticated: true, id: 'member-1' },
        getTeamWorkspaceId('private-team-1')
      )
    ).toBe(true);
  });

  it('refuses a non-member querying a private team workspace', () => {
    seedTeam('private-team-2', { members: [{ agentId: 'member-1' }] });
    expect(
      viewerMayQueryTeamWorkspace(
        { authenticated: true, id: 'stranger' },
        getTeamWorkspaceId('private-team-2')
      )
    ).toBe(false);
  });

  it('refuses an unauthenticated (anonymous) caller on a private team workspace', () => {
    seedTeam('private-team-3');
    expect(
      viewerMayQueryTeamWorkspace(ANONYMOUS_VIEWER, getTeamWorkspaceId('private-team-3'))
    ).toBe(false);
  });

  it('lets anyone, including anonymous, query a public team workspace', () => {
    seedTeam('public-team-1', { visibility: 'public', members: [] });
    expect(viewerMayQueryTeamWorkspace(ANONYMOUS_VIEWER, getTeamWorkspaceId('public-team-1'))).toBe(
      true
    );
    expect(
      viewerMayQueryTeamWorkspace(
        { authenticated: true, id: 'anyone' },
        getTeamWorkspaceId('public-team-1')
      )
    ).toBe(true);
  });

  it('refuses an unknown team id rather than leaking whether it exists', () => {
    expect(
      viewerMayQueryTeamWorkspace(
        { authenticated: true, id: 'someone' },
        getTeamWorkspaceId('no-such-team')
      )
    ).toBe(false);
  });

  it("leaves a non-team workspace-id namespace unchanged (not this check's scope)", () => {
    expect(viewerMayQueryTeamWorkspace(ANONYMOUS_VIEWER, 'private:some-agent')).toBe(true);
    expect(viewerMayQueryTeamWorkspace(ANONYMOUS_VIEWER, 'recruit:some-drive')).toBe(true);
  });
});

describe('holomesh_query end to end (orchestrator stubbed, never reached when refused)', () => {
  it('refuses a non-member naming a private workspace, and never calls the orchestrator', async () => {
    seedTeam('e2e-private-1', { members: [{ agentId: 'member-1' }] });
    const args = {
      search: 'anything',
      workspace: getTeamWorkspaceId('e2e-private-1'),
      __authAgentId: 'stranger',
    };
    const result = (await handleHoloMeshTool('holomesh_query', args)) as { error?: string };
    expect(result.error).toMatch(/not authorized to query workspace/i);
    expect(mockClient.queryKnowledge).not.toHaveBeenCalled();
  });

  it('does not refuse a member naming their own private workspace, and does query', async () => {
    seedTeam('e2e-private-2', { members: [{ agentId: 'member-1' }] });
    const args = {
      search: 'anything',
      workspace: getTeamWorkspaceId('e2e-private-2'),
      __authAgentId: 'member-1',
    };
    const result = (await handleHoloMeshTool('holomesh_query', args)) as { error?: string };
    expect(result.error).toBeUndefined();
    expect(mockClient.queryKnowledge).toHaveBeenCalledTimes(1);
  });

  it('does not refuse a query with no workspace named (unscoped discovery, unaffected)', async () => {
    const args = { search: 'anything', __authAgentId: 'anyone' };
    const result = (await handleHoloMeshTool('holomesh_query', args)) as { error?: string };
    expect(result.error).toBeUndefined();
    expect(mockClient.queryKnowledge).toHaveBeenCalledTimes(1);
  });
});
