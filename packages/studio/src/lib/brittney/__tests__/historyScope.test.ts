import { describe, expect, it } from 'vitest';
import { resolveBrittneyHistoryScope } from '../historyScope';

describe('resolveBrittneyHistoryScope', () => {
  it('prefers active workspace identity over scene identity', () => {
    expect(
      resolveBrittneyHistoryScope({
        activeWorkspaceId: 'ws_octocat',
        activeSceneId: 'default',
        routeScope: '/create',
      })
    ).toBe('workspace:ws_octocat');
  });

  it('falls back to route-scoped project history when no workspace is active', () => {
    expect(
      resolveBrittneyHistoryScope({
        activeSceneId: 'Scene 1',
        routeScope: '/create',
      })
    ).toBe('project:create:scene-1');
  });

  it('does not collapse empty context into the old global default key', () => {
    expect(resolveBrittneyHistoryScope({})).toBe('project:studio:default');
  });
});
