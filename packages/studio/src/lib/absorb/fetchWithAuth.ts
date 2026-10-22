/**
 * Authenticated fetch wrapper for absorb-service API calls.
 *
 * Reads the GitHub OAuth token from connectorStore and attaches it
 * as an Authorization header to all outgoing requests.
 */

import { useConnectorStore } from '@/lib/stores/connectorStore';

export function getAbsorbHeaders(): HeadersInit {
  const githubConn = useConnectorStore.getState().connections.github;
  const token = githubConn?.credentials?.token;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Routes that bill the SIGNED-IN SESSION owner and refuse any other credential
 * (403). They resolve the user's credential from the session server-side, so
 * the connector token is never sent to them: if it ever differed from the
 * session's GitHub token, the owner's own request would be refused.
 * Same mechanism as #618; #621 (Mapping N1) adds the absorb stream route.
 */
const SESSION_ONLY_ROUTES: RegExp[] = [/^\/api\/absorb\/projects\/[^/?#]+\/absorb\/stream\/?(?:[?#].*)?$/];

/** True for a route that must not receive the connector Authorization header. */
export function isSessionOnlyRoute(url: string): boolean {
  let pathname = url;
  try {
    pathname = new URL(url, 'http://studio.local').pathname;
  } catch {
    // Not a parseable URL: match the raw string.
  }
  return SESSION_ONLY_ROUTES.some((re) => re.test(pathname));
}

export async function absorbFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  const authHeaders = getAbsorbHeaders();
  const merged = new Headers(authHeaders);

  // Preserve any caller-provided headers
  if (opts.headers) {
    const extra = new Headers(opts.headers);
    extra.forEach((v, k) => merged.set(k, v));
  }

  if (isSessionOnlyRoute(url)) merged.delete('Authorization');

  return fetch(url, { ...opts, headers: merged });
}
