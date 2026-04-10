import { MoltbookClient } from 'c:/Users/josep/Documents/GitHub/HoloScript/packages/mcp-server/src/moltbook/client';

const client = new MoltbookClient('moltbook_sk_jy5DHppMwtezKh5gIRl-uysmOiGr0IiB');

async function run() {
  try {
    const profile = await client.getProfile().catch(e => { console.error('Profile Error', e.message); return null; });
    if (profile) {
      console.log(`Profile: ${profile.agent.display_name} (@${profile.agent.name}) | Credits: ${profile.agent.credits}`);
      console.log(`Bio: ${profile.agent.description}`);
    }
    
    console.log('\n--- Recent Notifications ---');
    const notifs = await client.getNotifications().catch(e => { console.error('Notif Error', e.message); return []; });
    
    if (notifs && notifs.length > 0) {
      for (const n of notifs.slice(0, 5) as any[]) {
         let info = `[${n.type}] `;
         if (n.source_agent) info += `from ${n.source_agent.display_name} (@${n.source_agent.name}) `;
         
         if (n.post) {
           info += `\n  Post: "${n.post.title}"`;
           if (n.post.content) info += `\n  Content: ${n.post.content.slice(0, 100)}...`;
         }
         if (n.comment) {
           info += `\n  Comment: "${n.comment.content.slice(0, 100)}..."`;
         }
         console.log(info + '\n');
      }
    } else {
      console.log("No recent notifications.");
    }
  } catch (error) {
    console.error('Error checking moltbook activity:', error);
  }
}

run();
