/**
 * Payment Traits
 *
 * Payment processing primitives — Stripe integration, invoicing,
 * subscriptions, refunds, wallet management, and x402 protocol.
 *
 * @version 2.0.0
 */
export const PAYMENT_TRAITS = [
  // ─── Payment Processing ───────────────────────────────────────────
  'stripe',              // Stripe charge / payment intent
  'invoice',             // Invoice generation and tracking
  'subscription',        // Recurring subscription lifecycle

  // ─── Financial Operations ─────────────────────────────────────────
  'refund',              // Refund processing with reason tracking
  'wallet',              // Digital wallet balance and transfers

  // ─── x402 Protocol (HTTP 402 Payment Required) ────────────────────
  'credit',              // x402 payment gate — returns HTTP 402 with USDC payment requirements
  'x402_settlement',     // On-chain settlement via x402 facilitator (Base / Solana)
  'micro_payment',       // In-memory micro-payment ledger (< $0.10, batch settled)
] as const;

export type PaymentTraitName = (typeof PAYMENT_TRAITS)[number];
