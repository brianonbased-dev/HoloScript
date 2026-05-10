const DEFAULT_ROUTE_SCOPE = 'studio';
const DEFAULT_SCENE_SCOPE = 'default';

function normalizeScopePart(value: string | null | undefined, fallback: string): string {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);

  return normalized || fallback;
}

export interface BrittneyHistoryScopeInput {
  activeWorkspaceId?: string | null;
  activeSceneId?: string | null;
  routeScope?: string | null;
}

export function resolveBrittneyHistoryScope(input: BrittneyHistoryScopeInput): string {
  const workspaceId = normalizeScopePart(input.activeWorkspaceId, '');
  if (workspaceId) {
    return `workspace:${workspaceId}`;
  }

  const routeScope = normalizeScopePart(input.routeScope, DEFAULT_ROUTE_SCOPE);
  const sceneId = normalizeScopePart(input.activeSceneId, DEFAULT_SCENE_SCOPE);
  return `project:${routeScope}:${sceneId}`;
}
