# AI-Guided HoloScript Generation API

**Package**: `@holoscript/framework`, not `@holoscript/core`. Every name on this page is imported from `@holoscript/framework` (source: `packages/framework/src/ai/`). The AI layer moved out of core in A.011.02c; this page stayed behind and still imported from core until 2026-10-07, which led one agent to report that `HoloScriptGenerator` existed nowhere.

**Tests**: 135 passing in the 5 files below, in `packages/framework/src/ai/__tests__/` (run 2026-10-08; see [Testing](#testing)). None of them calls a live model API (they use stand-in adapters or test only configuration), so validation against live APIs is still open (see [Next Steps](#next-steps)).

**Validation.** `HoloScriptGenerator` and `validateBatch` check generated code with core's canonical validator, `validateCanonicalSource({ source, surface: 'holo' })`: the `.holo` parser, plus the strict layer's refusals for what the parser used to accept silently (HS1001 empty, HS1002 unbalanced, HS1003 a token that cannot start a top-level item, HS1004 nothing parsed, HS1005 a trait with no name). A refused result has `parseResult.success === false` and errors that lead with their code, and auto-fix runs when the adapter has `fixHoloScript`. It does not yet catch prose or a code fence around an otherwise valid program (`Here you go:` before it, `Let me know…` after it): the parser drops that text silently, which is board task ge7y ("no parser drops input silently"). The framework adapters strip code fences before checking. Until 2026-10-08 this layer used a stand-in parser that called any text valid.

This document is a guide to the AI-guided HoloScript generation API in `@holoscript/framework`, which turns natural language descriptions into HoloScript code.

> Not the same path as the MCP `generate_object` / `generate_scene` tools. Those go through `@holoscript/llm-provider` (`generateHoloScript` on a provider adapter), whose system prompt (`HOLOSCRIPT_SYSTEM_PROMPT`) shows a parse-tested `composition "Name" { ... }` program. Since 2026-10-08 the framework adapters on this page send that same prompt.

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
import { HoloScriptGenerator, AnthropicAdapter } from '@holoscript/framework';

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
import {
  generateHoloScriptWithAdapter,
  generateBatch,
  validateBatch,
  OpenAIAdapter,
} from '@holoscript/framework';

// Single generation
const result = await generateHoloScriptWithAdapter(
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

> **Two functions, similar names.** `generateHoloScriptWithAdapter(prompt, adapter, config?)` is the helper above: it takes an adapter and returns `GeneratedCode`. The export named `generateHoloScript(prompt, options?)` is a different function: it uses the adapter registered with `registerAIAdapter` / `setDefaultAIAdapter` and returns the adapter's raw `GenerateResult`. Passing an adapter to `generateHoloScript` does not do what the helper does.

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
   validateCanonicalSource (.holo parser + strict refusals)
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

| Component                   | Purpose                         | Status                                                                                           |
| --------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------ |
| **AIAdapter**               | Interface for AI providers      | ✅ 9 implementations                                                                             |
| **HoloScriptGenerator**     | High-level generation API       | ✅ Complete                                                                                      |
| **validateCanonicalSource** | Parse & validate generated code | ✅ Refuses empty, unbalanced and wholly non-HoloScript text; ⚠️ not prose around a valid program |
| **ErrorRecovery**           | Auto-fix broken code            | ✅ Runs on refused output                                                                        |
| **Sessions**                | Track generation history        | ✅ Implemented                                                                                   |

---

## API Reference

### HoloScriptGenerator

Main class for AI-guided code generation.

#### Constructor

```typescript
class HoloScriptGenerator {
  constructor(enableCache?: boolean); // default: true
}
```

Creates a new generator instance with a built-in parser and, unless `enableCache` is false, a generation cache.

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
  parseResult: HSPlusCompileResult; // Parser result
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
- Checks the code with `validateCanonicalSource({ source, surface: 'holo' })`; refused code has
  `parseResult.success === false` and errors such as `HS1004: Nothing in this source parsed into a composition.`
- Auto-fixes if enabled, the check refused the code and the adapter has `fixHoloScript`; an
  adapter without it gets the refused code back marked invalid
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
| LM Studio       | `LMStudioAdapter`  | ✅     | URL     |
| Google (Gemini) | `GeminiAdapter`    | ✅     | API Key |
| XAI (Grok)      | `XAIAdapter`       | ✅     | API Key |
| Together.ai     | `TogetherAdapter`  | ✅     | API Key |
| Fireworks.ai    | `FireworksAdapter` | ✅     | API Key |
| NVIDIA          | `NVIDIAAdapter`    | ✅     | API Key |

### Adapter Interface

All adapters implement `AIAdapter` (`packages/framework/src/ai/AIAdapter.ts`). Only `id`,
`name` and `isReady()` are required; each capability is optional, so check before calling:

```typescript
interface AIAdapter {
  readonly id: string;
  readonly name: string;
  isReady(): boolean | Promise<boolean>;

  // Generate HoloScript from prompt
  generateHoloScript?(prompt: string, options?: GenerateOptions): Promise<GenerateResult>;

  // Explain existing code
  explainHoloScript?(holoScript: string): Promise<ExplainResult>;

  // Optimize for platform
  optimizeHoloScript?(
    holoScript: string,
    target: 'mobile' | 'desktop' | 'vr' | 'ar'
  ): Promise<OptimizeResult>;

  // Fix broken code
  fixHoloScript?(holoScript: string, errors: string[]): Promise<FixResult>;

  // Code completion at a cursor position
  completeHoloScript?(holoScript: string, cursorPosition: number): Promise<string[]>;

  // Multi-turn conversation
  chat?(
    message: string,
    holoScript?: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<string>;

  // Generate embeddings
  getEmbeddings?(text: string | string[]): Promise<number[][]>;
}

interface GenerateResult {
  holoScript: string;
  confidence?: number; // becomes GeneratedCode.aiConfidence
  objectCount?: number;
  warnings?: string[];
  metadata?: Record<string, unknown>;
}
```

### Using Different Adapters

```typescript
import {
  OpenAIAdapter,
  AnthropicAdapter,
  GeminiAdapter,
  OllamaAdapter,
  generateHoloScriptWithAdapter,
} from '@holoscript/framework';

// `model` is optional in every config; each adapter has a default.

// OpenAI
const openai = new OpenAIAdapter({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o-mini', // the default
});

// Anthropic (Claude)
const anthropic = new AnthropicAdapter({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Google Gemini
const gemini = new GeminiAdapter({
  apiKey: process.env.GEMINI_API_KEY,
});

// Local Ollama
const ollama = new OllamaAdapter({
  baseUrl: 'http://localhost:11434',
  model: 'mistral',
});

// Generate with different adapters
const results = await Promise.all([
  generateHoloScriptWithAdapter(prompt, openai),
  generateHoloScriptWithAdapter(prompt, anthropic),
  generateHoloScriptWithAdapter(prompt, gemini),
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

**Example output** (a model's exact output varies; this is the shape to expect, one
`composition` root around the objects). It parses with zero errors under `parseHolo` and the
strict layer:

```holo
composition "Throwable Sphere" {
  object "BlueSphere" {
    @grabbable
    @throwable
    @physics
    @collidable

    geometry: "sphere"
    position: [0, 1.5, 0]
    scale: 0.3
    material: { baseColor: "#0077ff", roughness: 0.4, metallic: 0.1 }
  }
}
```

A real, longer program in the same shape: `examples/quickstart/2-red-cube-teal-button.holo`.

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
const results = await Promise.all(prompts.map((p) => generateHoloScriptWithAdapter(p, adapter)));

// Then validate
const validation = validateBatch(results.map((r) => r.holoScript));
```

---

## Testing

### Unit Tests

The tests live in `packages/framework/src/ai/__tests__/`:

```bash
# Run all five AI layer test files
pnpm --filter @holoscript/framework exec vitest run src/ai/__tests__/

# Run one file
pnpm --filter @holoscript/framework exec vitest run src/ai/__tests__/HoloScriptGenerator.test.ts
```

### Test Coverage

Counted from a run on 2026-10-08. Re-run the command above rather than trusting these numbers
as they age.

| File                          | Tests   | Status         |
| ----------------------------- | ------- | -------------- |
| `HoloScriptGenerator.test.ts` | 23      | ✅ Passing     |
| `AIAdapter.test.ts`           | 14      | ✅ Passing     |
| `AIAdapter.prod.test.ts`      | 23      | ✅ Passing     |
| `adapters.test.ts`            | 34      | ✅ Passing     |
| `adapters.prod.test.ts`       | 41      | ✅ Passing     |
| **Total**                     | **135** | ✅ **Passing** |

### Mock Adapter for Testing

```typescript
import { describe, it, expect } from 'vitest';
import { HoloScriptGenerator, type AIAdapter } from '@holoscript/framework';

class MockAdapter implements AIAdapter {
  readonly id = 'mock';
  readonly name = 'Mock';

  isReady() {
    return true;
  }

  async generateHoloScript(prompt: string) {
    return {
      holoScript: `composition "Test" {\n  object "Cube" { geometry: "cube" }\n}`,
      confidence: 0.95, // surfaces as GeneratedCode.aiConfidence
    };
  }
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

**Last Updated**: 2026-10-07 (imports moved to `@holoscript/framework`, test counts re-run)  
**Status**: Generation and validation work (validation misses prose around a valid program; see the top of this page); tested without live model APIs  
**Maintainer**: AI Development Team
