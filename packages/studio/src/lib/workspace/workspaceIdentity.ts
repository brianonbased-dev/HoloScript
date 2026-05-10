export const FOUNDER_WORKSPACE_ID = 'ai-ecosystem';
export const DEFAULT_STUDIO_WORKSPACE_ID = 'studio-workspace';

export interface WorkspaceIdentityInput {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  githubUsername?: string | null;
}

export interface ResolveWorkspaceIdOptions {
  requestedWorkspaceId?: string | null;
  allowFounderWorkspace?: boolean;
  fallbackWorkspaceId?: string;
}

function founderIdentityValues(): Set<string> {
  const configured =
    typeof process !== 'undefined'
      ? (process.env.STUDIO_FOUNDER_GITHUB_USERS ?? '')
          .split(',')
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean)
      : [];

  return new Set([
    'brianonbased',
    'brianonbased-dev',
    'josep',
    'brianonbased@gmail.com',
    ...configured,
  ]);
}

export function isFounderWorkspaceIdentity(identity?: WorkspaceIdentityInput | null): boolean {
  if (!identity) return false;
  const founderValues = founderIdentityValues();
  return [identity.githubUsername, identity.name, identity.email, identity.id]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim().toLowerCase())
    .some((value) => founderValues.has(value));
}

export function sanitizeWorkspaceId(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 96) || DEFAULT_STUDIO_WORKSPACE_ID
  );
}

function identityWorkspaceId(
  identity?: WorkspaceIdentityInput | null,
  fallbackWorkspaceId?: string
): string {
  const raw =
    identity?.githubUsername?.trim() ||
    identity?.name?.trim() ||
    identity?.email?.trim() ||
    identity?.id?.trim();
  if (!raw) {
    return sanitizeWorkspaceId(fallbackWorkspaceId || DEFAULT_STUDIO_WORKSPACE_ID);
  }
  return `ws_${sanitizeWorkspaceId(raw)}`;
}

export function resolveWorkspaceIdForIdentity(
  identity?: WorkspaceIdentityInput | null,
  options: ResolveWorkspaceIdOptions = {}
): string {
  const requested = options.requestedWorkspaceId
    ? sanitizeWorkspaceId(options.requestedWorkspaceId)
    : null;
  const founderIdentity = isFounderWorkspaceIdentity(identity);
  const allowFounderWorkspace = options.allowFounderWorkspace === true || founderIdentity;

  if (requested && requested !== FOUNDER_WORKSPACE_ID) {
    return requested;
  }

  if (requested === FOUNDER_WORKSPACE_ID && allowFounderWorkspace) {
    return FOUNDER_WORKSPACE_ID;
  }

  if (!requested && founderIdentity) {
    return FOUNDER_WORKSPACE_ID;
  }

  return identityWorkspaceId(identity, options.fallbackWorkspaceId);
}
