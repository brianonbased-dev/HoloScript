/**
 * Drizzle ORM schema for HoloScript Studio.
 *
 * Defines all persistent tables — replaces in-memory Maps and IndexedDB
 * with PostgreSQL-backed storage for enterprise multi-user support.
 */

import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  uuid,
  varchar,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';

// =============================================================================
// USERS & AUTH (NextAuth.js adapter compatible)
// =============================================================================

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

export const accounts = pgTable(
  'accounts',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => ({ pk: primaryKey({ columns: [t.provider, t.providerAccountId] }) })
);

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
});

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.identifier, t.token] }) })
);

// =============================================================================
// PROJECTS
// =============================================================================

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    code: text('code').default(''),
    metadata: jsonb('metadata').default({}),
    visibility: varchar('visibility', { length: 16 }).default('private').notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => ({
    idx_projects_owner: index('idx_projects_owner').on(t.ownerId),
    idx_projects_owner_slug: uniqueIndex('idx_projects_owner_slug').on(t.ownerId, t.slug)
  })
);

// =============================================================================
// SCENE VERSIONS (replaces in-memory Map<sceneId, SceneVersion[]>)
// =============================================================================

export const sceneVersions = pgTable(
  'scene_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: text('project_id').notNull(),
    code: text('code').notNull(),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => ({
    idx_scene_versions_project: index('idx_scene_versions_project').on(t.projectId)
  })
);

// =============================================================================
// SCENE SNAPSHOTS (replaces in-memory Map<sceneId, Snapshot[]>)
// =============================================================================

export const sceneSnapshots = pgTable(
  'scene_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: text('project_id').notNull(),
    imageUrl: text('image_url').notNull(),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => ({
    idx_scene_snapshots_project: index('idx_scene_snapshots_project').on(t.projectId)
  })
);

// =============================================================================
// SHARED SCENES (replaces in-memory Map<shareId, SharedScene>)
// =============================================================================

export const sharedScenes = pgTable('shared_scenes', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  code: text('code').notNull(),
  metadata: jsonb('metadata').default({}),
  viewCount: integer('view_count').default(0).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// =============================================================================
// ASSETS
// =============================================================================

export const assets = pgTable(
  'assets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: varchar('type', { length: 32 }).notNull(),
    url: text('url').notNull(),
    thumbnailUrl: text('thumbnail_url'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => ({
    idx_assets_owner: index('idx_assets_owner').on(t.ownerId),
    idx_assets_type: index('idx_assets_type').on(t.type)
  })
);

// =============================================================================
// MARKETPLACE LISTINGS
// =============================================================================

export const marketplaceListings = pgTable(
  'marketplace_listings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    description: text('description'),
    priceCents: integer('price_cents').default(0).notNull(),
    currency: varchar('currency', { length: 3 }).default('USD').notNull(),
    status: varchar('status', { length: 16 }).default('draft').notNull(),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => ({
    idx_marketplace_seller: index('idx_marketplace_seller').on(t.sellerId),
    idx_marketplace_status: index('idx_marketplace_status').on(t.status)
  })
);

// =============================================================================
// DEPLOYMENTS
// =============================================================================

export const deployments = pgTable(
  'deployments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    url: text('url'),
    status: varchar('status', { length: 16 }).default('pending').notNull(),
    target: varchar('target', { length: 32 }).default('r3f').notNull(),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => ({
    idx_deployments_owner: index('idx_deployments_owner').on(t.ownerId),
    idx_deployments_project: index('idx_deployments_project').on(t.projectId)
  })
);

// =============================================================================
// ORGANIZATIONS & TEAMS
// =============================================================================

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => ({
    idx_orgs_owner: index('idx_orgs_owner').on(t.ownerId)
  })
);

export const orgMembers = pgTable(
  'org_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 16 }).default('member').notNull(),
    joinedAt: timestamp('joined_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => ({
    idx_org_members_org: index('idx_org_members_org').on(t.orgId),
    idx_org_members_user: index('idx_org_members_user').on(t.userId),
    idx_org_members_unique: uniqueIndex('idx_org_members_unique').on(t.orgId, t.userId)
  })
);

// =============================================================================
// PURCHASES & PAYMENTS
// =============================================================================

export const purchases = pgTable(
  'purchases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    buyerId: uuid('buyer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => marketplaceListings.id, { onDelete: 'cascade' }),
    stripeSessionId: text('stripe_session_id'),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    amountCents: integer('amount_cents').notNull(),
    currency: varchar('currency', { length: 3 }).default('USD').notNull(),
    status: varchar('status', { length: 16 }).default('pending').notNull(),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => ({
    idx_purchases_buyer: index('idx_purchases_buyer').on(t.buyerId),
    idx_purchases_listing: index('idx_purchases_listing').on(t.listingId),
    idx_purchases_stripe_session: index('idx_purchases_stripe_session').on(t.stripeSessionId)
  })
);

export const payouts = pgTable(
  'payouts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    purchaseId: uuid('purchase_id')
      .notNull()
      .references(() => purchases.id, { onDelete: 'cascade' }),
    recipientId: uuid('recipient_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 16 }).notNull(), // 'creator' | 'platform' | 'agent'
    amountCents: integer('amount_cents').notNull(),
    stripeConnectAccountId: text('stripe_connect_account_id'),
    stripeTransferId: text('stripe_transfer_id'),
    status: varchar('status', { length: 16 }).default('pending').notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => ({
    idx_payouts_purchase: index('idx_payouts_purchase').on(t.purchaseId),
    idx_payouts_recipient: index('idx_payouts_recipient').on(t.recipientId)
  })
);

export const creatorProfiles = pgTable('creator_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  stripeConnectAccountId: text('stripe_connect_account_id'),
  stripeOnboardingComplete: boolean('stripe_onboarding_complete').default(false).notNull(),
  displayName: text('display_name'),
  bio: text('bio'),
  website: text('website'),
  totalEarningsCents: integer('total_earnings_cents').default(0).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

// =============================================================================
// SOCIAL (follows, comments, activity)
// =============================================================================

export const follows = pgTable(
  'follows',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    followerId: uuid('follower_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    followingId: uuid('following_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => ({
    idx_follows_follower: index('idx_follows_follower').on(t.followerId),
    idx_follows_following: index('idx_follows_following').on(t.followingId),
    idx_follows_unique: uniqueIndex('idx_follows_unique').on(t.followerId, t.followingId)
  })
);

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetType: varchar('target_type', { length: 16 }).notNull(), // 'project' | 'listing' | 'scene'
    targetId: text('target_id').notNull(),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => ({
    idx_comments_target: index('idx_comments_target').on(t.targetType, t.targetId),
    idx_comments_author: index('idx_comments_author').on(t.authorId)
  })
);

export const activityFeed = pgTable(
  'activity_feed',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    action: varchar('action', { length: 32 }).notNull(), // 'published' | 'purchased' | 'commented' | 'followed' | 'deployed'
    targetType: varchar('target_type', { length: 16 }),
    targetId: text('target_id'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => ({
    idx_activity_actor: index('idx_activity_actor').on(t.actorId),
    idx_activity_time: index('idx_activity_time').on(t.createdAt)
  })
);

// =============================================================================
// CREDIT SYSTEM (Absorb Service) — Re-exported from @holoscript/absorb-service
// =============================================================================
// NOTE: FK constraints (userId -> users.id) are enforced at the DB migration
// level. The schema objects are defined in @holoscript/absorb-service/schema
// without FK refs to keep the package self-contained.


import { pgTable as pt, text as txt, timestamp as ts, integer as intg, jsonb as jsb, varchar as vch, boolean as bln, uuid as uid, index as idx } from 'drizzle-orm/pg-core';

export const moltbookAgents = pt(
  'moltbook_agents',
  {
    id: uid('id').defaultRandom().primaryKey(),
    userId: uid('user_id').notNull(),
    projectId: uid('project_id').notNull(),
    agentName: vch('agent_name', { length: 64 }).notNull(),
    moltbookApiKey: txt('moltbook_api_key').notNull(),
    config: jsb('config').default({}).notNull(),
    heartbeatEnabled: bln('heartbeat_enabled').default(false).notNull(),
    lastHeartbeat: ts('last_heartbeat', { mode: 'date' }),
    totalPostsGenerated: intg('total_posts_generated').default(0).notNull(),
    totalCommentsGenerated: intg('total_comments_generated').default(0).notNull(),
    totalLlmSpentCents: intg('total_llm_spent_cents').default(0).notNull(),
    createdAt: ts('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: ts('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    idx('idx_moltbook_agents_user').on(t.userId),
    idx('idx_moltbook_agents_project').on(t.projectId),
  ]
);

export {
  creditAccounts,
  creditTransactions,
  absorbProjects,
} from '@holoscript/absorb-service/schema';


// =============================================================================
// CHARACTERS
// =============================================================================

export const characters = pgTable(
  'characters',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    traits: jsonb('traits').default({}),
    dialog: jsonb('dialog').default({}),
    avatarUrl: text('avatar_url'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => ({
    idx_characters_owner: index('idx_characters_owner').on(t.ownerId)
  })
);
