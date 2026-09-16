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
 *   STUDIO_FOUNDER_GOOGLE_IDS    Google account ids — the `sub` claim, which is
 *                                Google's own immutable per-account subject.
 *                                Same strength as the GitHub numeric id, for
 *                                the sign-in the founder actually uses on
 *                                Google.
 *   STUDIO_FOUNDER_EMAILS        Email addresses, matched only against a GOOGLE
 *                                session (see the transition note below).
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
 * THE ALREADY-ISSUED-TOKEN WINDOW. Sessions are JWTs with a 30-day life, and a
 * token only gains a field when it is minted. `providerAccountId` and
 * `emailVerified` are both new here, so NO token issued before this deploy
 * carries either one. Old tokens do carry `provider`, `email` and the GitHub
 * login. So recognition must not depend solely on the new fields or the founder
 * is signed out of his own surfaces until his token expires:
 *
 *   - a GitHub session keeps working through STUDIO_FOUNDER_GITHUB_USERS;
 *   - a GOOGLE session keeps working through STUDIO_FOUNDER_EMAILS, which is
 *     why the email branch accepts `emailVerified` being ABSENT — absent means
 *     "minted before the field existed", not "the provider said no". An
 *     explicit `false` is still a refusal, so the API-key and benchmark paths
 *     (which set it false on purpose) stay non-founder.
 *
 * The email branch is restricted to Google because Google asserts
 * `email_verified` on its own accounts and does not let a holder set an
 * arbitrary unverified address; GitHub sends no such claim and its profile
 * email can be anything, which is why a GitHub session is never recognised by
 * email at all.
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
  /**
   * What the provider said about this email address.
   *   true      — the provider asserted it is verified.
   *   false     — explicitly not verified, or a non-sign-in caller (API key,
   *               benchmark header) that must never be the founder.
   *   undefined — unknown, because the token was minted before this field
   *               existed. Treated as "unknown", not as "no"; see the
   *               already-issued-token window above.
   */
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
  'GitHub numeric account id (preferred), and/or STUDIO_FOUNDER_GOOGLE_IDS to the founder ' +
  'Google account id, and/or STUDIO_FOUNDER_EMAILS to the founder Google address, and/or ' +
  'STUDIO_FOUNDER_GITHUB_USERS to the founder GitHub login.';

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
  /** Google account ids (`sub`) that are the founder. */
  googleIds: Set<string>;
  /** Email addresses that are the founder, for a session signed in through Google. */
  emails: Set<string>;
  /** GitHub logins that are the founder, for a session signed in through GitHub. */
  githubLogins: Set<string>;
  /** False when nothing is configured — in which case nobody is the founder. */
  configured: boolean;
}

/** The configured founder identifiers, read fresh so a deploy-time change takes effect. */
export function founderRecognitionConfig(): FounderRecognitionConfig {
  const githubIds = configuredValues('STUDIO_FOUNDER_GITHUB_IDS');
  const googleIds = configuredValues('STUDIO_FOUNDER_GOOGLE_IDS');
  const emails = configuredValues('STUDIO_FOUNDER_EMAILS');
  const githubLogins = configuredValues('STUDIO_FOUNDER_GITHUB_USERS');
  return {
    githubIds,
    googleIds,
    emails,
    githubLogins,
    configured:
      githubIds.size > 0 || googleIds.size > 0 || emails.size > 0 || githubLogins.size > 0,
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

  const provider = normalized(identity.provider);
  const signedInWithGitHub = provider === 'github';
  const signedInWithGoogle = provider === 'google';

  // 1. The provider's OWN immutable account id — GitHub's numeric id, Google's
  //    `sub`. Nobody can choose one for themselves and they are never reissued,
  //    so this is the branch to configure and the only one worth keeping long
  //    term. Each id is matched only against the provider it belongs to.
  const accountId = normalized(identity.providerAccountId);
  if (accountId) {
    if (signedInWithGitHub && config.githubIds.has(accountId)) return true;
    if (signedInWithGoogle && config.googleIds.has(accountId)) return true;
  }

  // 2. A configured email, and only from a GOOGLE sign-in, where the address
  //    comes out of Google's own ID token. An explicit `false` is a refusal —
  //    the API-key and benchmark callers set it false precisely so they can
  //    never be the founder. ABSENT is not a refusal: it means the token was
  //    minted before this field existed, and dropping those would sign the
  //    founder out of his own surfaces for the rest of the 30-day JWT window.
  if (signedInWithGoogle && identity.emailVerified !== false) {
    const email = normalized(identity.email);
    if (email && config.emails.has(email)) {
      return true;
    }
  }

  // 3. The GitHub login, and only from a session that signed in through GitHub,
  //    so a Google sign-in cannot present someone else's login. This is what
  //    carries GitHub sessions minted before `providerAccountId` existed.
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
