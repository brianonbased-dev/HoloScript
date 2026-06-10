CREATE TABLE "brittney_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"last_message_at" timestamp,
	"archived_at" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brittney_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"role" varchar(16) NOT NULL,
	"content" text NOT NULL,
	"tool_calls" jsonb DEFAULT '[]'::jsonb,
	"client_timestamp" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" varchar(16) NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"revoked_at" timestamp,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
ALTER TABLE "brittney_conversations" ADD CONSTRAINT "brittney_conversations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brittney_messages" ADD CONSTRAINT "brittney_messages_conversation_id_brittney_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."brittney_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_api_keys" ADD CONSTRAINT "user_api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_brittney_convos_owner" ON "brittney_conversations" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_brittney_convos_owner_scope" ON "brittney_conversations" USING btree ("owner_id","scope");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_brittney_msgs_convo_seq" ON "brittney_messages" USING btree ("conversation_id","seq");--> statement-breakpoint
CREATE INDEX "idx_user_api_keys_user" ON "user_api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_user_api_keys_hash" ON "user_api_keys" USING btree ("key_hash");