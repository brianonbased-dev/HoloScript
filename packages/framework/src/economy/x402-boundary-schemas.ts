/**
 * Runtime boundary validation for x402 payment payloads (Zod).
 *
 * Rejects malformed headers, prototype pollution, and trait-injected extra fields
 * before BigInt / facilitator logic runs.
 */

import { z } from 'zod';

/** Must match `X402_VERSION` in x402-facilitator.ts */
const X402_VERSION_LITERAL = 1 as const;

/** Must match `SettlementChain` / USDC_CONTRACTS keys in x402-facilitator.ts */
const SETTLEMENT_CHAINS = ['base', 'base-sepolia', 'solana', 'solana-devnet'] as const;

export const x402SettlementChainSchema = z.enum(SETTLEMENT_CHAINS);

const authorizationSchema = z
  .object({
    from: z.string().min(1).max(128),
    to: z.string().min(1).max(128),
    value: z
      .string()
      .regex(/^\d+$/)
      .refine((s) => {
        try {
          return BigInt(s) >= 0n;
        } catch {
          return false;
        }
      }, 'value must be a non-negative integer string'),
    validAfter: z.string().regex(/^\d+$/),
    validBefore: z.string().regex(/^\d+$/),
    nonce: z.string().min(8).max(256),
  })
  .strict();

const paymentPayloadInnerSchema = z
  .object({
    signature: z.string().min(10).max(10_000),
    authorization: authorizationSchema,
  })
  .strict();

/** Strict structural match for {@link import('./x402-facilitator').X402PaymentPayload}. */
export const x402PaymentPayloadSchema = z
  .object({
    x402Version: z.literal(X402_VERSION_LITERAL),
    scheme: z.literal('exact'),
    network: x402SettlementChainSchema,
    payload: paymentPayloadInnerSchema,
  })
  .strict();

export type X402PaymentPayloadParsed = z.infer<typeof x402PaymentPayloadSchema>;

export const x402RequiredAmountSchema = z.string().regex(/^\d+$/, 'requiredAmount must be base-units digits only');

export function formatX402ParseError(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.') || 'payload'}: ${i.message}`).join('; ');
}

export function safeParseX402PaymentPayload(
  input: unknown
): { success: true; data: X402PaymentPayloadParsed } | { success: false; error: string } {
  const r = x402PaymentPayloadSchema.safeParse(input);
  if (r.success) return { success: true, data: r.data };
  return { success: false, error: formatX402ParseError(r.error) };
}
