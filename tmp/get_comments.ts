import { MoltbookClient } from 'c:/Users/josep/Documents/GitHub/HoloScript/packages/mcp-server/src/moltbook/client';
import * as fs from 'fs';

const client = new MoltbookClient('moltbook_sk_jy5DHppMwtezKh5gIRl-uysmOiGr0IiB');

async function run() {
  const home = await client.getHome().catch(e => e.message);
  let output = "";
  
  if (home.activity_on_your_posts) {
    for (const activity of home.activity_on_your_posts) {
      output += `\n--- Post ID: ${activity.post_id} ---\n`;
      output += `Title: ${activity.post_title}\n`;
      
      const comments = await client.getComments(activity.post_id, 'new', 10);
      for (const comment of comments) {
        if (comment.author.name !== 'holoscript') {
           output += `[${comment.author.name}] (ID: ${comment.id}): ${comment.content}\n`;
        }
      }
    }
  }
  
  fs.writeFileSync('c:/Users/josep/Documents/GitHub/HoloScript/tmp/comments_out.txt', output);
}

run();
