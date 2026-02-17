# AI Integration

Use the HoloScript MCP server (34+ tools) to let AI agents generate, validate, and modify VR scenes through natural language.

## Overview

HoloScript ships with a Model Context Protocol (MCP) server at `@holoscript/mcp-server`. Connect it to any MCP-capable AI (Claude, GPT-4, Grok, etc.) and the AI can:

- Suggest appropriate traits for objects
- Generate complete `.holo` compositions from descriptions
- Validate code and fix errors
- Search the traits catalog (1,525+ traits)
- Create shareable playground links

## Setup

### 1. Install the MCP Server

```bash
npm install -g @holoscript/mcp-server
# or
npx @holoscript/mcp-server
```

### 2. Connect to Claude

Add to your Claude Desktop `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "holoscript": {
      "command": "npx",
      "args": ["@holoscript/mcp-server"]
    }
  }
}
```

### 3. Connect to Cursor / VS Code

Add to your MCP settings:

```json
{
  "holoscript": {
    "command": "npx",
    "args": ["@holoscript/mcp-server"],
    "env": {}
  }
}
```

## Key MCP Tools (34 Total)

| Tool | What it does |
| --- | --- |
| `suggest_traits` | Returns best traits for a description |
| `generate_object` | Creates a single HoloScript object |
| `generate_scene` | Creates a complete composition |
| `validate_holoscript` | Checks code for errors + suggestions |
| `list_traits` | Browse 1,525+ traits by category |
| `explain_trait` | Detailed docs for a single trait |
| `compile_to_target` | Compile to Unity, Godot, VRChat, etc. |
| `create_share_link` | Generate a playground URL |
| `get_examples` | Retrieve example compositions |
| `search_traits` | Semantic search across trait catalog |

## Example AI Workflows

### Workflow 1: Generate Scene from Prompt

**Human to AI:** "Create a meditation room with floating crystals and soft ambient sound"

**AI calls:**
```
1. suggest_traits({ description: "floating meditation crystal" })
   → ["@glowing", "@levitating", "@spatial_audio", "@reactive"]

2. generate_scene({
     name: "Meditation Room",
     description: "serene space with floating crystals and ambient sound",
     object_count: 5
   })
   → complete .holo composition

3. validate_holoscript({ code: <generated> })
   → { valid: true, warnings: [] }
```

**Output:**
```holo
composition "Meditation Room" {
  environment {
    skybox: "starfield"
    ambient_light: 0.15
    fog: { enabled: true, density: 0.02, color: "#1a0a2e" }
  }

  template "Crystal" {
    @glowing
    @levitating(speed: 0.3, height: 0.15)
    @spatial_audio

    geometry: "gem"

    every 3s {
      animate glow_intensity from 0.5 to 2.0 over 1.5s then reverse
    }
  }

  object "CrystalA" using "Crystal" {
    position: [0, 1.8, -3]
    color: "#aa44ff"
    glow_color: "#cc88ff"
    audio: "crystal_hum_low.wav"
  }

  object "CrystalB" using "Crystal" {
    position: [1.2, 2.2, -4]
    color: "#4488ff"
    glow_color: "#88aaff"
    audio: "crystal_hum_mid.wav"
  }

  object "CrystalC" using "Crystal" {
    position: [-1.0, 1.5, -3.5]
    color: "#ff44aa"
    glow_color: "#ff88cc"
    audio: "crystal_hum_high.wav"
  }

  object "AmbientSound" {
    @ambient
    audio: "meditation_drone.wav"
    volume: 0.3
    loop: true
  }

  object "Floor" {
    @collidable
    @glowing
    position: [0, -0.1, -3]
    scale: [8, 0.1, 8]
    color: "#110825"
    glow_color: "#4400aa"
    glow_intensity: 0.15
  }
}
```

### Workflow 2: Add Object to Existing Scene

**Human to AI:** "Add a glowing orb that follows the player"

**AI calls:**
```
1. generate_object({
     name: "FollowerOrb",
     description: "glowing orb that follows and orbits the player",
     geometry: "sphere"
   })

2. validate_holoscript({ code: existing_scene + new_object })
```

### Workflow 3: Debug and Fix

**Human to AI:** "My physics isn't working — why is the ball floating?"

**AI calls:**
```
1. validate_holoscript({ code: user_code, includeSuggestions: true })
   → {
       valid: false,
       errors: [{
         line: 12,
         message: "Object has @physics but no @collidable — will fall through floor",
         suggestion: "Add @collidable to 'Ball'"
       }]
     }
```

## Python Integration

```python
from holoscript import HoloScript

hs = HoloScript()

# Generate from natural language
scene = hs.generate("a haunted library with floating books and flickering candles")

# Validate
result = hs.validate(scene.code)
if result.valid:
    # Create shareable link
    share = hs.share(scene.code, title="Haunted Library", platform="web")
    print(f"Try it: {share.playground_url}")
```

## REST API

```bash
# Generate scene
curl -X POST https://api.holoscript.dev/generate \
  -H "Content-Type: application/json" \
  -d '{"description": "underwater coral reef with fish"}'

# Validate
curl -X POST https://api.holoscript.dev/validate \
  -d '{"code": "composition \"Test\" { ... }"}'

# Suggest traits
curl -X POST https://api.holoscript.dev/traits/suggest \
  -d '{"description": "a magic wand that shoots sparks"}'
```

## Tips for AI-Generated HoloScript

1. **Always validate** before sharing — call `validate_holoscript` on every generated scene
2. **Use `suggest_traits` first** — the trait suggestions dramatically improve output quality
3. **Iterate in steps** — generate → validate → refine, don't try one giant prompt
4. **Request specific targets** — tell the AI which platform (VRChat, Unity, web) to optimize for
5. **Cap object count** — for real-time generation keep scenes to 10–20 objects

## See Also

- [MCP Server Guide](/guides/mcp-server)
- [Python Bindings](/guides/python-bindings)
- [Traits Reference](/traits/)
- [Grok Integration](/integrations/grok)
