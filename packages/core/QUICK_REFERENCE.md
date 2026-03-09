# AI HoloScript Generation - Quick Reference

**TL;DR**: Generate HoloScript from natural language in 5 lines of code.

---

## Installation

```typescript
import { HoloScriptGenerator } from '@holoscript/core';
import { OpenAIAdapter } from '@holoscript/core';
```

---

## Basic Usage

### 1. Generate from Prompt

```typescript
const generator = new HoloScriptGenerator();
const adapter = new OpenAIAdapter({ apiKey: 'sk-...' });
const session = generator.createSession(adapter);

const result = await generator.generate('Create a blue sphere');
console.log(result.holoScript); // Generated code
```

### 2. Generate Batch

```typescript
import { generateBatch } from '@holoscript/core';

const results = await generateBatch(
  ['Create player', 'Create enemy', 'Create button'],
  new OpenAIAdapter({ apiKey: 'sk-...' })
);
```

### 3. Fix Broken Code

```typescript
const fixed = await generator.fix(brokenCode);
console.log(fixed.holoScript); // Auto-fixed
```

### 4. Optimize for Platform

```typescript
const optimized = await generator.optimize(code, 'mobile');
```

---

## Adapters

### Switch Provider

```typescript
// OpenAI
new OpenAIAdapter({ apiKey: 'sk-...' });

// Anthropic (Claude)
new AnthropicAdapter({ apiKey: 'ant-...' });

// Google Gemini
new GeminiAdapter({ apiKey: 'AIza...' });

// XAI (Grok)
new XAIAdapter({ apiKey: 'xai-...' });

// Local Ollama
new OllamaAdapter({ baseURL: 'http://localhost:11434' });

// Together.ai
new TogetherAdapter({ apiKey: 'together_...' });

// Fireworks.ai
new FireworksAdapter({ apiKey: 'fw_...' });

// NVIDIA
new NVIDIAAdapter({ apiKey: 'nvapi_...' });
```

---

## Configuration

```typescript
const session = generator.createSession(adapter, {
  maxAttempts: 5, // Retry logic (default: 3)
  minConfidence: 0.85, // Quality bar (default: 0.7)
  autoFix: true, // Fix broken code (default: true)
  targetPlatform: 'vr', // Target: mobile|desktop|vr|ar (default: vr)
});
```

---

## Error Handling

```typescript
try {
  const result = await generator.generate(prompt, session);

  if (result.parseResult.success) {
    console.log('✅ Success');
  } else {
    console.log('⚠️ Warnings:', result.parseResult.errors);
  }
} catch (error) {
  console.error('❌ Failed:', error.message);
}
```

---

## History & Stats

```typescript
// Get history
const history = generator.getHistory(session);
history.forEach((entry) => {
  console.log(entry.prompt);
  console.log(entry.generated.holoScript);
});

// Get statistics
const stats = generator.getStats(session);
console.log('Success rate:', stats.successRate);
console.log('Avg confidence:', stats.avgConfidence);
```

---

## Multi-Turn Conversation

```typescript
let history = [];

const response1 = await generator.chat('Create a player', session, history);
history.push({ role: 'user', content: 'Create a player' });
history.push({ role: 'assistant', content: response1 });

const response2 = await generator.chat('Add physics', session, history);
history.push({ role: 'user', content: 'Add physics' });
history.push({ role: 'assistant', content: response2 });
```

---

## Validation & Batch Operations

```typescript
import { validateBatch } from '@holoscript/core';

// Validate multiple codes
const validation = validateBatch(codes);
console.log('Valid:', validation.filter((v) => v.valid).length);
```

---

## Complete Example

```typescript
import { HoloScriptGenerator, OpenAIAdapter, generateBatch, validateBatch } from '@holoscript/core';

// Setup
const generator = new HoloScriptGenerator();
const adapter = new OpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY });
const session = generator.createSession(adapter, {
  maxAttempts: 5,
  minConfidence: 0.85,
  targetPlatform: 'vr',
});

// Generate multiple
const prompts = [
  'Create an interactive player controller',
  'Create a rotating cube',
  'Create a button',
];

const results = await generateBatch(prompts, adapter);

// Validate
const validation = validateBatch(results.map((r) => r.holoScript));

// Print results
results.forEach((result, i) => {
  console.log(`[${i}] ${prompts[i]}`);
  console.log('  Valid:', validation[i].valid);
  console.log('  Confidence:', result.aiConfidence);
  console.log('  Code:', result.holoScript.substring(0, 50) + '...');
});

// Get session stats
const stats = generator.getStats(session);
console.log('\nSession Stats:');
console.log('  Total:', stats.totalGenerations);
console.log('  Success Rate:', `${(stats.successRate * 100).toFixed(1)}%`);
console.log('  Avg Confidence:', stats.avgConfidence.toFixed(2));
```

---

## Common Patterns

### Pattern 1: High-Quality Generation

```typescript
const session = generator.createSession(adapter, {
  minConfidence: 0.95, // Very strict
  maxAttempts: 10, // Many retries
  autoFix: true,
});
```

### Pattern 2: Exploratory Generation

```typescript
const session = generator.createSession(adapter, {
  minConfidence: 0.6, // Exploratory
  maxAttempts: 3, // Quick
  autoFix: true,
});
```

### Pattern 3: Mobile Optimization

```typescript
const session = generator.createSession(adapter, {
  targetPlatform: 'mobile',
  minConfidence: 0.8,
  autoFix: true,
});
```

### Pattern 4: Iterative Refinement

```typescript
// Generate
let code = await generator.generate(prompt, session);

// Fix if needed
if (!code.parseResult.success) {
  code = await generator.fix(code.holoScript, session);
}

// Optimize
code = await generator.optimize(code.holoScript, 'vr', session);

// Explain
const explanation = await generator.explain(code.holoScript, session);
```

---

## Testing

```typescript
// With mock adapter (in tests)
import { describe, it, expect } from 'vitest';

class MockAdapter implements AIAdapter {
  async generateHoloScript(prompt: string) {
    return {
      holoScript: `orb #test { }`,
      aiConfidence: 0.95,
    };
  }
  // ... other methods
}

describe('MyCode', () => {
  it('should generate', async () => {
    const generator = new HoloScriptGenerator();
    const session = generator.createSession(new MockAdapter());
    const result = await generator.generate('test', session);
    expect(result.holoScript).toBeDefined();
  });
});
```

---

## Troubleshooting

| Issue                 | Solution                                               |
| --------------------- | ------------------------------------------------------ |
| Low confidence scores | ↑ Try better prompts or manual refinement              |
| Parse errors          | ✅ Auto-fix enabled (default: true)                    |
| Wrong output          | ↓ Decrease minConfidence or increase maxAttempts       |
| API rate limits       | ⏸️ Add delays between generations or reduce batch size |
| Type errors           | 🔍 Check AIAdapter interface compliance                |

---

## Performance Tips

1. **Reuse sessions**: Create once, generate many
2. **Use batches**: generateBatch() is faster than individual calls
3. **Adjust confidence**: Higher = more retries = slower
4. **Platform targets**: Specify targetPlatform upfront
5. **Auto-fix tuning**: Disable if code is always valid

---

**Full Documentation**: See `AI_GENERATION_API.md` for complete API reference.
