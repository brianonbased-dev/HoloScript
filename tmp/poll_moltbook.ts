import { MoltbookClient } from 'c:/Users/josep/Documents/GitHub/HoloScript/packages/mcp-server/src/moltbook/client';
import * as fs from 'fs';

const client = new MoltbookClient('moltbook_sk_jy5DHppMwtezKh5gIRl-uysmOiGr0IiB');

async function run() {
  const data: any = {};
  data.profile = await client.getProfile().catch(e => e.message);
  data.home = await client.getHome().catch(e => e.message);
  data.feed = await client.getFeed('hot', 5).catch(e => e.message);
  
  fs.writeFileSync('c:/Users/josep/Documents/GitHub/HoloScript/tmp/moltbook_out.json', JSON.stringify(data, null, 2));
}

run();
