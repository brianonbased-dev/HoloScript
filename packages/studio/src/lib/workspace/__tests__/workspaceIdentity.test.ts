import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FOUNDER_WORKSPACE_ID,
  isFounderWorkspaceIdentity,
  resolveWorkspaceIdForIdentity,
} from '../workspaceIdentity';

describe('workspace identity resolution', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps founder identities on the founder workspace', () => {
    expect(resolveWorkspaceIdForIdentity({ githubUsername: 'brianonbased-dev' })).toBe(
      FOUNDER_WORKSPACE_ID
    );
  });

  it('does not default a non-founder user to ai-ecosystem', () => {
    const workspaceId = resolveWorkspaceIdForIdentity({
      id: 'user-1',
      githubUsername: 'octocat',
      email: 'octocat@example.com',
    });

    expect(workspaceId).toBe('ws_octocat');
    expect(workspaceId).not.toBe(FOUNDER_WORKSPACE_ID);
  });

  it('uses the public Studio fallback when no session identity is available', () => {
    expect(resolveWorkspaceIdForIdentity(null)).toBe('studio-workspace');
  });

  it('refuses a non-founder request for ai-ecosystem and falls back to their account workspace', () => {
    const workspaceId = resolveWorkspaceIdForIdentity(
      { id: 'user-2', githubUsername: 'builder' },
      { requestedWorkspaceId: FOUNDER_WORKSPACE_ID }
    );

    expect(workspaceId).toBe('ws_builder');
  });

  it('allows explicit founder mode to target ai-ecosystem', () => {
    const workspaceId = resolveWorkspaceIdForIdentity(
      { id: 'user-3', githubUsername: 'assistant' },
      { requestedWorkspaceId: FOUNDER_WORKSPACE_ID, allowFounderWorkspace: true }
    );

    expect(workspaceId).toBe(FOUNDER_WORKSPACE_ID);
  });

  it('uses configured founder identities', () => {
    vi.stubEnv('STUDIO_FOUNDER_GITHUB_USERS', 'founder-alt');

    expect(isFounderWorkspaceIdentity({ githubUsername: 'founder-alt' })).toBe(true);
    expect(resolveWorkspaceIdForIdentity({ githubUsername: 'founder-alt' })).toBe(
      FOUNDER_WORKSPACE_ID
    );
  });
});
