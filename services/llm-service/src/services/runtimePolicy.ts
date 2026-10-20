/**
 * Server-side runtime policy resolution (external-agent access path).
 *
 * The policy is NEVER read from the request body. It comes only from the
 * delegated access grant that server-side auth attaches to the principal
 * (an outside agent acting for a human under an OAuth grant / client scope).
 *
 * - No grant (the human calling directly, or internal callers): 'any', i.e.
 *   today's routing.
 * - Grant: local-only by default; 'any' only if the grant carries the
 *   `inference:paid` scope, OR the human explicitly opted in to paid compute
 *   for this grant AND has credits (Joseph's rule: credits + opt-in = any).
 */
import type { RuntimePolicy } from './InferenceRouter.js';

export interface AccessGrant {
  clientId: string;
  scopes: string[];
  /** Policy stored on the grant row; defaults to 'local-only'. */
  runtimePolicy?: RuntimePolicy;
  /** The human explicitly opted this grant in to paid/rented compute. */
  paidOptIn?: boolean;
  /** Resolved server-side from the payer's balance at auth time. */
  payerHasCredits?: boolean;
}

export const PAID_SCOPE = 'inference:paid';

export function resolveRuntimePolicy(grant: AccessGrant | undefined | null): RuntimePolicy {
  if (!grant) return 'any';
  const credited = grant.payerHasCredits === true;
  if (grant.paidOptIn === true && credited) return 'any';
  if (grant.scopes.includes(PAID_SCOPE) && credited) return 'any';
  if (grant.runtimePolicy === 'any' && credited) return 'any';
  return 'local-only';
}

/** Read the grant attached by server-side auth; ignores anything in req.body. */
export function grantFromRequest(req: {
  principal?: { grant?: AccessGrant };
}): AccessGrant | undefined {
  return req.principal?.grant;
}
