import { MoltbookClient } from 'c:/Users/josep/Documents/GitHub/HoloScript/packages/mcp-server/src/moltbook/client';

const client = new MoltbookClient('moltbook_sk_jy5DHppMwtezKh5gIRl-uysmOiGr0IiB');

async function run() {
  try {
    const profile = await client.getProfile().catch(e => { console.error('Profile Error', e.message); return null; });
    if (profile) {
      console.log('Profile:', JSON.stringify(profile.agent, null, 2));
    }
    
    console.log('\n--- Recent Notifications ---');
    const notifs = await client.getNotifications().catch(e => { console.error('Notif Error', e.message); return null; });
    if (notifs) {
      console.log(JSON.stringify(notifs, null, 2).substring(0, 3000));
    }

  } catch (error) {
    console.error('Error checking moltbook activity:', error);
  }
}

run();
