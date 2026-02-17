# @holoscript/ai-validator

AI hallucination validation layer for HoloScript. Prevents invalid AI-generated code from breaking user workflows by detecting common LLM hallucination patterns.

## Features

- ✅ **Multi-Strategy Validation** - Syntax, semantic, structural, and trait validation
- ✅ **Hallucination Detection** - Detects 10+ common LLM hallucination patterns
- ✅ **Provider-Specific Rules** - Custom validation for OpenAI, Anthropic, Gemini
- ✅ **Detailed Error Reports** - Line numbers, suggestions, severity levels
- ✅ **Trait Similarity Matching** - Suggests correct traits for typos
- ✅ **Configurable Thresholds** - Adjustable hallucination score limits
- ✅ **80%+ Test Coverage** - Production-ready with comprehensive tests

## Installation

```bash
pnpm add @holoscript/ai-validator
```

## Quick Start

```typescript
import { AIValidator } from '@holoscript/ai-validator';

const validator = new AIValidator({
  hallucinationThreshold: 50,
  provider: 'anthropic',
  strict: false
});

// Validate AI-generated code
const result = await validator.validate(aiGeneratedCode);

if (!result.valid) {
  console.error('Validation failed:');
  result.errors.forEach(err => {
    console.log(`[${err.severity}] ${err.message}`);
    if (err.suggestion) {
      console.log(`  Suggestion: ${err.suggestion}`);
    }
  });
} else {
  console.log(`✓ Valid code (hallucination score: ${result.metadata.hallucinationScore}/100)`);
}
```

## API Reference

### `AIValidator`

Main validation class with configurable rules.

#### Constructor Options

```typescript
interface ValidatorConfig {
  strict?: boolean;                // Reject warnings as errors (default: false)
  knownTraits?: string[];          // Custom trait registry
  hallucinationThreshold?: number; // Max hallucination score 0-100 (default: 50)
  detectHallucinations?: boolean;  // Enable pattern detection (default: true)
  provider?: 'openai' | 'anthropic' | 'gemini' | 'local' | 'unknown';
}
```

#### Methods

##### `validate(code: string): Promise<ValidationResult>`

Validates HoloScript code and returns detailed results.

```typescript
const result = await validator.validate(code);

console.log('Valid:', result.valid);
console.log('Errors:', result.errors.length);
console.log('Warnings:', result.warnings.length);
console.log('Hallucination Score:', result.metadata.hallucinationScore);
```

##### `getStats(): ValidatorStats`

Returns validation statistics.

```typescript
const stats = validator.getStats();
console.log('Known traits:', stats.knownTraits);
console.log('Hallucination patterns:', stats.hallucinationPatterns);
```

### `validateAICode(code, config?)`

Convenience function for one-off validation.

```typescript
import { validateAICode } from '@holoscript/ai-validator';

const result = await validateAICode(aiCode, {
  provider: 'openai',
  hallucinationThreshold: 60
});
```

## Validation Strategies

### 1. Syntax Validation

Validates code against HoloScript parser:

```typescript
// ❌ Invalid: Triple braces
cube {{{
  @color(red)
}}}

// ✅ Valid: Correct syntax
cube {
  @color(red)
}
```

### 2. Structural Validation

Checks balanced braces and proper nesting:

```typescript
// ❌ Invalid: Unclosed brace
cube {
  @color(red)

// ✅ Valid: Balanced
cube {
  @color(red)
}
```

### 3. Trait Validation

Ensures traits exist in known registry:

```typescript
// ❌ Invalid: Unknown trait
cube {
  @magic_flying
  @ai_powered
}

// ✅ Valid: Known traits
cube {
  @grabbable
  @physics
}
```

### 4. Hallucination Detection

Detects common LLM hallucination patterns:

| Pattern | Score | Example |
|---------|-------|---------|
| AI-like traits | 30 | `@ai_powered`, `@smart_detection` |
| Triple braces | 50 | `{{{` or `}}}` |
| OOP syntax | 40 | `class`, `extends`, `implements` |
| Placeholders | 60 | `[PLACEHOLDER]`, `[YOUR_VALUE]` |
| TODO comments | 20 | `// TODO: Add properties` |
| HTML/XML | 35 | `<cube>...</cube>` |
| JavaScript | 35 | `function createCube()` |
| Template literals | 45 | `@color("${variable}")` |
| Excessive repetition | 25 | 5+ identical traits |

### 5. Semantic Validation

Warns about style and performance issues:

```typescript
// ⚠️ Warning: Empty object
cube {
}

// ⚠️ Warning: Very long line
cube { @position(0, 0, 0, 0, 0, 0, ...[100 values]...) }
```

## Provider-Specific Validation

### OpenAI (GPT-4, GPT-3.5)

Detects markdown code fences:

```typescript
const validator = new AIValidator({ provider: 'openai' });

// ❌ Invalid: Markdown fences
```holoscript
cube { @color(red) }
```

// ✅ Valid: No fences
cube { @color(red) }
```

### Anthropic (Claude)

Allows explanatory comments:

```typescript
const validator = new AIValidator({ provider: 'anthropic' });

// ✅ Valid: Claude-style comments allowed
cube {
  // This is a red cube
  @color(red)
}
```

## Hallucination Score

The validator calculates a hallucination score (0-100) based on detected patterns:

- **0-20**: Very likely valid code
- **20-40**: Possibly valid, minor issues
- **40-60**: Suspicious patterns detected
- **60-80**: Likely hallucinated
- **80-100**: Almost certainly hallucinated

```typescript
const result = await validator.validate(suspiciousCode);

if (result.metadata.hallucinationScore > 70) {
  // Regenerate with stricter constraints
  regenerateCode({ moreStrict: true });
}
```

## Integration Examples

### With MCP Server

```typescript
import { AIValidator } from '@holoscript/ai-validator';

const validator = new AIValidator({
  provider: 'anthropic',
  hallucinationThreshold: 50
});

// In MCP tool handler
async function handleGenerateObject(args: any) {
  const generatedCode = await generateWithLLM(args.prompt);

  const validation = await validator.validate(generatedCode);

  if (!validation.valid) {
    // Provide feedback to LLM for regeneration
    const feedback = validation.errors.map(e => e.message).join('\n');
    return await generateWithLLM(args.prompt, { feedback });
  }

  return generatedCode;
}
```

### With Security Sandbox

```typescript
import { AIValidator } from '@holoscript/ai-validator';
import { HoloScriptSandbox } from '@holoscript/security-sandbox';

const validator = new AIValidator();
const sandbox = new HoloScriptSandbox();

// Validate THEN sandbox
async function executeSafely(aiCode: string) {
  // Step 1: Validate
  const validation = await validator.validate(aiCode);
  if (!validation.valid) {
    throw new Error(`Invalid code: ${validation.errors[0].message}`);
  }

  // Step 2: Sandbox
  const result = await sandbox.executeHoloScript(aiCode, {
    source: 'ai-generated'
  });

  return result;
}
```

### Feedback Loop

```typescript
async function generateWithValidation(prompt: string, maxAttempts = 3) {
  for (let i = 0; i < maxAttempts; i++) {
    const code = await llm.generate(prompt);
    const validation = await validator.validate(code);

    if (validation.valid) {
      return code;
    }

    // Provide validation feedback to LLM
    const feedback = [
      'Your previous attempt had errors:',
      ...validation.errors.map(e => `- ${e.message}`),
      ...validation.errors.map(e => e.suggestion ? `  Try: ${e.suggestion}` : '')
    ].join('\n');

    prompt = `${prompt}\n\nFeedback from previous attempt:\n${feedback}`;
  }

  throw new Error('Failed to generate valid code after max attempts');
}
```

## Best Practices

### 1. Set Appropriate Thresholds

```typescript
// Strict for production
const prodValidator = new AIValidator({
  hallucinationThreshold: 30,
  strict: true
});

// Lenient for development
const devValidator = new AIValidator({
  hallucinationThreshold: 70,
  strict: false
});
```

### 2. Provider Hints

```typescript
// Set provider for better validation
const validator = new AIValidator({
  provider: detectProvider(apiKey) // 'openai', 'anthropic', etc.
});
```

### 3. Custom Trait Registry

```typescript
// Add custom traits for domain-specific validation
const validator = new AIValidator({
  knownTraits: [
    ...DEFAULT_TRAITS,
    '@custom_physics',
    '@special_rendering'
  ]
});
```

### 4. Error Reporting

```typescript
const result = await validator.validate(code);

if (!result.valid) {
  // Log for debugging
  console.error('Validation errors:', result.errors);

  // Send to monitoring
  monitoring.trackValidationFailure({
    provider: result.metadata.provider,
    hallucinationScore: result.metadata.hallucinationScore,
    errors: result.errors.length
  });

  // Provide user feedback
  showUserError('Generated code was invalid. Please try again.');
}
```

## License

MIT © Brian X Base Team
