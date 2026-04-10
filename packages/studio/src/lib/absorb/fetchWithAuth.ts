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

export async function absorbFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  const authHeaders = getAbsorbHeaders();
  const merged = new Headers(authHeaders);

  // Preserve any caller-provided headers
  if (opts.headers) {
    const extra = new Headers(opts.headers);
    extra.forEach((v, k) => merged.set(k, v));
  }

  return fetch(url, { ...opts, headers: merged });
}
