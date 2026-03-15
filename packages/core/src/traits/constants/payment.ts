/**
 * Payment Traits
 *
 * Payment processing primitives — Stripe integration, invoicing,
 * subscriptions, refunds, and wallet management.
 *
 * @version 1.0.0
 */
export const PAYMENT_TRAITS = [
  // ─── Payment Processing ───────────────────────────────────────────
  'stripe',              // Stripe charge / payment intent
  'invoice',             // Invoice generation and tracking
  'subscription',        // Recurring subscription lifecycle

  // ─── Financial Operations ─────────────────────────────────────────
  'refund',              // Refund processing with reason tracking
  'wallet',              // Digital wallet balance and transfers
] as const;

export type PaymentTraitName = (typeof PAYMENT_TRAITS)[number];
