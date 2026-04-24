/**
 * Studio Credit Gate — Pre-flight credit check for AI routes.
 *
 * Proxies to the absorb service's credit system via HTTP. If the absorb
 * service is unavailable, the request is BLOCKED (fail-closed). No free
 * LLM calls.
 *
 * Usage in a route handler:
 *
 * ```ts
 * const gate = await checkCredits(request, 'studio_autocomplete');
 * if (gate.error) return gate.error;
 * // ... do the LLM call ...
 * await deductCredits(gate.userId, 'studio_autocomplete');
 * ```
 */

import { NextResponse } from 'next/server';
import { getSession } from './api-auth';

import { ENDPOINTS, getAbsorbKey, getMcpApiKey } from '@holoscript/config';

const ABSORB_BASE = ENDPOINTS.ABSORB_SERVICE;
const ABSORB_API_KEY = getAbsorbKey() || getMcpApiKey() || '';

// Guard: validate ABSORB_BASE is a well-formed http/https URL to prevent SSRF via misconfiguration
(function validateAbsorbBase() {
  try {
    const parsed = new URL(ABSORB_BASE);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error(`ABSORB_SERVICE must be an http/https URL, got protocol: ${parsed.protocol}`);
    }
  } catch (e) {
    throw new Error(`Invalid ABSORB_SERVICE endpoint: ${ABSORB_BASE} — ${String(e)}`);
  }
})();

// Admin bypass — comma-separated GitHub usernames that skip credit checks
const ADMIN_GITHUB_USERNAMES = new Set(
  (process.env.ADMIN_GITHUB_USERNAMES || '')
    .split(',')
    .map((u) => u.trim().toLowerCase())
    .filter(Boolean)
);

export type StudioOperation =
  | 'studio_autocomplete'
  | 'studio_generate'
  | 'studio_chat'
  | 'studio_material'
  | 'studio_voice_to_holo';

export interface CreditGateSuccess {
  userId: string;
  error: null;
}

export interface CreditGateFailure {
  userId: string | null;
  error: NextResponse;
}

export type CreditGateResult = CreditGateSuccess | CreditGateFailure;

/**
 * Resolve user identity. Tries NextAuth session first, falls back to
 * x-user-id header (for API/CLI clients), then to the absorb API key
 * as an admin identity.
 */
async function resolveUser(request: Request): Promise<{ id: string | null; githubUsername: string }> {
  // 1. NextAuth session (browser users)
  try {
    const session = await getSession();
    if (session?.user?.id) {
      const ghUser = (session.user as Record<string, unknown>).githubUsername as string || '';
      return { id: session.user.id, githubUsername: ghUser };
    }
  } catch {
    // NextAuth not configured — fall through
  }

  // 2. Explicit header (API/CLI clients)
  const headerUserId = request.headers.get('x-user-id');
  if (headerUserId) return { id: headerUserId, githubUsername: '' };

  // 3. Authorization bearer token as user identity
  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) {
    return { id: `apikey:${auth.slice(7, 20)}`, githubUsername: '' };
  }

  return { id: null, githubUsername: '' };
}

/**
 * Pre-flight credit check. Must be called BEFORE making any LLM call.
 * Admin GitHub usernames (ADMIN_GITHUB_USERNAMES env) bypass credits entirely.
 * Returns a CreditGateResult — check `.error` to see if the user can proceed.
 */
export async function checkCredits(
  request: Request,
  operation: StudioOperation
): Promise<CreditGateResult> {
  const { id: userId, githubUsername } = await resolveUser(request);

  // Admin bypass — founders/admins skip credit checks
  if (githubUsername && ADMIN_GITHUB_USERNAMES.has(githubUsername.toLowerCase())) {
    return { userId: userId || `admin:${githubUsername}`, error: null };
  }

  if (!userId) {
    return {
      userId: null,
      error: NextResponse.json(
        {
          error: 'Authentication required',
          hint: 'Sign in or provide x-user-id header',
        },
        { status: 401 }
      ),
    };
  }

  try {
    const res = await fetch(`${ABSORB_BASE}/api/credits/check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ABSORB_API_KEY}`,
      },
      body: JSON.stringify({ userId, operation }),
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      return { userId, error: null };
    }

    if (res.status === 402) {
      const data = await res.json().catch(() => ({}));
      return {
        userId,
        error: NextResponse.json(
          {
            error: 'Insufficient credits',
            required: data.required,
            balance: data.balance,
            description: data.description,
            purchaseUrl: '/absorb?tab=credits',
          },
          { status: 402 }
        ),
      };
    }

    // Other errors from absorb service
    return {
      userId,
      error: NextResponse.json(
        { error: 'Credit check failed', upstream: res.status },
        { status: 502 }
      ),
    };
  } catch {
    // Absorb service unreachable — fail closed (no free LLM calls)
    return {
      userId,
      error: NextResponse.json(
        {
          error: 'Credit service unavailable',
          hint: 'The credit system is required for AI features. Try again shortly.',
        },
        { status: 503 }
      ),
    };
  }
}

/**
 * Deduct credits after a successful LLM call.
 * Fire-and-forget — does not block the response.
 */

// In-memory dead letter queue for failed deductions
// Note: In serverless environments, this will reset on cold start,
// but it provides best-effort retry during active instances.
const dlq: { userId: string; operation: StudioOperation; timestamp: number }[] = [];

// Periodic retry loop (runs every 60 seconds if items exist)
if (typeof setInterval !== 'undefined') {
  setInterval(async () => {
    if (dlq.length === 0) return;
    const batch = dlq.splice(0, dlq.length);
    for (const item of batch) {
      try {
        const res = await fetch(`${ABSORB_BASE}/api/credits/deduct`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${ABSORB_API_KEY}`,
          },
          body: JSON.stringify({ userId: item.userId, operation: item.operation }),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) throw new Error('Upstream rejected retry');
      } catch {
        // Drop if older than 2 hours to prevent memory leak
        if (Date.now() - item.timestamp < 2 * 60 * 60 * 1000) {
          dlq.push(item);
        }
      }
    }
  }, 60 * 1000);
}

export async function deductCredits(
  userId: string,
  operation: StudioOperation
): Promise<void> {
  try {
    const res = await fetch(`${ABSORB_BASE}/api/credits/deduct`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ABSORB_API_KEY}`,
      },
      body: JSON.stringify({ userId, operation }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }  catch (_err) {
    dlq.push({ userId, operation, timestamp: Date.now() });
    console.error(`[creditGate] Failed to deduct credits for ${userId}/${operation}. Queued for retry.`);
  }
}

