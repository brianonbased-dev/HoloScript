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

const ABSORB_BASE =
  process.env.ABSORB_SERVICE_URL || 'https://absorb.holoscript.net';
const ABSORB_API_KEY = process.env.ABSORB_API_KEY || process.env.MCP_API_KEY || '';

export type StudioOperation =
  | 'studio_autocomplete'
  | 'studio_generate'
  | 'studio_chat'
  | 'studio_material';

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
async function resolveUserId(request: Request): Promise<string | null> {
  // 1. NextAuth session (browser users)
  try {
    const session = await getSession();
    if (session?.user?.id) return session.user.id;
  } catch {
    // NextAuth not configured — fall through
  }

  // 2. Explicit header (API/CLI clients)
  const headerUserId = request.headers.get('x-user-id');
  if (headerUserId) return headerUserId;

  // 3. Authorization bearer token as user identity
  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) {
    return `apikey:${auth.slice(7, 20)}`;
  }

  return null;
}

/**
 * Pre-flight credit check. Must be called BEFORE making any LLM call.
 * Returns a CreditGateResult — check `.error` to see if the user can proceed.
 */
export async function checkCredits(
  request: Request,
  operation: StudioOperation
): Promise<CreditGateResult> {
  const userId = await resolveUserId(request);

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
  } catch (err) {
    dlq.push({ userId, operation, timestamp: Date.now() });
    console.error(`[creditGate] Failed to deduct credits for ${userId}/${operation}. Queued for retry.`);
  }
}
