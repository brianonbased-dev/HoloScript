/**
 * Absorb Service — Drizzle ORM Schema
 *
 * Defines the credit and absorb project tables. These are extracted from
 * the Studio schema to keep absorb-service self-contained.
 *
 * NOTE: userId columns reference users.id from the Studio schema. When used
 * within Studio, the FK constraint is enforced at the database level via
 * migrations. This schema does not declare the FK reference to avoid a
 * circular dependency on @holoscript/studio.
 */

import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  uuid,
  varchar,
  index,
} from 'drizzle-orm/pg-core';

// =============================================================================
// CREDIT SYSTEM
// =============================================================================

export const creditAccounts = pgTable('credit_accounts', {
  userId: uuid('user_id').primaryKey(),
  balanceCents: integer('balance_cents').default(0).notNull(),
  lifetimeSpentCents: integer('lifetime_spent_cents').default(0).notNull(),
  lifetimePurchasedCents: integer('lifetime_purchased_cents').default(0).notNull(),
  tier: varchar('tier', { length: 16 }).default('free').notNull(),
  freeCreditsUsedCents: integer('free_credits_used_cents').default(0).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

export const creditTransactions = pgTable(
  'credit_transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull(),
    type: varchar('type', { length: 16 }).notNull(),
    amountCents: integer('amount_cents').notNull(),
    balanceAfterCents: integer('balance_after_cents').notNull(),
    description: text('description').notNull(),
    metadata: jsonb('metadata').default({}),
    stripeSessionId: text('stripe_session_id'),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_credit_tx_user').on(t.userId),
    index('idx_credit_tx_type').on(t.type),
    index('idx_credit_tx_time').on(t.createdAt),
  ]
);

// =============================================================================
// ABSORB PROJECTS
// =============================================================================

export const absorbProjects = pgTable(
  'absorb_projects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull(),
    name: text('name').notNull(),
    sourceType: varchar('source_type', { length: 16 }).notNull(),
    sourceUrl: text('source_url'),
    localPath: text('local_path'),
    status: varchar('status', { length: 16 }).default('pending').notNull(),
    lastAbsorbedAt: timestamp('last_absorbed_at', { mode: 'date' }),
    absorbResultJson: text('absorb_result_json'),
    totalSpentCents: integer('total_spent_cents').default(0).notNull(),
    totalOperations: integer('total_operations').default(0).notNull(),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_absorb_projects_user').on(t.userId),
    index('idx_absorb_projects_status').on(t.status),
  ]
);
