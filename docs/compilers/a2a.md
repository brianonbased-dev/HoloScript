# Google A2A Agent Card Compiler

Compiles HoloScript agent definitions to [Google A2A (Agent-to-Agent)](https://google.github.io/A2A/) protocol **Agent Cards** — the standard JSON manifests that allow AI agents to discover and call each other across organizations and platforms.

## Overview

The A2A compiler (`--target a2a-agent-card`, exposed to agents as `compile_to_a2a_agent_card`) generates standardized Agent Card JSON files that are served at `/.well-known/agent-card.json`. Any A2A-compatible agent runtime (Google, Anthropic, Microsoft, custom) can discover and call your HoloScript agents through this standard interface.

```bash
holoscript compile agents.holo --target a2a-agent-card --output ./public/.well-known/
```

## What is A2A?

The Google A2A protocol enables agent interoperability:

- **Agent discovers** another agent at `https://example.com/.well-known/agent-card.json`
- **Card declares** the agent's capabilities, input/output schemas, and endpoints
- **Caller invokes** the agent via HTTP using the declared interface

HoloScript agents become first-class A2A participants: any AI orchestrator (LangGraph, AutoGen, Vertex AI agents) can call your spatial HoloScript agents.

## Agent Card Output

```json
{
  "$schema": "https://google.github.io/A2A/schema/agent-card.json",
  "name": "SpatialGuide",
  "description": "Navigates users through HoloScript spatial environments",
  "url": "https://myapp.com/agents/spatial-guide",
  "version": "1.0.0",
  "capabilities": {
    "streaming": true,
    "pushNotifications": false,
    "stateTransitionHistory": true
  },
  "skills": [
    {
      "id": "navigate",
      "name": "Navigate Scene",
      "description": "Guides the user to a named location in the scene",
      "inputModes": ["text"],
      "outputModes": ["text", "spatial-event"],
      "examples": ["Take me to the marketplace", "Show me the exit"]
    }
  ],
  "authentication": { "schemes": ["Bearer"] }
}
```

## HoloScript Agent Definition

```holo
composition "AgentDemo" {
  agent "SpatialGuide" {
    @llm_agent
    @pathfinding

    description: "Navigates users through the environment"
    version: "1.0.0"

    skill "navigate" {
      input: "natural language destination"
      output: "player teleport + commentary"

      action(destination) {
        target = resolve_location(destination)
        player.navigateTo(target)
        audio.speak("Heading to ${destination}")
      }
    }

    skill "describe_scene" {
      input: "none"
      output: "text description of current view"

      action() {
        return scene.describe({ detail: "high" })
      }
    }
  }
}
```

```bash
holoscript compile agent.holo --target a2a-agent-card
# → .well-known/agent-card.json
# → agents/spatial-guide/manifest.json
```

## Copy-Paste Workflow

Use this path when a `.holo` composition should become both an A2A-discoverable agent and a HoloMesh-discoverable peer.

```powershell
$code = @'
composition "HoloTunnelGuide" {
  metadata {
    title: "HoloTunnel Guide"
    description: "Guides remote agents through a Quest-visible HoloTunnel room"
    version: "1.0.0"
    tags: ["holotunnel", "quest", "spatial-guide"]
  }

  object "GuideBeacon" {
    @pointable
    geometry: "sphere"
    position: [0, 1.6, -2]
    scale: [0.25, 0.25, 0.25]
    material: { baseColor: "#22c55e", emissive: "#22c55e", emissive_intensity: 0.4 }
  }

  npc "TunnelGuide" {
    npc_type: "guide"
    dialogue_tree: "room_marathon"
  }
}
'@

$body = @{
  jsonrpc = "2.0"
  id = "holotunnel-a2a-card"
  method = "tools/call"
  params = @{
    name = "compile_to_a2a_agent_card"
    arguments = @{
      code = $code
      options = @{
        serviceUrl = "https://agents.example.com/a2a/holotunnel-guide"
        providerOrganization = "HoloScript"
        providerUrl = "https://holoscript.net"
        enableStreaming = $true
        authSchemes = @("bearer")
      }
    }
  }
} | ConvertTo-Json -Depth 16

Invoke-RestMethod `
  -Uri "https://mcp.holoscript.net/mcp" `
  -Method Post `
  -ContentType "application/json" `
  -Body $body |
  ConvertTo-Json -Depth 16
```

Publish the compiled `output` as `https://agents.example.com/.well-known/agent-card.json`, then register or submit that public card URL wherever your A2A directory expects agent-card links. Keep private bearer tokens out of the Agent Card; the card declares the auth scheme, not the secret.

Once hosted, seed HoloMesh discovery with the card URL:

```json
{
  "name": "discover_agents",
  "arguments": {
    "domain": "spatial",
    "tags": ["holotunnel", "spatial-guide"],
    "seedUrls": ["https://agents.example.com/.well-known/agent-card.json"],
    "limit": 5
  }
}
```

That gives the complete local slice: `.holo` composition -> `compile_to_a2a_agent_card` -> public `/.well-known/agent-card.json` -> HoloMesh `discover_agents` seed URL. External registry posting and demo hosting are separate release steps because they require live infrastructure ownership.

## Multi-Agent Compositions

HoloScript's spatial-comms layer supports 3 communication tiers:

| Layer   | Protocol            | Use case                       |
| ------- | ------------------- | ------------------------------ |
| Layer 1 | Real-time WebSocket | In-scene coordination (< 16ms) |
| Layer 2 | A2A HTTP            | Cross-agent task delegation    |
| Layer 3 | MCP                 | Tool discovery and invocation  |

A2A is Layer 2 — agents in different organizations coordinate via A2A while sharing a HoloScript scene.

## Serving the Agent Card

```bash
# Serve from project root
npx serve . -p 3000
# Card available at: http://localhost:3000/.well-known/agent-card.json

# Or add to Express
app.use('/.well-known', express.static('./public/.well-known'))
```

## Compiler Options

| Option            | Default  | Description                             |
| ----------------- | -------- | --------------------------------------- |
| `--a2a-base-url`  | required | Base URL where agent is hosted          |
| `--a2a-auth`      | `none`   | Auth scheme: `none`, `bearer`, `oauth2` |
| `--a2a-streaming` | `true`   | Enable streaming capability in card     |
| `--a2a-version`   | `1.0.0`  | Agent version string                    |

## See Also

- [Agents Overview](/agents/) — Full uAA2++ agent framework
- [uAAL VM](/agents/uaal-vm) — Agent bytecode execution
- [MCP Server](/guides/mcp-server) — Tool discovery (Layer 3)
