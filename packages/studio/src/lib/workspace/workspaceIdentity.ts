export const FOUNDER_WORKSPACE_ID = 'ai-ecosystem';
export const DEFAULT_STUDIO_WORKSPACE_ID = 'studio-workspace';

/**
 * Who counts as the founder. Doors audit 2026-09-15, round 6.
 *
 * The previous rule matched a fixed set of strings against the OAuth DISPLAY
 * NAME as well as the login and the email, and one of those strings was the
 * generic value 'josep'. A display name is chosen freely by whoever signs in,
 * so anyone who made a Google or GitHub account and typed that name was
 * treated as the founder. That flag switches Brittney to the GOLD founder key,
 * skips the premium cut on knowledge answers, and opens Studio's founder-only
 * spend and admin routes.
 *
 * Founder authority is now recognised only by identifiers the person signing in
 * cannot choose for themselves, and only from explicit configuration:
 *
 *   STUDIO_FOUNDER_GITHUB_IDS    GitHub NUMERIC account ids. Immutable and
 *                                never reissued, so this is the strongest
 *                                signal and the one to prefer.
 *   STUDIO_FOUNDER_EMAILS        Email addresses, which count only when the
 *                                provider itself asserted the address is
 *                                verified (Google sends `email_verified`).
 *   STUDIO_FOUNDER_GITHUB_USERS  GitHub LOGINS, matched only against the login
 *                                of a session that actually signed in through
 *                                GitHub — holding the login means controlling
 *                                that account. Kept so an existing deployment
 *                                keeps working and nobody is locked out mid
 *                                token lifetime; migrate it to the numeric ids.
 *
 * Nothing is recognised by default. With none of these set, no session is the
 * founder and the first check says so in the log.
 *
 * This tightens how founder authority is RECOGNISED. It does not change what
 * the founder is allowed to do.
 */

export interface WorkspaceIdentityInput {
  id?: string | null;
  /** Display name from the OAuth profile. Freely chosen, so never an authority signal. */
  name?: string | null;
  email?: string | null;
  githubUsername?: string | null;
  /** The OAuth provider this session signed in through ('github', 'google', ...). */
  provider?: string | null;
  /** The provider's own immutable account id: GitHub's numeric id, Google's `sub`. */
  providerAccountId?: string | null;
  /** True only when the provider asserted that this email address is verified. */
  emailVerified?: boolean | null;
}

export interface ResolveWorkspaceIdOptions {
  requestedWorkspaceId?: string | null;
  allowFounderWorkspace?: boolean;
  fallbackWorkspaceId?: string;
}

/** What an operator must set for a founder to be recognised at all. */
export const FOUNDER_RECOGNITION_UNCONFIGURED_MESSAGE =
  '[founder-identity] No founder is configured, so no sign-in will be treated as the founder ' +
  'and the founder-only surfaces stay closed. Set STUDIO_FOUNDER_GITHUB_IDS to the founder ' +
  'GitHub numeric account id (preferred), and/or STUDIO_FOUNDER_EMAILS to a provider-verified ' +
  'email address, and/or STUDIO_FOUNDER_GITHUB_USERS to the founder GitHub login.';

function configuredValues(variableName: string): Set<string> {
  const raw = typeof process !== 'undefined' ? (process.env[variableName] ?? '') : '';
  return new Set(
    raw
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

export interface FounderRecognitionConfig {
  /** GitHub numeric account ids that are the founder. */
  githubIds: Set<string>;
  /** Email addresses that are the founder, once the provider says they are verified. */
  emails: Set<string>;
  /** GitHub logins that are the founder, for a session signed in through GitHub. */
  githubLogins: Set<string>;
  /** False when nothing is configured — in which case nobody is the founder. */
  configured: boolean;
}

/** The configured founder identifiers, read fresh so a deploy-time change takes effect. */
export function founderRecognitionConfig(): FounderRecognitionConfig {
  const githubIds = configuredValues('STUDIO_FOUNDER_GITHUB_IDS');
  const emails = configuredValues('STUDIO_FOUNDER_EMAILS');
  const githubLogins = configuredValues('STUDIO_FOUNDER_GITHUB_USERS');
  return {
    githubIds,
    emails,
    githubLogins,
    configured: githubIds.size > 0 || emails.size > 0 || githubLogins.size > 0,
  };
}

let warnedFounderRecognitionUnconfigured = false;

function warnFounderRecognitionUnconfigured(): void {
  if (warnedFounderRecognitionUnconfigured) return;
  warnedFounderRecognitionUnconfigured = true;
  console.warn(FOUNDER_RECOGNITION_UNCONFIGURED_MESSAGE);
}

function normalized(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isFounderWorkspaceIdentity(identity?: WorkspaceIdentityInput | null): boolean {
  if (!identity) return false;

  const config = founderRecognitionConfig();
  if (!config.configured) {
    warnFounderRecognitionUnconfigured();
    return false;
  }

  const signedInWithGitHub = normalized(identity.provider) === 'github';

  // 1. The GitHub numeric account id. Immutable, never reissued.
  const accountId = normalized(identity.providerAccountId);
  if (signedInWithGitHub && accountId && config.githubIds.has(accountId)) {
    return true;
  }

  // 2. An email address the provider itself said is verified. An unverified
  //    address proves nothing: a sign-up form accepts any string.
  if (identity.emailVerified === true) {
    const email = normalized(identity.email);
    if (email && config.emails.has(email)) {
      return true;
    }
  }

  // 3. The GitHub login, and only from a session that signed in through GitHub,
  //    so a Google sign-in cannot present someone else's login.
  const login = normalized(identity.githubUsername);
  if (signedInWithGitHub && login && config.githubLogins.has(login)) {
    return true;
  }

  return false;
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
