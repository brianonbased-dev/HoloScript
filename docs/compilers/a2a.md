# Google A2A Agent Card Compiler

Compiles HoloScript agent definitions to [Google A2A (Agent-to-Agent)](https://google.github.io/A2A/) protocol **Agent Cards** — the standard JSON manifests that allow AI agents to discover and call each other across organizations and platforms.

## Overview

The A2A compiler (`--target a2a`) generates standardized Agent Card JSON files that are served at `/.well-known/agent-card.json`. Any A2A-compatible agent runtime (Google, Anthropic, Microsoft, custom) can discover and call your HoloScript agents through this standard interface.

```bash
holoscript compile agents.holo --target a2a --output ./public/.well-known/
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
holoscript compile agent.holo --target a2a
# → .well-known/agent-card.json
# → agents/spatial-guide/manifest.json
```

## Multi-Agent Compositions

HoloScript's spatial-comms layer supports 3 communication tiers:

| Layer   | Protocol       | Use case                        |
| ------- | -------------- | ------------------------------- |
| Layer 1 | Real-time WebSocket | In-scene coordination (< 16ms) |
| Layer 2 | A2A HTTP       | Cross-agent task delegation     |
| Layer 3 | MCP            | Tool discovery and invocation   |

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

| Option                | Default   | Description                               |
| --------------------- | --------- | ----------------------------------------- |
| `--a2a-base-url`      | required  | Base URL where agent is hosted            |
| `--a2a-auth`          | `none`    | Auth scheme: `none`, `bearer`, `oauth2`   |
| `--a2a-streaming`     | `true`    | Enable streaming capability in card       |
| `--a2a-version`       | `1.0.0`   | Agent version string                      |

## See Also

- [Agents Overview](/agents/) — Full uAA2++ agent framework
- [uAAL VM](/agents/uaal-vm) — Agent bytecode execution
- [MCP Server](/guides/mcp-server) — Tool discovery (Layer 3)
