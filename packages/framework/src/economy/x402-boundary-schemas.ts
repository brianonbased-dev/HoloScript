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
  .strict()
  .refine(
    (a) => {
      try {
        return BigInt(a.validAfter) <= BigInt(a.validBefore);
      } catch {
        return false;
      }
    },
    { message: 'validAfter must be <= validBefore' }
  );

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

/** Single accepted payment line in HTTP 402 (trait / gateway must not inject oversized or malformed options). */
export const x402PaymentOptionSchema = z
  .object({
    scheme: z.literal('exact'),
    network: x402SettlementChainSchema,
    maxAmountRequired: z
      .string()
      .regex(/^\d+$/)
      .max(48, 'maxAmountRequired too long'),
    resource: z.string().min(1).max(2048),
    description: z.string().max(4096),
    payTo: z.string().min(1).max(128),
    asset: z.string().min(1).max(128),
    maxTimeoutSeconds: z.number().int().min(1).max(2_592_000),
  })
  .strict();

export type X402PaymentOptionParsed = z.infer<typeof x402PaymentOptionSchema>;

/** Full PaymentRequired body (402 JSON) — blocks extra fields and oversized accepts[]. */
export const x402PaymentRequiredSchema = z
  .object({
    x402Version: z.literal(X402_VERSION_LITERAL),
    accepts: z.array(x402PaymentOptionSchema).min(1).max(16),
    error: z.string().max(2048),
  })
  .strict();

export type X402PaymentRequiredParsed = z.infer<typeof x402PaymentRequiredSchema>;

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

export function safeParseX402PaymentRequired(
  input: unknown
):
  | { success: true; data: X402PaymentRequiredParsed }
  | { success: false; error: string } {
  const r = x402PaymentRequiredSchema.safeParse(input);
  if (r.success) return { success: true, data: r.data };
  return { success: false, error: formatX402ParseError(r.error) };
}

/**
 * Single entry point for spatial / trait code paths: validate payment + required base-units together
 * before facilitator BigInt or settlement logic runs.
 */
export function validateX402MicropaymentBoundary(input: {
  payment: unknown;
  requiredAmount: unknown;
}):
  | { ok: true; payment: X402PaymentPayloadParsed; requiredAmount: string }
  | { ok: false; error: string } {
  const req = x402RequiredAmountSchema.safeParse(input.requiredAmount);
  if (!req.success) {
    return { ok: false, error: formatX402ParseError(req.error) };
  }
  const pay = safeParseX402PaymentPayload(input.payment);
  if (!pay.success) {
    return { ok: false, error: pay.error };
  }
  return { ok: true, payment: pay.data, requiredAmount: req.data };
}

export function validateX402PaymentRequiredBoundary(input: unknown):
  | { ok: true; data: X402PaymentRequiredParsed }
  | { ok: false; error: string } {
  const r = safeParseX402PaymentRequired(input);
  if (r.success) return { ok: true, data: r.data };
  return { ok: false, error: r.error };
}
