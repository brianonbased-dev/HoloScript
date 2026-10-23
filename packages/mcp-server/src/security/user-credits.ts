/**
 * absorb_check_credits for remote callers (Trust & Consent C1).
 *
 * The absorb-service handler reads credits through `args.apiKey`, falling back
 * to the server's ABSORB_API_KEY: a remote caller would see the SERVER account
 * (or whoever's key it passed). For any caller that is not the local stdio
 * user, mcp-server answers this tool itself, from the credit ledger row of the
 * token's own user, and never forwards to the absorb handler. No resolver
 * configured (no ledger) means refusal, never a fallback.
 */
export type UserCreditsResolver = (
  userId: string
) => Promise<{ balanceCents: number; found: boolean }>;

let resolver: UserCreditsResolver | undefined;

export function setUserCreditsResolver(fn: UserCreditsResolver | undefined): void {
  resolver = fn;
}

export async function checkCreditsForUser(userId: string): Promise<Record<string, unknown>> {
  if (!resolver) {
    return {
      success: false,
      error:
        'absorb_check_credits: the credit ledger is not available on this server; nothing was read (no server-key fallback).',
    };
  }
  const r = await resolver(userId);
  return {
    success: true,
    userId,
    balance_cents: r.balanceCents,
    account_found: r.found,
    source: 'credit_accounts (token user)',
  };
}
