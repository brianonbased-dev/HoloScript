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
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })]
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
  (t) => [primaryKey({ columns: [t.identifier, t.token] })]
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
  (t) => [
    index('idx_projects_owner').on(t.ownerId),
    uniqueIndex('idx_projects_owner_slug').on(t.ownerId, t.slug),
  ]
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
  (t) => [index('idx_scene_versions_project').on(t.projectId)]
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
  (t) => [index('idx_scene_snapshots_project').on(t.projectId)]
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
  (t) => [index('idx_assets_owner').on(t.ownerId), index('idx_assets_type').on(t.type)]
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
  (t) => [
    index('idx_marketplace_seller').on(t.sellerId),
    index('idx_marketplace_status').on(t.status),
  ]
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
  (t) => [
    index('idx_deployments_owner').on(t.ownerId),
    index('idx_deployments_project').on(t.projectId),
  ]
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
  (t) => [index('idx_orgs_owner').on(t.ownerId)]
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
  (t) => [
    index('idx_org_members_org').on(t.orgId),
    index('idx_org_members_user').on(t.userId),
    uniqueIndex('idx_org_members_unique').on(t.orgId, t.userId),
  ]
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
  (t) => [
    index('idx_purchases_buyer').on(t.buyerId),
    index('idx_purchases_listing').on(t.listingId),
    index('idx_purchases_stripe_session').on(t.stripeSessionId),
  ]
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
  (t) => [
    index('idx_payouts_purchase').on(t.purchaseId),
    index('idx_payouts_recipient').on(t.recipientId),
  ]
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
  (t) => [
    index('idx_follows_follower').on(t.followerId),
    index('idx_follows_following').on(t.followingId),
    uniqueIndex('idx_follows_unique').on(t.followerId, t.followingId),
  ]
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
  (t) => [
    index('idx_comments_target').on(t.targetType, t.targetId),
    index('idx_comments_author').on(t.authorId),
  ]
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
  (t) => [
    index('idx_activity_actor').on(t.actorId),
    index('idx_activity_time').on(t.createdAt),
  ]
);

// =============================================================================
// CREDIT SYSTEM (Absorb Service) — Re-exported from @holoscript/absorb-service
// =============================================================================
// NOTE: FK constraints (userId -> users.id) are enforced at the DB migration
// level. The schema objects are defined in @holoscript/absorb-service/schema
// without FK refs to keep the package self-contained.

export {
  creditAccounts,
  creditTransactions,
  absorbProjects,
} from '@holoscript/absorb-service/schema';

// =============================================================================
// HOLOMESH TRANSACTION LEDGER
// =============================================================================
// Persists x402 payment transactions from the HoloMesh knowledge marketplace.
// Synced from mcp.holoscript.net via POST /api/holomesh/transactions/sync.

export const holomeshTransactions = pgTable(
  'holomesh_transactions',
  {
    id: text('id').primaryKey(),              // MCP-assigned ID
    type: varchar('type', { length: 32 }).notNull(),   // 'purchase' | 'withdrawal' | 'reward' | 'fee'
    fromAgentId: text('from_agent_id'),
    fromAgentName: text('from_agent_name'),
    toAgentId: text('to_agent_id'),
    toAgentName: text('to_agent_name'),
    entryId: text('entry_id'),               // knowledge entry purchased (if applicable)
    amount: integer('amount').notNull(),     // in cents (USD) or smallest unit
    currency: varchar('currency', { length: 16 }).default('USD').notNull(),
    txHash: text('tx_hash'),                 // blockchain tx hash (Base/Sepolia)
    status: varchar('status', { length: 16 }).default('confirmed').notNull(),
    teamId: text('team_id'),
    metadata: jsonb('metadata').default({}),
    mcpCreatedAt: timestamp('mcp_created_at', { mode: 'date' }),
    syncedAt: timestamp('synced_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_holomesh_tx_from_agent').on(t.fromAgentId),
    index('idx_holomesh_tx_to_agent').on(t.toAgentId),
    index('idx_holomesh_tx_team').on(t.teamId),
    index('idx_holomesh_tx_entry').on(t.entryId),
    index('idx_holomesh_tx_mcp_created').on(t.mcpCreatedAt),
  ]
);

// =============================================================================
// HOLOMESH BOARD TASKS
// =============================================================================

export const holomeshBoardTasks = pgTable(
  'holomesh_board_tasks',
  {
    id: text('id').primaryKey(),                             // MCP-assigned task ID
    teamId: text('team_id').notNull(),
    title: text('title').notNull(),
    description: text('description').default('').notNull(),
    status: varchar('status', { length: 16 }).default('open').notNull(), // open|claimed|done|blocked
    priority: integer('priority').default(2).notNull(),
    role: varchar('role', { length: 32 }).default('coder').notNull(),
    source: varchar('source', { length: 32 }).default('manual').notNull(),
    claimedBy: text('claimed_by'),
    claimedByName: text('claimed_by_name'),
    completedBy: text('completed_by'),
    commitHash: text('commit_hash'),
    metadata: jsonb('metadata').default({}),
    mcpCreatedAt: timestamp('mcp_created_at', { mode: 'date' }),
    completedAt: timestamp('completed_at', { mode: 'date' }),
    syncedAt: timestamp('synced_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_holomesh_board_team').on(t.teamId),
    index('idx_holomesh_board_status').on(t.status),
    index('idx_holomesh_board_priority').on(t.priority),
  ]
);

// =============================================================================
// HOLOMESH ENTRY RATINGS
// =============================================================================
// Per-agent 1–5 star ratings and optional reviews for knowledge marketplace
// entries. One rating per (entryId, agentId) pair, last-write wins on update.

export const holomeshEntryRatings = pgTable(
  'holomesh_entry_ratings',
  {
    entryId: text('entry_id').notNull(),
    agentId: text('agent_id').notNull(),
    agentName: text('agent_name').default('').notNull(),
    rating: integer('rating').notNull(),           // 1–5
    comment: text('comment').default(''),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.entryId, t.agentId] }),
    index('idx_entry_ratings_entry').on(t.entryId),
    index('idx_entry_ratings_agent').on(t.agentId),
  ]
);

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
  (t) => [index('idx_characters_owner').on(t.ownerId)]
);
