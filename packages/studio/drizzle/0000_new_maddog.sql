CREATE TABLE "absorb_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"source_type" varchar(16) NOT NULL,
	"source_url" text,
	"local_path" text,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"last_absorbed_at" timestamp,
	"absorb_result_json" text,
	"total_spent_cents" integer DEFAULT 0 NOT NULL,
	"total_operations" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "activity_feed" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" varchar(32) NOT NULL,
	"target_type" varchar(16),
	"target_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" varchar(32) NOT NULL,
	"url" text NOT NULL,
	"thumbnail_url" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"traits" jsonb DEFAULT '{}'::jsonb,
	"dialog" jsonb DEFAULT '{}'::jsonb,
	"avatar_url" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"target_type" varchar(16) NOT NULL,
	"target_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"stripe_connect_account_id" text,
	"stripe_onboarding_complete" boolean DEFAULT false NOT NULL,
	"display_name" text,
	"bio" text,
	"website" text,
	"total_earnings_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_accounts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"balance_cents" integer DEFAULT 0 NOT NULL,
	"lifetime_spent_cents" integer DEFAULT 0 NOT NULL,
	"lifetime_purchased_cents" integer DEFAULT 0 NOT NULL,
	"tier" varchar(16) DEFAULT 'free' NOT NULL,
	"free_credits_used_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(16) NOT NULL,
	"amount_cents" integer NOT NULL,
	"balance_after_cents" integer NOT NULL,
	"description" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"stripe_session_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"owner_id" uuid NOT NULL,
	"url" text,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"target" varchar(32) DEFAULT 'r3f' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"follower_id" uuid NOT NULL,
	"following_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holomesh_board_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"priority" integer DEFAULT 2 NOT NULL,
	"role" varchar(32) DEFAULT 'coder' NOT NULL,
	"source" varchar(32) DEFAULT 'manual' NOT NULL,
	"claimed_by" text,
	"claimed_by_name" text,
	"completed_by" text,
	"commit_hash" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"mcp_created_at" timestamp,
	"completed_at" timestamp,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holomesh_entry_ratings" (
	"entry_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"agent_name" text DEFAULT '' NOT NULL,
	"rating" integer NOT NULL,
	"comment" text DEFAULT '',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "holomesh_entry_ratings_entry_id_agent_id_pk" PRIMARY KEY("entry_id","agent_id")
);
--> statement-breakpoint
CREATE TABLE "holomesh_knowledge_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text,
	"type" varchar(32),
	"content" text NOT NULL,
	"author_id" text,
	"author_name" text,
	"domain" varchar(64),
	"price" integer DEFAULT 0 NOT NULL,
	"premium" boolean DEFAULT false NOT NULL,
	"confidence" integer DEFAULT 0,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"provenance_hash" text,
	"query_count" integer DEFAULT 0,
	"reuse_count" integer DEFAULT 0,
	"sales_count" integer DEFAULT 0,
	"mcp_created_at" timestamp,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holomesh_referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" text NOT NULL,
	"buyer_agent_id" text NOT NULL,
	"buyer_agent_name" text,
	"referrer_agent_id" text NOT NULL,
	"referrer_agent_name" text,
	"sale_amount_cents" integer NOT NULL,
	"referral_bps" integer NOT NULL,
	"commission_cents" integer NOT NULL,
	"currency" varchar(16) DEFAULT 'USD' NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"transaction_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holomesh_team_presence_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"agent_name" text NOT NULL,
	"role" varchar(32) DEFAULT 'member',
	"session_start" timestamp NOT NULL,
	"session_end" timestamp,
	"duration_seconds" integer,
	"end_reason" varchar(32),
	"replaced_by_agent_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holomesh_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"type" varchar(32) NOT NULL,
	"from_agent_id" text,
	"from_agent_name" text,
	"to_agent_id" text,
	"to_agent_name" text,
	"entry_id" text,
	"amount" integer NOT NULL,
	"currency" varchar(16) DEFAULT 'USD' NOT NULL,
	"tx_hash" text,
	"status" varchar(16) DEFAULT 'confirmed' NOT NULL,
	"team_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"mcp_created_at" timestamp,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"asset_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(16) DEFAULT 'member' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"role" varchar(16) NOT NULL,
	"amount_cents" integer NOT NULL,
	"stripe_connect_account_id" text,
	"stripe_transfer_id" text,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"code" text DEFAULT '',
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"visibility" varchar(16) DEFAULT 'private' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyer_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"stripe_session_id" text,
	"stripe_payment_intent_id" text,
	"amount_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scene_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text NOT NULL,
	"image_url" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scene_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text NOT NULL,
	"code" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_scenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"project_id" uuid,
	"code" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text,
	"email_verified" timestamp,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_feed" ADD CONSTRAINT "activity_feed_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_following_id_users_id_fk" FOREIGN KEY ("following_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_listing_id_marketplace_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."marketplace_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_scenes" ADD CONSTRAINT "shared_scenes_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_scenes" ADD CONSTRAINT "shared_scenes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_absorb_projects_user" ON "absorb_projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_absorb_projects_status" ON "absorb_projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_activity_actor" ON "activity_feed" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "idx_activity_time" ON "activity_feed" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_assets_owner" ON "assets" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_assets_type" ON "assets" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_characters_owner" ON "characters" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_comments_target" ON "comments" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "idx_comments_author" ON "comments" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "idx_credit_tx_user" ON "credit_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_credit_tx_type" ON "credit_transactions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_credit_tx_time" ON "credit_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_deployments_owner" ON "deployments" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_deployments_project" ON "deployments" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_follows_follower" ON "follows" USING btree ("follower_id");--> statement-breakpoint
CREATE INDEX "idx_follows_following" ON "follows" USING btree ("following_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_follows_unique" ON "follows" USING btree ("follower_id","following_id");--> statement-breakpoint
CREATE INDEX "idx_holomesh_board_team" ON "holomesh_board_tasks" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "idx_holomesh_board_status" ON "holomesh_board_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_holomesh_board_priority" ON "holomesh_board_tasks" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "idx_entry_ratings_entry" ON "holomesh_entry_ratings" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "idx_entry_ratings_agent" ON "holomesh_entry_ratings" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_holomesh_ke_author" ON "holomesh_knowledge_entries" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "idx_holomesh_ke_domain" ON "holomesh_knowledge_entries" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "idx_holomesh_ke_type" ON "holomesh_knowledge_entries" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_holomesh_ke_synced" ON "holomesh_knowledge_entries" USING btree ("synced_at");--> statement-breakpoint
CREATE INDEX "idx_holomesh_ref_entry" ON "holomesh_referrals" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "idx_holomesh_ref_buyer" ON "holomesh_referrals" USING btree ("buyer_agent_id");--> statement-breakpoint
CREATE INDEX "idx_holomesh_ref_referrer" ON "holomesh_referrals" USING btree ("referrer_agent_id");--> statement-breakpoint
CREATE INDEX "idx_holomesh_ref_status" ON "holomesh_referrals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_presence_team" ON "holomesh_team_presence_sessions" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "idx_presence_agent" ON "holomesh_team_presence_sessions" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_presence_team_agent" ON "holomesh_team_presence_sessions" USING btree ("team_id","agent_id");--> statement-breakpoint
CREATE INDEX "idx_presence_active" ON "holomesh_team_presence_sessions" USING btree ("team_id","session_end");--> statement-breakpoint
CREATE INDEX "idx_holomesh_tx_from_agent" ON "holomesh_transactions" USING btree ("from_agent_id");--> statement-breakpoint
CREATE INDEX "idx_holomesh_tx_to_agent" ON "holomesh_transactions" USING btree ("to_agent_id");--> statement-breakpoint
CREATE INDEX "idx_holomesh_tx_team" ON "holomesh_transactions" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "idx_holomesh_tx_entry" ON "holomesh_transactions" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "idx_holomesh_tx_mcp_created" ON "holomesh_transactions" USING btree ("mcp_created_at");--> statement-breakpoint
CREATE INDEX "idx_marketplace_seller" ON "marketplace_listings" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "idx_marketplace_status" ON "marketplace_listings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_org_members_org" ON "org_members" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_org_members_user" ON "org_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_org_members_unique" ON "org_members" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_orgs_owner" ON "organizations" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_payouts_purchase" ON "payouts" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "idx_payouts_recipient" ON "payouts" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "idx_projects_owner" ON "projects" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_projects_owner_slug" ON "projects" USING btree ("owner_id","slug");--> statement-breakpoint
CREATE INDEX "idx_purchases_buyer" ON "purchases" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "idx_purchases_listing" ON "purchases" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "idx_purchases_stripe_session" ON "purchases" USING btree ("stripe_session_id");--> statement-breakpoint
CREATE INDEX "idx_scene_snapshots_project" ON "scene_snapshots" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_scene_versions_project" ON "scene_versions" USING btree ("project_id");