/**
 * Caller identity for the Studio credit gate.
 *
 * Kept free of next/server and @holoscript/config so it can be unit-tested
 * (see creditGate.ts header note on vitest hangs).
 *
 * SECURITY (external-agent access path, PR-4): identity comes ONLY from a
 * verified source: the NextAuth session, or the opt-in benchmark key. Until
 * this change a client-supplied `x-user-id` header was accepted as the user,
 * and any `Authorization: Bearer <anything>` minted an `apikey:<prefix>` user.
 * Both let an unauthenticated caller bill or act as any user id it named, and
 * no code in this repo sends either to Studio. Delegated agents must arrive
 * through the OAuth grant path, which resolves the human server-side.
 */

export interface ResolvedStudioUser {
  id: string | null;
  githubUsername: string;
}

export interface IdentityDeps {
  getSession: () => Promise<{ user?: { id?: string } & Record<string, unknown> } | null>;
  benchmarkKey?: string;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function benchmarkKeyMatches(request: Request, benchmarkKey?: string): boolean {
  if (!benchmarkKey) return false;
  const presented = request.headers.get('x-benchmark-key');
  return presented !== null && constantTimeEqual(presented, benchmarkKey);
}

export async function resolveStudioUser(
  request: Request,
  deps: IdentityDeps
): Promise<ResolvedStudioUser> {
  if (benchmarkKeyMatches(request, deps.benchmarkKey)) {
    return { id: 'benchmark', githubUsername: '' };
  }
  try {
    const session = await deps.getSession();
    if (session?.user?.id) {
      const ghUser = (session.user.githubUsername as string) || '';
      return { id: session.user.id, githubUsername: ghUser };
    }
  } catch {
    // NextAuth not configured: no identity.
  }
  // Deliberately NOT consulted: x-user-id, and a bare Authorization bearer.
  return { id: null, githubUsername: '' };
}
