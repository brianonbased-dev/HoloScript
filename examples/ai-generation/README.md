# AI Generation Examples

System prompts, templates, and examples for AI agents (Grok, Claude, Copilot) to generate HoloScript code.

**Python package:** `pip install holoscript` ([PyPI 5.3.0](https://pypi.org/project/holoscript/5.3.0/))

## Directory Structure

```
ai-generation/
├── prompts/
│   ├── scene-builder.md          # Scene composition prompts
│   ├── object-generator.md       # Object creation prompts
│   └── trait-advisor.md          # Trait recommendation prompts
├── integrations/
│   ├── xai-grok.ts               # xAI/Grok integration
│   ├── anthropic-claude.ts       # Anthropic Claude integration
│   ├── openai-gpt.ts             # OpenAI GPT-4 with function calling
│   ├── google-gemini.ts          # Google Gemini multimodal
│   ├── ollama-local.ts           # Local Ollama models
│   └── mcp-client.ts             # MCP client example
├── grok-rest-pipeline.py         # Full REST API + SDK pipeline demo
└── examples/
    ├── enchanted-forest.holo
    ├── social-gallery.holo       # Social traits (@shareable, @collaborative, @tweetable)
    ├── sci-fi-station.holo
    └── multiplayer-arena.holo
```

## AI Provider Integrations

| Provider             | File                  | Features                            |
| -------------------- | --------------------- | ----------------------------------- |
| **xAI Grok**         | `xai-grok.ts`         | X platform native, tweet sharing    |
| **Anthropic Claude** | `anthropic-claude.ts` | Multi-turn, iterative refinement    |
| **OpenAI GPT-4**     | `openai-gpt.ts`       | Function calling, streaming, vision |
| **Google Gemini**    | `google-gemini.ts`    | Multimodal, video, grounded search  |
| **Ollama**           | `ollama-local.ts`     | Local/offline, model comparison     |

## Quick Start for AI Agents

### Using MCP Tools

```typescript
// 1. Suggest traits for an object
const traits = await mcp.call('suggest_traits', {
  description: 'a sword that can be picked up and thrown',
});
// → ["@grabbable", "@throwable", "@collidable"]

// 2. Generate object code
const object = await mcp.call('generate_object', {
  description: 'a glowing blue crystal that floats',
  format: 'hsplus',
});
// → composition Crystal @glowing @animated { ... }

// 3. Generate complete scene
const scene = await mcp.call('generate_scene', {
  description: 'an enchanted forest with glowing mushrooms and a fairy',
  style: 'detailed',
});

// 4. Validate the code
const validation = await mcp.call('validate_holoscript', {
  code: scene.code,
  includeSuggestions: true,
});

// 5. Create share link for X
const share = await mcp.call('create_share_link', {
  code: scene.code,
  title: 'Enchanted Forest',
  platform: 'x',
});
```

### Using Python SDK (v5.3.0)

```python
from holoscript import generate, validate, share, suggest_traits, list_traits

# Generate from natural language
scene = generate("a floating castle in the clouds")

# Validate
result = validate(scene.code)
assert result.valid

# Suggest social traits
traits = suggest_traits("share this artwork and tweet about it")
print(traits["traits"])  # ['@shareable', '@tweetable']

# List available social traits
social = list_traits("social")
print(social["social"])  # ['@shareable', '@collaborative', '@tweetable']

# Share on X
link = share(scene.code, title="Cloud Castle", platform="x")
print(f"Tweet: {link.tweet_text}")
print(f"Playground: {link.playground_url}")
print(f"QR: {link.qr_code}")
```

### Using REST API

```bash
# Start the MCP server
cd packages/mcp-server && PORT=3000 node dist/http-server.js

# Render a scene
curl -X POST http://localhost:3000/api/render \
  -H "Content-Type: application/json" \
  -d '{"code": "composition \"Art\" { object \"Gem\" @shareable { geometry: \"sphere\" } }"}'

# Create X share link
curl -X POST http://localhost:3000/api/share \
  -H "Content-Type: application/json" \
  -d '{"code": "...", "title": "My VR Art", "platform": "x"}'
```

See [`grok-rest-pipeline.py`](grok-rest-pipeline.py) for the full SDK + REST pipeline demo.

## System Prompts

See individual prompt files for detailed system prompts optimized for:

- Scene composition from vague descriptions
- Object generation with appropriate traits
- Trait selection based on behavior requirements
- Error correction and code improvement

## Best Practices

1. **Always validate** generated code before sharing
2. **Use trait suggestions** for interactive objects
3. **Use social traits** (`@shareable`, `@collaborative`, `@tweetable`) for X integration
4. **Include physics** for realistic object behavior
5. **Add audio** for immersive experiences
6. **Consider networking** for multiplayer scenes
