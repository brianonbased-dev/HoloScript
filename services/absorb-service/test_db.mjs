import 'dotenv/config';
import { getDb } from './src/db/client.js';
import * as schema from './src/db/schema.js';
import { sql } from 'drizzle-orm';

async function test() {
  const db = getDb();
  if(!db) { console.log('No DB returned.'); return; }
  console.log('Got DB instance. Testing query...');
  const start = Date.now();
  try {
    const [row] = await db
      .select({ count: sql<number>`count(*) filter (where ${schema.moltbookAgents.heartbeatEnabled} = true)::int` })
      .from(schema.moltbookAgents);
    console.log('Query success:', row, 'Duration:', Date.now() - start, 'ms');
  } catch(e) {
    console.error('Query error:', e);
  }
}
test().then(() => process.exit(0));
