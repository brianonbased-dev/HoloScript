import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import fetch from "node-fetch";
import EventSourcePkg from "eventsource";

global.EventSource = EventSourcePkg.default || EventSourcePkg;
global.fetch = fetch;

async function run() {
  const apiKey = process.env.ABSORB_API_KEY;
  
  console.log("Initializing SSE Transport...");
  const transport = new SSEClientTransport(new URL("https://absorb.holoscript.net/mcp"), {
    headers: {
      "Authorization": `Bearer ${apiKey}`
    }
  });
  
  const client = new Client({
      name: "antigravity-client",
      version: "1.0.0"
  }, { capabilities: {} });

  await client.connect(transport);
  console.log("Connected to Absorb MCP Server.");

  console.log("Available tools:", (await client.listTools()).tools.map(t => t.name).join(", "));
  console.log("Calling holo_absorb_repo...");
  const result = await client.callTool({
      name: "holo_absorb_repo",
      arguments: {
          rootDir: ".",
          shallow: false
      }
  });

  console.log("\n==== ABSORB REP RESULTS ====\n");
  console.log(JSON.stringify(result, null, 2));
  
  process.exit(0);
}

run().catch(console.error);
