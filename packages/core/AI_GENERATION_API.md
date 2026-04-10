# AI-Guided HoloScript Generation API

**Status**: ✅ Complete | **Tests**: 65/65 passing | **Coverage**: Adapters + Generator + Integration

This document provides a complete guide to the AI-guided HoloScript generation system, which enables creation of valid HoloScript code from natural language descriptions through a unified API.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Architecture](#architecture)
3. [API Reference](#api-reference)
4. [Adapters](#adapters)
5. [Generator](#generator)
6. [Examples](#examples)
7. [Best Practices](#best-practices)
8. [Testing](#testing)

---

## Quick Start

### Basic Generation

```typescript
import { HoloScriptGenerator } from '@holoscript/core';
import { AnthropicAdapter } from '@holoscript/core';

// Create generator and session
const generator = new HoloScriptGenerator();
const adapter = new AnthropicAdapter({ apiKey: process.env.ANTHROPIC_API_KEY });
const session = generator.createSession(adapter);

// Generate code from prompt
const result = await generator.generate('Create a blue sphere at origin');

console.log(result.holoScript); // Generated HoloScript code
console.log(result.aiConfidence); // Confidence score (0-1)
console.log(result.parseResult.success); // Parse succeeded?
console.log(result.wasFixed); // Auto-fixed?
```

### Using Helper Functions

```typescript
import { generateHoloScript, generateBatch, validateBatch } from '@holoscript/core';
import { OpenAIAdapter } from '@holoscript/core';

// Single generation
const code = await generateHoloScript(
  'Create an interactive player controller',
  new OpenAIAdapter({ apiKey: 'sk-...' }),
  { maxAttempts: 3, targetPlatform: 'vr' }
);

// Batch generation
const results = await generateBatch(
  ['Create a player', 'Create an enemy', 'Create a button'],
  new OpenAIAdapter({ apiKey: 'sk-...' })
);

// Validate batch
const validation = validateBatch(results.map((r) => r.holoScript));
console.log(`Valid: ${validation.filter((v) => v.valid).length}/${validation.length}`);
```

---

## Architecture

### High-Level Flow

```
Natural Language Prompt
        ↓
    AI Adapter
        ↓
  Generated Code (HoloScript)
        ↓
   HoloScriptPlusParser
        ↓
   Parse Result (AST)
        ↓
   Valid? ──→ No → Auto-Fix → Re-parse
        ↓
       Yes
        ↓
  Explanation (optional)
        ↓
  Generated Code Result
```

### Key Components

| Component                | Purpose                         | Status               |
| ------------------------ | ------------------------------- | -------------------- |
| **AIAdapter**            | Interface for AI providers      | ✅ 8 implementations |
| **HoloScriptGenerator**  | High-level generation API       | ✅ Complete          |
| **HoloScriptPlusParser** | Parse & validate generated code | ✅ Working           |
| **ErrorRecovery**        | Auto-fix broken code            | ✅ Integrated        |
| **Sessions**             | Track generation history        | ✅ Implemented       |

---

## API Reference

### HoloScriptGenerator

Main class for AI-guided code generation.

#### Constructor

```typescript
constructor();
```

Creates a new generator instance with a built-in parser.

#### Methods

##### `createSession(adapter, config?)`

Create a new generation session.

```typescript
interface GenerationConfig {
  maxAttempts: number; // Default: 3
  targetPlatform: 'mobile' | 'desktop' | 'vr' | 'ar'; // Default: 'vr'
  autoFix: boolean; // Default: true
  minConfidence: number; // Default: 0.7 (0-1)
}

const session = generator.createSession(adapter, {
  maxAttempts: 5,
  targetPlatform: 'vr',
  autoFix: true,
  minConfidence: 0.8,
});
```

##### `generate(prompt, session?)`

Generate HoloScript from a natural language prompt.

```typescript
interface GeneratedCode {
  holoScript: string; // The generated code
  aiConfidence: number; // AI confidence (0-1)
  parseResult: ParseResult; // Parser result
  wasFixed: boolean; // Auto-fixed?
  attempts: number; // Number of attempts
  explanation?: string; // Optional explanation
}

const result = await generator.generate(
  'Create a glowing red cube that responds to touch',
  session
);
```

**Behavior**:

- Generates code up to `maxAttempts` times
- Checks confidence against `minConfidence` threshold
- Auto-fixes if enabled and first attempt has errors
- Parses with lenient mode for graceful degradation
- Fetches explanation if generation succeeds
- Records in session history

##### `optimize(code, platform, session?)`

Optimize code for a specific platform.

```typescript
const optimized = await generator.optimize(generatedCode.holoScript, 'mobile', session);
```

**Platforms**: `mobile`, `desktop`, `vr`, `ar`

##### `fix(code, session?)`

Fix invalid HoloScript code.

```typescript
const fixed = await generator.fix(invalidCode, session);

if (fixed.parseResult.success) {
  console.log('Fixed successfully!');
  console.log(fixed.holoScript);
}
```

##### `explain(code, session?)`

Get a text explanation of what code does.

```typescript
const explanation = await generator.explain(code, session);
console.log(explanation); // "This code creates a..."
```

##### `chat(message, session?, history?)`

Multi-turn conversation for iterative development.

```typescript
const history = [
  { role: 'user', content: 'Create a player' },
  { role: 'assistant', content: 'I will create...' },
];

const response = await generator.chat('Now add physics', session, history);
```

##### `getHistory(session?)`

Get generation history from session.

```typescript
const history = generator.getHistory(session);
history.forEach((entry, i) => {
  console.log(`[${i}] ${entry.prompt}`);
  console.log(`    Attempts: ${entry.generated.attempts}`);
  console.log(`    Confidence: ${entry.generated.aiConfidence}`);
  console.log(`    Success: ${entry.generated.parseResult.success}`);
});
```

##### `getStats(session?)`

Get statistics for a session.

```typescript
const stats = generator.getStats(session);

console.log(stats);
// {
//   totalGenerations: 5,
//   successCount: 4,
//   fixedCount: 1,
//   avgAttempts: 1.2,
//   avgConfidence: 0.87,
//   successRate: 0.8
// }
```

##### `clearHistory(session?)`

Clear session history.

```typescript
generator.clearHistory(session);
```

---

## Adapters

### Available Adapters

| Provider        | Class              | Status | Auth    |
| --------------- | ------------------ | ------ | ------- |
| OpenAI          | `OpenAIAdapter`    | ✅     | API Key |
| Anthropic       | `AnthropicAdapter` | ✅     | API Key |
| Ollama (Local)  | `OllamaAdapter`    | ✅     | URL     |
| Google (Gemini) | `GeminiAdapter`    | ✅     | API Key |
| XAI (Grok)      | `XAIAdapter`       | ✅     | API Key |
| Together.ai     | `TogetherAdapter`  | ✅     | API Key |
| Fireworks.ai    | `FireworksAdapter` | ✅     | API Key |
| NVIDIA          | `NVIDIAAdapter`    | ✅     | API Key |

### Adapter Interface

All adapters implement `AIAdapter`:

```typescript
interface AIAdapter {
  // Generate HoloScript from prompt
  generateHoloScript(prompt: string): Promise<GenerateResult>;

  // Explain existing code
  explainHoloScript(code: string): Promise<ExplainResult>;

  // Optimize for platform
  optimizeHoloScript(code: string, platform: string): Promise<OptimizeResult>;

  // Fix broken code
  fixHoloScript(code: string, errors: string[]): Promise<FixResult>;

  // Multi-turn conversation
  chat(message: string, systemPrompt: string, history?: Message[]): Promise<string>;

  // Generate embeddings
  getEmbeddings(texts: string[]): Promise<number[][]>;

  // Get adapter name
  getName(): string;
}
```

### Using Different Adapters

```typescript
import { OpenAIAdapter, AnthropicAdapter, GeminiAdapter } from '@holoscript/core';

// OpenAI (GPT-4)
const openai = new OpenAIAdapter({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4-turbo', // or 'gpt-4', 'gpt-3.5-turbo'
  temperature: 0.7,
});

// Anthropic (Claude)
const anthropic = new AnthropicAdapter({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-3-opus', // or 'claude-3-sonnet'
  temperature: 0.7,
});

// Google Gemini
const gemini = new GeminiAdapter({
  apiKey: process.env.GEMINI_API_KEY,
  model: 'gemini-pro',
  temperature: 0.7,
});

// Local Ollama
const ollama = new OllamaAdapter({
  baseURL: 'http://localhost:11434',
  model: 'mistral',
  temperature: 0.7,
});

// Generate with different adapters
const results = await Promise.all([
  generateHoloScript(prompt, openai),
  generateHoloScript(prompt, anthropic),
  generateHoloScript(prompt, gemini),
]);
```

---

## Generator

### Session Management

Sessions track generation history and configuration:

```typescript
const adapter = new OpenAIAdapter({ apiKey: '...' });
const session = generator.createSession(adapter, {
  maxAttempts: 5,
  targetPlatform: 'vr',
  autoFix: true,
  minConfidence: 0.8,
});

// All operations use this session by default
await generator.generate('Create a player', session);

// Or set as current
const current = generator.getCurrentSession();
```

### Advanced Configuration

```typescript
const session = generator.createSession(adapter, {
  // Retry configuration
  maxAttempts: 5, // Increase attempts for complex prompts

  // Confidence threshold
  minConfidence: 0.85, // Stricter validation

  // Auto-fix
  autoFix: true, // Try to fix broken code automatically

  // Target platform
  targetPlatform: 'mobile', // Optimize for mobile
});
```

### History Tracking

Every generation is recorded:

```typescript
await generator.generate('Create player', session);
await generator.generate('Create enemy', session);

const history = generator.getHistory(session);

history.forEach((entry) => {
  console.log('Prompt:', entry.prompt);
  console.log('Code:', entry.generated.holoScript);
  console.log('Success:', entry.generated.parseResult.success);
  console.log('Timestamp:', entry.timestamp);
});
```

---

## Examples

### Example 1: Generate Interactive Object

```typescript
const generator = new HoloScriptGenerator();
const adapter = new AnthropicAdapter({ apiKey: process.env.ANTHROPIC_API_KEY });
const session = generator.createSession(adapter);

const result = await generator.generate(
  'Create a blue sphere that the user can grab and throw',
  session
);

console.log('Generated:');
console.log(result.holoScript);
console.log('\nConfidence:', result.aiConfidence);
console.log('Valid:', result.parseResult.success);
console.log('Auto-fixed:', result.wasFixed);
```

**Expected Output**:

```holoscript
orb #throwableSphere
  @grabbable(snap_to_hand: true)
  @throwable(physics: true)
  geometry: 'sphere'
  color: '#0077ff'
  scale: 1.0
{
  position: [0, 1.5, 0]
  physics: {
    type: 'dynamic'
    mass: 0.5
  }
}
```

### Example 2: Batch Generation

```typescript
const prompts = [
  'Create a red cube that flashes when clicked',
  'Create a green cylinder that rotates slowly',
  'Create a yellow torus that glows in the dark',
];

const results = await generateBatch(prompts, new OpenAIAdapter({ apiKey: 'sk-...' }), {
  maxAttempts: 3,
  autoFix: true,
});

// Validate all results
const validation = validateBatch(results.map((r) => r.holoScript));
console.log(`\nValidation Results:`);
validation.forEach((v, i) => {
  console.log(`[${i}] Valid: ${v.valid}, Errors: ${v.errors}`);
});
```

### Example 3: Iterative Refinement

```typescript
const generator = new HoloScriptGenerator();
const adapter = new OpenAIAdapter({ apiKey: 'sk-...' });
const session = generator.createSession(adapter, { autoFix: true });

// Start with basic prompt
let code = await generator.generate('Create a player controller', session);
console.log('v1:', code.holoScript);

// Refine with fixes
const fixed = await generator.fix(code.holoScript, session);
console.log('v2:', fixed.holoScript);

// Optimize for mobile
const optimized = await generator.optimize(fixed.holoScript, 'mobile', session);
console.log('v3:', optimized.holoScript);

// Get explanation
const explanation = await generator.explain(optimized.holoScript, session);
console.log('\nExplanation:', explanation);
```

### Example 4: Multi-Turn Conversation

```typescript
const generator = new HoloScriptGenerator();
const adapter = new AnthropicAdapter({ apiKey: '...' });
const session = generator.createSession(adapter);

let history: Array<{ role: 'user' | 'assistant'; content: string }> = [];

// Turn 1
console.log('User: Create a simple game scene');
let response = await generator.chat('Create a simple game scene', session, history);
history.push({ role: 'user', content: 'Create a simple game scene' });
history.push({ role: 'assistant', content: response });
console.log('AI:', response);

// Turn 2
console.log('User: Add a player controller');
response = await generator.chat('Add a player controller', session, history);
history.push({ role: 'user', content: 'Add a player controller' });
history.push({ role: 'assistant', content: response });
console.log('AI:', response);

// Turn 3
console.log('User: Make the player able to jump');
response = await generator.chat('Make the player able to jump', session, history);
console.log('AI:', response);
```

---

## Best Practices

### 1. Session Management

```typescript
// ✅ Good: Create session once, reuse
const session = generator.createSession(adapter);
const code1 = await generator.generate('prompt 1', session);
const code2 = await generator.generate('prompt 2', session);

// ❌ Avoid: Creating new session for each generation
for (let i = 0; i < 10; i++) {
  const s = generator.createSession(adapter); // Don't do this
  await generator.generate(`prompt ${i}`, s);
}
```

### 2. Confidence Thresholds

```typescript
// ✅ Good: Adjust based on use case
const criticalCode = generator.createSession(adapter, {
  minConfidence: 0.95, // High bar for critical code
  maxAttempts: 10,
});

const experimentalCode = generator.createSession(adapter, {
  minConfidence: 0.7, // Lower bar for exploration
  maxAttempts: 3,
});
```

### 3. Error Handling

```typescript
// ✅ Good: Handle generation failures
try {
  const result = await generator.generate(prompt, session);
  if (result.parseResult.success) {
    console.log('Generated successfully');
  } else {
    console.log('Warnings:', result.parseResult.errors);
  }
} catch (error) {
  console.error('Generation failed:', error.message);
  // Fallback or retry
}
```

### 4. Platform Optimization

```typescript
// ✅ Good: Optimize upfront
const session = generator.createSession(adapter, {
  targetPlatform: 'mobile', // Optimize for target
});

// Or optimize after generation
const optimized = await generator.optimize(generatedCode.holoScript, 'mobile', session);
```

### 5. Batch Operations

```typescript
// ✅ Good: Generate in parallel
const results = await Promise.all(prompts.map((p) => generateHoloScript(p, adapter)));

// Then validate
const validation = validateBatch(results.map((r) => r.holoScript));
```

---

## Testing

### Unit Tests

All components have comprehensive test coverage:

```bash
# Run all AI layer tests
pnpm --filter=@holoscript/core test -- ai

# Run specific test file
pnpm --filter=@holoscript/core test -- AIIntegration.test.ts
pnpm --filter=@holoscript/core test -- HoloScriptGenerator.test.ts
```

### Test Coverage

| Module              | Tests  | Status         |
| ------------------- | ------ | -------------- |
| AIIntegration       | 30     | ✅ Passing     |
| HoloScriptGenerator | 35     | ✅ Passing     |
| **Total**           | **65** | ✅ **Passing** |

### Mock Adapter for Testing

```typescript
import { describe, it, expect } from 'vitest';
import type { AIAdapter } from '@holoscript/core';

class MockAdapter implements AIAdapter {
  async generateHoloScript(prompt: string) {
    return {
      holoScript: `orb #test { }`,
      aiConfidence: 0.95,
    };
  }

  // ... other methods
}

describe('GenerationLogic', () => {
  it('should work with mock adapter', async () => {
    const generator = new HoloScriptGenerator();
    const session = generator.createSession(new MockAdapter());
    const result = await generator.generate('test', session);

    expect(result.holoScript).toBeDefined();
    expect(result.aiConfidence).toBe(0.95);
  });
});
```

---

## Next Steps

### Planned Enhancements

- [ ] Real adapter validation with live APIs
- [ ] End-to-end scenario testing
- [ ] Performance benchmarking
- [ ] Custom prompt templates
- [ ] Generation analytics dashboard
- [ ] Fine-tuned models for HoloScript
- [ ] Streaming generation for long operations
- [ ] Context-aware generation with scene analysis

---

**Last Updated**: 2025-01-21  
**Status**: Production Ready  
**Maintainer**: AI Development Team
