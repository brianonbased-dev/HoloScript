# AI Validator

**Hallucination detection for LLM-generated HoloScript code.** Uses Levenshtein distance and semantic analysis to validate that generated code matches human intent.

## Overview

AI Validator prevents LLM hallucinations where AI generates syntactically valid but semantically incorrect HoloScript code that doesn't match the user's requirements.

## Installation

```bash
npm install @holoscript/ai-validator
```

## Quick Start

```typescript
import { AIValidator } from '@holoscript/ai-validator';

const validator = new AIValidator();

// Validate that generated code matches user intent
const result = await validator.validate({
  userRequest: 'Create a glowing sphere that players can grab',
  generatedCode: `
    object "GlowingSphere" @grabbable {
      geometry: "sphere"
      color: "#00ff00"
      emission: { intensity: 0.8 }
    }
  `
});

console.log(result.valid);         // true
console.log(result.confidence);    // 0.95 (95% match)
console.log(result.hallucinations);// []
```

## Detecting Hallucinations

```typescript
// Example: Missing required trait
const result = await validator.validate({
  userRequest: 'Create a sphere that glows',
  generatedCode: `
    object "Sphere" {
      geometry: "sphere"
      color: "#ff0000"
    }
  `,
  expectedTraits: ['@glowing']
});

console.log(result.hallucinations);  // [{ issue: 'missing_trait', expected: '@glowing' }]
```

### Types of Hallucinations Detected

| Hallucination | Detection | Fix |
|--------------|-----------|-----|
| **Missing trait** | User asks for "grabbable" but code lacks `@grabbable` | Add trait |
| **Wrong geometry** | User wants "cylinder" but code has "cube" | Check shape names |
| **Invalid property** | Code uses `postion` instead of `position` | Spell-check against schema |
| **Type mismatch** | Color as string vs. number array | Validate property types |
| **Logical error** | Action with no implementation | Parse AST for logic trees |
| **Performance issue** | Unbounded loop, no timeout | Detect algorithmic complexity |

## Semantic Analysis

```typescript
// Check semantic correctness
const analysis = await validator.analyzeSemantics(code, {
  checkTraitUsage: true,       // Traits used correctly
  checkPropertyTypes: true,    // Properties match schema
  checkGeometry: true,         // Geometry values valid
  checkLogic: true,            // Action logic valid
  checkPerformance: true       // No obvious inefficiencies
});

console.log(analysis.issues);  // Array of semantic problems
console.log(analysis.severity);// 'high', 'medium', 'low'
```

## Levenshtein Distance Matching

```typescript
// Fuzzy match user request to generated code
const match = await validator.fuzzyMatch({
  request: 'Create interactive button',
  generated: code
});

console.log(match.similarity);     // 0-1 score
console.log(match.missingConcepts);// ['interactive']
console.log(match.extraConcepts);  // []
```

## Confidence Scoring

```typescript
const result = await validator.validate({
  userRequest: 'Create a physics-based ball you can throw',
  generatedCode: code
});

console.log(result.confidence);    // 0.87 (87% - good match)
// Breakdown:
//   - Trait matching: 100% (@physics, @collidable, @throwable present)
//   - Property correctness: 95% (mass and physics params correct)
//   - Logic matching: 70% (gravity handling matches request)
//   - Overall: 87%
```

## Advanced Validation

```typescript
const validator = new AIValidator({
  strictMode: true,           // Fail on any issue vs. warnings
  semanticDepth: 'deep',      // Check logic trees deeply
  performanceAnalysis: true,  // Analyze algorithmic complexity
  securityCheck: true         // Detect security issues
});

const result = await validator.validate(options, {
  ignoreWarnings: false,      // Treat warnings as failures
  maxHallucinations: 0        // Fail if any hallucinations
});
```

## Integration with Code Generation

```typescript
import { generateScene } from '@holoscript/mcp-server';
import { AIValidator } from '@holoscript/ai-validator';

const validator = new AIValidator();

async function generateAndValidate(userRequest) {
  // Generate code using LLM
  const generated = await generateScene({
    description: userRequest,
    traits: ['@grabbable', '@physics']
  });
  
  // Validate immediately
  const validation = await validator.validate({
    userRequest,
    generatedCode: generated.code
  });
  
  if (validation.confidence < 0.8) {
    console.warn('Low confidence generation, regenerating');
    return generateAndValidate(userRequest);
  }
  
  return generated.code;
}
```

## Error Categories

```typescript
const result = await validator.validate({...});

// Categorized results
result.errors.traitErrors;     // Wrong traits used
result.errors.propertyErrors;  // Invalid properties
result.errors.geometryErrors;  // Bad geometry values
result.errors.logicErrors;     // Broken action logic
result.errors.syntaxErrors;    // Parse failures
result.errors.securityErrors;  // Potential security issues
```

## Custom Validation Rules

```typescript
validator.addRule({
  name: 'no-large-arrays',
  check: (ast) => {
    const arrays = ast.findAll(n => n.type === 'ArrayLiteral');
    return arrays.filter(a => a.elements.length > 1000);
  },
  severity: 'warning',
  message: 'Arrays over 1000 elements may cause performance issues'
});
```

## Batch Validation

```typescript
const codes = [generated1, generated2, generated3];

const results = await validator.validateBatch(
  codes.map((code, i) => ({
    userRequest: requests[i],
    generatedCode: code
  }))
);

console.log(results.map(r => r.confidence));  // Array of scores
console.log(results.filter(r => !r.valid)); // Failed validations
```

## Metrics & Reporting

```typescript
const report = await validator.generateReport({
  validations: results,
  includeMetrics: true,
  outputFormat: 'markdown'
});

console.log(report);
// Metrics:
// - Average confidence: 0.89
// - Hallucination rate: 2%
// - Most common issues: missing_traits, type_mismatch
```

## Environment Variables

```bash
# Validation
VALIDATOR_STRICT_MODE=false
VALIDATOR_MIN_CONFIDENCE=0.8
VALIDATOR_MAX_HALLUCINATIONS=3

# Features
VALIDATOR_SEMANTIC_CHECK=true
VALIDATOR_PERFORMANCE_ANALYSIS=true
VALIDATOR_SECURITY_CHECK=true

# Levenshtein
VALIDATOR_FUZZY_THRESHOLD=0.75
```

## Best Practices

1. **Validate all LLM output** — Never use generated code without validation
2. **Set confidence thresholds** — Require min 0.85 confidence for auto-deploy
3. **Log all hallucinations** — Build training data for better models
4. **Use semantic depth** — Check logic, not just syntax
5. **Fail early** — Validate before deployment or user testing
6. **Monitor patterns** — Track which issues are most common
7. **Tune rules** — Add custom validation for your domain

## See Also

- [MCP Server](../packages/mcp-server.md) — Code generation tools
- [Security Sandbox](../packages/security-sandbox.md) — Run validated code safely
- [Agent Protocol](../packages/agent-protocol.md) — Verification phase integration
