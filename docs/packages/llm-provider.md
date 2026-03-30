# @holoscript/llm-provider

**Unified LLM interface for HoloScript.** Generate scenes and code using OpenAI, Anthropic, Google Gemini, or local models.

## Installation

```bash
npm install @holoscript/llm-provider
```

## Usage

### Initialize

```typescript
import { createLLMProvider } from '@holoscript/llm-provider';

const provider = createLLMProvider({
  type: 'openai', // or 'anthropic', 'gemini', 'local'
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4',
});
```

### Generate Scene

```typescript
const scene = await provider.generateScene({
  description: 'A haunted mansion with ghosts and puzzles',
  complexity: 'medium',
  targetPlatforms: ['unity', 'webgpu'],
});

console.log(scene.code); // .holo file content
```

### Generate Object

```typescript
const object = await provider.generateObject({
  description: 'A glowing sword that damages enemies',
  traits: ['@grabbable', '@damaging', '@glowing'],
  context: scene, // Optional: give it scene context
});

console.log(object.code);
```

### Multi-Provider Support

```typescript
// See which models are available
const providers = ['openai', 'anthropic', 'gemini', 'local'];

for (const provider of providers) {
  const llm = createLLMProvider({ type: provider });
  const models = await llm.listModels();
  console.log(`${provider}:`, models);
}
```

## Configuration

### OpenAI

```typescript
const provider = createLLMProvider({
  type: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4-turbo',
  temperature: 0.7,
  maxTokens: 4000,
});
```

### Anthropic

```typescript
const provider = createLLMProvider({
  type: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-3-opus',
  temperature: 0.8,
});
```

### Local (Ollama)

```typescript
const provider = createLLMProvider({
  type: 'local',
  url: 'http://localhost:11434',
  model: 'neural-chat',
});
```

## Advanced

### Custom System Prompt

```typescript
const scene = await provider.generateScene({
  description: 'VR escape room',
  systemPrompt: 'You are an expert game designer. Create immersive, engaging scenes.',
  temperature: 0.9,
});
```

### Streaming

```typescript
const stream = await provider.generateSceneStream({
  description: 'Medieval village',
});

stream.on('chunk', (code) => {
  console.log('Streaming:', code);
});

const finalScene = await stream.complete();
```

### Batch Generation

```typescript
const results = await provider.batchGenerate(
  [
    { description: 'Forest scene' },
    { description: 'Alien spaceship' },
    { description: 'Mountain temple' },
  ],
  { parallel: 2 }
);
```

## See Also

- [MCP Server](./mcp-server.md) — AI agent integration
- [Agent SDK](./agent-sdk.md) — Build autonomous agents
