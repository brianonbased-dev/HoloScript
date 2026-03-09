import { StateSynchronizer } from '../StateSynchronizer';

async function fetchV43(prompt: string) {
  try {
    const res = await fetch('http://localhost:11435/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'brittney-qwen-v43-q8_0',
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json();
    return data.message?.content || data.response || JSON.stringify(data);
  } catch (error: any) {
    return `[V43 Fetch Error]: ${error.message}`;
  }
}

async function simulate() {
  console.log('🟢 Starting V43 Multi-Agent Spatial Sync Simulation...');
  const pubsub = StateSynchronizer.getInstance();

  // Agent B subscribes to Agent A's spatial / semantic changes
  pubsub.subscribeEntity('agent_A', async (deltas) => {
    for (const d of deltas) {
      if (d.field === 'action') {
        console.log(
          `\n📡 [Mesh] Agent B received mesh event: [Agent A performed -> ${d.newValue}]`
        );

        console.log(`⚙️ [Agent B] Asking V43 model for contextual reaction...`);
        const prompt = `You are Agent B in a simulated HoloScript environment. You just observed Agent A perform the following action via the mesh network: "${d.newValue}". What is your reaction? Provide a strict HoloScript @llm_agent reaction demonstrating spatial awareness. Return only the HoloScript snippet.`;

        const response = await fetchV43(prompt);
        console.log(`\n🧠 [Agent B V43 Reaction]:\n${response}`);
      }
    }
  });

  console.log('➡️ [Agent A] Broadcasting an episodic action delta to the Mesh...');
  pubsub.broadcastDeltas([
    {
      entityId: 'agent_A',
      field: 'action',
      oldValue: 'idle',
      newValue: 'invoking a massive volumetric cyberpunk firewall to block the structural corridor',
      timestamp: Date.now(),
    },
  ]);

  // Keep script alive for async fetch
  setTimeout(() => {
    console.log('\n🏁 Simulation completed.');
  }, 10000);
}

simulate();
