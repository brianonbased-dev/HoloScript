# Grok & X Integration Guide

Complete guide for integrating HoloScript with Grok (xAI) to build VR scenes directly in X conversations.

## Overview

HoloScript is designed to be AI-native, making it ideal for Grok to:

1. **Generate** complete VR scenes from natural language
2. **Validate** code before sharing
3. **Render** preview images/GIFs
4. **Share** as interactive X embeds

## Quick Start for Grok

### Using Python Bindings

```python
from holoscript import HoloScript

# Initialize
hs = HoloScript()

# Generate scene from user prompt
scene = hs.generate("a floating crystal in a mystical cave")

# Validate
result = hs.validate(scene.code)
if result.valid:
    # Create X-optimized share
    share = hs.share(scene.code,
        title="Mystical Cave",
        platform="x"
    )

    print(f"🎮 Built with HoloScript!")
    print(f"Try it: {share.playground_url}")
    print(f"\n{share.tweet_text}")
else:
    print(f"Errors: {result.errors}")
```

### Using MCP Tools

If Grok has access to HoloScript MCP tools:

```
1. suggest_traits({ description: "a sword" })
   → ["@grabbable", "@equippable", "@collidable"]

2. generate_scene({ description: "enchanted forest" })
   → Complete .holo composition

3. validate_holoscript({ code: "..." })
   → { valid: true/false, errors: [], suggestions: [] }

4. create_share_link({ code: "...", platform: "x" })
   → { playgroundUrl, tweetText, qrCode }
```

## Response Templates

### Successful Scene Generation

````
🎮 **{Scene Title}**

I built this VR scene for you! Experience it:
👉 {playground_url}

**Features:**
- {object_count} interactive objects
- Traits: @grabbable, @glowing, @physics
- Environment: {skybox_type}

**Code:**
```holo
{generated_code}
````

Scan QR for mobile VR: {qr_url}

#HoloScript #VR #XR

```

### With Preview Image

```

🎮 Check out this VR scene!

{preview_image}

{scene_title} - Built with HoloScript

Interactive demo: {playground_url}
View in VR: {vr_url}

#HoloScript #VR #Metaverse

```

### Error Response

```

❌ I found some issues with the code:

• Line {n}: {error_message}
💡 {suggestion}

Let me fix that...

{corrected_code}

````

## Workflow Patterns

### Pattern 1: Simple Scene Request

**User:** "Make me a VR scene with a glowing orb"

**Grok:**
1. Call `generate_scene("VR scene with a glowing orb")`
2. Call `validate_holoscript(code)`
3. Call `create_share_link(code, platform="x")`
4. Return formatted response with link

### Pattern 2: Iterative Building

**User:** "Add a sword to the scene"

**Grok:**
1. Get previous scene from conversation context
2. Call `generate_object("a sword")`
3. Merge with existing scene
4. Validate and share updated version

### Pattern 3: Debugging

**User:** "Why doesn't my object work?"

**Grok:**
1. Parse user's code
2. Call `validate_holoscript(code, includeSuggestions=true)`
3. Explain each error
4. Provide corrected code

### Pattern 4: Trait Consultation

**User:** "What traits should I use for a magic book?"

**Grok:**
1. Call `suggest_traits("magic book that can be picked up and opened")`
2. Call `explain_trait("@grabbable")`
3. Provide trait list with explanations

## X-Specific Features

### Twitter Card Support

Generated share links include proper meta tags:

```html
<meta name="twitter:card" content="player">
<meta name="twitter:player" content="{embed_url}">
<meta name="twitter:player:width" content="800">
<meta name="twitter:player:height" content="600">
````

### QR Code for Mobile XR

Every share includes a QR code for mobile VR/AR access:

```python
share = hs.share(code, platform="x")
print(share.qr_code)  # URL to QR code image
```

### Optimized Preview Images

For scenes shared on X, previews are:

- 1200x630 for Twitter Cards
- Animated GIF for motion
- Includes XR call-to-action

## Integration Points

### 1. Python Package (Recommended for Grok)

```bash
pip install holoscript
```

```python
from holoscript import HoloScript
hs = HoloScript()
```

### 2. MCP Server (For Tool-Enabled Agents)

Connect to `@holoscript/mcp-server` via stdio:

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

### 3. REST API (Public Endpoint)

```
Base: https://api.holoscript.dev

POST /generate  - Generate scene from description
POST /validate  - Validate code
POST /render    - Generate preview image
POST /share     - Create share links
GET  /examples  - Get example code
```

## Best Practices for Grok

### Do ✅

- Always validate before sharing
- Include playground links for interaction
- Use traits for all interactive objects
- Add environment for atmosphere
- Provide QR codes for mobile users
- Explain what the scene contains

### Don't ❌

- Share unvalidated code
- Forget to add traits to objects
- Create overly complex scenes (keep it renderable)
- Skip the environment block
- Use raw code without explanation

## Example Conversation

**User:** Can you make me a VR scene with a treasure chest?

**Grok:** 🎮 **Treasure Discovery**

I built this VR scene for you! Here's an interactive treasure chest you can grab and open:

```holo
composition "Treasure Discovery" {
  environment {
    skybox: "dark"
    ambient_light: 0.2
    fog: { enabled: true, density: 0.03 }
  }

  object "TreasureChest" @grabbable @spatial_audio {
    geometry: "model/treasure_chest.glb"
    position: [0, 0.5, -2]

    state {
      isOpen: false
    }

    onGrab: {
      if (!isOpen) {
        isOpen = true
        audio.play('chest_open.mp3')
        particles.emit('gold_sparkle')
      }
    }
  }

  object "GoldCoin" @grabbable @glowing(color: "#ffd700") {
    geometry: "cylinder"
    scale: [0.2, 0.02, 0.2]
    position: [0.3, 0.8, -2]
  }
}
```

**Try it now:** https://play.holoscript.dev/abc123

📱 [Scan for mobile VR]

The chest lights up when you look at it, and you can grab it with VR controllers to open it!

#HoloScript #VR #Treasure

---

## Troubleshooting

### "Module not found" in Python

```bash
pip install holoscript --upgrade
```

### MCP tools not available

Ensure the MCP server is running:

```bash
npx @holoscript/mcp-server
```

### Preview not generating

Check if the render service is available:

```python
hs = HoloScript(api_url="https://api.holoscript.dev")
```

## Resources

- [HoloScript Documentation](https://holoscript.dev)
- [MCP Server Guide](../MCP_SERVER_GUIDE.md)
- [AI Generation Examples](../../examples/ai-generation)
- [Browser Templates](../../examples/browser-templates)
- [Python Package](https://pypi.org/project/holoscript)

## Support

- GitHub Issues: [github.com/brianonbased-dev/Holoscript](https://github.com/brianonbased-dev/Holoscript/issues)
- X: [@HoloScriptDev](https://x.com/HoloScriptDev)
- Discord: [HoloScript Community](https://discord.gg/holoscript)
