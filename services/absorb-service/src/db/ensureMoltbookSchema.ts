import { Client } from 'pg';

type RegclassRow = {
  table_name: string | null;
};

const REQUIRED_TABLE = 'moltbook_agents';

const createMoltbookAgentEventsTable = `
CREATE TABLE IF NOT EXISTS "moltbook_agent_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL,
  "event_type" varchar(32) NOT NULL,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
)`;

const createMoltbookAgentsTable = `
CREATE TABLE IF NOT EXISTS "moltbook_agents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "agent_name" varchar(64) NOT NULL,
  "moltbook_api_key" text NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "heartbeat_enabled" boolean DEFAULT false NOT NULL,
  "last_heartbeat" timestamp,
  "total_posts_generated" integer DEFAULT 0 NOT NULL,
  "total_comments_generated" integer DEFAULT 0 NOT NULL,
  "total_upvotes_given" integer DEFAULT 0 NOT NULL,
  "challenge_failures" integer DEFAULT 0 NOT NULL,
  "total_llm_spent_cents" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
)`;

const createMoltbookIndexes = [
  'CREATE INDEX IF NOT EXISTS "idx_moltbook_events_agent" ON "moltbook_agent_events" USING btree ("agent_id")',
  'CREATE INDEX IF NOT EXISTS "idx_moltbook_events_time" ON "moltbook_agent_events" USING btree ("created_at")',
  'CREATE INDEX IF NOT EXISTS "idx_moltbook_agents_user" ON "moltbook_agents" USING btree ("user_id")',
  'CREATE INDEX IF NOT EXISTS "idx_moltbook_agents_project" ON "moltbook_agents" USING btree ("project_id")',
];

function shouldRequireSchema(): boolean {
  return process.env.ABSORB_REQUIRE_DB_SCHEMA === '1';
}

function createClient(databaseUrl: string): Client {
  const isPrivate = !databaseUrl.includes('.railway.app');
  return new Client({
    connectionString: databaseUrl,
    ssl: isPrivate ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: Math.max(5000, Number(process.env.PG_CONNECTION_TIMEOUT_MS || 15000)),
  });
}

async function tableExists(client: Client, tableName: string): Promise<boolean> {
  const result = await client.query<RegclassRow>('select to_regclass($1) as table_name', [`public.${tableName}`]);
  return Boolean(result.rows[0]?.table_name);
}

async function repairMoltbookSchema(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(createMoltbookAgentEventsTable);
    await client.query(createMoltbookAgentsTable);
    for (const statement of createMoltbookIndexes) {
      await client.query(statement);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

export async function ensureMoltbookSchema(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    const message = '[absorb-service] No DATABASE_URL configured; skipping moltbook schema verification.';
    if (shouldRequireSchema()) {
      throw new Error(`${message} ABSORB_REQUIRE_DB_SCHEMA=1.`);
    }
    console.warn(message);
    return;
  }

  const client = createClient(databaseUrl);
  try {
    await client.connect();
    if (await tableExists(client, REQUIRED_TABLE)) {
      console.log('[absorb-service] Moltbook schema verification OK: public.moltbook_agents exists.');
      return;
    }

    console.warn('[absorb-service] Moltbook schema missing; repairing tables before server start.');
    await repairMoltbookSchema(client);

    if (!(await tableExists(client, REQUIRED_TABLE))) {
      throw new Error('public.moltbook_agents is still missing after boot-time schema repair');
    }

    console.log('[absorb-service] Moltbook schema repair OK: public.moltbook_agents exists.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (shouldRequireSchema()) {
      throw new Error(`Moltbook schema verification failed: ${message}`);
    }
    console.warn('[absorb-service] Moltbook schema verification failed:', message);
  } finally {
    await client.end().catch(() => undefined);
  }
}
